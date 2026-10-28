#!/usr/bin/env sh
# ═══════════════════════════════════════════════════════════════════
#  Nexus — Cross-Platform Full-Stack Launcher (POSIX sh)
#  Starts: Caddy (HTTPS) + Client + Synapse/Conduwuit + DB + Redis
#          + LiveKit SFU + Token Server via Docker Compose
# ═══════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ╔═══════════════════════════════════╗"
echo "  ║         NEXUS — Full Start        ║"
echo "  ╚═══════════════════════════════════╝"
echo ""

# ─── 1. Initialize .env and secrets if needed ───
echo "[1/2] Validating environment configuration..."
sh "$SCRIPT_DIR/scripts/init-env.sh"

if [ "${1:-}" = "--lite" ] || [ "${1:-}" = "lite" ]; then
    export COMPOSE_PROFILES="lite"
    export SYNAPSE_URL="http://conduwuit:8008"
fi

# ─── 2. Start all containers via Docker Compose ───
echo ""
echo "[2/2] Starting Docker Compose stack..."
docker compose up -d --build

DOMAIN="$(grep '^NEXUS_DOMAIN=' .env | cut -d= -f2- | tr -d '\r')"
[ -z "$DOMAIN" ] && DOMAIN="localhost"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✓ All Nexus services are running in Docker!"
echo ""
echo "  App (HTTPS):    https://${DOMAIN}"
echo "  Matrix API:     https://${DOMAIN}/_matrix/client/versions"
echo "  Token Health:   https://${DOMAIN}/api/health"
echo "  LiveKit WS:     wss://${DOMAIN}/livekit"
echo ""
echo "  Stop stack:     docker compose down"
echo "═══════════════════════════════════════════════════"
echo ""
