#!/usr/bin/env bash
# Startet die Anwendung: baut das Frontend bei Bedarf und liefert es aus.
#
#   ./start.sh          Port 5099
#   PORT=8080 ./start.sh
set -euo pipefail

cd "$(dirname "$0")"

# Ohne gebautes Frontend gäbe es nichts auszuliefern.
if [ ! -f frontend/dist/index.html ]; then
  echo "==> Frontend ist noch nicht gebaut, hole das nach"
  npm --prefix frontend ci
  npm --prefix frontend run build
fi

# 0.0.0.0 statt localhost, damit die Portweiterleitung in Codespaces greift.
export ASPNETCORE_URLS="http://0.0.0.0:${PORT:-5099}"

echo "==> Anwendung läuft auf ${ASPNETCORE_URLS}"
exec dotnet run --project backend/Sitzordnung.Host --no-launch-profile -- --webroot "$PWD/frontend/dist"
