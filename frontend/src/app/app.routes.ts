import { Routes } from '@angular/router';
import { editModeGuard } from './core/mode.service';

// Kein Guard: die Oberflaeche liegt komplett hinter dem Vault. Solange keine
// entschluesselte Datei offen ist, zeigt AppComponent das Schloss statt der
// Routen. Eine serverseitige Anmeldung gibt es nicht mehr.
//
// Aufbau nach dem Vorbild der Klassenmappe: Man wählt links eine Klasse und
// bewegt sich dann in ihren Bereichen Übersicht, Schüler, Mitarbeit und Noten.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Sitzordnung',
    loadComponent: () => import('./pages/home/home').then((m) => m.HomePage),
  },
  {
    path: 'klasse/:classId',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'uebersicht' },
      {
        path: 'uebersicht',
        title: 'Übersicht',
        loadComponent: () =>
          import('./pages/class/class-overview').then((m) => m.ClassOverviewPage),
      },
      {
        path: 'schueler',
        title: 'Schüler',
        loadComponent: () =>
          import('./pages/class/class-students').then((m) => m.ClassStudentsPage),
      },
      {
        path: 'mitarbeit',
        title: 'Mitarbeit',
        loadComponent: () =>
          import('./pages/class/class-participation').then((m) => m.ClassParticipationPage),
      },
      {
        path: 'noten',
        title: 'Noten',
        loadComponent: () => import('./pages/class/class-grades').then((m) => m.ClassGradesPage),
      },
    ],
  },
  {
    path: 'kurs/:courseId',
    title: 'Mitarbeit',
    loadComponent: () => import('./pages/course/course').then((m) => m.CoursePage),
  },
  {
    path: 'kurs/:courseId/noten',
    title: 'Noten',
    loadComponent: () => import('./pages/grades/grades').then((m) => m.GradesPage),
  },
  {
    path: 'stundenplan',
    canActivate: [editModeGuard],
    title: 'Stundenplan',
    loadComponent: () => import('./pages/timetable/timetable').then((m) => m.TimetablePage),
  },
  {
    path: 'verwaltung',
    canActivate: [editModeGuard],
    title: 'Klassen & Schüler',
    loadComponent: () => import('./pages/data/data').then((m) => m.DataPage),
  },
  {
    path: 'stundenplan/import',
    canActivate: [editModeGuard],
    title: 'Stundenplan importieren',
    loadComponent: () =>
      import('./pages/timetable-import/timetable-import').then((m) => m.TimetableImportPage),
  },
  {
    path: 'auswertung',
    title: 'Auswertung',
    loadComponent: () => import('./pages/evaluation/evaluation').then((m) => m.EvaluationPage),
  },
  // Frühere Adressen führen weiterhin irgendwohin Sinnvolles.
  { path: 'unterricht', redirectTo: '' },
  { path: '**', redirectTo: '' },
];
