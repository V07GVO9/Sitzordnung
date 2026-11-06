# Demo-Daten

Erfundene Daten zum Ausprobieren der App. Alle Namen sind frei erfunden.

| Datei | Inhalt |
| --- | --- |
| `demo-stundenplan.ics` | Wochenplan im WebUntis-Format: 3 Klassen, 7 Fächer, 16 Doppelstunden (Mo–Fr) |
| `schueler-BFI10A.txt` | 18 Schüler der BFI10A |
| `schueler-KDM11.txt` | 16 Schüler der KDM11 |
| `schueler-KDM12.txt` | 15 Schüler der KDM12 |
| `demo.sitzordnung` | **Fertiger Datenbestand** mit allem oben plus Sitzordnungen, Mitarbeitsbewertungen, Leistungsnachweisen und Protokoll |
| `demo-datenbestand-erzeugen.mjs` | Skript, das `demo.sitzordnung` neu erzeugt |

## Schnellstart: fertigen Datenbestand öffnen

*Datei öffnen* → Passwort **`Demo-Passwort-2026!`** → `demo.sitzordnung` wählen.

Enthalten (Stand 06.11.2026):

- 3 Klassen, 49 Schüler, 12 Kurse mit Stundenplan
- je Kurs eine Sitzordnung, BFI10A Informatik zusätzlich „Gruppenarbeit"
- rund 780 Mitarbeitsbewertungen vom 14.09. bis 05.11.2026 (ohne Herbstferien), teils mit Kommentar
- 12 Leistungsnachweise (Klassenarbeiten, Tests, Referate, Handlungsprodukte) –
  zwei davon noch **nicht freigegeben**, einzelne Ergebnisse *entschuldigt* oder *verweigert*
- Zeitraum „1. Halbjahr 2026/27", eigener Notenschlüssel in Wirtschaft KDM11,
  Projektmanagement KDM12 mit 40 % schriftlich
- einige von Hand gesetzte Mitarbeitsnoten („fehlte") samt Protokolleinträgen

Gut zum Ausprobieren: *Auswertung* (Mitarbeitsnoten/Einzelbewertungen als CSV),
*Kurs → Noten* (Übersicht, Notenbögen, Protokoll, Notenübersicht als CSV).

Neu erzeugen: `node demo-daten/demo-datenbestand-erzeugen.mjs`

## Alternativ: Schritt für Schritt importieren

1. **Stundenplan zuerst:** *Stundenplan → Aus WebUntis importieren* →
   `demo-stundenplan.ics` wählen → alle Zeilen übernehmen.
   Dabei legt die App die Klassen, Fächer und Kurse automatisch an.
2. **Dann die Schüler:** *Klassen & Schüler* → Klasse wählen →
   *Namensliste einfügen* → Inhalt der passenden `schueler-….txt` einfügen →
   übernehmen. Für jede der drei Klassen wiederholen.

Die Stunden laufen wöchentlich bis Ende Januar 2027. Zeiten:
1. Block 07:45–09:15 · 2. Block 09:35–11:05 · 3. Block 11:25–12:55 · 4. Block 13:35–15:05
