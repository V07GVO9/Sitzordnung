/**
 * Liest einen Stundenplan aus einer ICS-Datei, wie WebUntis und andere
 * Schulsysteme sie exportieren, und macht daraus Wochenmuster.
 *
 * Ein solcher Export enthält einzelne Termine für jede Woche des Schuljahres.
 * Für den Stundenplan interessiert nur das Muster dahinter: welcher Unterricht
 * an welchem Wochentag von wann bis wann stattfindet.
 *
 * Portiert aus dem früheren TimetableImportService des .NET-Backends. Statt
 * einer Kalenderbibliothek steht hier ein kleiner Parser, der genau die
 * Felder liest, die ein Stundenplanexport benutzt.
 */

import { DayOfWeek, TimetableImportPreview, TimetableImportRow } from '../models';

/** Ein Muster, das seltener vorkommt, ist vermutlich eine Vertretung. */
const MINDESTENS_SO_OFT_FUER_REGELUNTERRICHT = 2;

/** Ohne Enddatum in der Wiederholungsregel wird ein Schulhalbjahr angenommen. */
const WOCHEN_OHNE_ENDE = 20;

const ZEITZONE = 'Europe/Berlin';

interface Termin {
  start: Date;
  ende: Date;
  /** Zeiten ohne Zonenangabe gelten laut Norm als Ortszeit und werden nicht umgerechnet. */
  istOrtszeit: boolean;
  titel: string;
  raum: string | null;
  wiederholungen: number;
}

/**
 * Hebt die Faltung auf, mit der ICS lange Zeilen umbricht: eine Folgezeile
 * beginnt mit einem Leerzeichen oder Tabulator und gehört an die vorige.
 */
function entfalte(text: string): string[] {
  const zeilen = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const ergebnis: string[] = [];

  for (const zeile of zeilen) {
    if ((zeile.startsWith(' ') || zeile.startsWith('\t')) && ergebnis.length > 0) {
      ergebnis[ergebnis.length - 1] += zeile.slice(1);
    } else {
      ergebnis.push(zeile);
    }
  }

  return ergebnis;
}

/** Trennt "DTSTART;TZID=Europe/Berlin:20240115T080000" in Name, Parameter und Wert. */
function zerlegeZeile(zeile: string): { name: string; parameter: string; wert: string } | null {
  const doppelpunkt = zeile.indexOf(':');
  if (doppelpunkt < 0) {
    return null;
  }

  const links = zeile.slice(0, doppelpunkt);
  const wert = zeile.slice(doppelpunkt + 1);
  const semikolon = links.indexOf(';');

  return semikolon < 0
    ? { name: links.toUpperCase(), parameter: '', wert }
    : {
        name: links.slice(0, semikolon).toUpperCase(),
        parameter: links.slice(semikolon + 1).toUpperCase(),
        wert,
      };
}

/**
 * Liest einen ICS-Zeitstempel. "…Z" ist UTC, alles andere wird als die Zeit
 * genommen, die dort steht - bei TZID hat sie ohnehin schon die richtige
 * Ortszeit, und ohne Angabe schreibt die Norm Ortszeit vor.
 */
function leseZeit(wert: string): { zeit: Date; istOrtszeit: boolean } | null {
  const treffer = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(wert.trim());
  if (!treffer) {
    return null;
  }

  const [, jahr, monat, tag, stunde, minute, sekunde, zulu] = treffer;
  const teile = [jahr, monat, tag, stunde, minute, sekunde].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  if (zulu === 'Z') {
    return {
      zeit: new Date(Date.UTC(teile[0], teile[1] - 1, teile[2], teile[3], teile[4], teile[5])),
      istOrtszeit: false,
    };
  }

  return {
    zeit: new Date(teile[0], teile[1] - 1, teile[2], teile[3], teile[4], teile[5]),
    istOrtszeit: true,
  };
}

/**
 * Rechnet einen UTC-Zeitpunkt in die Schulzeitzone um. Intl kennt die
 * Sommerzeit, deshalb stimmt die Stunde auch über den Zeitumstellungen.
 */
function nachSchulzeit(zeit: Date): { day: DayOfWeek; stunde: number; minute: number } {
  const formatierer = new Intl.DateTimeFormat('en-US', {
    timeZone: ZEITZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const teile = formatierer.formatToParts(zeit);
  const finde = (typ: string) => teile.find((t) => t.type === typ)?.value ?? '';

  const wochentage: Record<string, DayOfWeek> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // "24" statt "00" kommt bei hour12: false in manchen Umgebungen vor.
  const stunde = Number(finde('hour')) % 24;

  return {
    day: wochentage[finde('weekday')] ?? 0,
    stunde,
    minute: Number(finde('minute')),
  };
}

/** Ortszeiten stehen schon richtig da und werden nur ausgelesen. */
function alsOrtszeit(zeit: Date): { day: DayOfWeek; stunde: number; minute: number } {
  return {
    day: zeit.getDay() as DayOfWeek,
    stunde: zeit.getHours(),
    minute: zeit.getMinutes(),
  };
}

function alsUhrzeit(stunde: number, minute: number): string {
  return `${String(stunde).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Wie oft wiederholt sich eine Wochenregel? COUNT sagt es direkt, UNTIL
 * lässt sich ausrechnen, sonst wird ein Schulhalbjahr angenommen.
 */
function zaehleWochen(rrule: string, start: Date): number {
  const count = /(?:^|;)COUNT=(\d+)/.exec(rrule);
  if (count) {
    return Math.max(1, Number(count[1]));
  }

  const until = /(?:^|;)UNTIL=([0-9TZ]+)/.exec(rrule);
  if (until) {
    const ende = leseZeit(until[1]);
    if (ende) {
      const wochen = (ende.zeit.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000);
      return Math.max(1, Math.round(wochen));
    }
  }

  return WOCHEN_OHNE_ENDE;
}

/** Liest die VEVENT-Blöcke aus einer ICS-Datei. */
function leseTermine(ics: string): { termine: Termin[]; uebersprungen: number } {
  const termine: Termin[] = [];
  let uebersprungen = 0;

  let offen = false;
  let start: { zeit: Date; istOrtszeit: boolean } | null = null;
  let ende: { zeit: Date; istOrtszeit: boolean } | null = null;
  let titel = '';
  let raum = '';
  let rrule = '';
  let ganztaegig = false;

  for (const zeile of entfalte(ics)) {
    const getrimmt = zeile.trim();

    if (getrimmt.toUpperCase() === 'BEGIN:VEVENT') {
      offen = true;
      start = ende = null;
      titel = raum = rrule = '';
      ganztaegig = false;
      continue;
    }

    if (getrimmt.toUpperCase() === 'END:VEVENT') {
      if (offen) {
        if (!start || !ende || ganztaegig || ende.zeit <= start.zeit) {
          uebersprungen++;
        } else {
          termine.push({
            start: start.zeit,
            ende: ende.zeit,
            istOrtszeit: start.istOrtszeit,
            titel: titel.trim(),
            raum: raum.trim() === '' ? null : raum.trim(),
            wiederholungen: rrule === '' ? 1 : zaehleWochen(rrule, start.zeit),
          });
        }
      }
      offen = false;
      continue;
    }

    if (!offen) {
      continue;
    }

    const feld = zerlegeZeile(zeile);
    if (!feld) {
      continue;
    }

    // Ein ganztägiger Termin hat keine Uhrzeit und taugt nicht als Unterrichtsstunde.
    if (feld.parameter.includes('VALUE=DATE')) {
      ganztaegig = true;
    }

    switch (feld.name) {
      case 'DTSTART':
        start = leseZeit(feld.wert);
        break;
      case 'DTEND':
        ende = leseZeit(feld.wert);
        break;
      case 'SUMMARY':
        titel = entwerte(feld.wert);
        break;
      case 'LOCATION':
        raum = entwerte(feld.wert);
        break;
      case 'RRULE':
        rrule = feld.wert.toUpperCase();
        break;
      default:
        break;
    }
  }

  return { termine, uebersprungen };
}

/** ICS maskiert Komma, Semikolon und Zeilenumbruch mit einem Backslash. */
function entwerte(wert: string): string {
  return wert
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Zerlegt einen Termintitel in Klasse und Fach. Die Formate unterscheiden
 * sich je nach Schule ("MA - 10a - A101", "Deutsch KDM23", "10a/D"), deshalb
 * hilft vor allem der Abgleich mit dem, was schon in der App angelegt ist.
 * Bleibt etwas unklar, wird es leer gelassen und in der Vorschau ergänzt.
 */
export function zerlegeTitel(
  titel: string,
  bekannteKlassen: readonly string[],
  bekannteFaecher: readonly string[],
): { schoolClassName: string; subjectName: string } {
  if (titel.trim() === '') {
    return { schoolClassName: '', subjectName: '' };
  }

  const teile = titel
    .split(/[-/|,;\t]/)
    .flatMap((t) => t.split(' '))
    .map((t) => t.trim())
    .filter((t) => t !== '');

  const passt = (kandidaten: readonly string[], wert: string) =>
    kandidaten.some((k) => k.toLowerCase() === wert.toLowerCase());

  let klasse = teile.find((t) => passt(bekannteKlassen, t));
  let fach = teile.find((t) => passt(bekannteFaecher, t));

  const uebrig = teile.filter(
    (t) => t.toLowerCase() !== klasse?.toLowerCase() && t.toLowerCase() !== fach?.toLowerCase(),
  );

  // Klassenbezeichnungen enthalten fast immer eine Ziffer ("10a", "KDM23"),
  // Fachbezeichnungen so gut wie nie.
  if (!klasse) {
    klasse = uebrig.find((t) => /\d/.test(t));
    if (klasse) {
      uebrig.splice(uebrig.indexOf(klasse), 1);
    }
  }

  fach ??= uebrig.find((t) => /[a-zäöüß]/i.test(t) && !/\d/.test(t));

  return { schoolClassName: klasse ?? '', subjectName: fach ?? '' };
}

/**
 * Liest den Export und macht daraus Vorschauzeilen - ohne etwas zu speichern.
 * Die bereits angelegten Klassen und Fächer helfen beim Erkennen der Titel.
 */
export function parseTimetableIcs(
  ics: string,
  bekannteKlassen: readonly string[],
  bekannteFaecher: readonly string[],
): TimetableImportPreview {
  const warnings: string[] = [];

  if (!ics.toUpperCase().includes('BEGIN:VCALENDAR')) {
    return {
      rows: [],
      warnings: [
        'Das sieht nicht nach einer Kalenderdatei aus. Erwartet wird eine Datei im Format ICS.',
      ],
    };
  }

  const { termine, uebersprungen } = leseTermine(ics);

  if (uebersprungen === 1) {
    warnings.push('Ein Termin ohne verwertbare Uhrzeit wurde übersprungen.');
  } else if (uebersprungen > 1) {
    warnings.push(`${uebersprungen} Termine ohne verwertbare Uhrzeit wurden übersprungen.`);
  }

  // Jeder Termin wird auf sein Wochenmuster reduziert und gezählt.
  const zaehler = new Map<string, TimetableImportRow>();

  for (const termin of termine) {
    const von = termin.istOrtszeit ? alsOrtszeit(termin.start) : nachSchulzeit(termin.start);
    const bis = termin.istOrtszeit ? alsOrtszeit(termin.ende) : nachSchulzeit(termin.ende);

    const startTime = alsUhrzeit(von.stunde, von.minute);
    const endTime = alsUhrzeit(bis.stunde, bis.minute);
    const schluessel = `${von.day}|${startTime}|${endTime}|${termin.titel}|${termin.raum ?? ''}`;

    const vorhanden = zaehler.get(schluessel);
    if (vorhanden) {
      vorhanden.occurrences += termin.wiederholungen;
      vorhanden.looksRegular = vorhanden.occurrences >= MINDESTENS_SO_OFT_FUER_REGELUNTERRICHT;
      continue;
    }

    const { schoolClassName, subjectName } = zerlegeTitel(
      termin.titel,
      bekannteKlassen,
      bekannteFaecher,
    );

    zaehler.set(schluessel, {
      dayOfWeek: von.day,
      startTime,
      endTime,
      schoolClassName,
      subjectName,
      room: termin.raum,
      occurrences: termin.wiederholungen,
      looksRegular: termin.wiederholungen >= MINDESTENS_SO_OFT_FUER_REGELUNTERRICHT,
      sourceTitle: termin.titel,
    });
  }

  if (zaehler.size === 0 && uebersprungen === 0) {
    warnings.push('Die Datei enthält keine Termine mit Uhrzeit.');
  }

  const rows = [...zaehler.values()].sort(
    (a, b) =>
      a.dayOfWeek - b.dayOfWeek ||
      a.startTime.localeCompare(b.startTime) ||
      a.schoolClassName.localeCompare(b.schoolClassName),
  );

  const einzelne = rows.filter((r) => !r.looksRegular).length;
  if (einzelne === 1) {
    warnings.push(
      'Ein Eintrag kommt nur einmal vor - vermutlich eine Vertretung oder ein Einzeltermin. ' +
        'Er ist nicht vorausgewählt, lässt sich aber übernehmen.',
    );
  } else if (einzelne > 1) {
    warnings.push(
      `${einzelne} Einträge kommen nur einmal vor - vermutlich Vertretungen oder Einzeltermine. ` +
        'Sie sind nicht vorausgewählt, lassen sich aber übernehmen.',
    );
  }

  const ohneZuordnung = rows.filter(
    (r) => r.schoolClassName.trim() === '' || r.subjectName.trim() === '',
  ).length;
  if (ohneZuordnung === 1) {
    warnings.push(
      'Bei einem Eintrag war aus dem Titel nicht sicher erkennbar, was Klasse und was Fach ist. ' +
        'Bitte in der Vorschau ergänzen.',
    );
  } else if (ohneZuordnung > 1) {
    warnings.push(
      `Bei ${ohneZuordnung} Einträgen war aus dem Titel nicht sicher erkennbar, was Klasse und was Fach ist. ` +
        'Bitte in der Vorschau ergänzen.',
    );
  }

  return { rows, warnings };
}
