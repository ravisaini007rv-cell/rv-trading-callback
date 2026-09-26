#!/usr/bin/env bash
# RV Market Intelligence — one-click runner (Mac / Linux)
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  echo "📦 First run — setting up (2-3 min)…"
  python3 -m venv .venv
  ./.venv/bin/pip install --quiet -r requirements.txt
fi

echo "🚀 Starting RV Market Intelligence on http://localhost:8000"
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
if [ -n "$IP" ]; then
  echo "📱 Phone se kholne ke liye (same WiFi): http://$IP:8000"
fi
( sleep 2 && (open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000 2>/dev/null) ) &
exec ./.venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8000
