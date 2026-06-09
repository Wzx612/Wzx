-- ============================================================================
-- Atlas — database initialization (PostgreSQL 16 + pgvector)
--
-- Runs automatically on first boot via the Postgres entrypoint
-- (/docker-entrypoint-initdb.d/init.sql). Idempotent: safe to re-apply by hand.
--
-- Mirrors app/core/database.py + the SQLAlchemy models so the schema exists
-- before any application container connects.
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector: vector(n) columns + <=> ops

-- ── Enums (guarded for idempotency) ─────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doc_status') THEN
        CREATE TYPE doc_status AS ENUM ('processing', 'ready', 'error');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'analysis_status') THEN
        CREATE TYPE analysis_status AS ENUM ('pending', 'done', 'error');
    END IF;
END$$;

-- ── Legacy / OpenAI-style document pipeline (documents + document_chunks) ────
CREATE TABLE IF NOT EXISTS documents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename      VARCHAR(500)  NOT NULL,
    file_type     VARCHAR(50)   NOT NULL,
    minio_key     VARCHAR(1000) NOT NULL,
    file_size     INTEGER       NOT NULL,
    status        doc_status    NOT NULL DEFAULT 'processing',
    chunk_count   INTEGER       NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    metadata    JSONB DEFAULT '{}',
    embedding   vector(1536),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Knowledge-base pipeline (BGE, dim=512) — the verified RAG path ──────────
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name  VARCHAR(500)  NOT NULL,
    file_type  VARCHAR(50)   NOT NULL,
    file_size  INTEGER       NOT NULL,
    minio_path VARCHAR(1000) NOT NULL,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_embeddings (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id  UUID NOT NULL UNIQUE REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
    embedding vector(512) NOT NULL
);

CREATE TABLE IF NOT EXISTS document_content (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    page_count  INTEGER NOT NULL DEFAULT 0,
    char_count  INTEGER NOT NULL DEFAULT 0,
    parsed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_document_content_doc_id UNIQUE (document_id)
);

-- ── Vision analysis audit trail ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS image_analysis_records (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           VARCHAR(128),
    image_url         TEXT NOT NULL,
    original_filename VARCHAR(512) NOT NULL,
    file_size         INTEGER NOT NULL,
    summary           TEXT,
    analysis_result   JSONB,
    token_input       INTEGER,
    token_output      INTEGER,
    latency_ms        INTEGER,
    status            analysis_status NOT NULL DEFAULT 'pending',
    error_message     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Auth: application users (bcrypt password hashes; JWT issued at login) ─────
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(64)  UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(128) NOT NULL,
    role          VARCHAR(64)  NOT NULL DEFAULT 'user',
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chunks_doc_id        ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_doc ON knowledge_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_image_records_user   ON image_analysis_records (user_id);
CREATE INDEX IF NOT EXISTS idx_users_username       ON users (username);

-- NOTE: No ANN (IVFFlat/HNSW) index on the embedding columns yet.
-- IVFFlat with lists=100 on a near-empty table is unreliable: with the default
-- ivfflat.probes=1 a query scans a single list, so when row_count << lists it
-- can return ZERO rows even though matches exist. pgvector falls back to an
-- exact (sequential) cosine scan without an index, which is always correct and
-- fast while tables are small. Add a tuned IVFFlat/HNSW index manually once the
-- tables hold enough rows (see deploy/PRODUCTION.md).

-- ============================================================================
-- Done. Application containers find the full schema ready on startup.
-- ============================================================================
