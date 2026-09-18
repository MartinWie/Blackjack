#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

PID_FILE="./server.pid"
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    kill "$(cat "$PID_FILE")"
    rm -f "$PID_FILE"
    echo "Stopped."
else
    rm -f "$PID_FILE"
    pkill -f "de.mw.blackjack-all.jar" 2>/dev/null && echo "Stopped (by jar name)." || echo "Nothing running."
fi
