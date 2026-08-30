import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'anmeldung',
    title: 'Anmeldung',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: '',
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
        path: 'stundenplan',
        title: 'Stundenplan',
        loadComponent: () => import('./pages/timetable/timetable').then((m) => m.TimetablePage),
      },
      {
        path: 'auswertung',
        title: 'Auswertung',
        loadComponent: () => import('./pages/evaluation/evaluation').then((m) => m.EvaluationPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
