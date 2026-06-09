from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_recycle=settings.DB_POOL_RECYCLE,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


async def create_all_tables():
    async with engine.begin() as conn:
        from app.models import image_analysis, document, knowledge_document, document_content, knowledge_chunk  # noqa: F401 — register models

        # Enable pgvector extension
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

        # ORM tables (vision + document metadata, no vector column here)
        await conn.run_sync(Base.metadata.create_all)

        # RAG chunks table with native vector column
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS document_chunks (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                content TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                metadata JSONB DEFAULT '{}',
                embedding vector(1536),
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))

        # ivfflat index for fast approximate nearest neighbour search
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chunks_embedding
            ON document_chunks USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100)
        """))

        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_chunks_doc_id
            ON document_chunks (document_id)
        """))

        # BGE embeddings table (dim=512) — no vector index here;
        # add ivfflat/hnsw manually once the table has sufficient rows.
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS knowledge_embeddings (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                chunk_id UUID NOT NULL UNIQUE
                    REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
                embedding vector(512) NOT NULL
            )
        """))
