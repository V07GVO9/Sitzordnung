import { Course, SchoolClass, Student } from '../../core/models';
import { setupSteps } from './setup';

const klasse = { id: 1, name: 'BFI10A', studentCount: 0 } as SchoolClass;
const kurs = {
  id: 5,
  schoolClassId: 1,
  schoolClassName: 'BFI10A',
  subjectName: 'Informatik',
  subjectShortName: 'INF',
  seatingPlanCount: 0,
} as Course;
const anna = { id: 9, schoolClassId: 1, hasPhoto: false } as Student;

describe('setupSteps', () => {
  it('leerer Bestand: nichts erledigt', () => {
    const steps = setupSteps({ classes: [], courses: [], timetable: [], students: new Map() });
    expect(steps.map((s) => s.done)).toEqual([false, false, false, false, false]);
    expect(steps[0].status).toBe('Noch keine Klasse angelegt.');
  });

  it('nennt Klassen ohne Schüler und Kurse ohne Sitzordnung', () => {
    const steps = setupSteps({
      classes: [klasse],
      courses: [kurs],
      timetable: [],
      students: new Map([[1, []]]),
    });
    expect(steps[0].done).toBeTrue();
    expect(steps[1].status).toBe('Ohne Schüler: BFI10A.');
    expect(steps[3].status).toBe('Noch ohne Sitzordnung: INF BFI10A.');
  });

  it('alles eingerichtet - Fotos bleiben optional', () => {
    const steps = setupSteps({
      classes: [klasse],
      courses: [{ ...kurs, seatingPlanCount: 1 }],
      timetable: [{ id: 1 } as never],
      students: new Map([[1, [anna]]]),
    });
    expect(steps.filter((s) => !s.optional).every((s) => s.done)).toBeTrue();
    expect(steps[4]).toEqual(
      jasmine.objectContaining({
        optional: true,
        done: false,
        status: '0 von 1 Schülern mit Foto.',
      }),
    );
  });
});
