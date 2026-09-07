import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { formationGuard } from './core/guards/formation.guard';
import { footageGuard } from './core/guards/footage.guard';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard, commanderGuard } from './core/guards/admin.guard';
import { memberGuard } from './core/guards/member.guard';
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
        // Our guild's identity + roster — member-only (requires login in both
        // static and backend modes; not public even though the data is baked in).
        path: 'guild',
        canActivate: [memberGuard, featureGuard('page.guild')],
        loadComponent: () =>
          import('./features/guild/guild-page.component').then((m) => m.GuildPageComponent),
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
        path: 'manage/registrations',
        canActivate: [commanderGuard],
        loadComponent: () =>
          import('./features/manage/registrations-page.component').then((m) => m.RegistrationsPageComponent),
      },
      {
        path: 'manage/events',
        canActivate: [commanderGuard],
        loadComponent: () =>
          import('./features/manage/events-page.component').then((m) => m.ManageEventsPageComponent),
      },
      {
        path: 'manage/bot-schedule',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/manage/bot-schedule-page.component').then((m) => m.BotSchedulePageComponent),
      },
      {
        path: 'manage/pvp-events',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/manage/pvp-events-page.component').then((m) => m.PvpEventsPageComponent),
      },
      // Old split routes now live as collapsible panels under one page. These sit above the bare
      // `manage` route deliberately: the router would fall through to them anyway, but relying on
      // that is a subtlety, and a redirect listed after the route it redirects to reads wrongly.
      { path: 'manage/members', redirectTo: 'manage', pathMatch: 'full' },
      { path: 'manage/schedules', redirectTo: 'manage/bot-schedule', pathMatch: 'full' },
      { path: 'manage/scheduled-events', redirectTo: 'manage/bot-schedule', pathMatch: 'full' },
      {
        // Members and opponent guilds, as two collapsible panels. Last of the `manage/*` group so
        // every specific route above matches first — this one takes the bare segment.
        path: 'manage',
        canActivate: [commanderGuard],
        loadComponent: () =>
          import('./features/manage/manage-page.component').then((m) => m.ManagePageComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
