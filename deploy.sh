#!/bin/bash
#
# Build and run the container. Safe to re-run: it rebuilds, swaps and waits for the
# new one to answer /health.
#
#   bash deploy.sh          build and (re)start
#   bash deploy.sh --logs   follow the log afterwards

set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf '\033[1mError:\033[0m %s\n' "$*" >&2; exit 1; }

docker info >/dev/null 2>&1 || die "Docker isn't running."

# A first deploy should not fail on a missing secret — it should mint one.
if [ ! -f .env ]; then
    say "No .env — writing one with a fresh session key."
    KEY="$(openssl rand -hex 16)"
    sed "s/^BJ_SESSION_KEY=.*/BJ_SESSION_KEY=$KEY/" .env.example > .env
fi

# shellcheck disable=SC1091
set -a; . ./.env; set +a
[ -n "${BJ_SESSION_KEY:-}" ] || die "BJ_SESSION_KEY is empty in .env — 'openssl rand -hex 16'."

BUILD_ID="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
export BUILD_ID
PORT="${PORT:-8090}"

say "Building ${BUILD_ID}..."
docker compose build --quiet

say "Starting..."
docker compose up -d --remove-orphans

printf '   waiting for the table'
for _ in $(seq 1 60); do
    curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 && { printf ' up\n'; break; }
    printf '.'; sleep 1
done
curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1 \
    || { docker compose logs --tail 30; die "Never became healthy."; }

# The one failure that looks like success: a container running on the public dev key.
if docker compose logs 2>&1 | grep -q "dev default"; then
    die "Running on the public dev session key — BJ_SESSION_KEY did not reach the container."
fi

echo
say "Blackjack is running at http://localhost:$PORT"
echo "  Logs:  docker compose logs -f"
echo "  Stop:  docker compose down"

[ "${1:-}" = "--logs" ] && docker compose logs -f
