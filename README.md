# GameVN・Where Winds Meet

A guild roster and information page for **GameVN**, deployed as a static site on GitHub Pages. Member data is sourced from a Google Sheet and synced automatically via GitHub Actions.

**Live site:** https://shinigamae.github.io/wwm-google-sheet/

> **Status:** the app is transitioning from a **static-only** site (data shipped as
> encrypted `*.enc` files, decrypted in the browser) to a **real backend** that adds
> a server-side auth boundary. The backend is **code-complete but not yet deployed**;
> the live site still runs the static path until you flip `useBackend` (see the
> [go-live checklist](#-go-live-todo-backend) below).

---

## Repository layout

This repo is a monorepo:

- **`frontend/`** — the Angular 21 app. **All Node commands run from `frontend/`**
  (`cd frontend && npm install`); the GitHub workflows set `working-directory: frontend`.
- **`backend/`** — a **.NET 10** backend (Azure SQL + ASP.NET Core Minimal API +
  Azure Functions sync) that implements the server-side trust boundary described in
  [`SECURITY.md`](SECURITY.md). See [`backend/README.md`](backend/README.md) (runbook)
  and [`backend/PLAN.md`](backend/PLAN.md) (design).

---

## What's new (full-stack backend)

The backend replaces the "AES key ships to the browser" model (`SECURITY.md`'s core
limitation) with a proper server boundary, and adds back-office management:

- **Server-side auth** — Discord **Authorization Code** flow: the server holds the
  client secret, mints a short-lived **app JWT**, and gates data with it. The browser
  ships **no secret**.
- **Gated data** — only **Events, Schedule, a safe roster projection** (IGN/role/notes)
  and the feature config are public. **Match history, footages, roster-stats,
  player-stats, catalogues and formation require a valid JWT**; footage URLs need `ftp`,
  formation needs `fp`. Not-logged-in visitors see only the homepage.
- **Roles** — Admin ⊇ Commander ⊇ Warrior, enforced server-side (Admin = the legacy
  "Creator").
- **`/admin`** — feature-flag screen (Admin only): toggle any page/feature on or off.
  Disabling a page hides its nav button, blocks its route, **and** stops the API
  serving its data (404) — not just hiding the link.
- **`/manage/members`** — member permission editor (Commander+): `canLogin` / `fp` /
  `ftp` / role, audited, with a role-grant escalation guard.
- **`/manage/registrations`** — review the public Register form submissions and grant
  access (creates/updates the member so they can log in immediately).
- **Sync** — Azure Functions pull the Google Sheet + wwmdb relay into SQL on a timer,
  waking the DB only when data actually changed (cost-minimised).
- **Security hardening** — refuses to start in prod without a strong `JWT_SIGNING_KEY`
  and `CORS_ALLOWED_ORIGINS`; per-IP rate limiting; a `RESTRICT_TO_FRONTEND` origin
  filter (defense-in-depth). See [Security](#security).

Everything above is behind `environment.useBackend` (default **false**), so the static
site is unaffected until you deploy the backend and flip the flag.

---

## ✅ Go-live TODO (backend)

What **you** need to do to move off the static path onto the backend. (I can't do
these — they need your Azure subscription and Discord app.) The full step-by-step is in
[`backend/README.md`](backend/README.md); this is the checklist.

### 1. Provision Azure (free tier)
- [ ] Resource group in a region with the SQL free offer (near SEA players).
- [ ] **Azure SQL Database** — free GP **serverless**; auto-pause delay **1 hour**, min vCore. Capture the connection string.
- [ ] **App Service** — Linux **F1 (free)** + plan (hosts `Wwm.Api`).
- [ ] **Function App** (Consumption) + its **Storage Account** (hosts `Wwm.Sync`).

### 2. App Service settings (the API)
- [ ] `SQL_CONNECTION_STRING`
- [ ] `JWT_SIGNING_KEY` — a strong random secret **≥32 chars** (the app refuses to start on the dev default).
- [ ] `DISCORD_CLIENT_ID` (`1512670533093949570`) and `DISCORD_CLIENT_SECRET`
- [ ] `CORS_ALLOWED_ORIGINS` — your GitHub Pages origin (e.g. `https://shinigamae.github.io`). **Required in prod.**
- [ ] `ADMIN_KEY` and `FUNCTION_SYNC_URL` (`https://<funcapp>.azurewebsites.net/api/sync`)
- [ ] `AUTO_MIGRATE=true` for the first boot (creates the schema + seeds feature flags).
- [ ] Leave `DEV_AUTH_ENABLED` **unset**. (`RESTRICT_TO_FRONTEND` defaults to `true`.)

### 3. Function App settings (the sync)
- [ ] `SQL_CONNECTION_STRING`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID`
- [ ] `WWMDB_TOKEN` (optional; rotates), `WWMDB_ALLOWED_REGIONS` (default `SEA`)
- [ ] `ADMIN_KEY` (same value as the API), `AzureWebJobsStorage`
- [ ] `SYNC_CRON_SHEET` / `SYNC_CRON_STATS` (defaults: every 6 h / daily)

### 4. Discord app
- [ ] Add your SPA origin(s) as **redirect URIs** (prod + `http://localhost:4200/` for dev).
- [ ] Copy the **client secret** into the App Service (`DISCORD_CLIENT_SECRET`).

### 5. Deploy the backend (CI)
- [ ] Repo **variables**: `DEPLOY_BACKEND=true`, `AZURE_WEBAPP_NAME`, `AZURE_FUNCTIONAPP_NAME`.
- [ ] Repo **secrets**: `AZURE_WEBAPP_PUBLISH_PROFILE`, `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`.
- [ ] Push (or run `backend.yml` manually) → builds + deploys API and Functions.

### 6. First data load & verify
- [ ] Trigger the initial sync: `POST https://<funcapp>.azurewebsites.net/api/sync/all` with header `X-Admin-Key: <ADMIN_KEY>` (or wait for the timers).
- [ ] Confirm the roster/matches populate and `shinigamae` is seeded as **Admin**.
- [ ] Log in and check `/admin`, `/manage/members`, `/manage/registrations`.

### 7. Flip the frontend to the backend
- [ ] In `frontend/src/environments/environment.prod.ts` set `useBackend: true` and `apiBaseUrl` to `https://<appservice-host>/api`.
- [ ] Add a build-time injection for `apiBaseUrl` in `deploy.yml` (mirror the existing `DATA_ENCRYPTION_KEY` sed step) if you keep it as a secret/variable.
- [ ] Deploy the frontend and smoke-test login + gated pages.

### 8. Decommission the static path (after confirming the backend works)
- [ ] Remove the client AES path (`crypto.utils.ts` usage, `DATA_ENCRYPTION_KEY`, `*.enc` publishing).
- [ ] Retire/repoint `sync-sheets.yml` / `sync-player-stats.yml` (the sync now lives in Functions).
- [ ] Update `SECURITY.md` to describe the new trust boundary.

---

## Architecture — static path (current, `useBackend: false`)

```
Google Sheet
     │  (sync-sheets.yml — hourly)
     ▼
frontend/scripts/fetch-data.js  →  frontend/data/*.json  (committed to main)
     │
     │  triggers deploy.yml (workflow_dispatch)
     ▼
ng build (in frontend/)  →  frontend/docs/  →  pushed to gh-pages branch
```

- The **Angular app** fetches pre-built static files (`data/*.json`, or encrypted `data/*.enc` in prod) at runtime — no API calls from the browser.
- **`sync-sheets.yml`** runs hourly: fetches from the Google Sheet, encrypts sensitive files, commits `frontend/data/*.json` back to `main`, and triggers `deploy.yml` if data changed.
- **`deploy.yml`** builds the app (in `frontend/`) and force-pushes `frontend/docs/` to the `gh-pages` branch.
- **GitHub Pages** serves the `gh-pages` branch's `docs/` folder.
- **SPA deep-link routing**: GitHub Pages 404s on any path other than `/`. `frontend/public/404.html` encodes the path into a `?p=` param and redirects to root; `frontend/src/index.html` restores the real URL via `history.replaceState` before the router runs — so deep links (e.g. `/wwm/schedule`) work on refresh.

## Architecture — backend path (`useBackend: true`)

```
Google Sheet ─┐                    Azure Functions (timer)
wwmdb relay ──┤  change-detect →   • SheetSyncFn  • StatsSyncFn  • ManualSyncHttpFn
              └──────────────┬────────────────────────────────
                             ▼  (upsert only when changed)
Angular SPA ───REST+JWT──▶ Azure SQL ◀── EF Core ── ASP.NET Core Minimal API (App Service)
(GitHub Pages)                              • /api/public/*   anon, cached
                                            • /api/auth/*     Discord code → app JWT
                                            • /api/member/*   JWT (+ fp/ftp)
                                            • /api/commander/* Commander+
                                            • /api/admin/*    Admin
```

Same Angular app — the data services just swap their fetch target, and auth stores an
app JWT instead of recomputing permissions from the (public) members file. Details in
[`backend/README.md`](backend/README.md).

---

## Repository Secrets (static path)

Set in **Settings → Secrets and variables → Actions**. Used by the sync/deploy workflows:

| Secret | Description |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service-account key JSON; the sheet is shared with its `client_email` as Viewer (keeps the sheet private) |
| `GOOGLE_SHEET_ID` | The spreadsheet ID from its URL |
| `DATA_ENCRYPTION_KEY` | AES key injected into the prod bundle to decrypt `data/*.enc` (⚠ ships to the browser — see `SECURITY.md`) |
| `WWMDB_TOKEN` | *(optional)* override if wwmdb rotates the token embedded in their bundle |

> Backend secrets live in App Service / Function App configuration, **not** here — see the [go-live checklist](#-go-live-todo-backend).

---

## Data Configuration

Edit [`frontend/scripts/fetch-data.js`](frontend/scripts/fetch-data.js) to map files to sheet tab ranges:

```js
const PAGES = [
  { file: 'members.json',       range: 'Members!A:Z' },
  { file: 'schedule.json',      range: 'Schedule!A:Z' },
  { file: 'match-history.json', range: 'Match History!A:Z' },
  { file: 'events.json',        range: 'Events!A:J' },
];
```

Each `range` must match a **sheet tab** in your Google Spreadsheet. The first row is treated as column headers; subsequent rows become JSON objects keyed by those headers.

There is no separate Footages tab — the Match History sheet carries one column per uploader (`Kam`, `Necro`, `Ruby`, `VK`, `Yuenshin`, `canoc`, `Sniper`, `LVH`, `choxu`, …) holding that uploader's YouTube link. Both the frontend parser and the backend derive each match's `footages` array from those columns.

Both the Match History and Footages pages let you filter by opponent (Footages via single-select dropdowns; Match History via a multi-select chip group).

---

## Content-Security-Policy

A `Content-Security-Policy` meta tag in [`frontend/src/index.html`](frontend/src/index.html) allow-lists the external origins the app depends on — YouTube (footage player), the Discord CDN (avatars), Google Fonts, and image hosts.

**Gotcha:** event banners (`events.json`) are hosted on [ImgBB](https://ibb.co) (`https://i.ibb.co`). If you add images from a new host, add that origin to `img-src` in `frontend/src/index.html` or the browser will silently block them. When you enable the backend, also ensure `connect-src` allows the App Service origin (`apiBaseUrl`).

---

## Local Development

### Prerequisites
- Node.js 20+ and Angular CLI (`npm install -g @angular/cli`)
- For the backend: .NET 10 SDK; Azure Functions Core Tools + Azurite; SQL Server / LocalDB

### Frontend
```bash
cd frontend
npm install

# fetch data locally (service account)
GOOGLE_SERVICE_ACCOUNT_JSON='<json>' GOOGLE_SHEET_ID='<id>' node scripts/fetch-data.js

# dev server → http://localhost:4200/
npx ng serve

# production build (output → frontend/docs/, gitignored)
npx ng build
```

On Windows PowerShell, set env vars with `$env:NAME="value"; node scripts/fetch-data.js`.

### Backend (optional — only for `useBackend: true`)
See [`backend/README.md`](backend/README.md). In short:
```bash
cd backend
dotnet ef database update --project src/Wwm.Data --startup-project src/Wwm.Data
DEV_AUTH_ENABLED=true JWT_SIGNING_KEY=<32+ chars> dotnet run --project src/Wwm.Api
```
Then set `useBackend: true` in `frontend/src/environments/environment.ts` and `npx ng serve`. The `localhost` dev bypass gets an Admin session from `POST /api/auth/dev`.

---

## GitHub Pages Setup

1. **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `gh-pages` / `docs` folder

The `gh-pages` branch is created automatically the first time `deploy.yml` runs.

---

## Workflows

| Workflow | Trigger | Does |
|---|---|---|
| `sync-sheets.yml` | Hourly cron, manual | Fetches/encrypts sheet data (in `frontend/`), commits `frontend/data/*.json`, triggers `deploy.yml` if changed |
| `sync-player-stats.yml` | Daily cron, manual | Enriches the roster with wwmdb stats + catalogues, commits, triggers deploy |
| `deploy.yml` | Push to `main`, manual, or triggered by a sync | Builds the app (in `frontend/`) and force-pushes `frontend/docs/` to `gh-pages` |
| `backend.yml` | Push to `main` under `backend/**`, manual | Builds the .NET solution; **deploys** API + Functions only when the repo variable `DEPLOY_BACKEND=true` |

---

## Adding a New Page

1. Add an entry to `PAGES` in `frontend/scripts/fetch-data.js` (static path) and/or an endpoint in the backend.
2. Create the Angular component; fetch via the relevant data service.
3. Add the route in `frontend/src/app/app.routes.ts` (guard it if gated).
4. If it's a toggleable page, add its flag key to `FeatureKeys.Seed` in the backend and gate the nav/route with `featureGuard('page.<name>')`.
