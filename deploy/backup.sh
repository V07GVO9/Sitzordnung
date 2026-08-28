#!/usr/bin/env bash
# Sichert Datenbank und Fotos beider Umgebungen. Gedacht für einen täglichen
# Cron-Eintrag auf dem Server:
#
#   0 2 * * * /opt/sitzordnung/deploy/backup.sh >> /var/log/sitzordnung-backup.log 2>&1
set -euo pipefail

cd "$(dirname "$0")"

ZIEL="${BACKUP_DIR:-/var/backups/sitzordnung}"
TAGE="${BACKUP_KEEP_DAYS:-14}"
STEMPEL="$(date +%Y-%m-%d-%H%M)"

mkdir -p "$ZIEL"

for UMGEBUNG in prod test; do
  VOLUME="deploy_${UMGEBUNG}-data"

  if ! docker volume inspect "$VOLUME" >/dev/null 2>&1; then
    echo "Volume $VOLUME gibt es nicht, wird übersprungen."
    continue
  fi

  DATEI="$ZIEL/sitzordnung-$UMGEBUNG-$STEMPEL.tar.gz"

  # SQLite schreibt in eine WAL-Datei; die kommt mit ins Archiv, damit der
  # Stand vollständig ist.
  docker run --rm \
    -v "$VOLUME":/data:ro \
    -v "$ZIEL":/backup \
    alpine:3 \
    tar czf "/backup/$(basename "$DATEI")" -C /data .

  echo "Gesichert: $DATEI ($(du -h "$DATEI" | cut -f1))"
done

# Alte Sicherungen entfernen.
find "$ZIEL" -name 'sitzordnung-*.tar.gz' -type f -mtime "+$TAGE" -delete
echo "Sicherungen älter als $TAGE Tage wurden entfernt."
