import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { formationGuard } from './core/guards/formation.guard';
import { footageGuard } from './core/guards/footage.guard';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard, commanderGuard } from './core/guards/admin.guard';
import { featureGuard } from './core/guards/feature.guard';

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
        path: 'formation',
        canActivate: [formationGuard, featureGuard('page.formation')],
        loadComponent: () =>
          import('./features/formation/formation-page.component').then((m) => m.FormationPageComponent),
      },
      {
        path: 'schedule',
        canActivate: [featureGuard('page.schedule')],
        loadComponent: () =>
          import('./features/schedule/schedule-page.component').then((m) => m.SchedulePageComponent),
      },
      {
        // Match history is member-only (never public) — enforced server-side and
        // gated here once the backend is live (no-op in static mode).
        path: 'match-history',
        canActivate: [authGuard, featureGuard('page.match-history')],
        loadComponent: () =>
          import('./features/match-history/match-history-page.component').then((m) => m.MatchHistoryPageComponent),
      },
      {
        path: 'footages',
        canActivate: [footageGuard, featureGuard('page.footages')],
        loadComponent: () =>
          import('./features/footages/footages-page.component').then((m) => m.FootagesPageComponent),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/admin-page.component').then((m) => m.AdminPageComponent),
      },
      {
        path: 'manage/members',
        canActivate: [commanderGuard],
        loadComponent: () =>
          import('./features/manage/manage-members-page.component').then((m) => m.ManageMembersPageComponent),
      },
      {
        path: 'manage/registrations',
        canActivate: [commanderGuard],
        loadComponent: () =>
          import('./features/manage/registrations-page.component').then((m) => m.RegistrationsPageComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
