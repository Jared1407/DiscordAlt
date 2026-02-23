# Nexus — Encrypted Chat + Voice + Screen Share

A self-hosted communication platform with **end-to-end encryption**, real-time messaging, voice chat, and screen sharing.

Built on **Matrix Synapse** (messaging + E2E encryption) and **LiveKit** (voice/video/screen share).

---

## Quick Start

```powershell
# From PowerShell, in the project root:
.\start.ps1
```

Open **http://localhost:5173** in your browser.

> **First time?** The script auto-downloads LiveKit, installs npm deps, and starts everything.
> **Requires:** Docker Desktop for Windows, Node.js

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Vite)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ MatrixService│  │LiveKitService│  │  UI Components    │ │
│  │  (E2E crypto)│  │  (WebRTC)    │  │                   │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────────────┘ │
└─────────┼─────────────────┼─────────────────────────────────┘
          │                 │
          ▼                 ▼
  ┌───────────────┐  ┌─────────────┐  ┌──────────────────┐
  │ Matrix Synapse│  │ Token Server│  │   LiveKit SFU    │
  │   :8008       │  │   :3001     │  │   :7880          │
  │  (Docker)     │  │  (Docker)   │  │  (Native)        │
  └───────┬───────┘  └─────────────┘  └──────┬───────────┘
          │                                   │
          ▼                                   ▼
  ┌───────────────┐                   ┌──────────────────┐
  │  PostgreSQL   │                   │      Redis       │
  │   :5432       │                   │      :6379       │
  └───────────────┘                   └──────────────────┘
```

### Server Side (Docker + Native)

| Service | URL | Role |
|---------|-----|------|
| **Matrix Synapse** | http://localhost:8008 | Messaging, rooms, user auth |
| **PostgreSQL** | localhost:5432 | Synapse database |
| **Redis** | localhost:6379 | LiveKit coordination |
| **Token Server** | http://localhost:3001 | Issues authenticated LiveKit tokens |
| **LiveKit SFU** | ws://localhost:7880 | Voice, video, screen share (native Windows) |

### Client Side (Vite)

| Component | Purpose |
|-----------|---------|
| **MatrixService** | Auth, sync, rooms, messaging, E2E encryption |
| **LiveKitService** | Voice, screen share, WebRTC |
| **AppLayout** | Three-panel layout orchestrator |
| **ChatView** | Message display and input |
| **RoomSidebar** | Room list, create/join/browse |
| **VoiceControls** | Mute, deafen, screen share, disconnect |

---

## Security

- **🔒 E2E Encryption** — All new rooms use Megolm encryption (`m.megolm.v1.aes-sha2`). Messages are encrypted client-side before reaching the server.
- **🔑 Token Auth** — Voice tokens require a valid Matrix session. The token server verifies credentials against Synapse before issuing LiveKit access tokens.
- **🗄️ Key Storage** — Encryption keys are stored in the browser's IndexedDB via the Rust crypto WASM backend.

---

## Register Users

```powershell
# Create an admin account
docker exec -it synapse register_new_matrix_user http://localhost:8008 -c /data/homeserver.yaml -a

# Create a regular user
docker exec -it synapse register_new_matrix_user http://localhost:8008 -c /data/homeserver.yaml --no-admin
```

---

## Features

- **💬 Encrypted Messaging** — Real-time chat with E2E encryption, message grouping, timestamps
- **📢 Public Rooms** — Create rooms visible to all users on the server
- **🎙️ Voice Chat** — Click the phone icon on any room to enter voice
- **🖥️ Screen Share** — Share your screen with everyone in the voice call
- **🔇 Mute / Deafen** — Discord-style audio controls
- **🔒 Encryption Indicators** — Lock icons show which rooms are encrypted

---

## Project Structure

```
DiscordAlt/
├── clientApp/               # Client application (Vite)
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── services/        # MatrixService, LiveKitService
│   │   ├── utils/           # config, format, avatars, icons, time
│   │   ├── styles/          # CSS modules
│   │   └── main.js          # Entry point
│   └── package.json
├── tokenServer/             # Token server (Express, Docker)
│   ├── server.js
│   ├── Dockerfile
│   └── package.json
├── synapse-data/            # Synapse config (mounted into Docker)
├── docker-compose.yml       # Synapse, PostgreSQL, Redis, Token Server
└── start.ps1                # One-command full-stack launcher (PowerShell)
```

---

## Stop Everything

Press **Ctrl+C** in the PowerShell window running `start.ps1`. It automatically stops LiveKit and Docker services.
