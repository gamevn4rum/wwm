# GameVN・Where Winds Meet

A guild roster and information page for **GameVN**, deployed as a static site on GitHub Pages. Member data is sourced from a Google Sheet and synced automatically every hour via GitHub Actions.

**Live site:** https://shinigamae.github.io/wwm-google-sheet/

---

## Architecture

```
Google Sheet
     │  (sync-sheets.yml — hourly)
     ▼
scripts/fetch-data.js  →  data/*.json  (source of truth, committed to main)
     │
     │  triggers deploy.yml (workflow_dispatch)
     ▼
ng build  →  docs/  →  pushed to gh-pages branch
```

- The **Angular app** fetches pre-built static JSON files (`data/*.json`) at runtime — no API calls from the browser.
- **`sync-sheets.yml`** runs hourly: fetches fresh data from the Google Sheet, encrypts sensitive files, and commits `data/*.json` back to `main`. If anything changed, it triggers `deploy.yml`.
- **`deploy.yml`** runs on every push to `main` (code changes) or when triggered by a sync: it builds the app and force-pushes the `docs/` output to the `gh-pages` branch (created automatically if it doesn't exist yet).
- **GitHub Pages** serves the `gh-pages` branch's `docs/` folder.
- **SPA deep-link routing**: GitHub Pages has no server-side router, so it 404s on any path other than `/`. `public/404.html` encodes the requested path into a `?p=` query param and redirects to the app root; `src/index.html` reads that param on boot and calls `history.replaceState` to restore the real URL before Angular's router takes over. This means child routes (e.g. `/wwm/schedule`) work correctly even on a hard refresh or direct link.

---

## Repository Secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `GOOGLE_API_KEY` | Google Cloud API key with Sheets API enabled |
| `GOOGLE_SHEET_ID` | The spreadsheet ID from its URL |

---

## Data Configuration

Edit [`scripts/fetch-data.js`](scripts/fetch-data.js) to map pages to sheet tab names:

```js
const PAGES = [
  { file: 'members.json',       range: 'Members' },
  { file: 'formation.json',     range: 'Formation' },
  { file: 'schedule.json',      range: 'Schedule' },
  { file: 'match-history.json', range: 'MatchHistory' },
  { file: 'events.json',        range: 'Events' },
];
```

Each `range` must exactly match a **sheet tab name** in your Google Spreadsheet.  
The sheet's first row is treated as column headers; all subsequent rows become JSON objects keyed by those headers.

There is no separate Footages tab — the Match History sheet carries one column per uploader (`Kam`, `Necro`, `Ruby`, `VK`, `Yuenshin`, `canoc`, `Sniper`, `LVH`, `choxu`) holding that uploader's YouTube link for the match, if any. `MatchHistoryDataService` parses those columns into each `MatchRecord`'s `footages` array; the Footages gallery page and the match-card popup both derive their video lists from that same array instead of a separate fetch.

Both the Match History and Footages pages let you filter by opponent. Footages uses single-select dropdowns (match type / opponent / uploader); Match History uses a multi-select chip group so you can view several opponents at once (no chips selected = all matches).

---

## Content-Security-Policy

A `Content-Security-Policy` is set via a meta tag in [`src/index.html`](src/index.html) as defense-in-depth (see [`SECURITY.md`](SECURITY.md)). It allow-lists the external origins the app depends on — YouTube (footage player), the Discord CDN (avatars), Google Fonts, and image hosts.

**Gotcha:** event banners/screenshots (`events.json`) are hosted externally on [ImgBB](https://ibb.co) (`https://i.ibb.co`). If you add images from a new host, add that origin to the `img-src` directive in `src/index.html` or the browser will silently block them.

---

## Local Development

### Prerequisites

- Node.js 20+
- Angular CLI: `npm install -g @angular/cli`

### Setup

```bash
npm install
```

### Fetch data locally

```bash
GOOGLE_API_KEY=<your-key> GOOGLE_SHEET_ID=<your-id> node scripts/fetch-data.js
```

This writes `data/*.json`. On Windows PowerShell:

```powershell
$env:GOOGLE_API_KEY="<your-key>"; $env:GOOGLE_SHEET_ID="<your-id>"; node scripts/fetch-data.js
```

### Run dev server

```bash
ng serve
```

Open `http://localhost:4200/`. The dev server serves `data/*.json` as static assets automatically.

### Build for production

```bash
ng build
```

Output goes to `docs/` locally for inspection only — it is gitignored on `main`. Deployment happens via the `deploy.yml` workflow, which pushes `docs/` to the `gh-pages` branch.

---

## GitHub Pages Setup

1. Go to **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `gh-pages` / `docs` folder

The `gh-pages` branch is created automatically the first time `deploy.yml` runs — no manual setup needed beyond pointing Pages at it.

---

## Workflows

| Workflow | Trigger | Does |
|---|---|---|
| `sync-sheets.yml` | Hourly cron, manual | Fetches/encrypts sheet data, commits `data/*.json` to `main`, triggers `deploy.yml` if data changed |
| `deploy.yml` | Push to `main`, manual, or triggered by `sync-sheets.yml` | Builds the app and force-pushes `docs/` to `gh-pages` |

Trigger either manually from **Actions → (workflow name) → Run workflow**.

---

## Adding a New Page

1. Add an entry to `PAGES` in `scripts/fetch-data.js`
2. Create the Angular component and fetch from `data/<page>.json` via `HttpClient`
3. Add the route in `src/app/app.routes.ts`
