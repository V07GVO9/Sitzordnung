#!/usr/bin/env bash
# Rollt eine neue Version aus - die Entwicklungs-, Test- oder Produktivumgebung.
#
#   ./deploy.sh test
#   ./deploy.sh prod
#   ./deploy.sh dev
#
# Läuft die neue Version nicht an, wird die vorherige wiederhergestellt.
set -euo pipefail

cd "$(dirname "$0")"

UMGEBUNG="${1:-}"
case "$UMGEBUNG" in
  prod) DIENST="app-prod"; IMAGE_VAR="IMAGE_PROD"; DOMAIN_VAR="PROD_DOMAIN" ;;
  test) DIENST="app-test"; IMAGE_VAR="IMAGE_TEST"; DOMAIN_VAR="TEST_DOMAIN" ;;
  dev)  DIENST="app-dev";  IMAGE_VAR="IMAGE_DEV";  DOMAIN_VAR="DEV_DOMAIN" ;;
  *) echo "Aufruf: $0 {prod|test|dev}" >&2; exit 2 ;;
esac

if [ ! -f .env ]; then
  echo "Es fehlt die Datei deploy/.env - siehe .env.example." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

# Vorgaben für die Entwicklungsumgebung, falls .env sie noch nicht kennt
# (gleiche Werte wie in docker-compose.yml).
: "${IMAGE_DEV:=ghcr.io/v07gvo9/sitzordnung:develop}"
: "${DEV_DOMAIN:=develop.sitzordnung.celik-soft.de}"

IMAGE="${!IMAGE_VAR}"
DOMAIN="${!DOMAIN_VAR}"

echo "==> Rolle $UMGEBUNG aus ($IMAGE)"

# Für den Fall, dass die neue Version nicht startet.
VORHER="$(docker inspect --format '{{.Image}}' "$(docker compose ps -q "$DIENST" 2>/dev/null)" 2>/dev/null || true)"

docker compose pull "$DIENST"
docker compose up -d "$DIENST" caddy

echo "==> Warte auf https://$DOMAIN/health"
GESUND=0
for _ in $(seq 1 30); do
  sleep 2
  if curl -fsS --max-time 5 "https://$DOMAIN/health" >/dev/null 2>&1; then
    GESUND=1
    break
  fi
done

if [ "$GESUND" -eq 1 ]; then
  echo "==> $UMGEBUNG läuft: https://$DOMAIN"
  # Alte, nicht mehr benutzte Images aufräumen.
  docker image prune -f >/dev/null
  exit 0
fi

echo "FEHLER: Die neue Version antwortet nicht. Letzte Logzeilen:" >&2
docker compose logs --tail 40 "$DIENST" >&2

if [ -n "$VORHER" ]; then
  echo "==> Stelle die vorherige Version wieder her" >&2
  docker tag "$VORHER" "$IMAGE"
  docker compose up -d "$DIENST"
else
  echo "==> Keine vorherige Version vorhanden, nichts zurückzurollen." >&2
fi

exit 1
