from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DASHSCOPE_API_KEY: str
    DEEPSEEK_API_KEY: str = ""

    # ── Multi-provider chat proxy (/api/chat/stream) ─────────────────────────
    # Server-side provider keys so the frontend never ships them in the bundle.
    # Each is optional; a request for a provider with an empty key yields a clean
    # error event instead of calling out. DeepSeek reuses DEEPSEEK_API_KEY above.
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    ANTHROPIC_API_KEY: str = ""
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/atlas"
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "atlas-images"
    MINIO_SECURE: bool = False
    MAX_FILE_SIZE_MB: int = 10
    RATE_LIMIT_PER_MINUTE: int = 20

    # ── Microservice topology ────────────────────────────────────────────────
    # Identifies this process in /health and logs (embedding-service / rag-service / agent-service).
    SERVICE_NAME: str = "atlas-api"
    # When set, this process does NOT load the BGE model; it proxies all
    # embedding work to the embedding-service over HTTP. Leave EMPTY on the
    # embedding-service itself (it is the model host).
    EMBEDDING_SERVICE_URL: str = ""
    EMBEDDING_HTTP_TIMEOUT: float = 180.0
    # Optional Redis cache for query embeddings. Empty disables caching
    # (fail-open: the app runs identically without Redis).
    REDIS_URL: str = ""
    EMBEDDING_CACHE_TTL: int = 86400  # seconds

    # ── Auth (JWT dual-token + bcrypt) ────────────────────────────────────────
    # HS256 signing secret. MUST be overridden in production (set JWT_SECRET in
    # the server's backend/.env to a long random string). Tokens are otherwise
    # forgeable. Access tokens are short-lived; refresh tokens are long-lived and
    # revocable via Redis (jti allow-list).
    JWT_SECRET: str = "dev-insecure-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_TTL: int = 900       # seconds (15 min)
    REFRESH_TOKEN_TTL: int = 604800   # seconds (7 days)
    # Bootstrap admin: seeded once on startup if the users table has no such user
    # AND ADMIN_PASSWORD is non-empty. Leave ADMIN_PASSWORD empty to skip seeding.
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = ""
    ADMIN_NAME: str = "管理员"

    # ── Production tuning / observability ─────────────────────────────────────
    # Comma-separated extra CORS origins, e.g. "https://www.example.com,https://example.com"
    ALLOWED_ORIGINS: str = ""
    METRICS_ENABLED: bool = True
    # SQLAlchemy async pool sizing (per process). Tune for connection limits.
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800  # seconds; recycle conns to dodge stale TCP

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
