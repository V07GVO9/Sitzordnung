# Betrieb auf einem Server (Hetzner Cloud)

Diese Anleitung richtet zwei Umgebungen auf **einem** Server ein:

| Umgebung | Branch | Beispieladresse |
| --- | --- | --- |
| Produktion | `master` | `sitzordnung.celik-soft.de` |
| Test | `test` | `test.sitzordnung.celik-soft.de` |

Davor sitzt Caddy als Reverse-Proxy und holt die HTTPS-Zertifikate automatisch
von Let's Encrypt. Beide Umgebungen haben **getrennte Daten** – auf der
Testumgebung gehören keine echten Schülerdaten.

## Bevor es losgeht

Die App enthält Namen und Fotos von Schülern, also personenbezogene Daten von
Minderjährigen. Vor dem Produktivbetrieb an einer Schule gehört das geklärt:

- Mit der Schulleitung abstimmen, ob eine eigene Anwendung dafür zulässig ist.
- Bei Hetzner den **Auftragsverarbeitungsvertrag** abschließen (im Kundenkonto
  unter *Rechtliches* elektronisch abschließbar). Ohne ihn fehlt die Grundlage
  nach Art. 28 DSGVO.
- Ein starkes Passwort setzen und das Startpasswort sofort ersetzen.
- Auf der Testumgebung nur erfundene Namen verwenden.

## 1. Server anlegen

Bei [Hetzner Cloud](https://console.hetzner.cloud) ein Projekt anlegen und einen
Server erstellen:

- **Standort:** Nürnberg oder Falkenstein (beide in Deutschland)
- **Abbild:** Ubuntu 24.04
- **Typ:** CX22 (2 vCPU, 4 GB) reicht für beide Umgebungen reichlich; CX11 genügt auch
- **SSH-Key:** den eigenen öffentlichen Schlüssel hinterlegen – kein Passwortzugang

Notieren Sie die IPv4-Adresse des Servers.

## 2. DNS eintragen

Beim Domain-Anbieter zwei A-Einträge auf die IP des Servers setzen:

```
sitzordnung.celik-soft.de.        A    <IP des Servers>
test.sitzordnung.celik-soft.de.   A    <IP des Servers>
```

Erst wenn die Namen auflösen, kann Caddy Zertifikate holen. Prüfen mit
`nslookup sitzordnung.celik-soft.de`.

## 3. Server einrichten

Per SSH verbinden (`ssh root@<IP>`) und einrichten:

```bash
# Pakete aktualisieren
apt-get update && apt-get upgrade -y

# Docker installieren
curl -fsSL https://get.docker.com | sh

# Firewall: nur SSH und Web
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Automatische Sicherheitsupdates
apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades
```

Einen eigenen Benutzer für das Ausrollen anlegen – die Pipeline soll sich nicht
als `root` anmelden:

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
```

## 4. Projekt auf den Server holen

Als Benutzer `deploy`:

```bash
sudo -iu deploy
git clone https://github.com/V07GVO9/Sitzordnung.git /home/deploy/sitzordnung
cd /home/deploy/sitzordnung
cp deploy/.env.example deploy/.env
nano deploy/.env
```

In `deploy/.env` eintragen: die beiden Adressen, eine E-Mail für Let's Encrypt
und je ein Startpasswort. **Die Startpasswörter gelten nur beim allerersten
Start**, solange noch kein Konto existiert – danach zählt ausschließlich das
Passwort, das Sie in der App setzen.

## 5. Zum ersten Mal starten

```bash
cd /home/deploy/sitzordnung
docker compose -f deploy/docker-compose.yml --env-file deploy/.env pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

Danach `https://sitzordnung.celik-soft.de` aufrufen, anmelden und **sofort unter
*Konto* ein eigenes Passwort setzen**.

Falls das Startpasswort in `.env` zu kurz war, hat die App ein zufälliges
erzeugt. Es steht einmalig im Log:

```bash
docker compose -f deploy/docker-compose.yml logs app-prod | grep Startpasswort
```

## 6. Automatisch ausrollen einrichten

Die Pipeline in `.github/workflows/deploy.yml` baut bei jedem Push auf `test`
beziehungsweise `master` ein Image, lädt es in die GitHub-Registry und startet
auf dem Server `deploy/deploy.sh`.

Dafür im Repository unter **Settings → Secrets and variables → Actions** anlegen:

| Secret | Wert |
| --- | --- |
| `SSH_HOST` | IP oder Hostname des Servers |
| `SSH_USER` | `deploy` |
| `SSH_KEY` | privater SSH-Schlüssel (der ganze Inhalt der Datei) |
| `DEPLOY_PATH` | `/home/deploy/sitzordnung` |

Legen Sie für die Pipeline am besten ein **eigenes Schlüsselpaar** an
(`ssh-keygen -t ed25519 -f deploy-key`), tragen Sie den öffentlichen Teil in
`/home/deploy/.ssh/authorized_keys` ein und hinterlegen Sie nur den privaten
Teil als Secret.

Zusätzlich unter **Settings → Environments** die Umgebungen `test` und
`produktion` anlegen. Für `produktion` lohnt sich ein *Required reviewer* –
dann wird erst nach Ihrer Bestätigung produktiv ausgerollt.

### Was beim Ausrollen passiert

`deploy/deploy.sh` holt das neue Image, startet den Dienst neu und wartet, bis
`https://<adresse>/health` antwortet. Kommt keine Antwort, werden die letzten
Logzeilen ausgegeben und **die vorherige Version wiederhergestellt**.

Von Hand geht das genauso:

```bash
cd /home/deploy/sitzordnung
./deploy/deploy.sh test    # oder: prod
```

## 7. Sicherungen einrichten

`deploy/backup.sh` packt Datenbank und Fotos beider Umgebungen in ein Archiv und
löscht Sicherungen, die älter als 14 Tage sind. Als täglichen Cron-Eintrag:

```bash
sudo crontab -e
# Jede Nacht um 2 Uhr:
0 2 * * * /home/deploy/sitzordnung/deploy/backup.sh >> /var/log/sitzordnung-backup.log 2>&1
```

Die Archive liegen unter `/var/backups/sitzordnung`. Holen Sie sie regelmäßig
vom Server – eine Sicherung auf demselben Rechner hilft nicht, wenn der Rechner
weg ist:

```bash
# vom eigenen Rechner aus
scp -r deploy@<IP>:/var/backups/sitzordnung ./sicherungen
```

**Zurückspielen** einer Sicherung:

```bash
cd /home/deploy/sitzordnung
docker compose -f deploy/docker-compose.yml stop app-prod
docker run --rm -v deploy_prod-data:/data -v /var/backups/sitzordnung:/backup alpine:3 \
  sh -c "rm -rf /data/* && tar xzf /backup/sitzordnung-prod-JJJJ-MM-TT-HHMM.tar.gz -C /data"
docker compose -f deploy/docker-compose.yml start app-prod
```

## Alltag

```bash
cd /home/deploy/sitzordnung

# Was läuft gerade?
docker compose -f deploy/docker-compose.yml ps

# Logs mitlesen
docker compose -f deploy/docker-compose.yml logs -f app-prod

# Alles neu starten
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d
```

## Wenn etwas nicht geht

**Kein Zertifikat / Browser meldet unsicher.** Caddy braucht auflösende
DNS-Namen und die offenen Ports 80 und 443. Prüfen mit
`docker compose -f deploy/docker-compose.yml logs caddy`.

**Anmeldung schlägt fehl, obwohl das Passwort stimmt.** Das Cookie wird nur über
HTTPS übertragen. Rufen Sie die Adresse mit `https://` auf, nicht mit der reinen
IP.

**Nach dem Ausrollen sind Daten weg.** Sollte nicht passieren – die Daten liegen
in den Volumes `deploy_prod-data` und `deploy_test-data` und überstehen den
Austausch der Container. Prüfen mit `docker volume ls`.

**Passwort vergessen.** Es gibt keinen Weg zurück über die Oberfläche. Konto in
der Datenbank löschen, dann legt die App beim nächsten Start eines mit dem
Startpasswort aus `.env` neu an:

```bash
docker compose -f deploy/docker-compose.yml stop app-prod
docker run --rm -v deploy_prod-data:/data alpine:3 \
  sh -c "apk add --no-cache sqlite >/dev/null && sqlite3 /data/sitzordnung.db 'DELETE FROM Users;'"
docker compose -f deploy/docker-compose.yml start app-prod
```

## Was der Betrieb kostet

Ein CX22 bei Hetzner liegt bei etwa 4–6 € im Monat, dazu die Domain (rund 1 €
im Monat). Beide Umgebungen laufen auf demselben Server.
