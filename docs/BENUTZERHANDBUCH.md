# Benutzerhandbuch – Sitzordnung & Mitarbeitsnoten

Dieses Handbuch beschreibt alle Funktionen der App aus Sicht der Lehrkraft.
Technische Hinweise zu Installation und Entwicklung stehen in der
[README](../README.md), die Einrichtung von OneDrive in
[onedrive-einrichten.md](onedrive-einrichten.md).

> Dieses Handbuch wird jeden Donnerstag automatisch mit dem aktuellen Stand der
> App abgeglichen. Neue Funktionen kommen dabei hinzu, das
> [Änderungsverzeichnis](#13-änderungsverzeichnis) am Ende zeigt, was sich
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
9. [Bewertungsschema](#9-bewertungsschema)
10. [Speichern, Datei und Passwort](#10-speichern-datei-und-passwort)
11. [Android-App und Installation als App](#11-android-app-und-installation-als-app)
12. [Häufige Fragen](#12-häufige-fragen)
13. [Änderungsverzeichnis](#13-änderungsverzeichnis)

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

### Einrichtungs-Assistent

Ist noch kein Unterricht eingetragen, zeigt der Wochenplan **Einrichtung
starten**. Später: Bearbeitungsmodus → Menü ☰ → **Einrichtung (Assistent)**.

Der Assistent ist eine Checkliste mit Fortschrittsbalken. Jeder Schritt zeigt
seinen Stand (✓ erledigt), der nächste offene ist blau umrandet; der Knopf führt
direkt auf die passende Seite (mit Rückfrage in den Bearbeitungsmodus):

1. **Klassen und Fächer** – am schnellsten per WebUntis-Import, sonst von Hand.
2. **Schüler** – je Klasse ohne Schüler ein Knopf, der sie direkt öffnet.
3. **Stundenplan**
4. **Sitzordnungen** – je Kurs ohne Sitzordnung ein Knopf.
5. **Fotos** (optional) – zeigt, wie viele Schüler schon ein Foto haben.

### OneDrive

1. Reiter **OneDrive** → **Bei Microsoft anmelden**.
2. **Dateien aus OneDrive laden**, dann eine vorhandene Datei wählen oder unter
   **Neue Datei** einen Dateinamen vergeben.
3. Passwort eingeben → **Aus OneDrive öffnen** bzw. **In OneDrive anlegen**.

Optional: **Auf diesem Gerät merken** – beim nächsten Start öffnet die App den
Bestand ohne Passwort. Nur auf eigenen, gesperrten Geräten nutzen, nie an
Schul-PCs. Eine gemerkte Datei erscheint oben mit **Öffnen** und **Vergessen**.
Dateien in OneDrive lassen sich über das Papierkorb-Symbol löschen.

### Ungesicherte Änderungen wiederherstellen

Die App sichert den Bestand zusätzlich verschlüsselt im Browser. Öffnest du
deine Datei und liegen dazu noch **ungesicherte Änderungen** im Browser, übernimmt
die App sie automatisch – es erscheint „Ungesicherte Änderungen
wiederhergestellt“. Danach einmal speichern.

Wurde die Datei inzwischen anderswo gespeichert (z. B. auf einem anderen Gerät),
fragt die App nach: **Stand der Datei laden** oder **Meine Änderungen behalten**.
Der Zwischenspeicher ersetzt die Datei nicht.

---

## 2. Aufbau der Oberfläche

Der Aufbau ist an die iPad-App „Meine Klassenmappe“ angelehnt.

| Bereich | Inhalt |
| --- | --- |
| **Seitenleiste links** | Umschalter **Klassen** (alle Klassen mit Schülerzahl und Fächern) oder **Tagesansicht** (Unterricht eines Tages laut Stundenplan, mit ‹ › blättern, Klick aufs Datum = heute). Laufende Stunden sind mit „läuft“ markiert. |
| **Symbolleiste unten links** | Stundenplan und Verwaltung (nur im Bearbeitungsmodus), **Speichern-Knopf** mit Zustand (gespeichert / ungespeichert / speichert). |
| **Titelleiste** | Steht fest oben auf der Seite und scrollt mit dem Inhalt weg; zum Wiedersehen nach oben scrollen. Auf Mitarbeit und Noten zeigt der Titel das Fach mit Kürzel in der Fachfarbe; auf dem Handy in Kurzform (z. B. „INF BFI10A · Noten“), und der Modusschalter zeigt dort nur den Knopf zum Wechseln. Der Speichern-Knopf rechts zeigt den Speicherstand (Haken = gespeichert, Diskette auf Gelb = ungespeichert). Enthält Menüknopf ☰, Wochenplan, Modusschalter **Unterricht \| Bearbeiten**, bei laufender Stunde ein Hinweis-Knopf, der direkt zur Stunde führt. |
| **Reiter unten** | Bei gewählter Klasse: **Übersicht, Schüler, Mitarbeit, Noten**. |
| **Menü (drei Balken)** | Knopf ☰ links in der Titelleiste; Klick daneben oder <kbd>Esc</kbd> schließt es. Oben das **aktuelle Fach**, darunter Modus wechseln, Klassen & Fächer, Schüler, Stundenplan, Noten, Darstellung, Speichern, Sicherungskopie, Passwort ändern, Als App installieren. Im Unterrichtsmodus lässt sich das Menü erst öffnen, wenn im Wochenplan eine Stunde gewählt ist; im Bearbeitungsmodus immer. |

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
| **Unterricht** (Standard) | Bewerten, Stundenplan und Klassen ansehen, Noten eintragen | Klassen, Schüler, Stundenplan, Sitzpläne und Einstellungen ändern |
| **Bearbeiten** | Klassen, Fächer, Schüler, Stundenplan und Sitzpläne ändern | Bewerten |

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
| Foto | Auf das Bild tippen → Foto aus Galerie/Datei wählen, oder auf das **Kamera-Symbol** → Foto direkt aufnehmen (Handy/Tablet: Rückkamera). Fotos werden auf 400 Bildpunkte verkleinert. Entfernen über das Bild-Symbol |
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
| Sitzordnung wählen / neu anlegen | Dropdown **Sitzordnung**: vorhandene Sitzordnung auswählen oder **＋ Neue Sitzordnung** (z. B. für einen anderen Raum). Beliebig viele je Kurs; die neue übernimmt das aktuelle Raster, ihr Name ist gleich zum Ändern markiert. Darunter stehen die Sitzordnungen der **anderen Fächer/Lernfelder derselben Klasse** – eine Auswahl übernimmt sie als **Kopie** (mit Plätzen) in dieses Fach; das Original bleibt unverändert |
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

### Schnellbewertung per Wischen

Ohne die Knöpfe zu öffnen: über eine Kachel (Sitzplan) oder eine Zeile (Liste)
**waagerecht wischen**. Die Kachel folgt dem Finger und zeigt schon unterwegs,
was beim Loslassen vergeben wird.

| Geste | Bewertung |
| --- | --- |
| kurz nach rechts | **+** |
| weit nach rechts | **++** |
| kurz nach links | **−** |
| weit nach links | **−−** |

Zu kurz gewischt zählt nicht. Senkrechtes Wischen scrollt wie gewohnt. Auch hier
gibt es danach **Rückgängig**. Die **0** gibt es nur über die Knöpfe.

### Abwesende markieren

Wer fehlt, wird schon zu Stundenbeginn markiert: im Sitzplan Kachel antippen →
**Fehlt**, in der Liste der Knopf **fehlt** neben dem Namen. Die Kachel wird
grau und gestrichelt, oben steht „· 1 fehlt“. Abwesende lassen sich nicht
bewerten und werden nicht ausgelost. **Anwesend** nimmt die Markierung zurück.

Für die Note zählt die Doppelstunde dann für diesen Schüler nicht. Die
Änderung wird in der Datei protokolliert.

### Schüler auslosen

**Auslosen** wählt zufällig einen anwesenden Schüler – bevorzugt jemanden, der
an diesem Tag noch nicht bewertet wurde. Die Kachel bzw. Zeile leuchtet auf, im
Sitzplan öffnen sich gleich ihre Bewertungsknöpfe.

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

Beides steht in der Datei (Standard: 15 Minuten, Notfall-Freigabe aus) und
lässt sich in der App nicht mehr umstellen.

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

---

## 9. Bewertungsschema

Aufruf: Menü ☰ → **Noten** → **Bewertungsschema bearbeiten** (nachdem im
Wochenplan eine Stunde gewählt ist). Das Schema gilt je Kurs.

- **Gewichtung der Bereiche:** Anteil *schriftlich* in %, der Rest ist
  *mündlich/sonstig*.
- **Arten von Leistungsnachweisen:** Bezeichnung, Bereich und Gewicht
  (z. B. Klassenarbeit 2, Test 1). **Art hinzufügen** / **Entfernen**.
- **Punkteschlüssel:** ab wie viel Prozent welche Note gilt (Vorlage: IHK) –
  danach richtet sich die schriftliche Quartalsnote.
- **Mitarbeit je Doppelstunde:** Noten für ++, +, ausgeglichen, −, −− und
  ohne Bewertung – daraus entsteht der mündliche Vorschlag.
- **Schema speichern** oder **Verwerfen**.
- **Schema auf andere Kurse übertragen:** Kurse anhaken → **Übertragen**
  (übernimmt das gespeicherte Schema; vorausgewählt sind die übrigen
  Lernfelder der Klasse).

> Die Vorgaben im Schema sind nur ein Vorschlag. Verbindlich sind
> Schulgesetz, Verordnungen und Konferenzbeschlüsse.

---

## 10. Speichern, Datei und Passwort

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

### Automatisch speichern einschalten – Schritt für Schritt

Das automatische Speichern ist **normalerweise schon an**. Damit es wirklich in
die Datei schreibt, müssen drei Dinge stimmen.

**Vorher prüfen: Läuft es schon?**

1. Oben links auf die **drei Striche (☰)** tippen.
2. Unter **„Datei“** steht der Dateiname.
3. Steht darunter **„· speichert automatisch“**? → Fertig, alles läuft.
4. Steht das **nicht** da → mit Schritt 1 weitermachen.

**Schritt 1: Den richtigen Browser nehmen**

- **Google Chrome** oder **Microsoft Edge** verwenden.
- In Firefox oder Safari geht es nicht – dort landet jedes Speichern als neue
  Datei im Download-Ordner.
- Liegt die Datei in **OneDrive**, geht es in jedem Browser.

**Schritt 2: Die Datei richtig öffnen**

- Beim Start den Reiter **„Datei öffnen“** wählen, die eigene Datei aussuchen,
  dann das Passwort eingeben.
- Ungesicherte Änderungen aus dem Browser übernimmt die App dabei von selbst.

**Schritt 3: Einmal von Hand speichern**

1. **☰ → Jetzt speichern** (oder <kbd>Strg</kbd>+<kbd>S</kbd>).
2. Der Browser fragt, ob die Seite Änderungen an der Datei speichern darf.
3. **„Änderungen speichern“** bzw. **„Zulassen“** klicken.

Ab jetzt speichert die App **sofort nach jeder Änderung** von selbst in die Datei.

**Gut zu wissen**

- Die Einstellung gilt **nur für dieses Gerät**.
- Nach einem Browser-Neustart fragt Chrome/Edge eventuell erneut nach der
  Erlaubnis – dann Schritt 3 wiederholen.
- Hat ein **anderes Gerät** zwischendurch gespeichert, pausiert das automatische
  Speichern, bis entschieden ist, welcher Stand gilt.

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

### Sicherungskopie

Menü ☰ → **Sicherungskopie in OneDrive speichern** legt eine Kopie des ganzen
Bestands – verschlüsselt mit demselben Passwort – ohne Rückfrage in OneDrive
unter **Sitzordnung-App/Sicherheitskopien** ab, als
`<Dateiname>-sicherung-JJJJ-MM-TT.sitzordnung`. Anders als *Speichern unter …*
arbeitet die App danach mit derselben Datei weiter.

Ist die neueste Kopie in diesem Ordner **7 Tage oder älter** (oder gibt es noch
keine), zeigt der Wochenplan einen gelben Hinweis mit **Jetzt sichern**;
**Später** blendet ihn auf diesem Gerät bis morgen aus. Maßgeblich ist das
Erstellungsdatum der Kopien im OneDrive-Ordner – damit gilt derselbe Stand auf
allen Geräten. Ist OneDrive gerade nicht erreichbar, zählt der Vermerk der
letzten Sicherung in der Datei.

### Sicherung als PDF (lesbar)

Menü ☰ → **Sicherung als PDF (alle Noten)** erzeugt eine lesbare PDF-Datei
`sicherung-alle-noten-JJJJ-MM-TT.pdf` – ohne Passwort, zum Ausdrucken oder
Ablegen. Sie enthält **alle Kurse** (je Klasse und Fach/Lernfeld eine Seite,
Querformat) über den gesamten Zeitraum. Jeder Schüler steht in **einer Zeile**:

- alle Leistungsnachweise (nicht freigegebene grau/kursiv, e = entschuldigt,
  v = verweigert),
- die Mitarbeitsnote jeder Doppelstunde (fett/blau = von Hand gesetzt,
  f = fehlte, – = zählt nicht),
- Ø Mitarbeit, schriftlich, mündlich und Gesamtnote (* = vorläufig).

Bei vielen Doppelstunden wird die Schrift automatisch kleiner, damit alles in
eine Zeile passt. Die PDF ist **nicht verschlüsselt** – sie enthält
personenbezogene Daten und gehört entsprechend sicher abgelegt. Zum
Wiederherstellen taugt nur die verschlüsselte Sicherungskopie.

### Schuljahreswechsel

Bearbeitungsmodus → Menü ☰ → **Schuljahreswechsel**:

1. **Sicherungskopie** speichern – Pflicht, sonst bleibt der Wechsel
   gesperrt.
2. **Klassen:** neue Namen eintragen (**Alle Klassennummern +1** macht aus
   KDM11 → KDM12) oder **verlässt die Schule** ankreuzen – die Klasse wird samt
   Schülern gelöscht.
3. **Daten des alten Schuljahres:** Leistungsdaten löschen (Bewertungen, von
   Hand gesetzte Stundennoten, Leistungsnachweise, Quartalsnoten, Protokoll,
   Notenbögen-Vermerke, abgelaufene Zeiträume) und/oder den Stundenplan leeren.
   Die Anzahl je Art steht dabei.
4. Zusammenfassung prüfen → **Schuljahreswechsel durchführen** → bestätigen.

Erhalten bleiben Schüler, Fächer, Kurse, Sitzordnungen, Notenschlüssel und
Bewertungsschemata. Danach öffnet sich der Einrichtungs-Assistent – meist fehlt
nur noch der neue Stundenplan. Rückgängig machen lässt sich der Wechsel nur über
die Sicherungskopie.

## 11. Android-App und Installation als App

- **Als App installieren** (Chrome/Edge): Menü → **Als App installieren**.
  Die App bekommt ein eigenes Symbol und startet auch ohne Internet. Liegt eine
  neue Version bereit, meldet sie das.
- **Android-App:** APK unter
  <https://github.com/V07GVO9/sitzordnung/releases/latest/download/Sitzordnung.apk>.
  Speichern und CSV-Export landen in *Dokumente/Sitzordnung*, nach dem Export
  öffnet sich das Teilen-Menü. **Datei öffnen** nutzt die Dateiauswahl von
  Android (alle Dateitypen sind auswählbar).

---

## 12. Häufige Fragen

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
Nicht wiederherstellbar. Regelmäßig eine Sicherungskopie (Menü ☰ →
**Sicherungskopie in OneDrive speichern**) anlegen und das Passwort sicher verwahren.

**Wie lösche ich Daten nach Schuljahresende?**
Mit dem **Schuljahreswechsel** (Bearbeitungsmodus → Menü ☰): Er löscht die
Leistungsdaten des alten Jahres und Klassen, die die Schule verlassen – nach
einer Pflicht-Sicherungskopie. Einzelne Schüler, Kurse oder Klassen lassen
sich weiterhin in der Verwaltung löschen. Löschfristen liegen bei der Lehrkraft.

---

## 13. Änderungsverzeichnis

Wird bei jeder automatischen Prüfung (donnerstags) ergänzt. Alle Neuerungen
der App im Detail stehen im [Changelog](CHANGELOG.md).

| Datum | Änderung |
| --- | --- |
| 29.10.2026 | Sitzplan: Bewertungsknöpfe erst nach Antippen (Abschnitt 7); Passwort ändern über das Menü mit neuen Regeln (Abschnitt 11). |
| 28.10.2026 | Erste Fassung des Benutzerhandbuchs mit allen Funktionen. |

<!-- doku-stand: b76d278 -->
