# ═══════════════════════════════════════════════════
#  Nexus — Full Stack Launch Script (Windows)
#  Starts: Synapse + PostgreSQL + Redis + Token Server
#          + LiveKit (native) + Vite Client
# ═══════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$LiveKitVersion = "1.9.11"
$LiveKitBin = Join-Path $ScriptDir "livekit-server.exe"
$LiveKitConfig = Join-Path $ScriptDir "livekit-dev.yaml"

Write-Host ""
Write-Host "  ╔═══════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║         NEXUS — Full Start        ║" -ForegroundColor Cyan
Write-Host "  ╚═══════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ─── 1. Docker services (Synapse, DB, Redis, Token Server) ───
Write-Host "[1/4] Starting Docker services..." -ForegroundColor Green
docker compose up -d --build synapse db redis token-server
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Docker failed to start! Is Docker Desktop running?" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Synapse (Matrix)    → http://localhost:8008" -ForegroundColor Gray
Write-Host "  ✓ Redis               → localhost:6379" -ForegroundColor Gray
Write-Host "  ✓ Token Server        → http://localhost:3001" -ForegroundColor Gray

# ─── 2. Download LiveKit binary if needed ───
if (-not (Test-Path $LiveKitBin)) {
    Write-Host ""
    Write-Host "[2/4] Downloading LiveKit v${LiveKitVersion}..." -ForegroundColor Green
    $url = "https://github.com/livekit/livekit/releases/download/v${LiveKitVersion}/livekit_${LiveKitVersion}_windows_amd64.zip"
    $zipPath = Join-Path $ScriptDir "livekit.zip"
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
    Expand-Archive -Path $zipPath -DestinationPath $ScriptDir -Force
    Remove-Item $zipPath -Force
    Write-Host "  ✓ LiveKit binary downloaded" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "[2/4] LiveKit binary found ✓" -ForegroundColor Green
}

# ─── 3. Generate LiveKit config & start natively ───
Write-Host ""
Write-Host "[3/4] Starting LiveKit server..." -ForegroundColor Green

# Write dev config
@"
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_ice_lite: true
redis:
  address: localhost:6379
keys:
  nexus_dev_key: nexus_dev_secret_CHANGE_ME_IN_PROD
logging:
  level: info
"@ | Set-Content -Path $LiveKitConfig -Encoding UTF8

# Kill any existing LiveKit
Get-Process -Name "livekit-server" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Start LiveKit in background
$livekitProcess = Start-Process -FilePath $LiveKitBin `
    -ArgumentList "--config", $LiveKitConfig, "--dev" `
    -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 2

if (-not $livekitProcess.HasExited) {
    Write-Host "  ✓ LiveKit SFU         → ws://localhost:7880 (PID: $($livekitProcess.Id))" -ForegroundColor Gray
} else {
    Write-Host "  ✗ LiveKit failed to start!" -ForegroundColor Red
    exit 1
}

# ─── 4. Start Vite dev server ───
Write-Host ""
Write-Host "[4/4] Starting Nexus client..." -ForegroundColor Green

Set-Location (Join-Path $ScriptDir "clientApp")

# Install deps if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing npm dependencies..."
    npm install
}

Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✓ All services running!" -ForegroundColor Green
Write-Host ""
Write-Host "  Open:  http://localhost:5173" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Matrix Server:  http://localhost:8008" -ForegroundColor Gray
Write-Host "  Token Server:   http://localhost:3001" -ForegroundColor Gray
Write-Host "  LiveKit SFU:    ws://localhost:7880" -ForegroundColor Gray
Write-Host ""
Write-Host "  Press Ctrl+C to stop all services" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Cleanup handler
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    Write-Host "`nShutting down..." -ForegroundColor Yellow
    Get-Process -Name "livekit-server" -ErrorAction SilentlyContinue | Stop-Process -Force
    docker compose stop 2>$null
    Write-Host "All services stopped." -ForegroundColor Green
}

try {
    # Run Vite in foreground
    npx vite --host
} finally {
    # Cleanup when Vite exits or Ctrl+C
    Write-Host "`nShutting down..." -ForegroundColor Yellow
    Get-Process -Name "livekit-server" -ErrorAction SilentlyContinue | Stop-Process -Force
    Set-Location $ScriptDir
    docker compose stop 2>$null
    Write-Host "All services stopped." -ForegroundColor Green
}
