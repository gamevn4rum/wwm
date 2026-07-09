# Security Notes

This is a **static site** (Angular on GitHub Pages) with a Google Sheet as its
data source. There is no server the site controls. That single fact drives
every item below.

## The core limitation: a static site cannot keep data secret from its viewers

Anything the browser needs in order to work — API keys, the AES decryption key,
the data itself — is downloaded to every visitor and can be read from DevTools.
Encrypting `data/*.enc` and gating routes with a Discord login are **UI
conveniences, not confidentiality controls**. A visitor who never logs in can:

1. Open the JS bundle and copy `dataEncryptionKey`.
2. `fetch('data/members.enc')` and decrypt it locally with that key.

This was verified against the live site: the key in the bundle decrypts
`members.enc` into the full 42-row roster (Discord handles, IGNs, weapons,
availability). The Discord login and the `formationGuard` / `footageGuard`
route guards do **not** protect this data — they only decide what the SPA
renders, which the user's own browser controls anyway.

**Implication:** treat everything published to `data/` (encrypted or not) as
public. If a column must stay private, do not export it — filter it out in
`scripts/fetch-data.js` before the JSON is ever written. The only way to serve
data to *some* viewers and not others is to put a real server-side trust
boundary in front of it (see "If you need real access control").

## Owner actions — completed (verified 2026-07-09)

The high-priority owner actions from the original review are done and were
verified against the live services:

1. **The exposed Google API key `AIzaSy…Z57M` is dead.** The Sheets API now
   rejects it (`API_KEY_INVALID`). The old value still sits in git history,
   which is harmless now; history rewriting remains optional cleanup.
2. **The sheet is private.** Anonymous export of the spreadsheet returns 401.
   It is shared only with the sync service account (Viewer). The spreadsheet ID
   in old commits no longer grants anyone access.
3. **Sync uses a service account** (`GOOGLE_SERVICE_ACCOUNT_JSON` secret) —
   `sync-sheets.yml` runs succeed against the private sheet. The legacy
   `GOOGLE_API_KEY` fallback was removed from the workflow; the corresponding
   repo secret can be deleted.
4. **The `DATA_ENCRYPTION_KEY` secret provides no confidentiality** because it
   ships to the browser. Keep it only as light obfuscation; do not rely on it.
   Rotating it does not change the exposure. Real per-user access control needs
   the Apps Script gateway (`scripts/apps-script-gateway.gs`) wired into the
   app — this is the main remaining item.

## Fixes already applied in this repo

- **Removed the Google API key from the browser entirely.** The app is now
  static-only: the four data services (`events`, `schedule`, `members`,
  `match-history`) read the prebuilt `data/*.json` / `data/*.enc` files and no
  longer fall back to the live Sheets API from the client. `googleApiKey` and
  `defaultSpreadsheetId` were dropped from both `environment.ts` files and from
  the `deploy.yml` injection step, so no API key ships in the bundle anymore.
  (`fetch-data.js` in `sync-sheets.yml` authenticates server-side with the
  service account; nothing Google-related reaches a browser.)
- **Removed the stale `data/footages.json`.** The Footages tab was merged into
  Match History and its URLs are published only as `match-history.enc`, but the
  old plaintext export (member names + footage URLs) was still tracked and
  served from the live site, bypassing that encryption.
- **Deleted the public `/sheet` debug route** and its `SheetComponent` /
  `SheetDataService` / `GoogleSheetsApiService`, which live-queried the Sheets
  API (tab `Sheet1`) with the bundled key on demand.
- **Closed the stored XSS in the Events list.** `buildDescription()` no longer
  calls `bypassSecurityTrustHtml`; the sheet-authored description now runs
  through Angular's HTML sanitizer (`sanitize(SecurityContext.HTML, …)`), and
  the interpolated image URLs are attribute-escaped. Safe markup survives;
  `<script>` / `onerror` / other injection is stripped.
- **Added a `Content-Security-Policy`** meta tag in `src/index.html` as
  defense-in-depth. **Test the live app after deploying** — it allow-lists
  YouTube, the Discord CDN and Google Fonts.

Failure behaviour is now **fail-closed**: if a data file is missing or a
decryption fails, the app renders empty data instead of silently calling Google.

## Minor notes

- The Discord OAuth uses the implicit grant (`response_type=token`) and stores
  the token in `localStorage`. This is acceptable for a public client with the
  `identify` scope, but the token is readable by any XSS (see above). Closing
  the XSS is what makes this safe.
