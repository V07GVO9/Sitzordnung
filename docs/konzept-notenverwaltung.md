# Konzept: Notenverwaltung (mündlich + schriftlich)

Stand: 05.10.2026 · Status: Entwurf zur Abstimmung

## 1. Ziel

Die App erfasst heute nur Mitarbeitspunkte (`++ + − −−`). Künftig soll sie je
**Kurs** (Klasse + Fach) die vollständige Zeugnisnote nachvollziehbar führen:

- **schriftliche** Leistungen (Klassenarbeit, Test, Klausur)
- **mündliche/sonstige** Leistungen (Mitarbeit, Referat, Präsentation, Projekt, Handlungsprodukt einer Lernsituation)
- ein **Bewertungsschema** je Kurs, das festlegt, wie daraus die Note entsteht
- jederzeit ein **Notenstand je Schüler**, den die Lehrkraft dem Schüler zeigen kann

Leitfrage: *Wer hat wann wofür welche Note bekommen – und wie ergibt sich daraus der aktuelle Stand?*

## 2. Grundbegriffe

| Begriff | Bedeutung | Beispiel |
| --- | --- | --- |
| **Zeitraum** | Abschnitt, für den eine Note gebildet wird | 1. Halbjahr 2026/27 |
| **Bewertungsschema** | Gewichtung + Notenschlüssel eines Kurses | schriftlich 50 %, mündlich 50 % |
| **Bereich** | Oberkategorie im Schema | schriftlich / mündlich-sonstig |
| **Leistungsnachweis** | ein bewertetes Ereignis mit Datum | „Klassenarbeit LF3 – Netzwerke", 14.11.2026 |
| **Einzelnote** | Ergebnis eines Schülers in einem Leistungsnachweis | 2,3 (bzw. 78 von 100 Punkten) |
| **Notenstand** | berechneter Zwischenstand je Schüler zu einem Stichtag | „Stand 01.12.: 2,6 → Tendenz 3+" |

## 3. Bewertungsschema

Je Kurs und Zeitraum genau ein Schema, angelegt aus einer Vorlage.

**Aufbau:**

```
Schema „KDM 11 – LF5 – 1. HJ"
├─ Bereich schriftlich            Gewicht 50 %
│   ├─ Klassenarbeit              Gewicht 2
│   └─ Test                       Gewicht 1
└─ Bereich mündlich/sonstig       Gewicht 50 %
    ├─ Mitarbeit (aus Punkten)    Gewicht 2
    ├─ Präsentation / Referat     Gewicht 1
    └─ Handlungsprodukt LS        Gewicht 1
```

**Festlegungen im Schema:**

1. **Gewichtung der Bereiche** in Prozent (Summe 100 %).
2. **Gewicht je Nachweisart** innerhalb des Bereichs (relativ, z. B. 2 : 1).
3. **Punkteschlüssel** für Nachweise, die in Punkten bewertet werden (Prozent → Note).
   Vorlage: IHK-Schlüssel
   | Prozent | Note |
   | --- | --- |
   | 92–100 | 1 |
   | 81–91 | 2 |
   | 67–80 | 3 |
   | 50–66 | 4 |
   | 30–49 | 5 |
   | 0–29 | 6 |
4. **Mitarbeit**: Der bestehende Punkte-Notenschlüssel der App bleibt. Er
   liefert je Zeitraum *eine* Mitarbeitsnote, die als Einzelnote in den Bereich
   „mündlich" eingeht. Die Lehrkraft kann sie bestätigen oder begründet überschreiben.
5. **Rundung**: Notenstand auf zwei Nachkommastellen; Zeugnisvorschlag
   kaufmännisch gerundet (x,50 → schlechter/besser einstellbar). Die Endnote
   setzt immer die Lehrkraft (pädagogischer Ermessensspielraum).
6. **Fehlende Leistung**: „nicht teilgenommen (entschuldigt)" zählt nicht,
   „verweigert/Täuschung" = 6 – je Eintrag wählbar, nie automatisch.

> **Bitte prüfen:** Gewichtung schriftlich : mündlich, Schlüssel und Rundung
> regeln Schulgesetz, Verordnung und Beschlüsse der Fach-/Bildungsgangkonferenz.
> Die Werte oben sind nur Vorlagen. Ich kenne die konkreten Vorgaben Ihres
> Bundeslandes und Bildungsgangs nicht verbindlich.

## 4. Erfassung im Alltag

### 4.1 Schriftlicher Leistungsnachweis

1. Kurs → *Noten* → **Neuer Leistungsnachweis**
2. Angaben: Titel, Art, Datum, Bereich, max. Punktzahl (optional), Lernfeld/LS
3. Eingabetabelle mit allen Schülern: Punkte **oder** Note direkt
4. App rechnet Punkte → Prozent → Note, zeigt Notenspiegel und Durchschnitt
5. **Freigeben** – erst danach zählt der Nachweis im Notenstand und wird sichtbar

### 4.2 Mündliche Leistung

- **Mitarbeit:** wie bisher im Unterricht über die Sitzordnung. Am Ende eines
  Zeitraums (oder jederzeit als Zwischenstand) wird daraus die Mitarbeitsnote.
- **Einzelleistung** (Referat, Präsentation): als Leistungsnachweis für *einen
  oder wenige* Schüler, optional mit Kurzbewertungsbogen (Kriterien + Punkte).

### 4.3 Nachvollziehbarkeit

Jede Einzelnote speichert: Wert, Datum der Leistung, Datum der Eingabe,
Kommentar. **Änderungen** nach der Freigabe werden protokolliert (alter Wert,
neuer Wert, Zeitpunkt, Begründung) – nicht stillschweigend überschrieben.

## 5. Notenstand und Veröffentlichung

### 5.1 Ansicht für die Lehrkraft

Notenübersicht je Kurs: Zeilen = Schüler, Spalten = Leistungsnachweise,
rechts Bereichsnoten, Gesamtstand, Tendenz. Filter nach Zeitraum.

### 5.2 Veröffentlichung für Schüler

Die App hat bewusst **keinen Server**. Deshalb ist „Veröffentlichen" ein
**Export pro Schüler**, kein Online-Zugang.

**Empfohlen: individueller Notenbogen**

- Je Schüler ein Blatt (PDF bzw. druckbares HTML):
  Kopf mit Name, Kurs, Zeitraum, **Stand-Datum** · Tabelle aller freigegebenen
  Einzelnoten mit Datum und Gewicht · Bereichsnoten · aktueller Stand ·
  Hinweis „Zwischenstand, keine Zeugnisnote"
- Erzeugung für die ganze Klasse auf Knopfdruck (eine Datei je Schüler oder ein
  Sammel-PDF zum Austeilen)
- Verteilung über das schulische Lernmanagementsystem (z. B. Moodle, Teams) als
  **individuelle** Rückmeldung oder ausgedruckt im Gespräch

**Nie:** eine Klassenliste mit allen Noten aushängen oder hochladen (DSGVO).

**Jede Veröffentlichung wird vermerkt** (wann, welcher Stand, an wen). So ist
später belegbar, dass der Schüler z. B. am 01.12. „auf 4" stand.

**Optional, Ausbaustufe:** Selbstauskunft per Schülerdatei – je Schüler eine
kleine, mit einem persönlichen Code verschlüsselte HTML-Datei, die nur seinen
Notenstand zeigt. Technisch mit der vorhandenen Verschlüsselung machbar, aber
mehr Aufwand bei der Code-Verteilung.

## 6. Datenmodell (Erweiterung von `database.ts`)

```ts
interface GradingPeriodRecord {           // Zeitraum
  id: number; name: string; start: string; end: string;   // YYYY-MM-DD
}

interface GradingSchemeRecord {           // Bewertungsschema je Kurs + Zeitraum
  id: number; courseId: number; periodId: number;
  areas: { key: 'written' | 'oral'; label: string; weightPercent: number }[];
  assessmentTypes: { key: string; label: string; area: 'written' | 'oral'; weight: number }[];
  percentScale: { minPercent: number; grade: number }[];
  roundingMode: 'halfUp' | 'halfDown';
}

interface AssessmentRecord {              // Leistungsnachweis
  id: number; courseId: number; periodId: number;
  typeKey: string; title: string; date: string;
  maxPoints: number | null;
  releasedAt: string | null;              // null = Entwurf, zählt noch nicht
  note: string | null;                    // z. B. Lernfeld / Lernsituation
}

interface AssessmentResultRecord {        // Einzelnote
  id: number; assessmentId: number; studentId: number;
  points: number | null; grade: number | null;            // grade z. B. 2.3
  status: 'graded' | 'excused' | 'missing' | 'refused';
  comment: string | null; createdAt: string;
}

interface GradeChangeRecord {             // Änderungsprotokoll
  id: number; resultId: number; oldGrade: number | null; newGrade: number | null;
  reason: string; changedAt: string;
}

interface GradeReportRecord {             // Veröffentlichungsvermerk
  id: number; courseId: number; studentId: number; periodId: number;
  issuedAt: string; snapshot: { overall: number | null; written: number | null; oral: number | null };
}
```

Bestehende `ratings` und `gradeScales` bleiben unverändert; die Mitarbeitsnote
wird aus ihnen berechnet und als `AssessmentResultRecord` des Typs „Mitarbeit"
festgeschrieben. Der Dateiformat-Wechsel braucht eine Migration (leere Listen
ergänzen), alte Dateien bleiben lesbar.

## 7. Berechnung

```
Einzelnote      = aus Note oder Punkte → Prozent → percentScale
Bereichsnote    = Σ(Einzelnote × Typgewicht) / Σ(Typgewicht)   nur freigegeben, Status „graded"/„refused"
Gesamtstand     = Σ(Bereichsnote × Bereichsgewicht)            fehlt ein Bereich → nur vorhandene, Hinweis anzeigen
Zeugnisvorschlag= Rundung nach roundingMode; Endnote setzt die Lehrkraft
```

Die Logik kommt als reine Funktionen nach `core/store/assessment.logic.ts` –
testbar wie `grading.logic.ts`.

## 8. Oberfläche

| Ort | Neu |
| --- | --- |
| Kurs → Reiter **Noten** | Notenübersicht, „Neuer Leistungsnachweis", Notenbögen erzeugen |
| Leistungsnachweis | Eingabetabelle, Notenspiegel, Freigeben |
| Schüler (Klick auf Zeile) | alle Einzelnoten, Verlauf, Änderungsprotokoll, Veröffentlichungen |
| Auswertung → **Bewertungsschemata** | Vorlagen, Zeiträume, Zuordnung zu Kursen |

## 9. Umsetzung in Stufen

1. **Datenmodell + Berechnung + Tests** (Zeiträume, Schema, Nachweise, Einzelnoten)
2. **Erfassung** – Reiter „Noten", Eingabetabelle, Freigabe, Änderungsprotokoll
3. **Mitarbeit einbinden** – Mitarbeitsnote je Zeitraum übernehmen/überschreiben
4. **Notenbogen** – Export je Schüler (Druck/PDF), Veröffentlichungsvermerk
5. *optional:* verschlüsselte Selbstauskunft je Schüler, CSV-Export für die Zeugnissoftware

## 10. Offene Fragen an die Lehrkraft

1. Gewichtung schriftlich : mündlich je Schulform (BFI 10 / KDM 11–13) – gibt es Konferenzbeschlüsse?
2. Notenformat: Dezimalnoten (2,3), Tendenzen (2−) oder ganze Noten?
3. Zeiträume: Halbjahre, Quartale oder Blockunterricht?
4. Lernfeldnote: Wird bei KDM je Lernfeld eine eigene Note gebildet?
5. Verteilweg der Notenbögen: Moodle/Teams, Ausdruck, beides?
