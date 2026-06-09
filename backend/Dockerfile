# ── Atlas backend image (production-hardened) ─────────────────────────────────
# A single image powers all three application services (embedding / rag / agent);
# behaviour is differentiated by environment variables at runtime, not by image.
#
# The BGE model is downloaded once at runtime into a shared named volume
# (HF_HOME=/models) by the embedding-service, keeping the image lean.
#
# Hardening: runs as a non-root user; deps pinned via requirements; CPU-only torch.

FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/models \
    UVICORN_WORKERS=1

WORKDIR /app

# Runtime system deps:
#   curl     — container HEALTHCHECK
#   libgomp1 — OpenMP runtime required by torch/sentence-transformers
#   tini     — proper PID 1 / signal handling for graceful shutdown
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libgomp1 tini \
    && rm -rf /var/lib/apt/lists/*

# Install the CPU-only torch wheel first so the transitive dependency pulled in
# by sentence-transformers does NOT drag in the multi-GB CUDA build.
COPY requirements.txt .
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch \
    && pip install --no-cache-dir -r requirements.txt

# Non-root user. /models is created and owned by app so the fresh named volume
# inherits writable ownership (Docker seeds empty volumes from the image path).
RUN useradd --create-home --uid 10001 app \
    && mkdir -p /models \
    && chown -R app:app /app /models

COPY --chown=app:app . .

USER app

EXPOSE 8000

# Long start period covers first-boot model load on embedding-service.
HEALTHCHECK --interval=15s --timeout=5s --start-period=240s --retries=10 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# tini as PID 1 → clean SIGTERM handling for zero-drop rolling restarts.
ENTRYPOINT ["/usr/bin/tini", "--"]
# Shell form so UVICORN_WORKERS env (per-service) is honoured.
CMD uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-1}
