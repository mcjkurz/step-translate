#!/bin/bash

cd "$(dirname "$0")"

# Load environment variables from .env file
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# Determine port: CLI arg > env var > default (6969)
PORT="${1:-${PORT:-6969}}"

# Create logs directory and timestamped log file
mkdir -p logs
LOG_FILE="logs/$(date '+%Y-%m-%d_%H-%M-%S').log"

# Kill existing server if running
if [ -f .server.pid ]; then
    PID=$(cat .server.pid)
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        echo "Stopped existing server (PID: $PID)"
        sleep 1
    fi
    rm -f .server.pid
fi

# Also kill any process on the target port
for pid in $(lsof -ti:"$PORT" 2>/dev/null); do
    kill "$pid" 2>/dev/null && echo "Killed process on port $PORT (PID: $pid)"
done
sleep 1

# Check virtual environment exists
if [ ! -d "venv" ]; then
    echo "Error: Virtual environment not found. Create it with:"
    echo "  python3 -m venv venv"
    echo "  source venv/bin/activate"
    echo "  pip install -r requirements.txt"
    exit 1
fi

# Activate virtual environment and start server in background
source venv/bin/activate
nohup uvicorn app.main:app --host 127.0.0.1 --port "$PORT" --log-config log_config.json >> "$LOG_FILE" 2>&1 &
echo $! > .server.pid

# Wait a moment and verify server started
sleep 1
if kill -0 "$(cat .server.pid)" 2>/dev/null; then
    echo "Server started on http://127.0.0.1:$PORT (PID: $(cat .server.pid))"
    echo "Logs: $LOG_FILE"
    echo ""
    echo "Use ./stop.sh to stop the server"
else
    echo "Error: Server failed to start. Check logs: $LOG_FILE"
    rm -f .server.pid
    exit 1
fi
