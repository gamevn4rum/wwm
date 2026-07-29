# GameVN・Where Winds Meet

A guild roster and information page for **GameVN**, deployed as a static site on GitHub Pages. Member data is sourced from a Google Sheet and synced automatically via GitHub Actions.

**Live site:** https://shinigamae.github.io/wwm-google-sheet/

> **Status:** the app is transitioning from a **static-only** site (data shipped as
> encrypted `*.enc` files, decrypted in the browser) to a **real backend** that adds
> a server-side auth boundary. The backend is **code-complete but not yet deployed**;
> the live site still runs the static path until you flip `useBackend`.

---

## Repository layout

**This repo is the frontend only, and it is public** — GitHub Pages serves it, so
everything here is world-readable by design.

- **`frontend/`** — the Angular 21 app. **All Node commands run from `frontend/`**
  (`cd frontend && npm install`); the GitHub workflows set `working-directory: frontend`.
- **`scripts/`** — occasional manual tooling (guild-data pulls, UID resolution). Not
  part of any workflow.

The **.NET 10 backend lives in a separate private repository** (Azure SQL +
ASP.NET Core Minimal API + Azure Functions sync). It implements the server-side trust
boundary this repo's [`SECURITY.md`](SECURITY.md) documents as missing, and it is
private because it holds that boundary's schema, the gated member data model, and
reverse-engineered notes on NetEase's API. Its `README.md` is the deployment runbook and
its `PLAN.md` is the design spec; ask an officer for access.

Nothing in this repo builds, references or needs the backend — the only coupling is the
`apiBaseUrl` the SPA points at once `useBackend` is on.

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
- **Sync** — Azure Functions pull the Google Sheet + wwmdb relay into SQL on a timer,
  waking the DB only when data actually changed (cost-minimised).
- **Security hardening** — refuses to start in prod without a strong `JWT_SIGNING_KEY`
  and `CORS_ALLOWED_ORIGINS`; per-IP rate limiting; a `RESTRICT_TO_FRONTEND` origin
  filter (defense-in-depth). See [Security](#security).

Everything above is behind `environment.useBackend` (default **false**), so the static
site is unaffected until you deploy the backend and flip the flag.

---

## ✅ Go-live TODO (this repo's part)

Provisioning Azure, configuring the App Service / Function App, the Discord client
secret and deploying the API all happen **in the private backend repo** — its
`README.md` carries that runbook and its CI does the deploying. Only the steps below
are changes here.

### 1. Flip the frontend to the backend
- [ ] In `frontend/src/environments/environment.prod.ts` set `useBackend: true` and `apiBaseUrl` to `https://<appservice-host>/api`.
- [ ] Add a build-time injection for `apiBaseUrl` in `deploy.yml` (mirror the existing `DATA_ENCRYPTION_KEY` sed step) if you keep it as a secret/variable.
- [ ] Add the App Service origin to `connect-src` in `frontend/src/index.html`'s CSP, or the browser silently blocks every API call.
- [ ] Deploy the frontend and smoke-test login + gated pages.

### 2. Decommission the static path (after confirming the backend works)
- [ ] Remove the client AES path (`crypto.utils.ts` usage, `DATA_ENCRYPTION_KEY`, `*.enc` publishing).
- [ ] Retire `sync-sheets.yml`, `sync-player-stats.yml`, `sync-live-stats.yml` and `sync-opponent-guilds.yml` — the sync now lives in Azure Functions.
- [ ] Before deleting `frontend/scripts/fetch-*.js`, note the backend repo keeps frozen copies under `reference/scripts/` precisely so those protocol notes survive this step.
- [ ] Update `SECURITY.md` to describe the new trust boundary.

> On the backend side you'll also need its repo variables (`DEPLOY_BACKEND=true`,
> `AZURE_WEBAPP_NAME`, `AZURE_FUNCTIONAPP_NAME`) and publish-profile secrets. They are
> set on the **private** repo, not this one — moving the backend out moved its CI too.

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
wwmdb relay ──┤  change-detect →   • SheetSyncFn      • StatsSyncFn
game API ─────┤                    • GuildSyncFn      • LiveStatsSyncFn
              └──────────────┬───  • ManualSyncHttpFn (admin "sync now")
                             ▼  (upsert only when changed)
Angular SPA ───REST+JWT──▶ Azure SQL ◀── EF Core ── ASP.NET Core Minimal API (App Service)
(GitHub Pages)                              • /api/public/*   anon, cached
                                            • /api/auth/*     Discord code → app JWT
                                            • /api/member/*   JWT (+ fp/ftp)
                                            • /api/commander/* Commander+
                                            • /api/admin/*    Admin
```

Same Angular app — the data services just swap their fetch target, and auth stores an
app JWT instead of recomputing permissions from the (public) members file. Details are
in the private backend repo's `README.md` and `PLAN.md`.

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

### Non-sheet data (wwmdb relay)

Several data files come from the community relay [wwmdb.vlt.fyi](https://wwmdb.vlt.fyi)
instead of the Google Sheet. These two are produced by the `sync-player-stats.yml`
workflow:

- **`data/guild.enc`** — our guild's identity + member roster, rendered by the
  **Guild** page (`/guild`). Fetched by `frontend/scripts/fetch-guild.js` via the
  relay's `Guild {id, hostnum}` call; GameVN's guild id + serverId are baked into
  the script (the pair in the site URL `wwmdb.vlt.fyi/guilds/<id>/<hostnum>`), so
  no secret is needed. The relay's protocol is documented in `GUILD-API.md` in the
  private backend repo.
- **`data/player-stats.enc`** — per-member in-game stats/gear, rendered by the
  Roster Stats view. `fetch-player-stats.js` looks each member up by their guild
  **pId** (from `guild.json`) — wwmdb removed its IGN search, so the guild roster
  is now the source of the ids. Members on the Google-Sheet roster but not in the
  in-game guild simply show no stats.

### Non-sheet data (official game API)

- **`data/live-stats.enc`** — the same per-member gear and volatile stats, but
  read straight from NetEase's own game API every 30 minutes by the
  `sync-live-stats.yml` workflow (`frontend/scripts/fetch-live-stats.js`). No
  token: the API needs only a self-generated `h72-ms-uid` header.

  It is an **overlay**, not a replacement. That API answers in raw ids (item
  `1101578`, affix `9293004`, attribute key `MIN_W_ATK`) and carries no elegance
  score, school name or inner ways, so `player-stats.enc` above stays the source
  for all of those — including every name on a gear card, resolved from
  `data/gear-catalogue.json` (id→name pairs harvested hourly from wwmdb's
  already-resolved copy of the same payload). An item too new to be in the
  catalogue ships with its id and no name until the next hourly pass.

  Precedence, applied in `player-stats-data.service.ts`: **gear is always the
  live answer** when there is one, volatile stats (level, weapon mastery, online
  state, playtime) win per field when the API returned them, and everything else
  stays wwmdb's. Measured on one member in the same minute, wwmdb said level 99 /
  mastery 33542 / offline where the game API said 100 / 33950 / online — that gap
  is what this job closes.

And this one by the `sync-opponent-guilds.yml` workflow (twice a day):

- **`data/guild-opponents.json`** — identity, Guild Prosperity standing and member
  roster for every opponent guild in Match History, **public and unencrypted**,
  rendered by the Match History match popup. Which guilds are
  fetched comes from `data/opponent-guild-ids.json`, a hand-maintained
  `Opponent name → {id, hostnum}` map: wwmdb has no name-search method, so the map
  was built once by sweeping every leaderboard (`RankGroups` → `Rank {id}`, whose
  rows carry `units[].guild`) and matching on name. Opponents with no entry are
  absent, never guessed at — add them by hand as they are identified. Guilds
  rename, so each record keeps an `aliases` list of the Match History spellings
  that point at it; that is what the popup joins on.

  `prosperity` is the guild's place on the live Guild Prosperity board, in the same
  `GuildRankEntry` shape `guild-rank.json` uses for us — swept in three `Rank` calls
  for the whole set, with the boards resolved by *group name* (their ids are
  season-scoped). Null for the ~1/3 of opponents that don't make a top-200 board.

  ~317 KB / ~125 KB gzipped for ~57 guilds and ~4.7k members. Output is minified
  and deterministically sorted (guilds by name, members by join date), and carries
  no timestamp, so an unchanged roster produces a byte-identical file and the sync
  commits nothing — that, not the file size, is what keeps the repo and the Pages
  payload from growing twice a day. `fetch-opponent-guilds.js` warns past 1.5 MB;
  if it gets there, split per-guild or drop the member lists.

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
Clone the private backend repo separately and follow its `README.md`; it runs on
.NET 10 and needs a local SQL Server/LocalDB. Point this app at it with
`environment.ts` → `useBackend: true`, `apiBaseUrl: 'http://localhost:5xxx/api'`.
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
| `sync-player-stats.yml` | Hourly cron (:30, catalogues daily), manual | Pulls our guild (`fetch-guild.js` → `guild.enc`), enriches each guild member with wwmdb stats + catalogues (resolved by their guild **pId**, since wwmdb dropped IGN search), harvests `gear-catalogue.json`, encrypts, commits, triggers deploy |
| `sync-live-stats.yml` | Every 30 min (:05 / :35), manual | Re-reads gear + volatile stats from the official game API into `live-stats.enc` — the overlay described above. Decrypts `guild`/`player-stats` for the pIds, numberIds and last-known affix tiers it needs, then encrypts, commits, triggers deploy |
| `sync-opponent-guilds.yml` | Twice-daily cron (03:45 / 15:45 UTC), manual | Pulls every opponent guild in `data/opponent-guild-ids.json` (identity + member roster) into `data/guild-opponents.json`, commits, triggers deploy — only when the rosters actually changed |
| `deploy.yml` | Push to `main`, manual, or triggered by a sync | Builds the app (in `frontend/`) and force-pushes `frontend/docs/` to `gh-pages` |

---

## Adding a New Page

1. Add an entry to `PAGES` in `frontend/scripts/fetch-data.js` (static path) and/or an endpoint in the backend.
2. Create the Angular component; fetch via the relevant data service.
3. Add the route in `frontend/src/app/app.routes.ts` (guard it if gated).
4. If it's a toggleable page, add its flag key to `FeatureKeys.Seed` in the backend and gate the nav/route with `featureGuard('page.<name>')`.
