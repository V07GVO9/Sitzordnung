# Sitzordnung & Mitarbeitsnoten

Eine Webanwendung für Lehrkräfte: Schüler mit Foto verwalten, je Fach und Klasse
per Drag and Drop eine Sitzordnung bauen und während des Unterrichts Mitarbeitsnoten
vergeben. Bewertet werden kann nur, wenn der Kurs laut Stundenplan gerade läuft.

- **Backend:** ASP.NET Core 8 Web-API mit Entity Framework Core und SQLite
- **Frontend:** Angular 20 (Standalone-Komponenten, Signals, Angular CDK für Drag and Drop)

## Was die App kann

| Bereich | Beschreibung |
| --- | --- |
| Klassen & Schüler | Klassen anlegen, Schülerlisten aus WebUntis als CSV importieren oder Namen einfügen, Foto je Schüler hochladen |
| Fächer & Kurse | Fächer anlegen und einer Klasse zuordnen – daraus entsteht ein Kurs |
| Sitzordnung | Ein bis zwei Sitzordnungen je Kurs, Raster frei wählbar, Schüler per Drag and Drop platzieren und tauschen |
| Zwei Modi | **Bewerten** im Unterricht, **Sitzplan bearbeiten** zum Umbauen der Sitzordnung |
| Mitarbeitsnoten | Jeder Schüler startet bei 0 Punkten und wird mit `++`, `+`, `−` oder `−−` bewertet – eine Bewertung je Unterrichtsstunde |
| Stundenplan | Wochenplan je Kurs, wahlweise aus WebUntis als Kalenderdatei importiert |
| Notenschlüssel | Punktegrenzen frei festlegen – allgemein oder eigens für einen Kurs |
| Export | Punktestand und Einzelbewertungen jederzeit als CSV, wahlweise für einen Zeitraum |
| Anmeldung | Alle Daten liegen hinter einem Login; ohne Anmeldung liefert die API nichts aus |

### Eine Bewertung je Unterrichtsstunde

Bewertet werden darf **jederzeit** – auch abends, wenn die Stunde längst vorbei
ist. Begrenzt ist nur die Menge: je Unterrichtsstunde und Schüler zählt genau
eine Bewertung. Ein zweiter Klick in derselben Stunde **ersetzt** die vorherige,
statt Punkte zu häufen. So lässt sich ein Vertipper korrigieren, ohne dass eine
einzelne Stunde den Punktestand verzerrt.

Welche Stunde gerade gemeint ist, ergibt sich aus dem Stundenplan:

- die **laufende** Stunde des Kurses, sonst
- die **zuletzt gehaltene** – wer abends nachträgt, bewertet also den Unterricht
  von heute Vormittag.

Hat ein Kurs keinen Stundenplaneintrag, zählt der **Tag** als eine Einheit. Die
Kursansicht zeigt oben immer an, auf welche Stunde eine Bewertung gerade einzahlt,
und hebt die bereits vergebene Bewertung hervor.

### Die Oberfläche

Startseite ist der **Stundenplan** als Wochentabelle: die Uhrzeiten stehen einmal
links in der Zeitspalte, in den Zellen nur Fach und Klasse. Ein Klick auf eine
Stunde öffnet den Kurs zum Bewerten; die laufende Stunde ist hervorgehoben.

Alles, was selten gebraucht wird – Tagesübersicht, Klassen und Schüler,
Auswertung, Konto –, liegt hinter dem Knopf **Einstellungen** oben rechts.

### Stundenplan aus WebUntis übernehmen

Statt jede Stunde einzeln einzutragen, lässt sich der Plan als Kalenderdatei
importieren – in WebUntis über den iCal-Export des eigenen Stundenplans.

Der Import läuft in zwei Schritten: Die App liest die Datei, rechnet die Zeiten in
die lokale Zeitzone um und leitet aus den Einzelterminen die **Wochenmuster** ab.
In einer Vorschau lassen sich Klasse, Fach und Raum je Zeile korrigieren, bevor
etwas gespeichert wird. Fehlende Klassen, Fächer und Kurse legt der Import selbst an.

Weil die Titelformate sich je Schule unterscheiden („D - KDM23", „MA - 10a - A101"),
werden Klasse und Fach geraten – bereits angelegte Namen haben dabei Vorrang.
Einträge, die nur einmal vorkommen, sind vermutlich Vertretungen und deshalb nicht
vorausgewählt.

### Schülerlisten aus WebUntis übernehmen

Unter *Klassen & Schüler → Schüler importieren* lässt sich eine Klassenliste als
CSV hochladen – in WebUntis unter *Stammdaten → Schüler* zu exportieren. Erkannt
werden die Spalten *Langname* beziehungsweise *Nachname*, *Vorname* und *Klasse*
in beliebiger Reihenfolge, mit Semikolon, Komma oder Tabulator getrennt.

Enthält die Datei eine Klassenspalte, verteilt der Import die Schüler auf mehrere
Klassen und legt fehlende an. Ohne Klassenspalte wählen Sie eine Klasse für alle
Zeilen. Wie beim Stundenplan gibt es vorher eine Vorschau zum Korrigieren; bereits
vorhandene Namen werden übersprungen.

Wer keinen Export hat, kopiert die Namen aus der Klassenliste und fügt sie ein –
erkannt werden „Nachname, Vorname" und „Vorname Nachname".

### Anmeldung

Die App verlangt eine Anmeldung. Ohne gültige Sitzung antwortet **jeder**
API-Endpunkt mit `401` – geprüft wird im Backend, nicht in der Oberfläche.

Beim ersten Start wird ein Konto angelegt. Benutzername und Startpasswort kommen
aus der Konfiguration:

```
Auth__Username=lehrkraft
Auth__InitialPassword=ein-langes-startpasswort
```

Fehlt das Passwort oder ist es kürzer als 10 Zeichen, erzeugt die App ein
zufälliges und schreibt es einmalig ins Log. In beiden Fällen verlangt die App
nach dem Anmelden, ein eigenes Passwort zu setzen – zu finden unter *Konto*.

Weitere Eigenschaften: Passwörter werden nur als Hash gespeichert (PBKDF2), das
Sitzungs-Cookie ist `HttpOnly`, `Secure` und `SameSite=Strict`, und zehn
Fehlversuche je fünf Minuten und IP-Adresse bremsen das Durchprobieren aus.

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
Adresse für jeden erreichbar, der sie kennt. Die Anmeldung schützt zwar die
Daten, trotzdem gehören in einen Codespace nur Testdaten und keine echten Namen.

Codespaces ist für private Konten in gewissem Umfang kostenlos; darüber hinaus
rechnet GitHub nach Laufzeit ab. Ein Codespace lässt sich jederzeit unter
<https://github.com/codespaces> stoppen oder löschen.

## Starten

Voraussetzungen: [.NET SDK 8](https://dotnet.microsoft.com/download) und
[Node.js 20+](https://nodejs.org/). Kurz prüfen mit `dotnet --version` und
`node --version`.

### Der schnellste Weg

Frontend einmal bauen, dann das Backend starten – es liefert die Oberfläche
gleich mit:

Die drei Befehle sind unter Windows, macOS und Linux dieselben – sie werden im
Hauptordner des Projekts ausgeführt:

```
npm --prefix frontend install
npm --prefix frontend run build
dotnet run --project backend/Sitzordnung.Api
```

Die Anwendung läuft danach auf <http://localhost:5099> und der Browser öffnet
sich von selbst.

Dasselbe erledigen auch die Startskripte, die das Frontend bei Bedarf nachbauen:
`.\start.ps1` unter Windows, `./start.sh` unter macOS und Linux. Ein anderer
Port geht über `$env:PORT=8080` beziehungsweise `PORT=8080`.

### Zum Entwickeln (zwei Prozesse)

Wer am Frontend arbeitet, startet zusätzlich den Angular-Entwicklungsserver –
dann werden Änderungen sofort im Browser sichtbar:

```bash
# Fenster 1 – Backend auf Port 5099
dotnet run --project backend/Sitzordnung.Api

# Fenster 2 – Angular auf Port 4200
npm --prefix frontend start
```

Geöffnet wird dann <http://localhost:4200>. Der Entwicklungsserver reicht alle
Anfragen an `/api` über `frontend/proxy.conf.json` an das Backend auf Port 5099
weiter.

### In Visual Studio Code

Das Terminal mit ``Strg + ` `` öffnen und dort die Befehle von oben eingeben.
Ein Klick auf *Run and Debug* startet nur das Backend – ohne gebautes Frontend
zeigt es dann lediglich die API.

## Tests

```bash
cd backend
dotnet test
```

Die Testsuite umfasst:

- **Fachlogik** – Zuordnung einer Bewertung zur richtigen Unterrichtsstunde;
  Notenschlüssel; CSV-Erzeugung; Kalenderimport samt Sommer- und Winterzeit;
  Einlesen von Schülerlisten in den gängigen Spalten- und Trennzeichenvarianten.
- **API-Tests** – die vollständige Anwendung läuft gegen eine SQLite-Datenbank im
  Arbeitsspeicher, sodass auch Abfragen auffallen, die SQLite nicht übersetzen kann.

## Daten und Ablage

Alles bleibt lokal auf dem Rechner, auf dem das Backend läuft:

- `backend/Sitzordnung.Api/App_Data/sitzordnung.db` – die SQLite-Datenbank
- `backend/Sitzordnung.Api/App_Data/photos/` – die Schülerfotos

Beides ist von der Versionsverwaltung ausgenommen. Für eine Sicherung genügt es,
den Ordner `App_Data` zu kopieren. Fotos werden nur über die API ausgeliefert,
nicht als statische Dateien, und der Dateiname wird serverseitig vergeben.

Die Anwendung ist für **eine Lehrkraft** gedacht und kennt genau ein Konto. Die
Daten sind personenbezogen und betreffen Minderjährige: Wer die App im Netz
betreibt, sollte das mit der Schule abstimmen und mit dem Anbieter einen
Auftragsverarbeitungsvertrag schließen. Siehe [deploy/ANLEITUNG.md](deploy/ANLEITUNG.md).

## Auf einem Server betreiben

Für den Betrieb bei einem Anbieter liegen ein `Dockerfile`, ein Compose-Setup mit
Reverse-Proxy und automatischem HTTPS sowie GitHub-Actions-Pipelines bei:

- `test` wird auf die Testumgebung ausgerollt,
- `master` auf die Produktivumgebung,
- beide Umgebungen laufen auf einem Server, haben aber getrennte Daten.

Die vollständige Anleitung samt Sicherungen und Wiederherstellung steht in
[deploy/ANLEITUNG.md](deploy/ANLEITUNG.md).

Schnell ausprobieren lässt sich das Image auch lokal:

```bash
docker build -t sitzordnung .
docker run --rm -p 8080:8080 -v sitzordnung-daten:/data \
  -e Auth__Username=lehrkraft \
  -e Auth__InitialPassword=ein-langes-startpasswort \
  -e Auth__RequireHttps=false \
  sitzordnung
```

## Aufbau des Projekts

```
backend/
  Sitzordnung.Api/
    Models/        Datenmodell (Klasse, Fach, Kurs, Schüler, Sitzordnung, Bewertung …)
    Data/          EF-Core-Kontext und Migrationen
    Dtos/          Datenstrukturen der API
    Services/      Unterrichtsstunden, Notenschlüssel, Fotoablage, CSV,
                   ICS-Import, Schülerlisten-Import
    Controllers/   Die API-Endpunkte
  Sitzordnung.Api.Tests/
frontend/
  src/app/
    core/          API-Zugriff, Datenmodelle, Hinweismeldungen
    pages/         Stundenplan (Startseite), Kurs (Sitzordnung + Bewerten),
                   Verwaltung, Auswertung, Importe, Anmeldung, Konto
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
| `GET` | `/api/courses/{id}/current-lesson` | Welcher Stunde wird eine Bewertung zugerechnet? |
| `POST` | `/api/ratings` | Bewertung abgeben (ersetzt eine vorhandene derselben Stunde) |
| `POST` | `/api/timetable/import/preview` | Kalenderdatei einlesen und Vorschau zeigen |
| `POST` | `/api/timetable/import/apply` | Bestätigte Stunden übernehmen |
| `POST` | `/api/students/import/preview` | Schülerliste einlesen und Vorschau zeigen |
| `POST` | `/api/students/import/apply` | Bestätigte Schüler übernehmen |
| `GET` | `/api/courses/{id}/scoreboard` | Punktestand und Noten des Kurses |
| `PUT` | `/api/seatingplans/{id}/layout` | Sitzordnung speichern |
| `GET` | `/api/export/summary.csv` | Punktestand als CSV |
| `GET` | `/api/export/ratings.csv` | Einzelbewertungen als CSV |

Im Entwicklungsmodus ist unter <http://localhost:5099/swagger> die vollständige
API-Übersicht erreichbar.
