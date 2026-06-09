from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DASHSCOPE_API_KEY: str
    DEEPSEEK_API_KEY: str = ""
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
