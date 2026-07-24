# WWM Backend

Server-side trust boundary + data store for the WWM guild site, implementing
[`PLAN.md`](./PLAN.md). Replaces the "Google Sheet → GitHub Actions → static
`*.enc`" path with **Azure SQL** + an **ASP.NET Core Minimal API** (JWT-gated) +
**Azure Functions** (timer sync). Built on **.NET 10**.

> Status: code complete and compiling; **Azure resources are not provisioned by
> this repo** — follow the runbook below. The frontend keeps using the static
> path until you flip `environment.useBackend`.

## Solution layout

```
backend/
  WwmBackend.slnx
  src/
    Wwm.Data/   EF Core entities, WwmDbContext, Migrations
    Wwm.Core/   sheet↔entity mappers, DTOs, youtube/hashing, Google Sheets + wwmdb clients
    Wwm.Api/    Minimal API: public / auth / member / commander / admin route groups
    Wwm.Sync/   Azure Functions (isolated): SheetSyncFn, StatsSyncFn, ManualSyncHttpFn
```

## What's public vs gated (security model)

| Surface | Access |
|---|---|
| `GET /api/public/events`, `/schedule`, `/roster` (safe projection), `/config` | anonymous, cached (ETag) |
| `POST /api/auth/discord/exchange` | anonymous (Discord Authorization Code → app JWT) |
| `GET /api/member/roster`, `/player-stats`, `/inner-ways`, `/sets`, `/matches` | any member (JWT) |
| `GET /api/member/matches` footage URLs | included only with `ftp` |
| `GET /api/member/footages`, `/formation` | `ftp` / `fp` |
| `GET/PATCH /api/commander/members` | Commander+ (role-grant policy enforced) |
| `GET/PATCH /api/admin/features`, `/audit`, `POST /admin/sync/{source}` | Admin |

Anonymous visitors see only the homepage (Events, Schedule, safe roster grid).
Discord handles and permission flags never leave the server for anonymous users.

## Configuration & secrets

Set as App Service / Function App application settings (never commit them).

| Setting | Used by | Purpose |
|---|---|---|
| `SQL_CONNECTION_STRING` | Api, Sync | Azure SQL connection |
| `JWT_SIGNING_KEY` | Api | HMAC secret for app JWTs (≥32 chars). **Required in prod** — the app refuses to start on the dev default. |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Api | Authorization Code exchange |
| `CORS_ALLOWED_ORIGINS` | Api | comma-separated SPA origins (GitHub Pages). **Required in prod.** |
| `RESTRICT_TO_FRONTEND` | Api | default `true` — hard-reject browser requests from origins not on the CORS list. Set `false` to disable. |
| `ADMIN_KEY` | Api, Sync | shared key for the manual sync trigger |
| `FUNCTION_SYNC_URL` | Api | `https://<funcapp>.azurewebsites.net/api/sync` |
| `AUTO_MIGRATE` | Api | `true` → apply EF migrations + seed feature flags on startup |
| `DEV_AUTH_ENABLED` | Api | `true` → enables `POST /api/auth/dev` (local dev only) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` / `GOOGLE_SHEET_ID` | Sync | Sheets service-account auth |
| `WWMDB_TOKEN` / `WWMDB_ALLOWED_REGIONS` | Sync | wwmdb relay (token rotatable; default region `SEA`) |
| `SYNC_CRON_SHEET` / `SYNC_CRON_STATS` | Sync | NCRONTAB cadence (default `0 0 */6 * * *` / `0 0 21 * * *`) |
| `AzureWebJobsStorage` | Sync | Functions storage (also holds the change-detection hashes) |

## Discord Authorization Code setup

1. Discord Developer Portal → app `1512670533093949570` → OAuth2.
2. Add the SPA origin as a **redirect URI** (e.g. `https://<user>.github.io/wwm/`
   and `http://localhost:4200/` for dev).
3. Copy the **client secret** into `DISCORD_CLIENT_SECRET` on the App Service.
   The secret never ships to the browser.

## Local development

```bash
# 1. Database (LocalDB or a SQL Server container)
cd backend
export SQL_CONNECTION_STRING='Server=(localdb)\MSSQLLocalDB;Database=Wwm;Trusted_Connection=True;TrustServerCertificate=True'
dotnet ef database update --project src/Wwm.Data --startup-project src/Wwm.Data

# 2. API (set DEV_AUTH_ENABLED=true so the SPA localhost bypass can get a token)
DEV_AUTH_ENABLED=true JWT_SIGNING_KEY=dev-32-char-minimum-key-please-xxxxx dotnet run --project src/Wwm.Api

# 3. Functions (needs Azure Functions Core Tools + Azurite for storage)
#    Fill src/Wwm.Sync/local.settings.json, then:  func start

# 4. Frontend against the backend: set environment.ts useBackend=true, then
cd ../frontend && npx ng serve
```

## Azure provisioning (free tier) — runbook

1. **Resource group** in a region offering the SQL free offer (near SEA players).
2. **Azure SQL Database** — free GP **serverless** offer; set **auto-pause delay
   = 1 hour**, min vCore. Capture the connection string. (The vCore-second budget
   is the binding constraint — see PLAN §6; the sync avoids waking the DB unless
   data changed.)
3. **App Service** — Linux **F1 (free)** + plan. Deploy `Wwm.Api`. Set all Api
   settings above; set `AUTO_MIGRATE=true` for the first boot (creates schema +
   seeds feature flags).
4. **Function App (Consumption)** + its Storage Account (one, shared). Deploy
   `Wwm.Sync`. Set all Sync settings.
5. **CI/CD:** set repo variable `DEPLOY_BACKEND=true`, `AZURE_WEBAPP_NAME`,
   `AZURE_FUNCTIONAPP_NAME`, and the two publish-profile secrets
   (`AZURE_WEBAPP_PUBLISH_PROFILE`, `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`).
   `backend.yml` then builds and deploys on push.

## First data load (backfill)

The initial load is just the first sync run against the live sheet/relay (same
idempotent mappers as the incremental sync):

```
POST https://<funcapp>.azurewebsites.net/api/sync/all   header: X-Admin-Key: <ADMIN_KEY>
```

or wait for the timers. On INSERT, members bootstrap their role from the sheet
(`shinigamae`→Admin, `📳 Caller`→Commander); thereafter role/permissions are
app-managed and never overwritten by the sync (PLAN §9). Feature flags are seeded
by the API on first `AUTO_MIGRATE` boot.

## Flip the frontend to the backend

In `frontend/src/environments/environment.prod.ts` set `useBackend: true` and
`apiBaseUrl` to the App Service origin + `/api` (injected at build time), then
deploy. Guards + the JWT interceptor take over; the static `*.enc` path is no
longer used.
