# ═══════════════════════════════════════════════════════════════════
# Nexus — First-Run Environment & Secret Generator (PowerShell)
# ═══════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvFile = Join-Path $RepoRoot ".env"
$EnvExample = Join-Path $RepoRoot ".env.example"

function New-RandomSecret([int]$Length = 32) {
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    $bytes = New-Object byte[] $Length
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $sb = New-Object System.Text.StringBuilder $Length
    foreach ($b in $bytes) {
        [void]$sb.Append($chars[$b % $chars.Length])
    }
    return $sb.ToString()
}

function Get-HostLanIp {
    try {
        $ip = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -ne "127.0.0.1" -and
                $_.IPAddress -notlike "169.254.*" -and
                $_.InterfaceAlias -notmatch "Loopback|vEthernet|WSL|Docker|VirtualBox|VMware"
            } |
            Select-Object -First 1 -ExpandProperty IPAddress
        if ($ip) { return $ip }
    } catch { }
    return "127.0.0.1"
}

if (-not (Test-Path $EnvFile)) {
    Write-Host "  Generating .env from .env.example with fresh 32-character secrets..." -ForegroundColor Cyan
    Copy-Item $EnvExample $EnvFile
}

$lines = Get-Content $EnvFile
$updated = @()
$lanIp = Get-HostLanIp

foreach ($line in $lines) {
    if ($line -match '^(POSTGRES_PASSWORD|LIVEKIT_API_SECRET|REGISTRATION_SHARED_SECRET|MACAROON_SECRET_KEY|FORM_SECRET)=\s*$') {
        $key = $Matches[1]
        $updated += "${key}=$(New-RandomSecret 32)"
    } elseif ($line -match '^HOST_LAN_IP=(127\.0\.0\.1)?\s*$' -and $lanIp -ne "127.0.0.1") {
        $updated += "HOST_LAN_IP=$lanIp"
    } else {
        $updated += $line
    }
}

[System.IO.File]::WriteAllText($EnvFile, ($updated -join "`n") + "`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Host "  ✓ Environment ready ($EnvFile)" -ForegroundColor Green
