import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { formationGuard } from './core/guards/formation.guard';
import { footageGuard } from './core/guards/footage.guard';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/home/home-page.component').then((m) => m.HomePageComponent),
      },
      {
        path: 'sheet',
        loadComponent: () =>
          import('./features/sheet/sheet.component').then((m) => m.SheetComponent),
      },
      {
        path: 'formation',
        canActivate: [formationGuard],
        loadComponent: () =>
          import('./features/formation/formation-page.component').then((m) => m.FormationPageComponent),
      },
      {
        path: 'schedule',
        loadComponent: () =>
          import('./features/schedule/schedule-page.component').then((m) => m.SchedulePageComponent),
      },
      {
        path: 'match-history',
        loadComponent: () =>
          import('./features/match-history/match-history-page.component').then((m) => m.MatchHistoryPageComponent),
      },
      {
        path: 'footages',
        canActivate: [footageGuard],
        loadComponent: () =>
          import('./features/footages/footages-page.component').then((m) => m.FootagesPageComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
