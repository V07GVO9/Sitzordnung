# Wasserprotokoll (Android)

Einfache App: **Trinken** (mit Menge) und **Urinieren** per Knopfdruck protokollieren,
Zeitpunkt wird automatisch erfasst.

- Tabellenansicht in der App (Datum | Uhrzeit | Aktion | Menge), Eintrag lange drücken = löschen
- Tagesstand oben (ml getrunken, Anzahl Toilettengänge)
- **Excel-Export** (.xlsx) mit zwei Blättern: *Protokoll* und *Tagesübersicht*
- Daten bleiben lokal auf dem Handy (SQLite), keine Berechtigungen nötig

## Installation
`Wasserprotokoll.apk` aufs Handy laden und öffnen → „Installation aus unbekannten Quellen“ erlauben.
Android 7.0 oder neuer.

## Selbst bauen
`./build.sh` (Ubuntu, Pakete siehe Kopf der Datei). `wasser.keystore` bitte behalten –
nur mit demselben Schlüssel lassen sich Updates ohne Datenverlust installieren.
