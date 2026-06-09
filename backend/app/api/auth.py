"""Authentication API — username/password login issuing a JWT dual-token pair,
refresh-token rotation, logout (revocation), and the current-user endpoint.

Mounted at /api/auth (see app.main). The frontend auth store consumes:
  POST /api/auth/login    {username, password}   -> {user, tokens}
  POST /api/auth/refresh  {refreshToken}          -> {tokens}
  POST /api/auth/logout   {refreshToken}          -> {ok}
  GET  /api/auth/me                               -> {user}   (Bearer access)
where tokens = {accessToken, refreshToken, expiresAt(ms)}.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    CurrentUser,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    is_refresh_jti_valid,
    revoke_refresh_jti,
    store_refresh_jti,
    verify_password,
)
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refreshToken: str = Field(..., min_length=1)


class UserOut(BaseModel):
    id: str
    username: str
    name: str
    role: str
    avatar: str


class TokensOut(BaseModel):
    accessToken: str
    refreshToken: str
    expiresAt: int  # epoch milliseconds


class LoginResponse(BaseModel):
    user: UserOut
    tokens: TokensOut


class TokensResponse(BaseModel):
    tokens: TokensOut


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=str(user.id),
        username=user.username,
        name=user.name,
        role=user.role,
        avatar=(user.name[:1] or user.username[:1] or "?"),
    )


async def _issue_tokens(user: User) -> TokensOut:
    access, exp_s = create_access_token(
        user_id=str(user.id), username=user.username, name=user.name, role=user.role
    )
    refresh, jti, refresh_exp = create_refresh_token(user_id=str(user.id))
    await store_refresh_jti(jti, str(user.id), settings.REFRESH_TOKEN_TTL)
    return TokensOut(accessToken=access, refreshToken=refresh, expiresAt=exp_s * 1000)


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    user = await db.scalar(select(User).where(User.username == req.username))
    # Constant-ish failure path: verify even when user is missing is overkill here;
    # return a uniform 401 for both unknown user and bad password.
    if user is None or not user.is_active or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误"
        )

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()

    tokens = await _issue_tokens(user)
    logger.info("auth: login ok user=%s", user.username)
    return LoginResponse(user=_user_out(user), tokens=tokens)


@router.post("/refresh", response_model=TokensResponse)
async def refresh(req: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokensResponse:
    try:
        payload = decode_token(req.refreshToken, expected_type="refresh")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh token expired")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token")

    jti = payload.get("jti", "")
    if not await is_refresh_jti_valid(jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh token revoked")

    user = await db.scalar(select(User).where(User.id == payload.get("sub")))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found")

    # Rotate: revoke the presented refresh token, issue a fresh pair.
    await revoke_refresh_jti(jti)
    tokens = await _issue_tokens(user)
    return TokensResponse(tokens=tokens)


@router.post("/logout")
async def logout(req: RefreshRequest) -> dict:
    # Revoke even if the token is expired/invalid — best-effort, always 200.
    try:
        payload = jwt.decode(
            req.refreshToken,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        if payload.get("jti"):
            await revoke_refresh_jti(payload["jti"])
    except Exception:
        pass
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(
    current: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Return the authenticated user's profile (fresh from the DB)."""
    user = await db.scalar(select(User).where(User.id == current.id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found")
    return _user_out(user)
