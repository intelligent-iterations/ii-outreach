#!/usr/bin/env sh
set -eu

DISPLAY_VALUE="${DISPLAY:-:99}"

if command -v Xvfb >/dev/null 2>&1; then
  if ! pgrep -f "Xvfb ${DISPLAY_VALUE}" >/dev/null 2>&1; then
    Xvfb "${DISPLAY_VALUE}" -screen 0 1280x1024x24 >/tmp/xvfb.log 2>&1 &
    sleep 1
  fi
fi

export DISPLAY="${DISPLAY_VALUE}"

exec "$@"
