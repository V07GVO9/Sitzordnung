# Benutzerhandbuch – Sitzordnung & Mitarbeitsnoten

Dieses Handbuch beschreibt alle Funktionen der App aus Sicht der Lehrkraft.
Technische Hinweise zu Installation und Entwicklung stehen in der
[README](../README.md), die Einrichtung von OneDrive in
[onedrive-einrichten.md](onedrive-einrichten.md).

> Dieses Handbuch wird jeden Donnerstag automatisch mit dem aktuellen Stand der
> App abgeglichen. Neue Funktionen kommen dabei hinzu, das
> [Änderungsverzeichnis](#14-änderungsverzeichnis) am Ende zeigt, was sich
> geändert hat.

## Inhalt

1. [Erste Schritte: Datei öffnen oder anlegen](#1-erste-schritte-datei-öffnen-oder-anlegen)
2. [Aufbau der Oberfläche](#2-aufbau-der-oberfläche)
3. [Die zwei Modi: Unterricht und Bearbeiten](#3-die-zwei-modi-unterricht-und-bearbeiten)
4. [Klassen, Fächer und Schüler einrichten](#4-klassen-fächer-und-schüler-einrichten)
5. [Stundenplan](#5-stundenplan)
6. [Sitzordnung bauen](#6-sitzordnung-bauen)
7. [Mitarbeit bewerten](#7-mitarbeit-bewerten)
8. [Die Bereiche einer Klasse](#8-die-bereiche-einer-klasse)
9. [Notenverwaltung je Kurs](#9-notenverwaltung-je-kurs)
10. [Auswertung, Export und Einstellungen](#10-auswertung-export-und-einstellungen)
11. [Speichern, Datei und Passwort](#11-speichern-datei-und-passwort)
12. [Android-App und Installation als App](#12-android-app-und-installation-als-app)
13. [Häufige Fragen](#13-häufige-fragen)
14. [Änderungsverzeichnis](#14-änderungsverzeichnis)

---

## 1. Erste Schritte: Datei öffnen oder anlegen

Alle Daten liegen in **einer verschlüsselten Datei**. Beim Start fragt die App
nach dieser Datei und dem Passwort. Ohne beides zeigt sie nichts an.

| Reiter | Wofür |
| --- | --- |
| **Datei öffnen** | Vorhandenen Datenbestand vom Gerät laden. |
| **Neu anlegen** | Leeren Datenbestand erzeugen. Passwort zweimal eingeben (mind. 8 Zeichen), danach Speicherort wählen. |
| **OneDrive** | Datenbestand aus dem OneDrive-Ordner *Sitzordnung* öffnen oder dort neu anlegen (nur sichtbar, wenn OneDrive eingerichtet ist). |

**So geht's (neuer Bestand):**

1. Reiter **Neu anlegen** wählen.
2. Passwort eingeben und wiederholen.
3. **Neuen Datenbestand anlegen** klicken und den Speicherort wählen.

> ⚠️ **Das Passwort lässt sich nicht zurücksetzen.** Ist es verloren, ist der
> Datenbestand verloren.

### OneDrive

1. Reiter **OneDrive** → **Bei Microsoft anmelden**.
2. **Dateien aus OneDrive laden**, dann eine vorhandene Datei wählen oder unter
   **Neue Datei** einen Dateinamen vergeben.
3. Passwort eingeben → **Aus OneDrive öffnen** bzw. **In OneDrive anlegen**.

Optional: **Auf diesem Gerät merken** – beim nächsten Start öffnet die App den
Bestand ohne Passwort. Nur auf eigenen, gesperrten Geräten nutzen, nie an
Schul-PCs. Eine gemerkte Datei erscheint oben mit **Öffnen** und **Vergessen**.
Dateien in OneDrive lassen sich über das Papierkorb-Symbol löschen.

### Zwischenstand wiederherstellen

Die App sichert den Bestand zusätzlich verschlüsselt im Browser. Findet sie
beim Start einen solchen **Zwischenstand**, bietet sie ihn an:
Passwort eingeben → **Zwischenstand laden** oder **Verwerfen**.
Der Zwischenstand ersetzt die Datei nicht.

---

## 2. Aufbau der Oberfläche

Der Aufbau ist an die iPad-App „Meine Klassenmappe“ angelehnt.

| Bereich | Inhalt |
| --- | --- |
| **Seitenleiste links** | Umschalter **Klassen** (alle Klassen mit Schülerzahl und Fächern) oder **Tagesansicht** (Unterricht eines Tages laut Stundenplan, mit ‹ › blättern, Klick aufs Datum = heute). Laufende Stunden sind mit „läuft“ markiert. |
| **Symbolleiste unten links** | Stundenplan und Verwaltung (nur im Bearbeitungsmodus), Auswertung, **Speichern-Knopf** mit Zustand (gespeichert / ungespeichert / speichert). |
| **Titelleiste** | Modusschalter **Unterricht \| Bearbeiten**, bei laufender Stunde ein Hinweis-Knopf, der direkt zur Stunde führt. |
| **Reiter unten** | Bei gewählter Klasse: **Übersicht, Schüler, Mitarbeit, Noten**. |
| **Menü (drei Balken)** | Modus wechseln, Klassen & Fächer, Schüler, Stundenplan, Auswertung & Export, Notenschlüssel, App-Einstellungen, Darstellung, Speichern, Datei & Passwort, Als App installieren. |

- Die Seitenleiste lässt sich über das Symbol oben rechts ein- und ausblenden.
  Auf schmalen Geräten liegt sie als Schublade über dem Inhalt.
- **Darstellung:** Im Menü zwischen *hell*, *dunkel* und *System* umschalten.
  Die Wahl gilt je Gerät.
- **Startseite:** Ohne gewählte Klasse zeigt die App alle Klassen als Knöpfe.
  Läuft gerade Unterricht, erscheint oben **Mitarbeit eintragen**.

---

## 3. Die zwei Modi: Unterricht und Bearbeiten

| Modus | Was geht | Was nicht geht |
| --- | --- | --- |
| **Unterricht** (Standard) | Bewerten, Stundenplan und Klassen ansehen, auswerten, exportieren, Noten verwalten | Klassen, Schüler, Stundenplan, Sitzpläne und Einstellungen ändern |
| **Bearbeiten** | Klassen, Fächer, Schüler, Stundenplan, Sitzpläne, Notenschlüssel, Einstellungen, Datei & Passwort ändern | Bewerten |

- **Bearbeiten starten:** Schalter **Bearbeiten** in der Titelleiste oder im
  Menü. Die App fragt zur Sicherheit nach.
- **Zurück:** **Unterricht** oder **Fertig** in der gelben Leiste – ohne
  Rückfrage.
- Der gewählte Modus bleibt auf dem Gerät gespeichert.

---

## 4. Klassen, Fächer und Schüler einrichten

*Nur im Bearbeitungsmodus.* Menü → **Klassen & Fächer verwalten** bzw.
**Schüler anlegen & importieren**.

### Grundprinzip

**Klasse + Fach = Kurs.** Jeder Kurs hat eigene Sitzordnungen, eigene
Bewertungen, eigene Noten und ggf. einen eigenen Notenschlüssel.
In KDM wird jedes Lernfeld als eigenes Fach angelegt (z. B. „LF3 …“, Kürzel
LF3).

### Reiter „Fächer“

1. Fachname (z. B. *Mathematik*) und optional ein **Kürzel** (max. 10 Zeichen)
   eingeben.
2. **Fach anlegen**. Löschen über das Papierkorb-Symbol.

### Reiter „Klassen“

1. Klassennamen eingeben (z. B. *10a*) → **Klasse anlegen**.
2. Klasse oben auswählen.
3. Unter *Fächer der Klasse* ein Fach wählen → **Fach zuordnen**. Damit
   entsteht der Kurs.
4. Kurs entfernen über das ✕ am Kurs, Klasse löschen über **Klasse löschen**.

### Reiter „Schüler“

| Funktion | Bedienung |
| --- | --- |
| Einzeln anlegen | Vorname und Nachname eintragen → **Schüler anlegen** |
| Namensliste einfügen | **Namensliste einfügen**, ein Name je Zeile: „Nachname, Vorname“ oder „Vorname Nachname“ → **Schüler übernehmen** |
| Vor-/Nachname tauschen | Tauscht bei **allen** Schülern der Klasse Vor- und Nachnamen – praktisch nach einem falsch herum eingefügten Import |
| Umbenennen | Direkt im Namensfeld der Schülerkarte ändern |
| Foto | Auf das Bild tippen → Foto wählen. Fotos werden auf 400 Bildpunkte verkleinert. Entfernen über das Bild-Symbol |
| Löschen | Papierkorb-Symbol an der Schülerkarte |

Alternativ lassen sich Schüler auch im Klassenbereich **Schüler** über das
**+** anlegen (siehe [Abschnitt 8](#8-die-bereiche-einer-klasse)).

> Hinweis Datenschutz: Für Fotos ist in vielen Bundesländern eine Einwilligung
> der Erziehungsberechtigten nötig. Den Einsatz mit Schulleitung bzw.
> Datenschutzbeauftragten abstimmen.

---

## 5. Stundenplan

*Bearbeiten nur im Bearbeitungsmodus.* Menü → **Stundenplan**.

Der Stundenplan steuert, **wann bewertet werden darf** (siehe
[Abschnitt 7](#sperre-außerhalb-des-unterrichts)).

### Stunde von Hand eintragen

1. **Kurs**, **Tag**, **Von**, **Bis** und optional **Raum** wählen.
2. **Eintragen**.
3. Entfernen über das Papierkorb-Symbol an der Stunde.

Auf dem Handy erscheint der Plan als Liste je Wochentag, ab Tablet als
Wochentabelle. Der heutige Tag und die laufende Stunde sind hervorgehoben.
Ein Klick auf eine Stunde öffnet den Kurs.

### Aus WebUntis importieren (ICS-Datei)

1. In WebUntis (oder einem anderen Schulsystem) den Stundenplan als
   Kalenderdatei (**.ics**) exportieren.
2. **Aus WebUntis importieren** → Datei wählen. Die Datei verlässt das Gerät
   nicht.
3. In der **Vorschau** prüfen:
   - Einträge, die nur einmal vorkommen (vermutlich Vertretungen), sind nicht
     vorausgewählt.
   - **Klasse** und **Fach** lassen sich je Zeile korrigieren; fehlende Angaben
     sind markiert.
   - **Alle** / **Keine** wählt alle Zeilen an oder ab.
4. **… Stunden übernehmen**. Fehlende Klassen, Fächer und Kurse legt die App
   dabei selbst an und zeigt eine Bilanz.

---

## 6. Sitzordnung bauen

Kurs öffnen → Ansicht **Sitzplan** → in den **Bearbeitungsmodus** wechseln.

| Funktion | Bedienung |
| --- | --- |
| Sitzordnung anlegen | **Sitzordnung anlegen** (wenn noch keine existiert) |
| Zweite Sitzordnung | **Zweite Sitzordnung** – z. B. für einen anderen Raum. Max. zwei je Kurs; Umschalten über die Reiter mit den Plan-Namen |
| Name ändern | Feld **Name** |
| Raster | **Reihen** und **Spalten** (je 1–20). Plätze außerhalb eines verkleinerten Rasters werden frei |
| Platzieren | Schüler aus *Ohne Platz* per Drag and Drop auf einen Platz ziehen |
| Verschieben / Tauschen | Platzierten Schüler auf einen anderen Platz ziehen; auf einen besetzten Platz = Tausch |
| Platz freigeben | Schüler zurück in *Ohne Platz* ziehen |
| **Auffüllen** | Füllt freie Plätze der Reihe nach |
| **Alphabetisch** | Setzt alle nach Nachnamen von vorn nach hinten |
| **Zufällig** | Setzt alle zufällig neu |
| **Leeren** | Nimmt alle von ihren Plätzen |
| **Löschen** | Löscht die aktuelle Sitzordnung |

Änderungen werden sofort übernommen. Vorne im Raum ist die **Tafel**
eingezeichnet.

---

## 7. Mitarbeit bewerten

*Nur im Unterrichtsmodus.* Kurs öffnen – über die Seitenleiste, die
Tagesansicht, den Hinweis „läuft gerade“ oder **Klasse → Mitarbeit**.

Oben stehen die Fächer der Klasse als Reiter, darunter Datum und Stunde.
Bewertet wird wahlweise in der **Liste** oder auf dem **Sitzplan**.

**Auf dem Sitzplan** zeigen die Kacheln nur Foto, Name und Punktestand. Erst
ein **Tipp auf einen Schüler** klappt die Bewertungsknöpfe und den Knopf
**Verlauf** auf. Erneut tippen oder <kbd>Esc</kbd> klappt sie wieder zu; nach
einer Bewertung schließen sie von selbst.

### Die Bewertungsskala

| Knopf | Bedeutung | Punkte |
| --- | --- | --- |
| **++** | Sehr gute Mitarbeit | +2 |
| **+** | Gute Mitarbeit | +1 |
| **0** | Durchschnittliche Mitarbeit | 0 |
| **−** | Schwache Mitarbeit | −1 |
| **−−** | Keine Mitarbeit / Störung | −2 |

- Jeder Schüler startet bei **0 Punkten**; der Punktestand ist die Summe aller
  Bewertungen im Kurs.
- Wer heute bewertet wurde, bekommt die Farbe seiner Bewertung (grün bis rot)
  und ein kleines Symbol.
- Nach jeder Bewertung erscheint unten eine Meldung mit **Rückgängig** – für
  Vertipper.
- Schüler **ohne Sitzplatz** stehen neben dem Sitzplan und können dort ebenso
  bewertet werden.

### Verlauf eines Schülers

In der Liste öffnet ein Tipp auf Foto oder Namen das Blatt **Mitarbeit**, auf
dem Sitzplan der Knopf **Verlauf** unter den Bewertungsknöpfen:

- Punktestand und ggf. Note im Fach,
- Verteilung der Bewertungen für **7 Tage**, **30 Tage** oder **Gesamt**,
- **Jetzt bewerten** mit denselben Knöpfen,
- **Verlauf** Tag für Tag – ein Tipp auf eine Bewertung löscht sie (mit
  Rückfrage),
- mit ‹ › zum vorigen/nächsten Schüler blättern.

### Sperre außerhalb des Unterrichts

Bewerten geht nur, **während der Kurs laut Stundenplan läuft**.

- **Kulanzzeit** (Standard 15 Min.): So lange vor Beginn und nach Ende bleibt
  Bewerten möglich.
- **Notfall-Freigabe**: hebt die Sperre ganz auf, z. B. bei kurzfristigen
  Planänderungen.

Beides unter **Auswertung → Einstellungen** (siehe
[Abschnitt 10](#reiter-einstellungen)).

---

## 8. Die Bereiche einer Klasse

Klasse in der Seitenleiste wählen; unten erscheinen vier Reiter.

### Übersicht

- **Aktueller Unterricht** – läuft gerade eine Stunde: direkt zum Bewerten.
- **Unterricht heute** – alle heutigen Stunden der Klasse mit Raum.
- **Fächer** – alle Kurse mit Anzahl der Sitzordnungen und Bewertungen der
  letzten 14 Tage; **Fach zuordnen** führt zur Verwaltung.
- **Gute** und **schwache Mitarbeit (14 Tage)** – wer auffällt.

### Schüler

- Klassenliste mit Nummer, Foto und Kurzstand der Mitarbeit.
- **Buchstaben-Register** am rechten Rand zum Springen.
- Ein Tipp öffnet die **Stammdaten**: Name, Foto, Mitarbeit je Fach (Punkte,
  Note). Mit ‹ › blättern.
- Im Bearbeitungsmodus zusätzlich: **+** (neuer Schüler – das Blatt bleibt
  offen, so lässt sich eine ganze Klasse zügig erfassen), **Liste
  importieren**, Name ändern, Foto ändern/entfernen, Schüler löschen.

### Mitarbeit

Öffnet das Bewerten (siehe [Abschnitt 7](#7-mitarbeit-bewerten)).

### Noten

- Fach oben wählen.
- Je Schüler: Verteilung der Bewertungen, **Punkte** und **Note** laut
  Notenschlüssel, oben der Durchschnitt.
- **Notenverwaltung** öffnet die ausführliche Notenverwaltung des Kurses
  ([Abschnitt 9](#9-notenverwaltung-je-kurs)), **Export** die Auswertung.

---

## 9. Notenverwaltung je Kurs

Aufruf: Kurs → **Noten** oder Klasse → Noten → **Notenverwaltung**.

### Zeitraum

Oben **Zeitraum** wählen (z. B. „1. Halbjahr 2026/27“) – alle Reiter rechnen
dann nur in diesem Zeitraum. **Zeiträume verwalten**: Name, Von, Bis →
**Zeitraum anlegen**; Löschen je Zeitraum.
**Notenübersicht als CSV** exportiert die Übersicht.

### Reiter

| Reiter | Inhalt |
| --- | --- |
| **Übersicht** | Alle Schüler mit Einzelnoten der freigegebenen Leistungsnachweise, Mitarbeit, schriftlich, mündlich und Gesamtnote. Ein * markiert eine vorläufige Gesamtnote (ein Bereich hat noch keine Noten). |
| **Leistungsnachweise** | Klassenarbeit, Test, Referat … anlegen und Noten eintragen (siehe unten). |
| **Mitarbeit** | Je Doppelstunde eine Mitarbeitsnote pro Schüler. |
| **Bewertungsschema** | Gewichtung, Arten, Punkteschlüssel, Mitarbeitsnoten. |
| **Notenbögen** | Je Schüler ein Bogen mit seinem Stand. |
| **Protokoll** | Alle Änderungen an freigegebenen Noten und von Hand gesetzte Mitarbeitsnoten, mit Begründung. |

### Leistungsnachweis anlegen und bewerten

1. **Art**, **Titel**, **Datum** und optional **Max. Punkte** eingeben →
   **Anlegen**.
2. In der Liste **Noten eintragen** wählen.
3. Je Schüler **Status** (*bewertet*, *entschuldigt*, *verweigert*), **Punkte**
   oder **Note** (mit Komma, z. B. 2,3) und ggf. **Bemerkung** eintragen.
   Mit Punkten rechnet die App über den Punkteschlüssel um; eine eingetragene
   Note hat Vorrang.
4. **Speichern** – der **Notenspiegel** und der Durchschnitt werden angezeigt.
5. **Freigeben (zählt ab dann)** – erst jetzt zählt der Nachweis in der
   Übersicht. Vorher ist er ein *Entwurf*.
6. Änderungen nach der Freigabe brauchen eine **Begründung** (landet im
   Protokoll). **Freigabe zurücknehmen** und **Löschen** sind möglich.

### Mitarbeit je Doppelstunde

- Eine Doppelstunde zählt, sobald an dem Tag im Kurs jemand bewertet wurde.
- Mehrere Bewertungen einer Stunde werden addiert (höchstens ++, mindestens −−).
- Standard: ++ = 1,0 · + = 2,0 · ausgeglichen = 3,0 · − = 4,0 · −− = 5,0 ·
  ohne Bewertung = 3,0 (anpassbar im Schema).
- Je Zelle lässt sich die Note **von Hand** überschreiben oder **fehlte**
  wählen – dann zählt die Stunde für diesen Schüler nicht.
- Die Mitarbeit ist der Durchschnitt der Stundennoten.

### Bewertungsschema

- **Gewichtung der Bereiche:** Anteil *schriftlich* in %, der Rest ist
  *mündlich/sonstig*.
- **Arten von Leistungsnachweisen:** Bezeichnung, Bereich und Gewicht
  (z. B. Klassenarbeit 2, Test 1). **Art hinzufügen** / **Entfernen**.
  Die Mitarbeit geht mit eigenem Gewicht in den mündlichen Bereich ein.
- **Punkteschlüssel:** ab wie viel Prozent welche Note gilt (Vorlage: IHK).
- **Mitarbeit je Doppelstunde:** Noten für ++, +, ausgeglichen, −, −− und
  ohne Bewertung.
- **Schema speichern** oder **Verwerfen**.
- **Schema auf andere Kurse übertragen:** Kurse anhaken → **Übertragen**
  (übernimmt das gespeicherte Schema; vorausgewählt sind die übrigen
  Lernfelder der Klasse).

> Die Vorgaben im Schema sind nur ein Vorschlag. Verbindlich sind
> Schulgesetz, Verordnungen und Konferenzbeschlüsse.

### Rechenweg der Gesamtnote

1. Ein Bereich (schriftlich, mündlich) = gewichteter Durchschnitt seiner
   Einzelnoten.
2. Gesamtnote = beide Bereiche nach dem Anteil im Schema verrechnet.
3. Fehlt ein Bereich, ist die Gesamtnote vorläufig (*).

### Notenbögen

1. Schüler anhaken (**Alle** / **Keinen**).
2. **Drucken / als PDF speichern** oder **Je Schüler als HTML-Datei**.
3. Jede Ausgabe wird unter *Ausgegebene Notenbögen* mit dem damaligen Stand
   vermerkt.

Nur freigegebene Leistungsnachweise erscheinen. Bögen einzeln aushändigen oder
einzeln verschicken – nie als Klassenliste.

---

## 10. Auswertung, Export und Einstellungen

Menü → **Auswertung & Export** (oder Diagramm-Symbol unten links).

### Reiter „Punkte & Export“

1. **Kurs** wählen, optional Zeitraum **Von/Bis** (leer = gesamter Zeitraum).
2. Tabelle: Name, Punkte, Anzahl Bewertungen, Punkte heute, Note.
3. Export als CSV (öffnet sich in Excel/LibreOffice):
   - **Punktestand (CSV)** – der gewählte Kurs,
   - **Einzelbewertungen** – jede Bewertung einzeln,
   - **Alle Kurse** – Punktestände aller Kurse.

### Reiter „Notenschlüssel“ *(Bearbeitungsmodus)*

Legt fest, ab wie vielen **Mitarbeitspunkten** welche Note gilt.

1. **Für alle Kurse** oder **Nur [Kurs]** wählen.
2. Bezeichnung vergeben, Stufen eintragen („ab … Punkten → Note“),
   **Stufe hinzufügen** / ✕.
3. **Übernehmen**. Einen kurseigenen Schlüssel entfernt **Eigenen Schlüssel
   entfernen** – dann gilt wieder der allgemeine.

### Reiter „Einstellungen“ *(Bearbeitungsmodus)*

- **Kulanzzeit** vor und nach der Stunde (0–120 Minuten).
- **Notfall-Freigabe:** Bewerten auch außerhalb des Stundenplans. Solange sie
  aktiv ist, zeigt die App einen Warnhinweis.

### Reiter „Datei“ *(Bearbeitungsmodus)*

Siehe [Abschnitt 11](#11-speichern-datei-und-passwort).

---

## 11. Speichern, Datei und Passwort

### Speichern

- Speichern-Knopf unten links, Menü → **Jetzt speichern** oder
  <kbd>Strg</kbd>+<kbd>S</kbd>.
- Der Knopf zeigt jederzeit, ob es ungespeicherte Änderungen gibt. Beim
  Schließen des Fensters warnt der Browser.

| Umgebung | Verhalten |
| --- | --- |
| Chrome / Edge | Schreibt direkt in die gewählte Datei; nach dem ersten Speichern von Hand **automatisch** wenige Sekunden nach jeder Änderung |
| Firefox / Safari | Jedes Speichern legt eine neue Datei im Download-Ordner ab |
| OneDrive | Speichert automatisch in OneDrive. Hat ein anderes Gerät inzwischen gespeichert, fragt die App, welcher Stand gilt |
| Android-App | Speichert in *Dokumente/Sitzordnung* |

### Reiter „Datei“ (Auswertung → Datei)

- **Automatisch speichern** ein-/ausschalten (gilt je Gerät).
- Bei OneDrive: **Auf diesem Gerät merken** ein-/ausschalten.
- **Speichern unter …** – Kopie an anderem Ort/mit anderem Namen.
- **In OneDrive ablegen** – lokalen Bestand nach OneDrive verschieben;
  danach öffnet jedes Gerät denselben Stand.
- **Passwort ändern:** bisheriges und neues Passwort →
  **Passwort ändern und speichern**. Ältere Sicherungskopien behalten ihr altes
  Passwort.

### Passwort ändern

Schneller geht es über **Menü → Passwort ändern** (unter „Jetzt speichern“).
Ein neues Passwort braucht:

- mehr als 10 Zeichen,
- einen Großbuchstaben,
- eine Zahl,
- ein Sonderzeichen.

Beim Tippen hakt die App ab, welche Regel erfüllt ist.

### Was in der Datei steht

Klassen, Schüler samt Fotos, Kurse, Sitzordnungen, Stundenplan, Bewertungen,
Noten, Notenschlüssel und Einstellungen – verschlüsselt (AES-GCM).

---

## 12. Android-App und Installation als App

- **Als App installieren** (Chrome/Edge): Menü → **Als App installieren**.
  Die App bekommt ein eigenes Symbol und startet auch ohne Internet. Liegt eine
  neue Version bereit, meldet sie das.
- **Android-App:** APK unter
  <https://github.com/V07GVO9/sitzordnung/releases/latest/download/Sitzordnung.apk>.
  Speichern und CSV-Export landen in *Dokumente/Sitzordnung*, nach dem Export
  öffnet sich das Teilen-Menü. **Datei öffnen** nutzt die Dateiauswahl von
  Android (alle Dateitypen sind auswählbar).

---

## 13. Häufige Fragen

**Ich kann nicht bewerten.**
Prüfen: (1) Unterrichtsmodus aktiv? (2) Läuft der Kurs laut Stundenplan?
(3) Ggf. Kulanzzeit erhöhen oder Notfall-Freigabe einschalten.

**Ich finde Stundenplan / Verwaltung nicht.**
Diese Seiten gibt es nur im **Bearbeitungsmodus**.

**Ich habe mich vertippt.**
Direkt nach der Bewertung **Rückgängig** – oder im Verlauf des Schülers die
Bewertung antippen und löschen.

**Vor- und Nachnamen sind nach dem Import vertauscht.**
Verwaltung → Schüler → **Vor-/Nachname tauschen**.

**Passwort vergessen?**
Nicht wiederherstellbar. Regelmäßig eine Sicherungskopie (**Speichern unter …**)
anlegen und das Passwort sicher verwahren.

**Wie lösche ich Daten nach Schuljahresende?**
Im Bearbeitungsmodus Schüler, Kurse oder ganze Klassen in der Verwaltung
löschen – damit verschwinden auch deren Bewertungen. Löschfristen liegen bei
der Lehrkraft.

---

## 14. Änderungsverzeichnis

Wird bei jeder automatischen Prüfung (donnerstags) ergänzt. Alle Neuerungen
der App im Detail stehen im [Changelog](CHANGELOG.md).

| Datum | Änderung |
| --- | --- |
| 29.10.2026 | Sitzplan: Bewertungsknöpfe erst nach Antippen (Abschnitt 7); Passwort ändern über das Menü mit neuen Regeln (Abschnitt 11). |
| 28.10.2026 | Erste Fassung des Benutzerhandbuchs mit allen Funktionen. |

<!-- doku-stand: 17b7746 -->
