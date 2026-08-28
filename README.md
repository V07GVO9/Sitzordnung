# Sitzordnung & Mitarbeitsnoten

Eine Webanwendung für Lehrkräfte: Schüler mit Foto verwalten, je Fach und Klasse
per Drag and Drop eine Sitzordnung bauen und während des Unterrichts Mitarbeitsnoten
vergeben. Bewertet werden kann nur, wenn der Kurs laut Stundenplan gerade läuft.

- **Backend:** ASP.NET Core 8 Web-API mit Entity Framework Core und SQLite
- **Frontend:** Angular 20 (Standalone-Komponenten, Signals, Angular CDK für Drag and Drop)

## Was die App kann

| Bereich | Beschreibung |
| --- | --- |
| Klassen & Schüler | Klassen anlegen, Schüler einzeln erfassen oder eine Namensliste einfügen, Foto je Schüler hochladen |
| Fächer & Kurse | Fächer anlegen und einer Klasse zuordnen – daraus entsteht ein Kurs |
| Sitzordnung | Ein bis zwei Sitzordnungen je Kurs, Raster frei wählbar, Schüler per Drag and Drop platzieren und tauschen |
| Zwei Modi | **Unterricht** zum Bewerten, **Einstellungen** zum Umbauen der Sitzordnung |
| Mitarbeitsnoten | Jeder Schüler startet bei 0 Punkten und wird mit `++`, `+`, `−` oder `−−` bewertet |
| Stundenplan | Wochenplan je Kurs; nur währenddessen sind Bewertungen möglich |
| Notenschlüssel | Punktegrenzen frei festlegen – allgemein oder eigens für einen Kurs |
| Export | Punktestand und Einzelbewertungen jederzeit als CSV, wahlweise für einen Zeitraum |

### Die Sperre für Bewertungen

Bewertungen sind nur innerhalb einer eingetragenen Unterrichtsstunde möglich. Die
Prüfung findet im Backend statt, nicht nur in der Oberfläche – ein Aufruf außerhalb
der Unterrichtszeit wird mit `403` abgelehnt.

Zwei Stellschrauben unter *Auswertung → Einstellungen*:

- **Kulanzzeit** (Standard 15 Minuten): So lange vor Beginn und nach Ende einer
  Stunde ist das Bewerten noch möglich.
- **Notfall-Freigabe** (Standard aus): Hebt die Sperre ganz auf, falls der
  Stundenplan einmal kurzfristig abweicht.

## Ohne lokale Installation ausprobieren (GitHub Codespaces)

Das Repository bringt eine Codespaces-Konfiguration mit. Damit läuft die
Anwendung in einem Container bei GitHub, und der Browser zeigt sie über eine
weitergeleitete Adresse – lokal muss nichts installiert werden.

1. Auf GitHub im Repository auf **Code → Codespaces → Create codespace** klicken
   (beim Branch den gewünschten auswählen).
2. Der Container installiert die Abhängigkeiten und baut das Frontend von selbst.
   Das dauert beim ersten Mal einige Minuten.
3. Im Terminal des Codespace starten:

   ```bash
   ./start.sh
   ```

4. VS Code meldet den weitergeleiteten Port 5099 und öffnet die Anwendung. Über
   den Reiter *Ports* lässt sich die Adresse auch später wieder aufrufen.

Der Port ist zunächst **privat** – nur Sie sehen ihn. Zum Vorführen kann er im
Reiter *Ports* per Rechtsklick auf *Public* gestellt werden; dann ist die
Adresse für jeden erreichbar, der sie kennt. Da die App keine Anmeldung hat,
sollte das nur kurz und ohne echte Schülerdaten geschehen.

Codespaces ist für private Konten in gewissem Umfang kostenlos; darüber hinaus
rechnet GitHub nach Laufzeit ab. Ein Codespace lässt sich jederzeit unter
<https://github.com/codespaces> stoppen oder löschen.

## Starten

Voraussetzungen: [.NET SDK 8](https://dotnet.microsoft.com/download) und
[Node.js 20+](https://nodejs.org/).

### Zum Entwickeln (zwei Prozesse)

```bash
# 1. Backend – läuft auf http://localhost:5099
cd backend/Sitzordnung.Api
dotnet run

# 2. Frontend – läuft auf http://localhost:4200
cd frontend
npm install
npm start
```

Der Angular-Entwicklungsserver reicht alle Anfragen an `/api` über
`frontend/proxy.conf.json` an das Backend weiter. Im Browser wird
<http://localhost:4200> geöffnet.

### Als fertige Anwendung (ein Prozess)

Der Angular-Build legt seine Dateien direkt in `wwwroot` des Backends ab, das sie
dann mit ausliefert:

```bash
cd frontend && npm install && npm run build
cd ../backend/Sitzordnung.Api && dotnet run
```

Danach ist die komplette Anwendung unter <http://localhost:5099> erreichbar.

Beide Schritte zusammen erledigt auch `./start.sh` – das Skript baut das Frontend
nach, falls es noch fehlt, und startet die Anwendung. Mit `PORT=8080 ./start.sh`
läuft sie auf einem anderen Port.

## Tests

```bash
cd backend
dotnet test
```

Die Testsuite umfasst:

- **Fachlogik** – Stundenplanprüfung inklusive Kulanzzeit, Tageswechsel und
  Notfall-Freigabe; Notenschlüssel; CSV-Erzeugung.
- **API-Tests** – die vollständige Anwendung läuft gegen eine SQLite-Datenbank im
  Arbeitsspeicher, sodass auch Abfragen auffallen, die SQLite nicht übersetzen kann.

## Daten und Ablage

Alles bleibt lokal auf dem Rechner, auf dem das Backend läuft:

- `backend/Sitzordnung.Api/App_Data/sitzordnung.db` – die SQLite-Datenbank
- `backend/Sitzordnung.Api/App_Data/photos/` – die Schülerfotos

Beides ist von der Versionsverwaltung ausgenommen. Für eine Sicherung genügt es,
den Ordner `App_Data` zu kopieren. Fotos werden nur über die API ausgeliefert,
nicht als statische Dateien, und der Dateiname wird serverseitig vergeben.

Die Anwendung ist für **eine Lehrkraft auf einem Rechner** gedacht und hat keine
Anmeldung. Wer sie im Netzwerk erreichbar macht, sollte einen Zugriffsschutz davor
setzen – die Daten sind personenbezogen.

## Aufbau des Projekts

```
backend/
  Sitzordnung.Api/
    Models/        Datenmodell (Klasse, Fach, Kurs, Schüler, Sitzordnung, Bewertung …)
    Data/          EF-Core-Kontext und Migrationen
    Dtos/          Datenstrukturen der API
    Services/      Stundenplanprüfung, Notenschlüssel, Fotoablage, CSV
    Controllers/   Die API-Endpunkte
  Sitzordnung.Api.Tests/
frontend/
  src/app/
    core/          API-Zugriff, Datenmodelle, Hinweismeldungen
    pages/         Übersicht, Kurs (Sitzordnung + Bewerten), Verwaltung,
                   Stundenplan, Auswertung
```

### Datenmodell in Kürze

Eine **Klasse** hat **Schüler**. Ein **Fach** plus eine Klasse ergibt einen **Kurs** –
daran hängen Sitzordnungen, Stundenplaneinträge, Bewertungen und optional ein
eigener Notenschlüssel. Eine Bewertung ist eine einzelne Veränderung (+2, +1, −1, −2);
der Punktestand eines Schülers ist die Summe seiner Bewertungen, beginnend bei 0.

## Die wichtigsten Endpunkte

| Methode | Pfad | Zweck |
| --- | --- | --- |
| `GET` | `/api/courses` | Alle Kurse |
| `GET` | `/api/timetable/current` | Welcher Unterricht läuft gerade? |
| `GET` | `/api/courses/{id}/rating-window` | Darf für diesen Kurs bewertet werden? |
| `POST` | `/api/ratings` | Bewertung abgeben (nur während des Unterrichts) |
| `GET` | `/api/courses/{id}/scoreboard` | Punktestand und Noten des Kurses |
| `PUT` | `/api/seatingplans/{id}/layout` | Sitzordnung speichern |
| `GET` | `/api/export/summary.csv` | Punktestand als CSV |
| `GET` | `/api/export/ratings.csv` | Einzelbewertungen als CSV |

Im Entwicklungsmodus ist unter <http://localhost:5099/swagger> die vollständige
API-Übersicht erreichbar.
