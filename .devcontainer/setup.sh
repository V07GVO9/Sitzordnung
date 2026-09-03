#!/usr/bin/env bash
# Wird von Codespaces einmal nach dem Erstellen des Containers ausgeführt:
# Abhängigkeiten holen und das Frontend ins wwwroot des Backends bauen.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Frontend-Abhängigkeiten installieren"
npm --prefix frontend ci

echo "==> Frontend bauen"
npm --prefix frontend run build

echo "==> Backend wiederherstellen"
dotnet restore backend/Sitzordnung.sln

echo
echo "Fertig. Anwendung starten mit:  ./start.sh"
