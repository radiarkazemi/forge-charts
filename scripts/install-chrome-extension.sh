#!/bin/bash
# One-click Chrome extension install (Linux). Opens Chrome with TRH extension loaded.
set -e
EXT_DIR="$(cd "$(dirname "$0")/../chrome-extension" && pwd)"
for chrome in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$chrome" >/dev/null 2>&1; then
    exec "$chrome" --load-extension="$EXT_DIR" "chrome://extensions/" 2>/dev/null &
    echo "Chrome opened with TRH extension loaded from $EXT_DIR"
    exit 0
  fi
done
echo "Chrome not found. Manual: chrome://extensions → Developer mode → Load unpacked → $EXT_DIR"
