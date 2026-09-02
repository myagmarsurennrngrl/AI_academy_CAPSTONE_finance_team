"""Username / password authentication with a small file-backed user store.

Only an administrator creates accounts - there is no self-registration. The
first admin is bootstrapped from ``ADMIN_USERNAME`` / ``ADMIN_PASSWORD`` in
``.env`` (or created with ``python -m app.manage create-user``). Every
analysis endpoint requires a valid bearer token obtained from
``POST /api/auth/login``.

Storage: one JSON file (``USERS_FILE``, default ``data/users.json`` next to
the backend) holding salted PBKDF2-SHA256 password hashes and the HMAC secret
used to sign tokens. A JSON file is sufficient for this single-process,
small-team deployment; swap ``UserStore`` for a database table if the app
ever runs across several workers.

Tokens are compact HMAC-signed JSON (``base64url(payload).base64url(sig)``)
with an expiry - no third-party JWT dependency, no server-side session table.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.config import get_settings

logger = logging.getLogger(__name__)

ROLE_ADMIN = "admin"
ROLE_USER = "user"
ROLES = (ROLE_ADMIN, ROLE_USER)

USERNAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$")
MIN_PASSWORD_LENGTH = 6
PBKDF2_ITERATIONS = 260_000


class AuthError(Exception):
    """Raised for invalid credentials, invalid / expired tokens and invalid
    user-management requests. ``status`` is the HTTP status the API should use."""

    def __init__(self, message: str, status: int = 401):
        super().__init__(message)
        self.status = status


# ---------------------------------------------------------------------------
# Password hashing
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_b64.encode("ascii"))
    except (ValueError, TypeError):
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
    return hmac.compare_digest(actual, expected)


def validate_username(username: str) -> str:
    username = (username or "").strip()
    if not USERNAME_RE.match(username):
        raise AuthError(
            "Username must be 3-32 characters: letters, digits, '.', '_' or '-', starting with a letter or digit.",
            status=400,
        )
    return username


def validate_password(password: str) -> str:
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH:
        raise AuthError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.", status=400)
    return password


def validate_role(role: str) -> str:
    if role not in ROLES:
        raise AuthError(f"Role must be one of: {', '.join(ROLES)}.", status=400)
    return role


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------

def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64decode(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode((text + padding).encode("ascii"))


def create_token(username: str, role: str, secret: str, ttl_seconds: int) -> tuple[str, int]:
    now = int(time.time())
    payload = {"sub": username, "role": role, "iat": now, "exp": now + int(ttl_seconds)}
    body = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{_b64encode(signature)}", payload["exp"]


def decode_token(token: str, secret: str) -> Dict:
    try:
        body, signature = token.split(".")
        expected = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64decode(signature)):
            raise AuthError("Invalid authentication token.")
        payload = json.loads(_b64decode(body).decode("utf-8"))
    except AuthError:
        raise
    except (ValueError, TypeError, json.JSONDecodeError):
        raise AuthError("Invalid authentication token.") from None
    if not isinstance(payload, dict) or "sub" not in payload or "exp" not in payload:
        raise AuthError("Invalid authentication token.")
    if int(payload["exp"]) < int(time.time()):
        raise AuthError("Your session has expired. Please sign in again.")
    return payload


# ---------------------------------------------------------------------------
# User store
# ---------------------------------------------------------------------------

@dataclass
class UserRecord:
    username: str
    role: str
    password_hash: str
    created_at: str

    def public(self) -> Dict[str, str]:
        return {"username": self.username, "role": self.role, "created_at": self.created_at}


class UserStore:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.RLock()

    # -- persistence --------------------------------------------------------
    def _read(self) -> Dict:
        if not os.path.exists(self.path):
            return {"secret": "", "users": {}}
        with open(self.path, "r", encoding="utf-8") as fh:
            try:
                data = json.load(fh)
            except json.JSONDecodeError:
                logger.error("User store %s is not valid JSON; treating it as empty.", self.path)
                return {"secret": "", "users": {}}
        data.setdefault("secret", "")
        data.setdefault("users", {})
        return data

    def _write(self, data: Dict) -> None:
        directory = os.path.dirname(os.path.abspath(self.path))
        os.makedirs(directory, exist_ok=True)
        tmp = f"{self.path}.tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
        os.replace(tmp, self.path)

    # -- secret ---------------------------------------------------------------
    def token_secret(self) -> str:
        """The HMAC secret for tokens: AUTH_SECRET from the environment if
        set, otherwise a random secret generated once and persisted in the
        store so tokens survive backend restarts."""
        configured = get_settings().auth_secret
        if configured:
            return configured
        with self._lock:
            data = self._read()
            if not data["secret"]:
                data["secret"] = secrets.token_urlsafe(48)
                self._write(data)
            return data["secret"]

    # -- queries ----------------------------------------------------------------
    def list_users(self) -> List[Dict[str, str]]:
        with self._lock:
            users = [UserRecord(**u) for u in self._read()["users"].values()]
        users.sort(key=lambda u: (u.role != ROLE_ADMIN, u.username.lower()))
        return [u.public() for u in users]

    def get(self, username: str) -> Optional[UserRecord]:
        with self._lock:
            raw = self._read()["users"].get(username)
        return UserRecord(**raw) if raw else None

    def count(self) -> int:
        with self._lock:
            return len(self._read()["users"])

    # -- mutations ----------------------------------------------------------------
    def create(self, username: str, password: str, role: str = ROLE_USER) -> UserRecord:
        username = validate_username(username)
        validate_password(password)
        validate_role(role)
        with self._lock:
            data = self._read()
            if username in data["users"]:
                raise AuthError(f"User '{username}' already exists.", status=409)
            record = UserRecord(
                username=username,
                role=role,
                password_hash=hash_password(password),
                created_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            )
            data["users"][username] = asdict(record)
            self._write(data)
        logger.info("Created %s account '%s'", role, username)
        return record

    def delete(self, username: str) -> None:
        with self._lock:
            data = self._read()
            record = data["users"].get(username)
            if record is None:
                raise AuthError(f"User '{username}' does not exist.", status=404)
            admins = [u for u in data["users"].values() if u["role"] == ROLE_ADMIN]
            if record["role"] == ROLE_ADMIN and len(admins) <= 1:
                raise AuthError("Cannot delete the last administrator account.", status=400)
            del data["users"][username]
            self._write(data)
        logger.info("Deleted account '%s'", username)

    def set_password(self, username: str, password: str) -> None:
        validate_password(password)
        with self._lock:
            data = self._read()
            record = data["users"].get(username)
            if record is None:
                raise AuthError(f"User '{username}' does not exist.", status=404)
            record["password_hash"] = hash_password(password)
            self._write(data)

    def set_role(self, username: str, role: str) -> None:
        validate_role(role)
        with self._lock:
            data = self._read()
            record = data["users"].get(username)
            if record is None:
                raise AuthError(f"User '{username}' does not exist.", status=404)
            if record["role"] == ROLE_ADMIN and role != ROLE_ADMIN:
                admins = [u for u in data["users"].values() if u["role"] == ROLE_ADMIN]
                if len(admins) <= 1:
                    raise AuthError("Cannot demote the last administrator account.", status=400)
            record["role"] = role
            self._write(data)

    def authenticate(self, username: str, password: str) -> UserRecord:
        record = self.get((username or "").strip())
        # Verify against a dummy hash when the user does not exist so the
        # response time does not reveal which usernames are valid.
        stored = record.password_hash if record else _DUMMY_HASH
        if not verify_password(password or "", stored) or record is None:
            raise AuthError("Incorrect username or password.", status=401)
        return record


_DUMMY_HASH = hash_password("not-a-real-password")

_STORES: Dict[str, UserStore] = {}
_STORES_LOCK = threading.Lock()


def get_store() -> UserStore:
    path = os.path.abspath(get_settings().users_file)
    with _STORES_LOCK:
        store = _STORES.get(path)
        if store is None:
            store = UserStore(path)
            _STORES[path] = store
        return store


def reset_store_cache() -> None:
    """Test helper: forget cached stores (settings may point elsewhere now)."""
    with _STORES_LOCK:
        _STORES.clear()


# ---------------------------------------------------------------------------
# Login / bootstrap
# ---------------------------------------------------------------------------

def login(username: str, password: str) -> Dict:
    settings = get_settings()
    store = get_store()
    record = store.authenticate(username, password)
    token, expires_at = create_token(
        record.username, record.role, store.token_secret(), settings.auth_token_hours * 3600
    )
    return {
        "token": token,
        "expires_at": datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat(timespec="seconds"),
        "user": record.public(),
    }


def resolve_token(token: str) -> UserRecord:
    """Validates a bearer token and returns the (still existing) user."""
    store = get_store()
    payload = decode_token(token, store.token_secret())
    record = store.get(str(payload["sub"]))
    if record is None:
        raise AuthError("This account no longer exists. Please sign in again.")
    return record


def bootstrap_admin() -> None:
    """Creates the first administrator from ADMIN_USERNAME / ADMIN_PASSWORD
    when the user store is still empty. Safe to call on every startup."""
    settings = get_settings()
    if settings.auth_disabled:
        logger.warning("AUTH_DISABLED=true - every API endpoint is open without login.")
        return
    store = get_store()
    if store.count() > 0:
        return
    if settings.admin_username and settings.admin_password:
        try:
            store.create(settings.admin_username, settings.admin_password, ROLE_ADMIN)
            logger.info("Bootstrapped administrator '%s' from ADMIN_USERNAME/ADMIN_PASSWORD.", settings.admin_username)
        except AuthError as exc:
            logger.error("Could not bootstrap administrator: %s", exc)
    else:
        logger.warning(
            "No user accounts exist and ADMIN_USERNAME/ADMIN_PASSWORD are not set. Nobody can sign in "
            "until an administrator is created (set them in backend/.env or run "
            "'python -m app.manage create-user <name> <password> --admin')."
        )
