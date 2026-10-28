# ═══════════════════════════════════════════════════════════════════
#  Nexus — Cross-Platform Full-Stack Launcher (PowerShell)
#  Starts: Caddy (HTTPS) + Client + Synapse/Conduwuit + DB + Redis
#          + LiveKit SFU + Token Server via Docker Compose
# ═══════════════════════════════════════════════════════════════════

param(
    [ValidateSet("synapse", "lite")]
    [string]$Profile = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host ""
Write-Host "  ╔═══════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║         NEXUS — Full Start        ║" -ForegroundColor Cyan
Write-Host "  ╚═══════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ─── 1. Initialize .env and secrets if needed ───
Write-Host "[1/2] Validating environment configuration..." -ForegroundColor Green
& (Join-Path $ScriptDir "scripts\init-env.ps1")

if ($Profile -eq "lite") {
    $env:COMPOSE_PROFILES = "lite"
    $env:SYNAPSE_URL = "http://conduwuit:8008"
} elseif ($Profile -eq "synapse") {
    $env:COMPOSE_PROFILES = "synapse"
    $env:SYNAPSE_URL = "http://synapse:8008"
}

# ─── 2. Start all containers via Docker Compose ───
Write-Host ""
Write-Host "[2/2] Starting Docker Compose stack..." -ForegroundColor Green
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ✗ Docker Compose failed to start! Is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

$domain = "localhost"
$lanIp = "127.0.0.1"
foreach ($line in (Get-Content (Join-Path $ScriptDir ".env"))) {
    if ($line -match '^NEXUS_DOMAIN=(.+)$') { $domain = $Matches[1].Trim() }
    if ($line -match '^HOST_LAN_IP=(.+)$') { $lanIp = $Matches[1].Trim() }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✓ All Nexus services are running in Docker!" -ForegroundColor Green
Write-Host ""
Write-Host "  App (HTTPS):    https://$domain" -ForegroundColor Yellow
if ($lanIp -ne "127.0.0.1") {
    Write-Host "  LAN IP:         $lanIp" -ForegroundColor Gray
}
Write-Host "  Matrix API:     https://$domain/_matrix/client/versions" -ForegroundColor Gray
Write-Host "  Token Health:   https://$domain/api/health" -ForegroundColor Gray
Write-Host "  LiveKit WS:     wss://$domain/livekit" -ForegroundColor Gray
Write-Host ""
Write-Host "  Stop stack:     docker compose down" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
