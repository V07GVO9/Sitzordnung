import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'anmelden',
    title: 'Anmelden',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  // Der Stundenplan ist die Startseite - er wird täglich gebraucht.
  {
    path: '',
    canActivate: [authGuard],
    title: 'Stundenplan',
    loadComponent: () => import('./pages/timetable/timetable').then((m) => m.TimetablePage),
  },
  {
    path: 'unterricht',
    canActivate: [authGuard],
    title: 'Unterricht',
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
  },
  {
    path: 'kurs/:courseId',
    canActivate: [authGuard],
    title: 'Sitzordnung',
    loadComponent: () => import('./pages/course/course').then((m) => m.CoursePage),
  },
  {
    path: 'verwaltung',
    canActivate: [authGuard],
    title: 'Klassen & Schüler',
    loadComponent: () => import('./pages/data/data').then((m) => m.DataPage),
  },
  { path: 'stundenplan', redirectTo: '', pathMatch: 'full' },
  {
    path: 'verwaltung/import',
    canActivate: [authGuard],
    title: 'Schüler importieren',
    loadComponent: () =>
      import('./pages/student-import/student-import').then((m) => m.StudentImportPage),
  },
  {
    path: 'stundenplan/import',
    canActivate: [authGuard],
    title: 'Stundenplan importieren',
    loadComponent: () =>
      import('./pages/timetable-import/timetable-import').then((m) => m.TimetableImportPage),
  },
  {
    path: 'auswertung',
    canActivate: [authGuard],
    title: 'Auswertung',
    loadComponent: () => import('./pages/evaluation/evaluation').then((m) => m.EvaluationPage),
  },
  {
    path: 'konto',
    canActivate: [authGuard],
    title: 'Konto',
    loadComponent: () => import('./pages/account/account').then((m) => m.AccountPage),
  },
  { path: '**', redirectTo: '' },
];
