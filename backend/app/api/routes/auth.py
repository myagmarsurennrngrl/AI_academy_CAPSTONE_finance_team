"""Authentication + user administration endpoints.

* POST   /api/auth/login                      username + password -> bearer token
* GET    /api/auth/me                         who am I (validates the token)
* PUT    /api/auth/me/password                change my own password
* GET    /api/auth/users                      [admin] list accounts
* POST   /api/auth/users                      [admin] create an account
* DELETE /api/auth/users/{username}           [admin] remove an account
* PUT    /api/auth/users/{username}/password  [admin] reset a password
* PUT    /api/auth/users/{username}/role      [admin] change a role

There is deliberately no public sign-up: only administrators create accounts.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response

from app.api.deps import get_current_user, require_admin
from app.models.schemas import (
    AuthUser,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    PasswordResetRequest,
    RoleUpdateRequest,
    UserCreateRequest,
    UserListResponse,
    UserPublic,
)
from app.services import auth_service
from app.services.auth_service import AuthError

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _raise(exc: AuthError) -> None:
    raise HTTPException(status_code=exc.status, detail=str(exc)) from exc


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    try:
        return LoginResponse(**auth_service.login(body.username, body.password))
    except AuthError as exc:
        _raise(exc)


@router.get("/me", response_model=AuthUser)
async def me(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    return user


@router.put("/me/password", response_model=AuthUser)
async def change_own_password(body: ChangePasswordRequest, user: AuthUser = Depends(get_current_user)) -> AuthUser:
    store = auth_service.get_store()
    try:
        store.authenticate(user.username, body.current_password)
        store.set_password(user.username, body.new_password)
    except AuthError as exc:
        _raise(exc)
    return user


@router.get("/users", response_model=UserListResponse)
async def list_users(_: AuthUser = Depends(require_admin)) -> UserListResponse:
    return UserListResponse(users=[UserPublic(**u) for u in auth_service.get_store().list_users()])


@router.post("/users", response_model=UserPublic, status_code=201)
async def create_user(body: UserCreateRequest, _: AuthUser = Depends(require_admin)) -> UserPublic:
    try:
        record = auth_service.get_store().create(body.username, body.password, body.role)
    except AuthError as exc:
        _raise(exc)
    return UserPublic(**record.public())


@router.delete("/users/{username}", status_code=204, response_class=Response)
async def delete_user(username: str, admin: AuthUser = Depends(require_admin)) -> Response:
    if username == admin.username:
        raise HTTPException(status_code=400, detail="You cannot delete your own account while signed in.")
    try:
        auth_service.get_store().delete(username)
    except AuthError as exc:
        _raise(exc)
    return Response(status_code=204)


@router.put("/users/{username}/password", response_model=UserPublic)
async def reset_password(username: str, body: PasswordResetRequest, _: AuthUser = Depends(require_admin)) -> UserPublic:
    store = auth_service.get_store()
    try:
        store.set_password(username, body.password)
    except AuthError as exc:
        _raise(exc)
    record = store.get(username)
    return UserPublic(**record.public())


@router.put("/users/{username}/role", response_model=UserPublic)
async def update_role(username: str, body: RoleUpdateRequest, admin: AuthUser = Depends(require_admin)) -> UserPublic:
    if username == admin.username and body.role != auth_service.ROLE_ADMIN:
        raise HTTPException(status_code=400, detail="You cannot remove your own administrator role.")
    store = auth_service.get_store()
    try:
        store.set_role(username, body.role)
    except AuthError as exc:
        _raise(exc)
    record = store.get(username)
    return UserPublic(**record.public())
