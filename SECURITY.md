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

## Review 2026-07-26 (UID/PID adoption + Guild page)

Re-checked after the Members sheet gained `UID`/`PID` columns and the roster/stats
pipelines were extended. **Still in place, verified against `origin/gh-pages`:**

- No secret in the deployed bundle beyond the (known, unavoidable) data key — no
  `AIzaSy…`, `service_account`, `private_key`, `client_secret`, sheet id.
- No plaintext data on the published branch: `docs/data/` carries only the `.enc`
  files plus the intentionally-public `events/schedule/inner-ways/sets` JSON. No
  `members.json` / `player-stats.json` / `guild.json` ever reaches it.
- The only `innerHTML` sink (Events description) still routes through
  `sanitizer.sanitize(SecurityContext.HTML, …)`; no `bypassSecurityTrust*` anywhere.
- No client-side Sheets API path: no `sheets.googleapis.com`, `googleApiKey` or
  `spreadsheetId` in `src/`. Data services still fail closed to empty.
- Workflows interpolate no `github.event.*` into `run:` blocks, echo no secrets, and
  use no `pull_request_target`.
- Backend go-live guards intact (unchanged): prod refuses to start without a ≥32-char
  `JWT_SIGNING_KEY` or `CORS_ALLOWED_ORIGINS`; global 120/min + register 5/min rate
  limits; `RESTRICT_TO_FRONTEND` on by default.

**Closed in this review:**

- **`UID`/`PID` are no longer exported.** `fetch-data.js` now drops them from
  `members.json` (`OMITTED_COLUMNS`) before anything is written, so they never reach
  `members.enc`. This matters more than the other columns: the Register flow treats a
  matching **IGN + UID as proof you are that member**, and published data is readable
  by everyone — shipping the pair would have let any visitor claim any not-yet-
  registered roster row. The backend still gets both columns; it reads the sheet
  directly with the service account.
- **`POST /api/public/register` no longer scans the Members table.** The roster gate
  now matches the UID with indexed equality on its two spellings (bare and
  zero-padded). An unauthenticated route that loaded every member per request is a
  cheap way to hammer a serverless DB that bills for being woken.

**Data files added since (2026-07-26, leaderboards + newcomer detection):**

- `data/guild-rank.json` — **public by design, unencrypted.** Carries only our own
  standing on public leaderboards (board name, rank, score, entry count, timestamp).
  No UID/PID, and no other guild's rows.
- `data/hall-of-fame.json` — **public by design, unencrypted.** Member IGNs (already
  public via `guild.enc`) plus their public leaderboard placements: board, rank,
  score, field size. No UID/PID, nothing account-shaped.
- `data/new-members.json` — guild members not yet on the Members sheet, **with their
  UID and PID**. Gitignored and never encrypted/published, and the sync logs only
  their IGNs (already public via `guild.enc`). This repo is public, so its Actions
  logs, job summaries and artifacts are world-readable — an IGN+UID pair is what the
  Register flow accepts as proof of identity, so it must not appear in any of them.
  Closing the loop properly (writing newcomers straight into the private sheet) needs
  the sync service account promoted from Viewer to Editor.

**Accepted / still true — not fixed, know these:**

- **The static site still cannot enforce the registration gate.** The in-app check is
  UX only; the Google Form endpoint accepts unauthenticated POSTs from anywhere, and
  it has no Discord field, so anyone can submit any IGN/UID and an officer must
  verify. There is no rate limit available on a static host — if registration spam
  becomes a problem, use the Google Form's own "limit to 1 response / require
  sign-in" settings, or wait for the backend (5/min limiter already written).
- **`guild.enc` still publishes every member's pId**, so PID is only withheld from
  `members.enc`, not globally. `fetch-player-stats.js` needs the pIds in the local
  `guild.json`, but the *published* copy does not — stripping them in
  `encrypt-data.js` (and re-keying the Guild page's `@for` off IGN) would close it.
- **`player-stats.enc` now carries activity data** — `isOnline`, `loginTime`,
  `logoutTime`, `onlineTime`, `eleganceScore` — so when each member last played, and
  their total playtime, are publicly readable. This is the same data wwmdb already
  shows publicly, and it drives the Guild page's "last seen"/online state, but it is a
  deliberate publication of per-member activity: drop the fields from `shapePlayer`
  if that is not wanted.
- **CSP `connect-src` now also allows `https://docs.google.com`** — required for the
  static Register form, whose POST was silently CSP-blocked in production. It widens
  the exfiltration channel a hypothetical XSS could use; `form-action 'self'` and the
  sanitizer are the compensating controls.

## Minor notes

- The Discord OAuth uses the implicit grant (`response_type=token`) and stores
  the token in `localStorage`. This is acceptable for a public client with the
  `identify` scope, but the token is readable by any XSS (see above). Closing
  the XSS is what makes this safe.
- The Guild page publishes `data/guild.enc` (guild identity + member IGN/join
  date roster), pulled from the wwmdb relay by `scripts/fetch-guild.js`. Same
  public-data caveat as the roster: `.enc` is a UI convenience, not
  confidentiality. Player stats (`scripts/fetch-player-stats.js`) now resolve
  each member via their guild **pId** rather than an IGN search. Both scripts
  strip anything account/email-shaped at ingestion (a recursive deny-list in
  fetch-guild.js, a strict allow-list in fetch-player-stats.js), so the upstream
  NetEase account email is never written to `data/` — honouring the "filter it
  out before the JSON is written" rule above.
