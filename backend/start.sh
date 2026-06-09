#!/usr/bin/env bash
set -e

echo "=== Atlas Vision Backend ==="

# Install deps if needed
if ! python -c "import fastapi" 2>/dev/null; then
  echo "[1/3] Installing Python dependencies..."
  pip install -r requirements.txt
fi

# Create tables
echo "[2/3] Ensuring database tables exist..."
python create_tables.py

# Start server
echo "[3/3] Starting FastAPI server on http://localhost:8000"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
