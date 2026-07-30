# GameVN・Where Winds Meet

A guild roster and information page for **GameVN**, deployed as a static site on GitHub Pages. It is a pure SPA: every read goes to the .NET backend's API, and this repo ships no data of its own.

**Live site:** https://gamevn4rum.github.io/wwm/

> **Status:** on the backend as of 2026-07-30. The old static path — data shipped as
> encrypted `*.enc` files with the AES key in the bundle, plus the Google Sheet sync
> workflows — has been **removed entirely**, along with `frontend/data/`, the fetch and
> encrypt/decrypt scripts, and the `DATA_ENCRYPTION_KEY` build-time injection. There is no
> `useBackend` flag any more; there is only the backend.
>
> Those payloads were the last surviving copy of the wwmdb-derived data (wwmdb's hostname
> stopped resolving on 2026-07-30 and it is not coming back), so they were archived into
> the backend repo's `backfill-data/` and imported into SQL *before* being deleted here.

---

## Repository layout

**This repo is the frontend only, and it is public** — GitHub Pages serves it, so
everything here is world-readable by design.

- **`frontend/`** — the Angular 21 app, and the whole of this repo's build. **All Node
  commands run from `frontend/`** (`cd frontend && npm install`); the deploy workflow sets
  `working-directory: frontend`.

There is no `frontend/data/` and no data-sync tooling any more — the API is the only
source. `frontend/scripts/` keeps just `generate-dummy-assets.py`, which touches no data.

The **.NET 10 backend lives in a separate private repository** (Azure SQL +
ASP.NET Core Minimal API + Azure Functions sync). It implements the server-side trust
boundary this repo's [`SECURITY.md`](SECURITY.md) documents as missing, and it is
private because it holds that boundary's schema, the gated member data model, and
reverse-engineered notes on NetEase's API. Its `README.md` is the deployment runbook and
its `PLAN.md` is the design spec; ask an officer for access.

This repo does not build or vendor the backend; the coupling is the `apiBaseUrl` in
`environment.prod.ts` plus the matching `connect-src` entry in `index.html`. Miss the
second and the browser blocks every call, which looks exactly like a backend outage.

> ⚠ The backend was split out *after* being committed here, so every backend file is
> still readable in this repo's git history. Making it private only applies going
> forward. [`HISTORY-SCRUB.md`](HISTORY-SCRUB.md) has the purge procedure and, more
> importantly, the credential-rotation checklist that matters either way.

---

## What the backend adds

It replaces the "AES key ships to the browser" model (`SECURITY.md`'s core
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
- **Sync** — Azure Functions pull the Google Sheet into SQL on a timer, waking the DB only
  when data actually changed (cost-minimised).
- **Security hardening** — refuses to start in prod without a strong `JWT_SIGNING_KEY`
  and `CORS_ALLOWED_ORIGINS`; per-IP rate limiting; a `RESTRICT_TO_FRONTEND` origin
  filter (defense-in-depth). See [Security](#security).

---

## Architecture

```
Google Sheet ─┐                    Azure Functions (timer)
game API ─────┤  change-detect →   • SheetSyncFn      • StatsSyncFn
              │                    • GuildSyncFn      • LiveStatsSyncFn
              └──────────────┬───  • ManualSyncHttpFn (admin "sync now")
                             ▼  (upsert only when changed)
Angular SPA ───REST+JWT──▶ Azure SQL ◀── EF Core ── ASP.NET Core Minimal API (App Service)
(GitHub Pages)                              • /api/public/*    anon, cached
                                            • /api/auth/*      Discord code → app JWT
                                            • /api/member/*    JWT (+ fp/ftp)
                                            • /api/commander/* Commander+
                                            • /api/admin/*     Admin
```

This repo builds only the SPA:

```
ng build (in frontend/)  →  frontend/docs/  →  force-pushed to gh-pages branch
```

- **`deploy.yml`** builds the app and force-pushes `frontend/docs/` to `gh-pages` as a
  fresh orphan commit. No secret injection, and no data — the bundle is code and assets.
- **GitHub Pages** serves the `gh-pages` branch's `docs/` folder.
- **SPA deep-link routing**: GitHub Pages 404s on any path other than `/`.
  `frontend/public/404.html` encodes the path into a `?p=` param and redirects to root;
  `frontend/src/index.html` restores the real URL via `history.replaceState` before the
  router runs — so deep links (e.g. `/wwm/schedule`) survive a refresh.

> **wwmdb is gone.** `wwmdb.vlt.fyi` stopped resolving on 2026-07-30. It was the only
> source for player stats, the inner-way and gear-set catalogues, guild rosters, rankings
> and the Hall of Fame, so none of that can ever be re-fetched. What the site serves for
> those pages was imported into SQL from this repo's final published payloads, which are
> archived in the backend repo's `backfill-data/`. The live-stats overlay still works —
> it reads NetEase's own game API, which is unaffected.

---

## Repository Secrets

**None.** This repo's only workflow builds and publishes a static bundle, and the bundle
carries nothing sensitive: `apiBaseUrl` is committed in `environment.prod.ts` because a
URL is not a secret.

The `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID`, `DATA_ENCRYPTION_KEY` and
`WWMDB_TOKEN` secrets the old sync workflows used are no longer read by anything here and
can be deleted. `DATA_ENCRYPTION_KEY` in particular was *published by design* — it shipped
in the browser bundle so the client could decrypt `data/*.enc`, which is the single
limitation the backend exists to remove. Treat any value that ever lived in those secrets
as burned; see [`HISTORY-SCRUB.md`](HISTORY-SCRUB.md) for the rotation checklist.

Backend configuration lives in App Service / Function App application settings, in the
private repo's remit — never here.

---

## Where the data comes from

Nothing is configured in this repo. The API decides what the SPA can see, and the sheet is
read by the backend's `SheetSyncFn`, not from the browser. Two consequences worth knowing:

- **The public projection is deliberately thin.** `/api/public/roster` sends IGN, role,
  notes and a derived `registered` flag — no Discord handles, no UIDs, no PIDs. The
  IGN+UID pair is what the Register gate accepts as proof of identity, so publishing it
  would let a visitor claim any unregistered roster row.
- **Footage uploaders arrive as IGNs.** The Match History sheet names one column per
  uploader by Discord handle; `UpsertMatchesAsync` resolves each to a `Member.Ign` before
  storing. A handle matching nobody on the roster is passed through as-is rather than
  dropped, so an uploader label is *usually* an IGN and occasionally a raw handle.

## Content-Security-Policy

A `Content-Security-Policy` meta tag in [`frontend/src/index.html`](frontend/src/index.html) allow-lists the external origins the app depends on — YouTube (footage player), the Discord CDN (avatars), Google Fonts, and image hosts.

**Two gotchas.** `connect-src` must list the App Service origin (`apiBaseUrl`) — without it the browser blocks every API call, which presents exactly like a backend outage rather than a CSP problem. And event banners are hosted on [ImgBB](https://ibb.co) (`https://i.ibb.co`); images from a new host need that origin in `img-src`, or they are silently blocked.

---

## Local Development

### Prerequisites
- Node.js 20+ and Angular CLI (`npm install -g @angular/cli`)
- For the backend: .NET 10 SDK; Azure Functions Core Tools + Azurite; SQL Server / LocalDB

### Frontend
```bash
cd frontend
npm install

# dev server → http://localhost:4200/
npx ng serve

# production build (output → frontend/docs/, gitignored)
npx ng build
```

There is no data-fetching step: the app needs a reachable API, not local files.

### Pointing at an API
`environment.ts` (dev) defaults to `http://localhost:5080/api`. Run the backend from its
private repo — .NET 10 plus a local SQL Server/LocalDB — or set `apiBaseUrl` to the
deployed App Service if you only need real data.

On `localhost` the app asks for an Admin session via `POST /api/auth/dev`, which the
backend only answers when `DEV_AUTH_ENABLED=true` **and** it is not running as Production.
Against the deployed API that endpoint is a 404, so a local build pointed at production is
logged out until you complete a real Discord login.

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
| `deploy.yml` | Push to `main`, manual | Builds the app (in `frontend/`) and force-pushes `frontend/docs/` to `gh-pages` |

That is the only workflow. The four `sync-*` jobs that used to fetch the sheet, wwmdb and
the game API were removed — that work now runs in the backend's Azure Functions, on the
same schedules, writing to SQL instead of committing files here.

---

## Adding a New Page

1. Add an endpoint in the backend and, if it needs one, a mapper + DTO.
2. Create the Angular component; fetch via a data service that calls `apiUrl('/...')`.
3. Add the route in `frontend/src/app/app.routes.ts` (guard it if gated).
4. If it's a toggleable page, add its flag key to `FeatureKeys.Seed` in the backend and gate the nav/route with `featureGuard('page.<name>')`.
