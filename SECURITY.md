# Security Notes

Last reviewed **2026-11-21**: a full audit of this SPA, the .NET backend (`wwm-backend`)
and the Discord bot (`discord-vault`), followed by library updates in all three.

## How the trust model works

This is an Angular SPA on GitHub Pages. It holds **no data of its own**: since 2026-07-30
everything is read from the .NET backend's API, and that is where the trust boundary
sits. Anything in the bundle is readable by every visitor, so the bundle carries nothing
secret. The only configuration it holds is the API's hostname (`environment.prod.ts`).

- **Login.** Discord OAuth authorization-code flow. The SPA generates `state` with
  `crypto.randomUUID()`, keeps it in `sessionStorage`, and refuses a callback whose
  `state` is missing or different (login CSRF). It strips `?code=` from the URL before
  the exchange. The backend swaps the code using the client secret, which only the
  server holds. It then mints a short-lived app JWT (1 hour, HS256, issuer/audience/key
  all checked).
- **Identity is the Discord user id** (since 2026-11-21), not the username. Usernames
  are released on rename, so whoever registered an old name used to inherit that
  member's row and role. Members now carry `DiscordUserId`:
  - Login matches the id first. It links a row found by username only if that row is
    not linked yet.
  - The bot sends the interaction user's id as `X-Discord-User-Id`, and every bot
    permission check resolves the caller through `CallerIdentity`.
  - An officer changing a member's handle clears the link.
- **Sessions.** `/auth/refresh` renews an expired token for up to 7 days after the
  original Discord login. Every renewal re-reads the member row, so disabling or
  demoting someone takes effect at their next renewal. **Sign-out calls
  `/auth/logout`**, which bumps the member's `SessionEpoch`. That ends every session
  they hold, on every device, within one access-token lifetime.
- **The token** is kept in `localStorage`. The interceptor attaches it only to URLs
  under `apiBaseUrl`. Font, image and screenshot fetches never carry it.
- **Route guards are cosmetic.** They decide what the SPA renders. Every gated page loads
  its data from the API, which re-checks the JWT and the role on each request.
- **The public projection is deliberately thin:** IGN, role, officer notes and a derived
  `registered` flag. It carries no Discord handles, UIDs or PIDs. Notes are public **by
  design**, so officers should write nothing in them they would not post on the home
  page.

## Browser-side controls

- **CSP** as a `<meta>` tag in `src/index.html` (GitHub Pages cannot send headers):
  - `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
  - Scripts from `'self'` and YouTube only. The build inlines no script; keep it that way.
  - `connect-src` allows the API, the Discord CDN and Google Fonts. The profile modal's
    screenshot (`html-to-image`) fetches the avatar and fonts to inline them.
  - `style-src 'unsafe-inline'` is required by Angular.
- **XSS.** The only `[innerHTML]` sinks are event articles (the public feed and the
  Manage preview).
  - Both go through `sanitize(SecurityContext.HTML, …)`, with image URLs
    attribute-escaped first.
  - Since 2026-11-21, author-written `class` attributes are also stripped. Tailwind
    utilities are global, so `class="fixed inset-0 z-50"` could otherwise lay a
    full-page link over `/schedule`.
  - The only `bypassSecurityTrustResourceUrl` builds a YouTube embed URL from a
    hard-coded id checked against `[A-Za-z0-9_-]{11}`.
  - Player-supplied names are only ever interpolated as text.
- **Clickjacking.** `public/spa-restore.js` carries a JavaScript framebuster. It is
  best-effort, because a meta CSP cannot set `frame-ancestors`.
- **Dev login.** The `/auth/dev` bypass runs only in a non-production build served from
  `localhost`. The backend also refuses it unless `DEV_AUTH_ENABLED` is set and the
  environment is not Production.

## Backend controls (summary; details in `wwm-backend`)

- **Startup guards.** Production refuses to start without a ≥32-character
  `JWT_SIGNING_KEY` or `CORS_ALLOWED_ORIGINS`.
- **CORS and headers.** CORS is an explicit origin list, with no credentials, plus a
  middleware that rejects unknown `Origin`s. HSTS, the HTTPS redirect, `nosniff`,
  `X-Frame-Options: DENY` and `Referrer-Policy` are all set.
- **Rate limits** per IP: 120/min globally, 10/min on `/auth/*`, 5/min on `/register`.
- **Bot and internal calls** authenticate with `X-Bot-Key` / `ADMIN_KEY` in headers,
  compared in constant time. An empty key fails closed.
- **Roles.** Only an Admin may edit, retire or re-link a Commander/Admin row. Since
  2026-11-21 that applies to the bot's `/gmemadd` and `/gmemkick` paths as well as the
  site's member editor.
- **SQL** is parameterised throughout. Image proxies fetch by id against host and path
  allow-lists. Unhandled exceptions return a generic `server_error`.
- **Footage links** filed from the bot must be YouTube videos. They are stored in
  canonical form, and the bot's public post sets `AllowedMentions.None`.

## CI / supply chain

- `deploy.yml` runs only on `push` to `main` and on `workflow_dispatch`. It has no
  `pull_request_target`, no `${{ github.event.* }}` inside `run:`, and no repo secrets.
- `actions/checkout` uses `persist-credentials: false`, so the `contents: write` token
  is **not** in `.git/config` while `npm ci` runs dependency install scripts. Only the
  final push step receives it.
- Dependencies are kept current. On 2026-11-21: Angular 22, TypeScript 6.0 (the newest
  Angular 22 supports), and `npm audit` showed 0 vulnerabilities. Re-run `npm audit` after
  every dependency change.

## Open items / accepted risks

- **The refresh credential is the access token itself, held in `localStorage`.** Any XSS
  or malicious extension that reads it gets up to 7 days of renewals, unless the member
  signs out (epoch bump) or is disabled. Stronger options:
  - a rotating, opaque refresh token in an HttpOnly cookie on the API origin, with the
    access token held only in memory;
  - a shorter grace period for renewing expired tokens.
- **One shared `ADMIN_KEY`** guards the Functions triggers, the game-token intake and
  the capture hook. Giving the token intake its own key would limit the damage if a
  local relay or capture machine were compromised.
- **Registration review is the safeguard for unclaimed rows.**
  - An applicant can match an unclaimed roster row by IGN alone, and the public roster
    shows which rows are unclaimed.
  - Approval can fall back to the self-declared Discord handle.
  - Officers should confirm identity before approving.
- **Security headers.** A real CSP header with `frame-ancestors` and reporting needs a
  host that can send headers. One option is Cloudflare in front of a custom domain (see
  the note below).
- **CSP `script-src` trusts the whole `www.youtube.com` origin.** No bypass is known, but
  a nonce or `strict-dynamic` policy would be tighter. `connect-src https://discord.com`
  looks unused.
- **Git history.** The purged paths (`backend/`, `data/`, `frontend/data/`, `*.enc`) have
  no objects left in any local branch. Whether GitHub has garbage-collected the old
  commits can only be confirmed by GitHub Support. See [`HISTORY-SCRUB.md`](HISTORY-SCRUB.md).

**If the API moves behind Cloudflare** (custom domain), lock the Azure origin so it
cannot be reached directly: allow only Cloudflare's IP ranges, or require a secret header
added by a Transform Rule. Then switch the rate limiter to `CF-Connecting-IP`. Without
that change, every visitor shares the few Cloudflare edge IPs' rate-limit buckets.
Update `environment.prod.ts` and the CSP's `connect-src`/`img-src` together.

## History

- **Until 2026-07-30 the site was static.** Data shipped as `data/*.enc` files, whose
  AES key was in the bundle. Encryption and route guards were UI conveniences, not
  confidentiality: the bundled key was verified to decrypt the full roster. The
  backend replaced all of it. Anything published back then stays published, and the
  old key and roster remain in git history until it is rewritten.
- **Owner actions completed (verified 2026-07-09):**
  - The exposed Google API key (`AIzaSy…Z57M`) is dead.
  - The sheet is private, shared only with the sync service account.
  - Sync authenticates with that service account. `DATA_ENCRYPTION_KEY` and the
    `GOOGLE_API_KEY` secret are obsolete.
- **Earlier fixes** (2026-07, static era):
  - Removed the bundled Google API key and the `/sheet` debug route.
  - Dropped the stale plaintext `footages.json`.
  - Sanitized event descriptions instead of using `bypassSecurityTrustHtml`.
  - Stopped exporting UID/PID, because IGN + UID is what registration accepts as proof
    of identity.
  - Added the CSP.
- **OAuth** moved from the implicit grant (`response_type=token`) to the
  authorization-code flow with the backend.
