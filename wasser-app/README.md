# Wasserprotokoll (Android)

Einfache App: **Wasser** (Menge wählbar), **Kaffee** und **Softdrink** (je automatisch 300 ml), **Energy Drink** (automatisch 250 ml)
sowie **Urinieren** per Knopfdruck protokollieren, Zeitpunkt wird automatisch erfasst.

- Tabellenansicht in der App (nur der aktuelle Tag) (Datum | Uhrzeit | Aktion | Menge), Eintrag lange drücken = bearbeiten (Datum, Uhrzeit, Aktion, Menge) oder löschen
- Tagesstand oben (ml getrunken, Anzahl Toilettengänge)
- **Excel-Export** (.xlsx) für ein gewähltes Datum (Dropdown) oder alle Tage, mit zwei Blättern: *Protokoll* und *Tagesübersicht* (Gesamt, Wasser, Kaffee, Softdrink, Energy Drink, Urinieren je Tag)
- Daten bleiben lokal auf dem Handy (SQLite), keine Berechtigungen nötig

## Installation
`Wasserprotokoll.apk` aufs Handy laden und öffnen → „Installation aus unbekannten Quellen“ erlauben.
Android 7.0 oder neuer.

## Selbst bauen
`./build.sh` (Ubuntu, Pakete siehe Kopf der Datei). `wasser.keystore` bitte behalten –
nur mit demselben Schlüssel lassen sich Updates ohne Datenverlust installieren.
