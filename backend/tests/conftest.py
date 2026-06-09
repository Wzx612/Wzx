"""Shared pytest fixtures for integration tests that require a real database.

Design note:
  pytest-asyncio uses a FRESH event loop per test function
  (asyncio_default_test_loop_scope = function, as in pytest.ini).
  SQLAlchemy's asyncpg connection pool stores connections bound to the
  event loop they were created in.  Re-using the global app engine across
  test functions therefore produces "Event loop is closed" errors on the
  second test onward.

  Fix: create a brand-new engine (pool_size=1) for every test function and
  dispose it at the end of the test.  Tables are expected to already exist
  (the app creates them on startup; run the server once or call
  app.core.database.create_all_tables() manually before the test suite).
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


@pytest.fixture
async def db() -> AsyncSession:
    """Function-scoped async session backed by a fresh per-test engine."""
    engine = create_async_engine(
        settings.DATABASE_URL,
        pool_size=1,
        max_overflow=0,
        echo=False,
    )
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        try:
            yield session
        finally:
            await session.close()
    await engine.dispose()
