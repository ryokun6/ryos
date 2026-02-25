#!/usr/bin/env bash
# Fast full-stack dev: Vite serves frontend directly (fast), API requests proxy to vercel dev.
#
# This avoids the ~190ms/request overhead of vercel dev's proxy for frontend modules,
# reducing initial page load from ~35s to ~6s while keeping full API support.
#
# Architecture:
#   Browser → Vite (port 5173) → fast module serving
#              ↓ /api/* proxy
#          vercel dev (port 3001) → serverless function execution
set -e

API_PORT="${VERCEL_API_PORT:-3001}"

# Ensure api symlink exists
bash scripts/ensure-api-symlink.sh

cleanup() {
  if [ -n "$API_PID" ]; then
    kill "$API_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup EXIT INT TERM

echo "[dev:full] Starting vercel dev for API on port $API_PORT..."
vercel dev --listen "$API_PORT" &
API_PID=$!

# Wait for vercel dev to be ready
echo "[dev:full] Waiting for API server..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null "http://localhost:$API_PORT" 2>/dev/null; then
    echo "[dev:full] API server ready on port $API_PORT"
    break
  fi
  sleep 1
done

echo "[dev:full] Starting Vite dev server (frontend) on port 5173..."
echo "[dev:full] API requests (/api/*) will be proxied to port $API_PORT"
echo ""
VERCEL_API_PORT="$API_PORT" NODE_OPTIONS='--max-old-space-size=4096' npx vite --port 5173
