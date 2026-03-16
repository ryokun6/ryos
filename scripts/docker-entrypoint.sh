#!/bin/bash
set -e

# Start Lightpanda headless browser in the background
echo "[entrypoint] Starting Lightpanda browser on :9222..."
lightpanda serve --host 127.0.0.1 --port 9222 &
BROWSER_PID=$!

# Wait for CDP port to be ready
for i in $(seq 1 30); do
  if echo > /dev/tcp/127.0.0.1/9222 2>/dev/null; then
    echo "[entrypoint] Lightpanda ready (pid $BROWSER_PID)"
    break
  fi
  sleep 0.2
done

# Start the app
echo "[entrypoint] Starting app..."
exec bun run start
