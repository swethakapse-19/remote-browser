#!/bin/bash
set -e

echo "[entrypoint] Starting Xvfb virtual display on :99..."
Xvfb :99 -screen 0 1280x720x24 -ac &
XVFB_PID=$!

sleep 1
echo "[entrypoint] Xvfb started (PID: $XVFB_PID)"

if ! xdpyinfo -display :99 &>/dev/null; then
    echo "[entrypoint] ERROR: Xvfb display :99 is not available"
    exit 1
fi
echo "[entrypoint] Display :99 confirmed ready"

echo "[entrypoint] Starting Chromium with CDP on port 9222..."
exec $CHROME_BIN \
    --no-sandbox \
    --disable-setuid-sandbox \
    --disable-dev-shm-usage \
    --disable-accelerated-2d-canvas \
    --disable-gpu \
    --disable-background-timer-throttling \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    --disable-ipc-flooding-protection \
    --remote-debugging-port=9222 \
    --remote-debugging-address=0.0.0.0 \
    --window-size=1280,720 \
    --force-device-scale-factor=1 \
    --user-data-dir=/home/chrome/.config/chromium \
    --display=:99 \
    "about:blank"
