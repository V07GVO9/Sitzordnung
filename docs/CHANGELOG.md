# Changelog – Was ist neu?

Alle für Lehrkräfte sichtbaren Änderungen der App, neueste zuerst.
Wie die Funktionen im Einzelnen bedient werden, steht im
[Benutzerhandbuch](BENUTZERHANDBUCH.md).

Kategorien: **Neu** · **Geändert** · **Behoben**

---

## 09.11.2026

**Neu**
- **Datenschutz-Modus (Beamer):** Menü ☰ → Datenschutz-Modus macht Namen und
  Fotos unkenntlich; ein durchgestrichenes Auge in der Titelleiste schaltet ihn
  wieder aus.
- **Sicherungskopie:** Menü ☰ → Sicherungskopie herunterladen (verschlüsselt,
  die Arbeitsdatei bleibt). Nach 7 Tagen ohne Kopie erinnert der Wochenplan.
- **Schuljahreswechsel:** Assistent mit Pflicht-Sicherungskopie: Klassen
  hochsetzen oder entfernen, Leistungsdaten des alten Jahres löschen,
  Stundenplan leeren – mit Zusammenfassung und Rückfrage.
- **Einrichtungs-Assistent:** Checkliste vom leeren Bestand bis zum ersten
  Unterricht (Klassen & Fächer, Schüler, Stundenplan, Sitzordnungen, Fotos) mit
  Stand je Schritt und Direkt-Knopf. Startet aus dem leeren Wochenplan oder über
  Menü ☰ → Einrichtung.
- **Foto per Kamera:** Unter Schüler nimmt das Kamera-Symbol ein Foto direkt
  auf, ohne Umweg über die Galerie.
- **Leere Seiten mit Direkt-Link:** Leerer Stundenplan → „Aus WebUntis
  importieren“, Klasse ohne Schüler → „Schüler anlegen“ (öffnet gleich die
  richtige Klasse), Auswertung ohne Stunde → „Zum Wochenplan“.
- **Hinweise in der Notenübersicht:** Ein Kasten nennt Schüler mit einer
  Gesamtnote schlechter als 4,0, ohne schriftliche Note oder ohne Note in einem
  freigegebenen Leistungsnachweis; ⚠ markiert sie in der Tabelle.
- **Schnellbewertung per Wischen:** Über Kachel oder Listenzeile waagerecht
  wischen – kurz rechts **+**, weit rechts **++**, kurz links **−**, weit links
  **−−**. Die Kachel zeigt schon beim Wischen, was vergeben wird.
- **Abwesende markieren:** Kachel antippen → **Fehlt** bzw. in der Liste
  **fehlt**. Abwesende sind ausgegraut, werden nicht bewertet und nicht
  ausgelost; die Doppelstunde zählt für sie nicht.
- **Schüler auslosen:** Knopf **Auslosen** wählt zufällig einen anwesenden
  Schüler, bevorzugt noch nicht bewertete, und öffnet gleich seine Knöpfe.

**Geändert**
- Notenverwaltung: **Bewertungsschema, Notenbögen und Protokoll** liegen unter
  **Mehr ▾** – auf dem Handy bleiben so nur vier Reiter.
- Auf der Kursseite (Liste und Sitzplan) entfällt der Knopf **Noten**. Die
  **Notenverwaltung** (Leistungsnachweise, Bewertungsschema, Notenbögen,
  Protokoll) hat dafür einen eigenen Menüpunkt: Menü ☰ → **Notenverwaltung**.
  Die Quartalsnoten bleiben unter Menü ☰ → **Noten**.
- **Titelleiste wieder sichtbar:** Statt verborgen zu sein, steht sie fest
  oben auf der Seite und scrollt beim Runterscrollen mit weg. Das
  Herunterziehen und der Knopf oben in der Mitte entfallen. So ist auch der
  Speicherstand (Knopf rechts) wieder im Blick.
- **Kurskopf:** Auf Mitarbeit, Noten und Auswertung zeigt der Titel das Fach mit
  Kürzel in der Fachfarbe.
- **Handy:** Kurzer Titel (z. B. „INF BFI10A · Noten“), und der Modusschalter
  zeigt nur den Knopf zum Wechseln – alles passt in eine Zeile.
- Wochenplan: Nach dem Blättern führt ein deutlicher **Heute**-Knopf zurück in
  die aktuelle Woche.

## 06.11.2026

**Neu**
- **Automatische Sperre:** Nach 15 Minuten ohne Eingabe schließt sich der
  Datenbestand. Ungesicherte Änderungen bleiben verschlüsselt im Browser und
  kommen beim erneuten Öffnen derselben Datei zurück.
- **Mitarbeit aus anderem Werkzeug übernehmen:** Unter *Noten →
  Leistungsnachweise* lässt sich die PDF-Mitarbeitsübersicht der Schul-App
  einlesen. Je Fach entsteht ein mündlicher Leistungsnachweis; die Note ist der
  Durchschnitt der Bewertungen (++ bis −−). Namen werden automatisch zugeordnet,
  mit Vorschau vor dem Speichern.

**Geändert**
- **Stärkere Verschlüsselung:** Neue und neu gespeicherte Dateien nutzen
  600 000 statt 310 000 Runden zur Schlüsselableitung. Ältere Dateien lassen
  sich weiter öffnen.
- Die **OneDrive-Anmeldung** gilt nur noch bis zum Schließen des Tabs.
- Im Bearbeitungsmodus werden Sitzordnungen über ein **Dropdown** gewählt;
  dort lässt sich auch direkt eine **neue Sitzordnung** anlegen.
- Die **Titelleiste ist ausgeblendet** und erscheint am Rechner, sobald die Maus an
  den oberen Rand kommt, auf Tablet/Handy durch Herunterziehen. Der Menüknopf ☰
  sitzt wieder in der Titelleiste. Der Seitenrand ist halb so breit – mehr Platz
  für Sitzplan und Wochenplan.
- Das Dropdown zeigt auch die Sitzordnungen der **anderen Fächer und Lernfelder
  der Klasse**; eine Auswahl übernimmt sie als Kopie in das aktuelle Fach.
- Je Kurs sind jetzt **beliebig viele Sitzordnungen** möglich (vorher zwei).

## 05.11.2026

**Geändert**
- Automatisches Speichern schreibt jetzt **sofort nach jeder Änderung** in die
  Datei (vorher etwa 3 Sekunden später) – und zusätzlich, sobald die App
  verlassen oder in den Hintergrund geschaltet wird.
- Im **Wochenplan** ist kein Fach mehr aktiv; Menü, Noten und Auswertung
  beziehen sich erst wieder auf eine dort gewählte Stunde.

**Behoben**
- Änderungen, die genau während eines Speichervorgangs entstanden, galten als
  gespeichert, standen aber noch nicht in der Datei.
- Wird beim Anlegen eines neuen Datenbestands der Dateidialog abgebrochen,
  entsteht kein Bestand mehr ohne Datei. So kann man nicht versehentlich an
  einer ungespeicherten Datei arbeiten und später die alte Version öffnen.

## 29.10.2026

**Geändert**
- Sitzplan: Die Bewertungsknöpfe erscheinen erst, wenn ein Schüler angetippt
  wurde. Die Kacheln sind dadurch kompakter, Foto und Name haben mehr Platz.
  Erneut tippen oder <kbd>Esc</kbd> klappt die Knöpfe wieder zu, nach einer
  Bewertung schließen sie von selbst.
- Sitzplan: Der Verlauf eines Schülers öffnet sich über den Knopf
  **Verlauf** unter den Bewertungsknöpfen (vorher: Tipp auf Foto/Name).

## 28.10.2026

**Neu**
- **Passwort ändern** direkt aus dem Menü (unter „Jetzt speichern“).
- Neue Passwörter müssen mehr als 10 Zeichen, einen Großbuchstaben, eine Zahl
  und ein Sonderzeichen enthalten; beim Tippen wird angezeigt, was erfüllt ist.
- Benutzerhandbuch mit allen Funktionen der App.

## 10.10.2026

**Neu**
- Schalter **Unterricht / Bearbeiten** ersetzt den dauerhaften
  Einstellungsmodus.
- Vor- und Nachnamen einer ganzen Klasse auf einmal tauschen.

**Geändert**
- Bewertung **0** liegt als Mitte zwischen + und −.

**Behoben**
- Platzierte Schüler lassen sich im Bearbeitungsmodus wieder verschieben.
- Android: Beim Öffnen einer Datei ist im Auswahldialog nichts mehr
  ausgegraut.

## 08.10.2026

**Neu**
- Datenbestand in **OneDrive** ablegen – derselbe Stand auf jedem Gerät.
- OneDrive-Bestand auf dem Gerät merken und beim Start automatisch öffnen.
- Oberfläche nach dem Vorbild der iPad-App „Meine Klassenmappe“ (Klassen
  links, Bereiche Übersicht/Schüler/Mitarbeit/Noten).

## 07.10.2026

**Neu**
- **Notenverwaltung:** Notenseite je Kurs, Leistungsnachweise,
  Bewertungsschema, Mitarbeit je Doppelstunde, Notenbögen.
- **Android-App** (APK zum Herunterladen).
- App lässt sich im Browser **als App installieren** und läuft offline.
- Automatisches Speichern, Rückfragen im App-Stil, Sitzplan-Werkzeuge
  (Auffüllen, Alphabetisch, Zufällig, Leeren).

**Geändert**
- Neues Design mit **Dunkelmodus**, neuer Navigation und Reitern.

## 03.09.2026

**Neu**
- Stundenplan-Import aus **WebUntis** (ICS-Datei).
- Speichern geschieht von selbst.

**Geändert**
- Keine Anmeldung am Server mehr nötig.

## 31.08.2026

**Geändert**
- Alle Daten liegen in **einer verschlüsselten Datei** auf dem eigenen Gerät
  statt in einer Datenbank auf dem Server.

## 29./30.08.2026

**Neu**
- Zwischen den Unterrichtsstunden blättern.

**Geändert**
- Oberfläche für Smartphones optimiert („Mobile first“).
- Schülerkachel auf Foto, Name und Bewertungsknöpfe reduziert.
