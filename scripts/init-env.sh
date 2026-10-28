#!/usr/bin/env sh
# ═══════════════════════════════════════════════════════════════════
# Nexus — First-Run Environment & Secret Generator (POSIX sh)
# ═══════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"
ENV_EXAMPLE="$REPO_ROOT/.env.example"

generate_secret() {
    LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32
}

detect_lan_ip() {
    if command -v ip >/dev/null 2>&1; then
        ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -n1
    elif command -v ipconfig >/dev/null 2>&1; then
        ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
    elif command -v hostname >/dev/null 2>&1; then
        hostname -I 2>/dev/null | awk '{print $1}'
    fi
}

if [ ! -f "$ENV_FILE" ]; then
    echo "  Generating .env from .env.example with fresh 32-character secrets..."
    cp "$ENV_EXAMPLE" "$ENV_FILE"
fi

LAN_IP="$(detect_lan_ip)"
[ -z "$LAN_IP" ] && LAN_IP="127.0.0.1"

for KEY in POSTGRES_PASSWORD LIVEKIT_API_SECRET REGISTRATION_SHARED_SECRET MACAROON_SECRET_KEY FORM_SECRET; do
    if grep -q "^${KEY}=$" "$ENV_FILE"; then
        SECRET="$(generate_secret)"
        sed -i.bak "s|^${KEY}=$|${KEY}=${SECRET}|" "$ENV_FILE"
    fi
done

if [ "$LAN_IP" != "127.0.0.1" ] && grep -qE "^HOST_LAN_IP=(127\.0\.0\.1)?$" "$ENV_FILE"; then
    sed -i.bak "s|^HOST_LAN_IP=.*|HOST_LAN_IP=${LAN_IP}|" "$ENV_FILE"
fi

rm -f "${ENV_FILE}.bak"
echo "  ✓ Environment ready ($ENV_FILE)"
