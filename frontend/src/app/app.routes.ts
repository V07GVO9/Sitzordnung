import { Routes } from '@angular/router';

// Kein Guard: die Oberflaeche liegt komplett hinter dem Vault. Solange keine
// entschluesselte Datei offen ist, zeigt AppComponent das Schloss statt der
// Routen. Eine serverseitige Anmeldung gibt es nicht mehr.
export const routes: Routes = [
  // Der Stundenplan ist die Startseite - er wird täglich gebraucht.
  {
    path: '',
    title: 'Stundenplan',
    loadComponent: () => import('./pages/timetable/timetable').then((m) => m.TimetablePage),
  },
  {
    path: 'unterricht',
    title: 'Unterricht',
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
  },
  {
    path: 'kurs/:courseId',
    title: 'Sitzordnung',
    loadComponent: () => import('./pages/course/course').then((m) => m.CoursePage),
  },
  {
    path: 'verwaltung',
    title: 'Klassen & Schüler',
    loadComponent: () => import('./pages/data/data').then((m) => m.DataPage),
  },
  {
    path: 'stundenplan/import',
    title: 'Stundenplan importieren',
    loadComponent: () =>
      import('./pages/timetable-import/timetable-import').then((m) => m.TimetableImportPage),
  },
  { path: 'stundenplan', redirectTo: '', pathMatch: 'full' },
  {
    path: 'auswertung',
    title: 'Auswertung',
    loadComponent: () => import('./pages/evaluation/evaluation').then((m) => m.EvaluationPage),
  },
  { path: '**', redirectTo: '' },
];
