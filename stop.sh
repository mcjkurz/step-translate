#!/bin/bash

cd "$(dirname "$0")"

stopped=false

if [ -f .server.pid ]; then
    PID=$(cat .server.pid)
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        echo "Server stopped (PID: $PID)"
        stopped=true
    else
        echo "Server not running (stale PID file)"
    fi
    rm -f .server.pid
fi

# Also check for any process on port 6969
for pid in $(lsof -ti:6969 2>/dev/null); do
    kill "$pid" 2>/dev/null
    if [ "$stopped" = false ]; then
        echo "Killed process on port 6969 (PID: $pid)"
        stopped=true
    fi
done

if [ "$stopped" = false ]; then
    echo "No server running on port 6969"
fi
