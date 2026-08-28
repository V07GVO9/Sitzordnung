#!/usr/bin/env pwsh
# Startet die Anwendung unter Windows. Frontend und API laufen unter derselben Adresse.
#
#   .\start.ps1              Port 5099
#   $env:PORT=8080; .\start.ps1
$ErrorActionPreference = 'Stop'

Set-Location -Path $PSScriptRoot

# Ohne gebautes Frontend würde nur die API antworten.
if (-not (Test-Path 'backend/Sitzordnung.Api/wwwroot/index.html')) {
    Write-Host '==> Frontend ist noch nicht gebaut, hole das nach'
    npm --prefix frontend ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci ist fehlgeschlagen.' }
    npm --prefix frontend run build
    if ($LASTEXITCODE -ne 0) { throw 'Der Frontend-Build ist fehlgeschlagen.' }
}

$port = if ($env:PORT) { $env:PORT } else { '5099' }
$env:ASPNETCORE_URLS = "http://localhost:$port"

Write-Host "==> Anwendung läuft auf $env:ASPNETCORE_URLS"
dotnet run --project backend/Sitzordnung.Api --no-launch-profile
