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
    // The bare "Form GvG Team" modal the Discord RSVP post links to. Deliberately outside
    // MainLayoutComponent — this window holds the modal and nothing else.
    path: 'embed/gvg-formation',
    data: { preload: false },
    // No rank guard: a guard redirects, and in a window that holds only this modal the home page
    // is not a useful answer. The page says why instead — see FormationEmbedPageComponent.access.
    canActivate: [featureGuard('page.formation')],
    loadComponent: () =>
      import('./features/formation/embed/formation-embed-page.component')
        .then((m) => m.FormationEmbedPageComponent),
  },
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
        data: { preload: false },
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/admin/admin-page.component').then((m) => m.AdminPageComponent),
      },
      {
        path: 'manage/bot-management',
        data: { preload: false },
        canActivate: [commanderGuard],
        loadComponent: () =>
          import('./features/manage/bot-schedule-page.component').then((m) => m.BotSchedulePageComponent),
      },
      {
        path: 'manage/pvp-events',
        data: { preload: false },
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/manage/pvp-events-page.component').then((m) => m.PvpEventsPageComponent),
      },
      {
        // Members, opponent guilds and event posts, as tabs (?tab=). Retired URLs fall to `**`.
        path: 'manage',
        data: { preload: false },
        canActivate: [commanderGuard],
        loadComponent: () =>
          import('./features/manage/manage-page.component').then((m) => m.ManagePageComponent),
      },
      { path: '**', redirectTo: '' },
    ],
  },
];
