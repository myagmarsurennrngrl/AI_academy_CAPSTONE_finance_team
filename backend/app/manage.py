"""Command-line user administration (no running server required).

    python -m app.manage create-user <username> <password> [--admin]
    python -m app.manage list-users
    python -m app.manage set-password <username> <new-password>
    python -m app.manage delete-user <username>

Reads the same backend/.env (USERS_FILE, AUTH_SECRET) as the API server.
"""
from __future__ import annotations

import argparse
import sys

from app.services import auth_service
from app.services.auth_service import ROLE_ADMIN, ROLE_USER, AuthError


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.manage", description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create-user", help="Create an account")
    create.add_argument("username")
    create.add_argument("password")
    create.add_argument("--admin", action="store_true", help="Give the account administrator rights")

    sub.add_parser("list-users", help="List accounts")

    setpw = sub.add_parser("set-password", help="Reset a password")
    setpw.add_argument("username")
    setpw.add_argument("password")

    delete = sub.add_parser("delete-user", help="Delete an account")
    delete.add_argument("username")

    args = parser.parse_args(argv)
    store = auth_service.get_store()
    try:
        if args.command == "create-user":
            record = store.create(args.username, args.password, ROLE_ADMIN if args.admin else ROLE_USER)
            print(f"Created {record.role} '{record.username}' in {store.path}")
        elif args.command == "list-users":
            users = store.list_users()
            if not users:
                print(f"No accounts in {store.path}")
            for u in users:
                print(f"{u['username']:<24} {u['role']:<6} created {u['created_at']}")
        elif args.command == "set-password":
            store.set_password(args.username, args.password)
            print(f"Password updated for '{args.username}'")
        elif args.command == "delete-user":
            store.delete(args.username)
            print(f"Deleted '{args.username}'")
    except AuthError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
