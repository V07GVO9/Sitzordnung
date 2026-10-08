# Sitzordnung & Mitarbeitsnoten

Eine Webanwendung für Lehrkräfte: Schüler mit Foto verwalten, je Fach und Klasse
per Drag and Drop eine Sitzordnung bauen und während des Unterrichts Mitarbeitsnoten
vergeben. Bewertet werden kann nur, wenn der Kurs laut Stundenplan gerade läuft.

**Die Daten bleiben beim Anwender.** Es gibt keine Datenbank und keinen Server,
der die Daten kennt: Alles liegt in einer einzelnen, mit einem Passwort
verschlüsselten Datei auf dem Rechner der Lehrkraft. Die Anwendung läuft
vollständig im Browser.

- **Frontend:** Angular 20 (Standalone-Komponenten, Signals, Angular CDK für Drag and Drop)
- **Verschlüsselung:** WebCrypto – AES-GCM mit einem per PBKDF2 abgeleiteten Schlüssel
- **Auslieferung:** ein minimales ASP.NET-Core-Programm, das ausschließlich die
  gebauten Dateien ausliefert (ein *Static Host*)

## Was die App kann

| Bereich | Beschreibung |
| --- | --- |
| Klassen & Schüler | Klassen anlegen, Schüler einzeln erfassen oder eine Namensliste einfügen, Foto je Schüler hinterlegen |
| Fächer & Kurse | Fächer anlegen und einer Klasse zuordnen – daraus entsteht ein Kurs |
| Sitzordnung | Ein bis zwei Sitzordnungen je Kurs, Raster frei wählbar, Schüler per Drag and Drop platzieren und tauschen |
| Zwei Modi | **Unterricht** zum Bewerten, **Einstellungen** zum Umbauen der Sitzordnung |
| Mitarbeitsnoten | Jeder Schüler startet bei 0 Punkten und wird mit `++`, `+`, `−` oder `−−` bewertet |
| Stundenplan | Wochenplan je Kurs; nur währenddessen sind Bewertungen möglich |
| Notenschlüssel | Punktegrenzen frei festlegen – allgemein oder eigens für einen Kurs |
| Export | Punktestand und Einzelbewertungen jederzeit als CSV, wahlweise für einen Zeitraum |
| Noten | Je Kurs (Lernfeld/Fach) schriftliche und mündliche Noten mit Bewertungsschema, Notenstand und Notenbogen je Schüler – siehe unten |

## Noten

Jeder Kurs hat unter **Kurs → Noten** eine eigene Notenverwaltung. In KDM wird
jedes Lernfeld als eigenes Fach angelegt (z. B. „LF3 …", Kürzel LF3) – so bekommt
jedes Lernfeld eine eigene Note und ein eigenes Bewertungsschema.

| Reiter | Inhalt |
| --- | --- |
| Übersicht | Alle Schüler mit Einzelnoten, Mitarbeit, schriftlich, mündlich und Gesamtnote (Noten mit Komma) |
| Leistungsnachweise | Klassenarbeit, Test, Referat … mit Datum anlegen, Punkte oder Noten eintragen, Notenspiegel. Zählt erst nach **Freigabe** |
| Mitarbeit | Je Doppelstunde eine Note aus `++ + − −−` (1,0 · 2,0 · 4,0 · 5,0; ohne Bewertung 3,0). Einzeln überschreibbar oder „fehlte" |
| Bewertungsschema | Gewichtung schriftlich/mündlich, Arten mit Gewicht, Punkteschlüssel (Vorlage IHK), Mitarbeitsnoten; auf andere Lernfelder übertragbar |
| Notenbögen | Je Schüler ein Bogen mit seinem Stand – drucken/PDF oder als HTML-Datei; jede Ausgabe wird vermerkt |
| Protokoll | Jede Änderung an freigegebenen Noten und jede von Hand gesetzte Mitarbeitsnote, mit Begründung |

**Rechenweg:** Eine Doppelstunde zählt, sobald im Kurs an dem Tag jemand
bewertet wurde. Die Mitarbeit ist der Durchschnitt dieser Stundennoten und geht
mit ihrem Gewicht als eine Einzelnote in den mündlichen Bereich ein. Ein Bereich
ist der gewichtete Durchschnitt seiner Einzelnoten; die Gesamtnote verrechnet
beide Bereiche nach dem Anteil im Schema. Fehlt ein Bereich noch, ist die
Gesamtnote vorläufig (*). Zeiträume wie „1. Halbjahr" grenzen alles ein.

Die Vorgaben im Schema sind nur ein Vorschlag – verbindlich sind Schulgesetz,
Verordnungen und Konferenzbeschlüsse.

## Bedienung

Aufbau und Bedienung sind an die iPad-App „Meine Klassenmappe“ angelehnt:

- **Klassen links:** Die Seitenleiste zeigt alle Klassen (Ordner, Schülerzahl,
  Fächer). Der Umschalter *Tagesansicht* zeigt stattdessen den Unterricht eines
  Tages aus dem Stundenplan – ein Tipp auf eine Stunde öffnet sie. Mit dem
  Symbol oben rechts lässt sich die Leiste ausblenden; auf schmalen Geräten
  liegt sie als Schublade über dem Inhalt.
- **Bereiche einer Klasse unten:** *Übersicht* (laufende und heutige Stunden,
  Fächer, gute und schwache Mitarbeit der letzten 14 Tage), *Schüler*
  (Klassenliste mit Buchstaben-Register, Stammdaten als Blatt mit ‹ ›),
  *Mitarbeit* und *Noten* (Punkte, Note und Farbbalken je Fach).
- **Mitarbeit eintragen:** Oben die Fächer der Klasse, darunter Datum und
  laufende Stunde. Bewertet wird wahlweise in der **Liste** oder auf dem
  **Sitzplan** – jeweils mit der Skala ++ / + / − / −− in den Farben Grün bis
  Rot. Wer heute bewertet wurde, bekommt die Farbe seiner Bewertung. Ein Tipp
  auf Foto oder Namen öffnet den Verlauf mit Verteilung (7 Tage, 30 Tage,
  gesamt); dort lassen sich einzelne Bewertungen löschen. Nach jeder Bewertung
  erscheint unten eine Meldung mit **Rückgängig** – für Vertipper.
- **Sitzplan bearbeiten:** Stift-Symbol neben *Liste | Sitzplan*. Neben Drag and
  Drop setzen *Auffüllen*, *Alphabetisch* und *Zufällig* die Schüler auf einen
  Schlag.
- **Menü (drei Balken):** Klassen & Fächer verwalten, Schüler importieren,
  Stundenplan, Auswertung & Export, Notenschlüssel, Einstellungen, Speichern und
  Datenbestand schließen.
- **Darstellung:** hell, dunkel oder wie im Betriebssystem eingestellt –
  umschaltbar im Menü. Die Wahl gilt je Gerät.
- **Als App installieren:** In Chrome und Edge erscheint *Als App
  installieren*. Die App bekommt dann ein eigenes Symbol und startet auch ohne
  Internet. Zwischengespeichert werden dabei nur die Programmdateien, nie die
  Daten. Liegt eine neue Version bereit, meldet die App das.

## Die Datei mit den Daten

Beim Öffnen der Anwendung fragt sie nach einer Datei und dem zugehörigen
Passwort. Ohne beides zeigt sie keine Daten an.

- **Neu anlegen** erzeugt einen leeren Datenbestand und fragt nach einem
  Speicherort.
- **Datei öffnen** liest einen vorhandenen Bestand ein.

Gespeichert wird über **Speichern** (am PC in der Seitenleiste, auf Handy und
Tablet über das Symbol oben rechts) oder mit <kbd>Strg</kbd>+<kbd>S</kbd>. Die
App zeigt jederzeit an, ob es ungespeicherte Änderungen gibt; beim Schließen des
Fensters warnt der Browser davor.

In Chrome und Edge merkt sich die Anwendung die gewählte Datei und schreibt beim
Speichern direkt dorthin zurück. Dort speichert sie auch **automatisch** wenige
Sekunden nach jeder Änderung – sobald einmal von Hand gespeichert und dem
Browser damit das Schreiben erlaubt wurde. Abschalten lässt sich das unter
*Auswertung → Datei*. Firefox und Safari unterstützen das nicht – dort landet
beim Speichern jedes Mal eine neue Datei im Download-Ordner.

### Auf mehreren Geräten: OneDrive

Statt auf einem Gerät kann der Bestand auch in **OneDrive** liegen (Ordner
*Sitzordnung*). Dann öffnet jedes Gerät denselben Stand über den Reiter
**OneDrive** auf der Startseite, und die App speichert automatisch dorthin. Die
Datei bleibt verschlüsselt, Microsoft sieht nur den verschlüsselten Inhalt. Hat
ein anderes Gerät inzwischen gespeichert, fragt die App, welcher Stand gilt.

Dafür muss die App einmal bei Microsoft registriert werden – siehe
[docs/onedrive-einrichten.md](docs/onedrive-einrichten.md).

### Was in der Datei steht

Alles: Klassen, Schüler samt Fotos, Kurse, Sitzordnungen, Stundenplan,
Bewertungen, Notenschlüssel und Einstellungen. Fotos werden beim Hinterlegen auf
400 Bildpunkte Kantenlänge verkleinert, damit die Datei handlich bleibt.

Die Datei ist ein JSON-Umschlag mit den Verfahrensangaben und dem verschlüsselten
Inhalt. Aus dem Passwort wird per PBKDF2 (SHA-256, 310 000 Runden) ein Schlüssel
abgeleitet; verschlüsselt wird mit AES-GCM. AES-GCM erkennt Veränderungen an der
Datei, ein falsches Passwort schlägt deshalb sauber fehl.

**Das Passwort lässt sich nicht zurücksetzen.** Geht es verloren, ist der
Datenbestand verloren. Es wird nirgends abgelegt und nach dem Neuladen der Seite
erneut abgefragt.

### Zwischenspeicher im Browser

Damit ein Absturz oder ein versehentlich geschlossenes Fenster keine Noten
kostet, schreibt die Anwendung den Bestand zusätzlich – ebenfalls verschlüsselt –
in den Speicher des Browsers (IndexedDB). Beim nächsten Start bietet sie diesen
Zwischenstand zum Laden an.

Der Zwischenspeicher ersetzt die Datei nicht: Er liegt im Browserprofil, ist beim
Leeren der Browserdaten weg und in einem privaten Fenster gar nicht erst
vorhanden. **Die Datei bleibt die eigentliche Ablage.**

### Die Sperre für Bewertungen

Bewertungen sind nur innerhalb einer eingetragenen Unterrichtsstunde möglich.
Zwei Stellschrauben unter *Auswertung → Einstellungen*:

- **Kulanzzeit** (Standard 15 Minuten): So lange vor Beginn und nach Ende einer
  Stunde ist das Bewerten noch möglich.
- **Notfall-Freigabe** (Standard aus): Hebt die Sperre ganz auf, falls der
  Stundenplan einmal kurzfristig abweicht.

Anders als früher, als die Prüfung im Backend stattfand, läuft sie jetzt im
Browser. Sie ist damit eine Hilfe für den Unterrichtsalltag, keine
Zugriffskontrolle – wer will, kann sie im Browser umgehen. Für eine App, die
einer Lehrkraft auf dem eigenen Rechner gehört, ist das der bewusste Tausch
gegen die Server-Datenhaltung.

## Datenschutz

Der Verzicht auf Server und Datenbank verbessert die Lage deutlich: keine
Datenhaltung außerhalb des Geräts, kein Netzwerkweg, keine Frage nach
Auftragsverarbeitung. Er beantwortet aber nicht alles:

- Es bleiben **personenbezogene Daten** – Namen, Fotos und Leistungsbewertungen,
  in der Regel von Minderjährigen. Die DSGVO gilt unverändert, nur der
  Speicherort ändert sich.
- **Fotos** brauchen in vielen Bundesländern eine Einwilligung der
  Erziehungsberechtigten. Das ist unabhängig von der Technik.
- **Verantwortlich bleibt die Schule.** Der Einsatz gehört mit der Schulleitung
  bzw. dem schulischen Datenschutzbeauftragten abgestimmt. Manche Länder
  beschränken die Verarbeitung von Schülerdaten auf Privatgeräten.
- Die Verschlüsselung schützt die Datei, nicht das laufende Gerät. Ein
  gesperrter Bildschirm und eine verschlüsselte Festplatte gehören dazu.
- **Löschfristen** liegen weiterhin in der Hand der Lehrkraft: Bewertungen nach
  Schuljahresende löschen.

## Starten

Voraussetzungen: [Node.js 20+](https://nodejs.org/) und – für die Auslieferung –
[.NET SDK 8](https://dotnet.microsoft.com/download).

### Zum Entwickeln

```bash
cd frontend
npm install
npm start
```

Danach ist die Anwendung unter <http://localhost:4200> erreichbar. Ein Backend
wird dafür nicht gebraucht.

### Als fertige Anwendung

Der Angular-Build legt seine Dateien in `wwwroot` des Hosts ab, der sie dann
ausliefert:

```bash
cd frontend && npm install && npm run build
cd ../backend/Sitzordnung.Host && dotnet run
```

Danach ist die Anwendung unter <http://localhost:5099> erreichbar.

Der Host ist austauschbar: Er liefert nur die gebauten Dateien aus und bekommt
die Daten nie zu sehen. Statt `dotnet run` genügt auch jeder andere Webserver,
der auf `backend/Sitzordnung.Host/wwwroot` zeigt – etwa `npx serve`. Ein
Doppelklick auf `index.html` reicht dagegen nicht: Über `file://` sperrt der
Browser das Nachladen der Programmteile.

## Tests

```bash
cd frontend
npm test
```

Die Testsuite deckt die Fachlogik ab, die früher im Backend lag:

- **Stundenplanprüfung** – Kulanzzeit, Tageswechsel, Notfall-Freigabe
- **Notenschlüssel** – Punktgrenzen, kursspezifischer und globaler Schlüssel
- **CSV-Erzeugung** – Trennzeichen, BOM, Schutz gegen Formeln in Excel
- **Datenspeicher** – die Regeln der früheren API-Endpunkte: doppelte Namen,
  Sitzplatzvergabe, Überschneidungen im Stundenplan, Punktestände
- **Verschlüsselung** – Rückweg, falsches Passwort, veränderte Datei

Die Tests laufen in einem echten Browser. In Umgebungen ohne Sandbox (etwa in
einem Container) sorgt `frontend/karma.conf.js` für die passenden Startoptionen;
den Browser findet Karma über die Umgebungsvariable `CHROME_BIN`.

## Aufbau des Projekts

```
frontend/
  src/app/
    core/
      api.service.ts     Schnittstelle für die Seiten (früher HTTP, jetzt lokal)
      models.ts          Datenstrukturen der Oberfläche
      store/
        database.ts      Der Datenbestand als Ganzes
        local-store.ts   Die Fachlogik der früheren Controller
        lesson.logic.ts  Stundenplanprüfung
        grading.logic.ts Notenschlüssel (Mitarbeitspunkte)
        assessment.logic.ts  Notenberechnung: Leistungsnachweise, Mitarbeit, Gesamtnote
        report.ts        Notenbogen als HTML
        csv.ts           CSV-Erzeugung
        vault-crypto.ts  Ver- und Entschlüsselung der Datei
        vault.service.ts Datei, Passwort und Zwischenspeicher
        file-system.ts   Zugriff auf Dateien im Browser
        photo.ts         Fotos einlesen und verkleinern
        browser-storage.ts  Zwischenspeicher in IndexedDB
      ui/                Gemeinsame Bausteine: Symbole, Dunkelmodus,
                         Rückfragen, Installation als App
    vault/               Der Startbildschirm zum Öffnen des Bestands
    pages/               Übersicht, Kurs (Sitzordnung + Bewerten), Noten, Verwaltung,
                         Stundenplan, Auswertung
backend/
  Sitzordnung.Host/      Liefert die gebauten Dateien aus - sonst nichts
```

### Datenmodell in Kürze

Eine **Klasse** hat **Schüler**. Ein **Fach** plus eine Klasse ergibt einen **Kurs** –
daran hängen Sitzordnungen, Stundenplaneinträge, Bewertungen und optional ein
eigener Notenschlüssel. Eine Bewertung ist eine einzelne Veränderung (+2, +1, −1, −2);
der Punktestand eines Schülers ist die Summe seiner Bewertungen, beginnend bei 0.

## Android-App

Die Web-App wird mit [Capacitor](https://capacitorjs.com/) als Android-App
verpackt (Projekt unter `frontend/android`). Bei jedem Push baut der Workflow
**Android-App** die APK und veröffentlicht sie als GitHub-Release:

```
https://github.com/V07GVO9/sitzordnung/releases/latest/download/Sitzordnung.apk
```

Unterschiede zur Browser-Version:

- **Speichern** legt die Datei unter *Dokumente/Sitzordnung* auf dem Gerät ab.
- **CSV-Export** speichert dort ebenfalls und öffnet danach das Teilen-Menü.
- **Öffnen** nutzt die Dateiauswahl von Android.

Lokal bauen (Android SDK nötig): `npm run android` im Ordner `frontend`, dann
`./gradlew assembleDebug` in `frontend/android`.
