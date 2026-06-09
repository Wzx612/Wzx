"""Integration tests for the JWT dual-token auth flow.

Hits the real FastAPI app in-process (httpx ASGITransport) against the real
Postgres from settings. Validates: login (ok/bad), the get_current_user gate
(/me + a business route: 401 vs 200), refresh issuing a fresh rotated pair,
and logout.

To avoid the asyncpg "Event loop is closed" pool-across-loops issue (see
conftest), this module never touches the global engine: it builds a fresh
NullPool engine per use and overrides the app's get_db dependency.
"""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password
from app.main import app

USERNAME = "pytest_auth_user"
PASSWORD = "Sup3r-Secret-Pw!"


def _fresh_engine():
    # NullPool: every connection is opened/closed per use, so nothing is bound
    # to a now-closed event loop between tests.
    return create_async_engine(settings.DATABASE_URL, poolclass=NullPool)


@pytest.fixture(scope="module")
def seeded_user():
    import asyncio

    async def _run(sql_fn):
        eng = _fresh_engine()
        try:
            async with eng.begin() as conn:
                await sql_fn(conn)
        finally:
            await eng.dispose()

    async def _setup(conn):
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                username VARCHAR(64) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(128) NOT NULL,
                role VARCHAR(64) NOT NULL DEFAULT 'user',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                last_login_at TIMESTAMPTZ
            )
        """))
        await conn.execute(
            text("""
                INSERT INTO users (username, password_hash, name, role)
                VALUES (:u, :p, '测试用户', 'admin')
                ON CONFLICT (username)
                DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = TRUE
            """),
            {"u": USERNAME, "p": hash_password(PASSWORD)},
        )

    async def _teardown(conn):
        await conn.execute(text("DELETE FROM users WHERE username = :u"), {"u": USERNAME})

    asyncio.run(_run(_setup))
    yield
    asyncio.run(_run(_teardown))


@pytest.fixture
async def client():
    """httpx client whose app uses a per-test NullPool engine for get_db."""
    eng = _fresh_engine()
    Session = async_sessionmaker(eng, expire_on_commit=False)

    async def _get_db():
        async with Session() as s:
            yield s

    app.dependency_overrides[get_db] = _get_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_db, None)
        await eng.dispose()


async def _login(c: AsyncClient) -> dict:
    r = await c.post("/api/auth/login", json={"username": USERNAME, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()


class TestLogin:
    async def test_login_ok_returns_user_and_dual_tokens(self, seeded_user, client):
        body = await _login(client)
        assert body["user"]["username"] == USERNAME
        assert body["user"]["role"] == "admin"
        assert body["user"]["avatar"]
        t = body["tokens"]
        assert t["accessToken"] and t["refreshToken"]
        assert t["accessToken"] != t["refreshToken"]
        assert t["expiresAt"] > 0

    async def test_login_wrong_password_401(self, seeded_user, client):
        r = await client.post("/api/auth/login", json={"username": USERNAME, "password": "wrong"})
        assert r.status_code == 401

    async def test_login_unknown_user_401(self, seeded_user, client):
        r = await client.post("/api/auth/login", json={"username": f"nope_{uuid.uuid4().hex}", "password": "x"})
        assert r.status_code == 401


class TestGate:
    async def test_me_requires_auth(self, seeded_user, client):
        r = await client.get("/api/auth/me")
        assert r.status_code == 401

    async def test_me_with_access_token(self, seeded_user, client):
        access = (await _login(client))["tokens"]["accessToken"]
        r = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {access}"})
        assert r.status_code == 200, r.text
        assert r.json()["username"] == USERNAME

    async def test_me_rejects_garbage_token(self, seeded_user, client):
        r = await client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
        assert r.status_code == 401

    async def test_business_route_is_gated(self, seeded_user, client):
        # A protected router path must reject unauthenticated requests with 401.
        r = await client.post("/api/retrieval/search", json={})
        assert r.status_code == 401


class TestRefreshLogout:
    async def test_refresh_issues_fresh_rotated_pair(self, seeded_user, client):
        refresh = (await _login(client))["tokens"]["refreshToken"]
        r = await client.post("/api/auth/refresh", json={"refreshToken": refresh})
        assert r.status_code == 200, r.text
        new_tokens = r.json()["tokens"]
        assert new_tokens["accessToken"] and new_tokens["refreshToken"]
        assert new_tokens["refreshToken"] != refresh  # rotated

    async def test_refresh_rejects_access_token(self, seeded_user, client):
        access = (await _login(client))["tokens"]["accessToken"]
        r = await client.post("/api/auth/refresh", json={"refreshToken": access})
        assert r.status_code == 401  # wrong token type

    async def test_logout_ok(self, seeded_user, client):
        refresh = (await _login(client))["tokens"]["refreshToken"]
        r = await client.post("/api/auth/logout", json={"refreshToken": refresh})
        assert r.status_code == 200
        assert r.json()["ok"] is True
