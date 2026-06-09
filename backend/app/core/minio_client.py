import io
import logging
import uuid
from datetime import timedelta

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: Minio | None = None

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
CONTENT_TYPE_EXT = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}


def get_minio_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
    return _client


def ensure_bucket() -> None:
    client = get_minio_client()
    try:
        if not client.bucket_exists(settings.MINIO_BUCKET):
            client.make_bucket(settings.MINIO_BUCKET)
            logger.info("Created MinIO bucket: %s", settings.MINIO_BUCKET)
    except S3Error as e:
        logger.error("MinIO bucket check/create failed: %s", e)
        raise


def upload_knowledge_image(file_bytes: bytes, content_type: str) -> tuple[str, str]:
    """Upload image bytes to MinIO under knowledge-images/ prefix.

    Returns (object_key, presigned_url).
    object_key is stored in knowledge_documents.minio_path;
    presigned_url (7-day validity) is used to call Qwen-VL and for display.
    """
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(f"Unsupported content type: {content_type}")

    ext = CONTENT_TYPE_EXT[content_type]
    object_name = f"knowledge-images/{uuid.uuid4()}.{ext}"

    client = get_minio_client()
    ensure_bucket()

    client.put_object(
        settings.MINIO_BUCKET,
        object_name,
        io.BytesIO(file_bytes),
        length=len(file_bytes),
        content_type=content_type,
    )

    url = client.presigned_get_object(
        settings.MINIO_BUCKET,
        object_name,
        expires=timedelta(days=7),
    )
    logger.info("Uploaded knowledge image to MinIO: %s (%d bytes)", object_name, len(file_bytes))
    return object_name, url


def get_presigned_url(object_key: str, expires_days: int = 7) -> str:
    """Generate a fresh presigned GET URL for an existing MinIO object."""
    client = get_minio_client()
    return client.presigned_get_object(
        settings.MINIO_BUCKET,
        object_key,
        expires=timedelta(days=expires_days),
    )


def upload_image(file_bytes: bytes, content_type: str) -> str:
    """Upload image bytes to MinIO under images/ prefix.

    Returns a presigned GET URL valid for 7 days.
    Raises ValueError for invalid content type, S3Error for upload failures.
    """
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(f"Unsupported content type: {content_type}")

    ext = CONTENT_TYPE_EXT[content_type]
    object_name = f"images/{uuid.uuid4()}.{ext}"

    client = get_minio_client()
    ensure_bucket()

    client.put_object(
        settings.MINIO_BUCKET,
        object_name,
        io.BytesIO(file_bytes),
        length=len(file_bytes),
        content_type=content_type,
    )

    url = client.presigned_get_object(
        settings.MINIO_BUCKET,
        object_name,
        expires=timedelta(days=7),
    )
    logger.info("Uploaded image to MinIO: %s (%d bytes)", object_name, len(file_bytes))
    return url
