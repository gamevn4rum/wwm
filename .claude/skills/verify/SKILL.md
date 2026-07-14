# Verify WWMSheet changes

Angular 21 SPA (GitHub Pages, static-only data). Verify by driving the dev
server with Playwright — there is no backend.

## Build & launch

```bash
npx ng serve --port 4278   # run_in_background; ready in ~20s
```

Gotchas:
- The dev server does NOT serve asset files created after startup — restart
  it after adding anything under `data/`.
- Kill a stuck server via PowerShell:
  `Get-NetTCPConnection -LocalPort 4278 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`
  (TaskStop on the background task may leave the node child holding the port.)

## Dev data

Dev (`environment.ts`, empty `dataEncryptionKey`) reads plaintext
`data/match-history.json` / `data/members.json` — both gitignored and absent
by default, so match-history/footages pages render empty. Create a synthetic
file to exercise them (delete it afterwards). Row shape for match-history:

```json
[{ "Date": "12/Jul/2026", "Opponent": "Test", "Type": "Scrim", "Win": "✅",
   "Kam": "https://www.youtube.com/watch?v=VIDEO_ID" }]
```

Uploader columns must match `UPLOADERS` in
`src/app/features/match-history/match-record.model.ts`.

## Drive

No Playwright browsers installed; use `playwright-core` (npm i in scratchpad)
with `chromium.launch({ channel: 'msedge' })` — system Edge works headless.

- Routes: `/` `/formation` `/schedule` `/match-history` `/footages`.
- Footage cards use `@defer (on viewport)` — scroll `.footage-card-body`
  into view and wait for the `youtube-player` selector before interacting.
- Click the youtube-player placeholder to boot the IFrame API, then check
  `window.YT.Player` and `youtube-player iframe`.
- CSP lives in a meta tag in `src/index.html`; capture violations by
  listening to console messages matching /Content Security Policy|Refused to/
  plus a `securitypolicyviolation` DOM listener via addInitScript.
- `page.goto(..., { waitUntil: 'networkidle' })` occasionally times out;
  retry once or use `load`.
