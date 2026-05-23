#!/usr/bin/env sh
set -eu

export STREAM_TYPE="${STREAM_TYPE:-file}"
export DISPATCHER_ENABLED="${DISPATCHER_ENABLED:-false}"
export UDP_VIDEO_PORT="${UDP_VIDEO_PORT:-4000}"
export DURATION_MS="${DURATION_MS:-30000}"
export SEGMENT_BYTES="${SEGMENT_BYTES:-104857600}"
export UDP_PAYLOAD_BYTES="${UDP_PAYLOAD_BYTES:-32768}"
export MIN_SLEEP_MS="${MIN_SLEEP_MS:-0}"
export MAX_SLEEP_MS="${MAX_SLEEP_MS:-8}"

echo "[test] Start the server in another terminal first:"
echo "[test]   STREAM_TYPE=file DISPATCHER_ENABLED=false npm run dev"
echo "[test] Sending ordered UDP video stream for ${DURATION_MS} ms..."

npm run send:example
