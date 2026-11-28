#!/bin/sh
set -eu

mkdir -p /data

cd /app
pnpm --filter @practice-room/api start &
API_PID=$!

# Wait until API is up (or give up after ~90s and still start nginx)
i=0
while [ "$i" -lt 90 ]; do
  if wget -q -O - http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1; then
    break
  fi
  # If API already died, stop waiting
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "API process exited before becoming healthy" >&2
    break
  fi
  i=$((i + 1))
  sleep 1
done

# nginx must stay in the foreground on 0.0.0.0:8080 for Fly
exec nginx -g "daemon off;"
