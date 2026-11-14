import { parseTimetableIcs, zerlegeTitel } from './timetable-import';

/** Baut eine ICS-Datei aus fertigen VEVENT-Blöcken. */
function ics(...events: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join('\r\n');
}

function event(felder: Record<string, string>): string {
  return [
    'BEGIN:VEVENT',
    ...Object.entries(felder).map(([k, v]) => `${k}:${v}`),
    'END:VEVENT',
  ].join('\r\n');
}

describe('parseTimetableIcs', () => {
  it('weist eine Datei zurück, die kein Kalender ist', () => {
    const ergebnis = parseTimetableIcs('Vorname;Nachname\nAnna;Meier', [], []);

    expect(ergebnis.rows).toEqual([]);
    expect(ergebnis.warnings[0]).toContain('ICS');
  });

  it('liest Wochentag und Uhrzeit aus einer Ortszeit', () => {
    // 15.01.2024 war ein Montag.
    const datei = ics(
      event({
        'DTSTART;TZID=Europe/Berlin': '20240115T080000',
        'DTEND;TZID=Europe/Berlin': '20240115T084500',
        SUMMARY: 'Mathematik 10a',
        LOCATION: 'A101',
      }),
    );

    const { rows } = parseTimetableIcs(datei, ['10a'], ['Mathematik']);

    expect(rows.length).toBe(1);
    expect(rows[0].dayOfWeek).toBe(1);
    expect(rows[0].startTime).toBe('08:00');
    expect(rows[0].endTime).toBe('08:45');
    expect(rows[0].room).toBe('A101');
  });

  it('rechnet UTC-Zeiten in die Schulzeitzone um', () => {
    // Im Januar ist Berlin UTC+1: 07:00Z sind 08:00 Ortszeit.
    const datei = ics(
      event({
        DTSTART: '20240115T070000Z',
        DTEND: '20240115T074500Z',
        SUMMARY: 'Deutsch 10a',
      }),
    );

    const { rows } = parseTimetableIcs(datei, [], []);

    expect(rows[0].startTime).toBe('08:00');
    expect(rows[0].endTime).toBe('08:45');
  });

  it('beachtet die Sommerzeit', () => {
    // Im Juni ist Berlin UTC+2: 06:00Z sind 08:00 Ortszeit.
    const datei = ics(
      event({
        DTSTART: '20240617T060000Z',
        DTEND: '20240617T064500Z',
        SUMMARY: 'Deutsch 10a',
      }),
    );

    const { rows } = parseTimetableIcs(datei, [], []);

    expect(rows[0].startTime).toBe('08:00');
  });

  it('zaehlt gleiche Termine zu einem Muster zusammen', () => {
    const einzeln = {
      'DTSTART;TZID=Europe/Berlin': '20240115T080000',
      'DTEND;TZID=Europe/Berlin': '20240115T084500',
      SUMMARY: 'Mathematik 10a',
    };
    // Dieselbe Stunde in drei aufeinanderfolgenden Wochen.
    const datei = ics(
      event(einzeln),
      event({
        'DTSTART;TZID=Europe/Berlin': '20240122T080000',
        'DTEND;TZID=Europe/Berlin': '20240122T084500',
        SUMMARY: 'Mathematik 10a',
      }),
      event({
        'DTSTART;TZID=Europe/Berlin': '20240129T080000',
        'DTEND;TZID=Europe/Berlin': '20240129T084500',
        SUMMARY: 'Mathematik 10a',
      }),
    );

    const { rows } = parseTimetableIcs(datei, [], []);

    expect(rows.length).toBe(1);
    expect(rows[0].occurrences).toBe(3);
    expect(rows[0].looksRegular).toBeTrue();
  });

  it('nimmt COUNT aus einer Wiederholungsregel als Anzahl', () => {
    const datei = ics(
      event({
        'DTSTART;TZID=Europe/Berlin': '20240115T080000',
        'DTEND;TZID=Europe/Berlin': '20240115T084500',
        RRULE: 'FREQ=WEEKLY;COUNT=18',
        SUMMARY: 'Mathematik 10a',
      }),
    );

    const { rows } = parseTimetableIcs(datei, [], []);

    expect(rows[0].occurrences).toBe(18);
    expect(rows[0].looksRegular).toBeTrue();
  });

  it('markiert einmalige Termine als vermutliche Vertretung', () => {
    const datei = ics(
      event({
        'DTSTART;TZID=Europe/Berlin': '20240115T080000',
        'DTEND;TZID=Europe/Berlin': '20240115T084500',
        SUMMARY: 'Vertretung 10a',
      }),
    );

    const { rows, warnings } = parseTimetableIcs(datei, [], []);

    expect(rows[0].looksRegular).toBeFalse();
    expect(warnings.some((w) => w.includes('nur einmal'))).toBeTrue();
  });

  it('ueberspringt ganztaegige Termine und solche ohne Ende', () => {
    const datei = ics(
      event({ 'DTSTART;VALUE=DATE': '20240115', 'DTEND;VALUE=DATE': '20240116', SUMMARY: 'Ferien' }),
      event({ 'DTSTART;TZID=Europe/Berlin': '20240115T080000', SUMMARY: 'Ohne Ende' }),
    );

    const { rows, warnings } = parseTimetableIcs(datei, [], []);

    expect(rows).toEqual([]);
    expect(warnings.some((w) => w.includes('übersprungen'))).toBeTrue();
  });

  it('ueberspringt Termine, deren Ende nicht nach dem Beginn liegt', () => {
    const datei = ics(
      event({
        'DTSTART;TZID=Europe/Berlin': '20240115T084500',
        'DTEND;TZID=Europe/Berlin': '20240115T080000',
        SUMMARY: 'Verdreht',
      }),
    );

    expect(parseTimetableIcs(datei, [], []).rows).toEqual([]);
  });

  it('setzt gefaltete Zeilen wieder zusammen', () => {
    const datei = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'DTSTART;TZID=Europe/Berlin:20240115T080000',
      'DTEND;TZID=Europe/Berlin:20240115T084500',
      'SUMMARY:Mathe',
      ' matik 10a',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const { rows } = parseTimetableIcs(datei, [], ['Mathematik']);

    expect(rows[0].sourceTitle).toBe('Mathematik 10a');
    expect(rows[0].subjectName).toBe('Mathematik');
  });

  it('loest die Maskierung von Komma und Semikolon auf', () => {
    const datei = ics(
      event({
        'DTSTART;TZID=Europe/Berlin': '20240115T080000',
        'DTEND;TZID=Europe/Berlin': '20240115T084500',
        SUMMARY: 'Mathematik\\, 10a',
      }),
    );

    expect(parseTimetableIcs(datei, [], []).rows[0].sourceTitle).toBe('Mathematik, 10a');
  });

  it('sortiert nach Wochentag und Uhrzeit', () => {
    const datei = ics(
      event({
        'DTSTART;TZID=Europe/Berlin': '20240117T100000',
        'DTEND;TZID=Europe/Berlin': '20240117T104500',
        SUMMARY: 'Mittwoch spaet',
      }),
      event({
        'DTSTART;TZID=Europe/Berlin': '20240115T080000',
        'DTEND;TZID=Europe/Berlin': '20240115T084500',
        SUMMARY: 'Montag frueh',
      }),
    );

    const { rows } = parseTimetableIcs(datei, [], []);

    expect(rows[0].dayOfWeek).toBe(1);
    expect(rows[1].dayOfWeek).toBe(3);
  });

  it('warnt, wenn Klasse oder Fach nicht erkennbar war', () => {
    const datei = ics(
      event({
        'DTSTART;TZID=Europe/Berlin': '20240115T080000',
        'DTEND;TZID=Europe/Berlin': '20240115T084500',
        SUMMARY: '???',
      }),
    );

    const { warnings } = parseTimetableIcs(datei, [], []);

    expect(warnings.some((w) => w.includes('nicht sicher erkennbar'))).toBeTrue();
  });
});

describe('zerlegeTitel', () => {
  it('erkennt Klasse und Fach am bereits Angelegten', () => {
    expect(zerlegeTitel('MA - 10a - A101', ['10a'], ['MA'])).toEqual({
      schoolClassName: '10a',
      subjectName: 'MA',
    });
  });

  it('haelt einen Teil mit Ziffer fuer die Klasse', () => {
    expect(zerlegeTitel('Deutsch KDM23', [], [])).toEqual({
      schoolClassName: 'KDM23',
      subjectName: 'Deutsch',
    });
  });

  it('kommt mit dem Schraegstrich als Trenner zurecht', () => {
    expect(zerlegeTitel('10a/D', [], ['D'])).toEqual({
      schoolClassName: '10a',
      subjectName: 'D',
    });
  });

  it('vergleicht ohne Ruecksicht auf Gross- und Kleinschreibung', () => {
    expect(zerlegeTitel('mathe 10A', ['10a'], ['Mathe'])).toEqual({
      schoolClassName: '10A',
      subjectName: 'mathe',
    });
  });

  it('laesst leer, was sich nicht zuordnen laesst', () => {
    expect(zerlegeTitel('', [], [])).toEqual({ schoolClassName: '', subjectName: '' });
  });
});
