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

## Required owner actions (cannot be done in code)

These are the highest-priority items and only the repo/Google Cloud owner can do
them:

1. **Rotate the exposed Google API key.** The key
   `AIzaSy…Z57M` was committed in `src/environments/environment.ts` and shipped
   in the production bundle. Assume it is compromised. Create a new key in
   Google Cloud Console and update the `GOOGLE_API_KEY` **repository secret**
   (Settings → Secrets and variables → Actions). Do not put it back in source.
2. **Restrict the new key** in Google Cloud Console:
   - *Application restriction* → HTTP referrers → `https://gamevn4rum.github.io/*`
   - *API restriction* → Google Sheets API only.
   This limits a leaked key to Sheets reads from your domain instead of any
   Google API / anyone.
3. **Review the Google Sheet's sharing.** For the in-browser API-key fallback
   to work, the sheet must be readable by the key (i.e. link-shared). Confirm
   the sheet grants **view-only** at most, and that no sensitive tab is exposed.
   Anyone with the (public) spreadsheet ID + key can read every shared tab
   directly via `sheets.googleapis.com`, bypassing the app entirely.
4. **The `DATA_ENCRYPTION_KEY` secret provides no confidentiality** here because
   it ships to the browser. Keep it only if you want light obfuscation; do not
   rely on it. Rotating it does not change the exposure.
5. **Purge secrets from git history.** Rotating is enough to make the old key
   useless, but the old value remains in past commits. Rotation (step 1) is the
   real fix; history rewriting is optional cleanup.

## Fixes already applied in this repo

- **Removed the Google API key from the browser entirely.** The app is now
  static-only: the four data services (`events`, `schedule`, `members`,
  `match-history`) read the prebuilt `data/*.json` / `data/*.enc` files and no
  longer fall back to the live Sheets API from the client. `googleApiKey` and
  `defaultSpreadsheetId` were dropped from both `environment.ts` files and from
  the `deploy.yml` injection step, so no API key ships in the bundle anymore.
  (The `GOOGLE_API_KEY` secret is still used server-side by `fetch-data.js` in
  `sync-sheets.yml` — that is fine; it never reaches a browser there.)
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
