"""FastAPI dependencies shared by the routers: the current authenticated
user (bearer token) and the administrator-only guard."""
from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings
from app.models.schemas import AuthUser
from app.services import auth_service
from app.services.auth_service import ROLE_ADMIN, AuthError

# auto_error=False so a missing header yields our own 401 message (and so the
# dependency can be bypassed cleanly when AUTH_DISABLED=true).
bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> AuthUser:
    settings = get_settings()
    if settings.auth_disabled:
        return AuthUser(username="anonymous", role=ROLE_ADMIN)
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=401,
            detail="Sign in to use the analysis service.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        record = auth_service.resolve_token(credentials.credentials)
    except AuthError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc), headers={"WWW-Authenticate": "Bearer"}) from exc
    return AuthUser(username=record.username, role=record.role)


async def require_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Administrator access is required.")
    return user
