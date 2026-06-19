# GameVN・Where Winds Meet

A guild roster and information page for **GameVN**, deployed as a static site on GitHub Pages. Member data is sourced from a Google Sheet and synced automatically every hour via GitHub Actions.

**Live site:** https://shinigamae.github.io/wwm-google-sheet/

---

## Architecture

```
Google Sheet
     │  (GitHub Actions — hourly)
     ▼
scripts/fetch-data.js  →  data/*.json  (source of truth)
                                │
                          ng build  →  docs/  (GitHub Pages root)
```

- The **Angular app** fetches pre-built static JSON files (`data/*.json`) at runtime — no API calls from the browser.
- The **GitHub Actions workflow** runs hourly, fetches fresh data from the Google Sheet, rebuilds the app, and pushes `data/` + `docs/` back to the repo.
- **GitHub Pages** serves the `docs/` folder on the `main` branch.

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
  { file: 'footages.json',      range: 'Footages' },
];
```

Each `range` must exactly match a **sheet tab name** in your Google Spreadsheet.  
The sheet's first row is treated as column headers; all subsequent rows become JSON objects keyed by those headers.

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

Output goes to `docs/`. Commit and push `docs/` to deploy to GitHub Pages.

---

## GitHub Pages Setup

1. Go to **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `docs` folder

---

## Workflow: Manual Sync

Trigger a data sync at any time from **Actions → Sync Google Sheets Data → Run workflow**.

---

## Adding a New Page

1. Add an entry to `PAGES` in `scripts/fetch-data.js`
2. Create the Angular component and fetch from `data/<page>.json` via `HttpClient`
3. Add the route in `src/app/app.routes.ts`
