#!/bin/bash
#
# Start Blackjack locally.
#
#   bash start.sh            build if needed, then run
#   bash start.sh --build    force a rebuild first
#
# Stop it again with `bash stop.sh`.

set -euo pipefail
cd "$(dirname "$0")"

PORT="${APP_PORT:-8090}"
JAR="build/libs/de.mw.blackjack-all.jar"
PID_FILE="./server.pid"
LOG="./server.log"
FORCE_BUILD=false
[ "${1:-}" = "--build" ] && FORCE_BUILD=true

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[1mError:\033[0m %s\n' "$*" >&2; exit 1; }

if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
    say "Already running at http://localhost:$PORT — stop.sh first for a clean restart."
    exit 0
fi

# Tailwind scans the Kotlin sources for class names, so a .kt edit invalidates the
# stylesheet as surely as a .css one.
stale() {
    [ ! -f "$1" ] && return 0
    [ -n "$(find src build.gradle.kts -type f -newer "$1" -print -quit 2>/dev/null)" ]
}

if stale src/jvmMain/resources/static/output.css || [ "$FORCE_BUILD" = true ]; then
    say "Compiling Tailwind..."
    [ -d node_modules ] || npm install --silent
    npx tailwindcss --minify -i ./src/jvmMain/resources/static/input.css \
                    -o ./src/jvmMain/resources/static/output.css >/dev/null 2>&1 \
        || die "Tailwind build failed."
fi

if stale "$JAR" || [ "$FORCE_BUILD" = true ]; then
    say "Building..."
    ./gradlew build -x test --console=plain -q || die "Build failed."
fi

say "Starting..."
: > "$LOG"
# The same knobs the image sets, so local behaviour matches the deployment.
# A fixed small heap locally: MaxRAMPercentage is for the container, and on a laptop
# with 64 GB it sizes a heap this app will never come close to needing.
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:--Xmx256m -XX:+UseSerialGC -XX:MaxMetaspaceSize=128m -XX:MaxDirectMemorySize=128m -Dio.netty.allocator.type=unpooled}"
nohup java -jar "$JAR" > "$LOG" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
disown "$SERVER_PID" 2>/dev/null || true

printf '   waiting for the server'
for _ in $(seq 1 60); do
    curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 && { printf ' up\n'; break; }
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        printf '\n'; tail -20 "$LOG"; rm -f "$PID_FILE"; die "Server exited during startup."
    fi
    printf '.'; sleep 1
done

curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 || { tail -20 "$LOG"; die "Server never became healthy."; }

echo
say "Blackjack is running at http://localhost:$PORT"
echo "  On your phone: http://$(ipconfig getifaddr en0 2>/dev/null || echo '<your-ip>'):$PORT"
echo "  Logs: tail -f $LOG   Stop: bash stop.sh"
