"""Auth security primitives: bcrypt password hashing, JWT dual-token issuance,
Redis-backed refresh-token revocation, and the get_current_user dependency.

Design (enterprise dual-token, internal SSO):
  - Access token  — short-lived (settings.ACCESS_TOKEN_TTL), STATELESS. Verified
    by signature + expiry only (no DB/Redis hit), so it gates every request
    cheaply. Carries username/name/role claims so the API needs no user lookup.
  - Refresh token — long-lived (settings.REFRESH_TOKEN_TTL), STATEFUL. Its `jti`
    is stored in Redis (key auth:rt:{jti}); /auth/refresh ROTATES it (old jti
    deleted, new one stored) and /auth/logout REVOKES it. This gives real
    server-side session invalidation and replay protection.

Redis is optional: if REDIS_URL is unset (dev/test) refresh degrades to
stateless (no rotation tracking / revocation). The deployed server has Redis,
so revocation is fully enforced there.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Passwords ─────────────────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    """bcrypt hash (cost 12). NB: bcrypt truncates input at 72 bytes."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────


def _now() -> int:
    return int(time.time())


def create_access_token(
    *, user_id: str, username: str, name: str, role: str
) -> tuple[str, int]:
    """Return (access_token, expires_at_epoch_seconds)."""
    exp = _now() + settings.ACCESS_TOKEN_TTL
    payload = {
        "sub": str(user_id),
        "username": username,
        "name": name,
        "role": role,
        "type": "access",
        "jti": uuid.uuid4().hex,
        "iat": _now(),
        "exp": exp,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, exp


def create_refresh_token(*, user_id: str) -> tuple[str, str, int]:
    """Return (refresh_token, jti, expires_at_epoch_seconds)."""
    jti = uuid.uuid4().hex
    exp = _now() + settings.REFRESH_TOKEN_TTL
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": jti,
        "iat": _now(),
        "exp": exp,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, jti, exp


def decode_token(token: str, *, expected_type: str) -> dict:
    """Decode + verify a JWT. Raises jwt exceptions on invalid/expired tokens,
    ValueError on a token-type mismatch."""
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    if payload.get("type") != expected_type:
        raise ValueError(f"expected {expected_type} token, got {payload.get('type')}")
    return payload


# ── Refresh-token revocation store (Redis, optional) ──────────────────────────

_redis = None
_redis_unavailable = False


async def _get_redis():
    global _redis, _redis_unavailable
    if _redis_unavailable or not settings.REDIS_URL:
        return None
    if _redis is None:
        try:
            from redis import asyncio as aioredis

            _redis = aioredis.from_url(
                settings.REDIS_URL, encoding="utf-8", decode_responses=True
            )
        except Exception as exc:  # pragma: no cover - optional dependency
            logger.warning("auth: Redis unavailable, refresh revocation disabled: %s", exc)
            _redis_unavailable = True
            return None
    return _redis


async def store_refresh_jti(jti: str, user_id: str, ttl: int) -> None:
    r = await _get_redis()
    if r is None:
        return
    try:
        await r.setex(f"auth:rt:{jti}", ttl, str(user_id))
    except Exception as exc:  # pragma: no cover
        logger.warning("auth: failed to store refresh jti: %s", exc)


async def is_refresh_jti_valid(jti: str) -> bool:
    """True if the refresh jti is still active. Fail-open when Redis is absent
    (no store configured), fail-closed on a present-but-erroring store."""
    r = await _get_redis()
    if r is None:
        return True  # no revocation store configured → stateless refresh
    try:
        return bool(await r.exists(f"auth:rt:{jti}"))
    except Exception as exc:  # pragma: no cover
        logger.warning("auth: refresh jti check failed: %s", exc)
        return False


async def revoke_refresh_jti(jti: str) -> None:
    r = await _get_redis()
    if r is None:
        return
    try:
        await r.delete(f"auth:rt:{jti}")
    except Exception as exc:  # pragma: no cover
        logger.warning("auth: failed to revoke refresh jti: %s", exc)


# ── Current-user dependency ───────────────────────────────────────────────────


@dataclass
class CurrentUser:
    id: str
    username: str
    name: str
    role: str


_bearer = HTTPBearer(auto_error=False)
_UNAUTH = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> CurrentUser:
    """FastAPI dependency: require a valid access token, return the user claims.

    Use as a route/router dependency to enforce authentication, e.g.
        @router.get("/me")
        async def me(user: CurrentUser = Depends(get_current_user)): ...
    """
    if creds is None or not creds.credentials:
        raise _UNAUTH
    try:
        payload = decode_token(creds.credentials, expected_type="access")
    except Exception:
        raise _UNAUTH
    return CurrentUser(
        id=str(payload.get("sub", "")),
        username=str(payload.get("username", "")),
        name=str(payload.get("name", "")),
        role=str(payload.get("role", "")),
    )
