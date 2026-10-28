# Nexus — Encrypted Chat + Voice + Screen Share

A self-hosted, LAN-friendly communication platform with **end-to-end encryption**, real-time messaging, voice chat, and screen sharing.

Built on **Matrix** (**Synapse** or lightweight **Conduwuit**), **LiveKit** (voice/video/screen share), and **Caddy** (single-origin local HTTPS reverse proxy).

---

## Quick Start

### 1. Standard Startup (Synapse + PostgreSQL)

**Windows (PowerShell):**
```powershell
.\start.ps1
```

**Linux / macOS:**
```bash
./start.sh
```

Or directly via Docker Compose after generating `.env`:
```bash
docker compose up -d --build
```

Open **https://localhost** in your browser.

> **First run?** The startup script automatically creates `.env` from `.env.example`, generates 32-character cryptographic secrets, detects your host LAN IP for LiveKit WebRTC, initializes the Matrix homeserver config (`synapse-init`), and launches all containers.

---

### 2. Lightweight Mode (`lite` profile — Raspberry Pi / Mini-PC / Low-RAM Hosts)

For low-memory home lab hosts, use the **`lite`** profile powered by **Conduwuit** (Rust + embedded RocksDB in `./conduwuit-data`) instead of Python Synapse + PostgreSQL:

```bash
# In .env, set SYNAPSE_URL=http://conduwuit:8008 (or pass it inline):
SYNAPSE_URL=http://conduwuit:8008 COMPOSE_PROFILES=lite docker compose --profile lite up -d --build
```

Or via the launcher scripts:
```powershell
# PowerShell
.\start.ps1 -Profile lite
```
```bash
# Linux / macOS
./start.sh --lite
```

---

## Architecture

All browser traffic flows through **Caddy** over HTTPS on port `443`, eliminating mixed-content issues and enabling WebRTC microphone and screen-sharing APIs (`navigator.mediaDevices`) across your LAN:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser (https://<host>)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ MatrixService│  │LiveKitService│  │     UI Components     │  │
│  │  (E2E crypto)│  │   (WebRTC)   │  │                       │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘  │
└─────────┼─────────────────┼──────────────────────┼──────────────┘
          │ /_matrix/*      │ /livekit/*  /api/*   │ /*
          ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Caddy Reverse Proxy (:443 HTTPS)                │
└───────┬───────────────────┬──────────────┬──────────────┬───────┘
        │                   │              │              │
        ▼                   ▼              ▼              ▼
┌───────────────┐   ┌──────────────┐ ┌───────────┐ ┌──────────────┐
│ Matrix Server │   │ LiveKit SFU  │ │Token Srv  │ │ Client Nginx │
│ Synapse :8008 │   │ :7880 / :7882│ │   :3001   │ │     :80      │
│ or Conduwuit  │   └───────┬──────┘ └───────────┘ └──────────────┘
└───────┬───────┘           │
        │                   ▼
        ▼           ┌──────────────┐
┌───────────────┐   │    Redis     │
│  PostgreSQL   │   │    :6379     │
└───────────────┘   └──────────────┘
```

---

## Connecting from Other Devices on Your LAN

Browsers require a secure context (`https://`) on non-`localhost` origins before allowing microphone capture (`getUserMedia`) or screen sharing (`getDisplayMedia`).

1. **Set your LAN IP or hostname in `.env`:**
   ```ini
   NEXUS_DOMAIN=192.168.1.50
   HOST_LAN_IP=192.168.1.50
   NEXUS_TLS_MODE=internal
   ```
   Restart Caddy and LiveKit:
   ```bash
   docker compose up -d caddy livekit
   ```

2. **Trust the Caddy Local Root CA on LAN client devices:**
   Caddy generates its local root certificate at:
   ```
   ./caddy-data/caddy/pki/authorities/local/root.crt
   ```
   Copy `root.crt` to your other LAN devices and add it to their trust store:
   - **Windows:** Double-click `root.crt` → *Install Certificate* → *Local Machine* → *Place all certificates in the following store* → *Trusted Root Certification Authorities*.
   - **macOS:** Double-click `root.crt` to add to *Keychain Access* → *System*, then open the certificate and set *When using this certificate* to *Always Trust*.
   - **Linux (Ubuntu/Debian):**
     ```bash
     sudo cp root.crt /usr/local/share/ca-certificates/nexus-caddy-root.crt
     sudo update-ca-certificates
     ```
   - **iOS / Android:** Transfer `root.crt` to the device, install the CA profile in system settings, and enable full trust for root certificates (iOS: *Settings → General → About → Certificate Trust Settings*).

3. **Open `https://<NEXUS_DOMAIN>`** from any device on your LAN. The client automatically resolves Matrix (`https://<host>`), Token Server (`https://<host>/api`), and LiveKit (`wss://<host>/livekit`) from `window.location`.

---

## Stop Everything

```bash
docker compose down
```
