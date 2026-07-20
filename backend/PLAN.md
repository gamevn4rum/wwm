# WWM Backend — Implementation Plan (hand-off spec)

> **Status:** design approved, not yet implemented.
> **Audience:** the next engineer/Claude session that will build this. This doc is
> self-contained — read it top to bottom and you can start coding without
> re-investigating the frontend.
> **Last updated:** 2026-07-20.

---

## 0. TL;DR

Replace the current "Google Sheet → GitHub Actions → static `data/*.enc` files"
data path with a real backend:

- **Azure SQL Database** (free serverless offer) as the data store.
- **ASP.NET Core Minimal API** on **Azure App Service (Linux, F1 free)** serving
  **REST** (not gRPC — see §3) to the Angular SPA, with a real server-side auth
  boundary so gated data (roster PII, footage URLs, player stats) is only
  returned to authorized Discord members.
- **Azure Functions (Consumption, timer-triggered)** as the sync engine that
  pulls from the Google Sheet and from the third-party wwmdb relay and upserts
  into SQL. Designed for **minimal cost** (see §6).

**The Google Sheet stays the guild's editing surface** for the entire build —
members keep editing the sheet; the Function syncs it into SQL. Retiring the
sheet (admin CRUD in the API) is an explicit later phase, out of scope here.

Everything targets Azure **free tier**; the only non-zero cost is the Function
App's required Storage Account (a few cents/month) — §6 minimizes even that.

---

## 1. Goals / non-goals / constraints

### Goals
1. A server-side trust boundary: gated data leaves the server only for
   authorized members (fixes the core `SECURITY.md` limitation — today the AES
   key ships in the browser bundle, so `*.enc` is effectively public).
2. Azure SQL as the source of truth for *serving* (sheet remains source of truth
   for *editing roster identity* until retired).
3. Keep total Azure cost at ~$0 (free tiers + negligible storage).
4. Minimal, contained frontend changes (swap data-service fetch targets).
5. **Admin & Commander management** (see §9A): role-based back-office pages so
   Admins can toggle pages/features on/off, and Commanders can edit member
   permissions (can-login / formation / footage …) and roles — enforced
   server-side. These are the first *write* paths in the system.

### Non-goals (this phase)
- **Full roster CRUD / retiring the Google Sheet.** The sheet stays the editing
  surface for roster *identity* (IGN, weapons, availability, notes). We add write
  endpoints only for the app-owned slice — permissions, roles, and feature flags
  (see §5 + §9 ownership split). Full member add/remove and sheet retirement
  remain a later phase.
- **Commander event/article posting** — requested but explicitly deferred (§9A);
  the `Event` table + endpoint are sketched so it drops in later without rework.
- Normalizing the deeply-nested game data (gear/inner-ways) into full relational
  tables — stored as JSON columns for now (§5).
- Real-time updates / websockets. Sync cadence is minutes-to-hours; fine.

### Hard constraints
- **App Service F1:** 60 CPU-min/day, 1 GB RAM, shared, **no Always-On**, cold
  starts. `[1]`
- **Azure SQL free offer:** GP **serverless**, **100,000 vCore-seconds/month** +
  32 GB data + 32 GB backup, auto-pause; up to 10 DBs/subscription; lifetime of
  subscription. `[2]`  → The vCore-second budget is the real constraint and
  drives the cost design in §6.
- **Azure Functions Consumption:** free grant **1M executions + 400,000 GB-s /
  month**. Our load is trivially under this; the Storage Account it requires is
  *not* in the grant. `[3]`

---

## 2. Current state (what you're replacing)

Angular 21 SPA, served statically from GitHub Pages (`gh-pages` branch, `docs/`).
No runtime backend today. Relevant code:

| Concern | File(s) |
|---|---|
| Sheet fetch (sync) | `scripts/fetch-data.js` (Members, Schedule, Match History, Events) |
| 3rd-party stats fetch | `scripts/fetch-player-stats.js` (wwmdb.vlt.fyi → player-stats, inner-ways, sets) |
| Client-side AES decrypt | `src/app/core/utils/crypto.utils.ts`, `scripts/encrypt-data.js` |
| Data services (fetch targets) | `src/app/**/**-data.service.ts` (one per entity) |
| Auth | `src/app/core/services/discord-auth.service.ts` (Discord implicit flow, client-side) |
| Route guards | `src/app/core/guards/{formation,footage}.guard.ts` |
| Intended server boundary (never deployed) | `scripts/apps-script-gateway.gs` (reference for the auth logic we now implement for real) |
| CI/CD | `.github/workflows/{sync-sheets,sync-player-stats,deploy}.yml` |

**Read the security context first:** `SECURITY.md`. The whole point of a real
backend is the trust boundary it documents as missing.

### Data classification (drives which API surface serves what)

| Entity | Today's file | Class | Notes |
|---|---|---|---|
| Members (roster) | `members.enc` | 🔒 gated (PII) | Discord handles, permissions |
| Matches | `match-history.enc` | 🔒 gated | carries per-uploader footage URLs |
| Footages | *(derived from Matches)* | 🔒 gated | flattened view, no own storage |
| Player-stats | `player-stats.enc` | 🔒 gated | per-member in-game data, nested |
| Events | `events.json` | 🌐 public | |
| Schedule | `schedule.json` | 🌐 public | |
| Inner-ways catalogue | `inner-ways.json` | 🌐 public/static | ~97 rows, nested |
| Sets catalogue | `sets.json` | 🌐 public/static | ~67 rows, nested |

---

## 3. Transport decision: REST (settled)

**REST via ASP.NET Core Minimal APIs.** Rationale (chosen over gRPC on both
"resources" and "security"):

- Consumer is a **browser** → REST is native (`HttpClient`); gRPC needs
  gRPC-Web + a proxy/bridge (extra surface, no upside here).
- **F1 free tier**: gRPC needs HTTP/2 end-to-end, is Linux-only / Windows-preview,
  and depends on site config F1 doesn't reliably expose. REST just works. `[1]`
- At this scale (~42 members, ~57 matches) gRPC's binary/streaming gains are
  irrelevant; the real resource saver is **HTTP caching (ETag/Cache-Control) on
  public endpoints**, which REST gets for free and cuts both F1 CPU-minutes and
  SQL vCore-seconds.
- Security parity with less to secure (managed TLS + JWT + CORS + rate-limit vs.
  the same plus a gRPC-Web bridge).

Do **not** revisit this without a new requirement (e.g. server-to-server
streaming) that changes the calculus.

---

## 4. Target architecture

```
   Google Sheet ─────────────►┐
   (editing surface, stays)    │   Azure Functions (Consumption, Timer)
   wwmdb.vlt.fyi ─────────────►│    • SheetSyncFn  (schedule, change-detect → upsert)
   (3rd-party relay)           │    • StatsSyncFn  (daily, change-detect → upsert)
                               └────────────────┬───────────────────────
                                                │ upsert only when changed (§6)
                                                ▼
   Angular SPA ───────────────►  Azure SQL Database (GP serverless, free)
   (GitHub Pages)                                ▲
        │  REST + JWT                            │ EF Core
        ▼                                        │
   Azure App Service (Linux F1)  ASP.NET Core Minimal API
    • /api/public/*   anon, cached
    • /api/member/*   JWT + membership/permission
    • /api/auth/discord   Discord token → app JWT
```

---

## 5. Database schema

**Hybrid:** relational for flat, queried guild entities; **JSON columns**
(`NVARCHAR(MAX)` + `ISJSON` check, read/written whole) for the deeply-nested,
upstream-shaped game data that's regenerated wholesale each sync. Rationale:
the client consumes gear/inner-way/set objects as blobs and never filters on
their inner fields, so a 15-table normalization buys nothing here.

```sql
-- ── Relational core ────────────────────────────────────────────────
-- Column ownership (critical — see the §9 sync rule):
--   [S] sheet-owned : sync overwrites on every run
--   [A] app-owned   : sync sets only on INSERT (bootstrap); NEVER overwrites on
--                     UPDATE, so Commander/Admin edits are preserved
CREATE TABLE Member (
  Id                  INT IDENTITY PRIMARY KEY,
  Ign                 NVARCHAR(100) NOT NULL UNIQUE, -- [S]
  Discord             NVARCHAR(100) NULL,            -- [S] auth join key (case-insensitive match)
  MainWeapon          NVARCHAR(60)  NULL,            -- [S]
  SecondaryWeapon     NVARCHAR(60)  NULL,            -- [S]
  Role                NVARCHAR(40)  NULL,            -- [A] Admin|Commander|Warrior; Commander-editable (bootstrap from sheet)
  Team                NVARCHAR(40)  NULL,            -- [S]
  CanLogin            BIT NOT NULL DEFAULT 1,        -- [A] gates the whole authenticated session (new permission)
  FormationPermission BIT NOT NULL DEFAULT 0,        -- [A] fp  (bootstrap from sheet '✅' → 1)
  FootagePermission   BIT NOT NULL DEFAULT 0,        -- [A] ftp (bootstrap from sheet '✅' → 1)
  Saturday            NVARCHAR(20)  NULL,            -- [S]
  Sunday              NVARCHAR(20)  NULL,            -- [S]
  Notes               NVARCHAR(500) NULL,            -- [S]
  UpdatedBy           NVARCHAR(100) NULL,            -- [A] last editor username (audit)
  UpdatedUtc          DATETIME2     NULL             -- [A]
);

-- Opponent guilds (and, if useful, our own). Matches reference a guild by id
-- instead of a free-text name. Guild identity may later map to NetEase's guild
-- id (the `Guild {"id":…}` API documented in data-migration.html); name-based
-- for now.
CREATE TABLE Guild (
  Id             INT IDENTITY PRIMARY KEY,
  Name           NVARCHAR(100) NOT NULL UNIQUE,        -- opponent name as it appears in the sheet
  Tag            NVARCHAR(20)  NULL,
  Region         NVARCHAR(20)  NULL,
  NeteaseGuildId NVARCHAR(40)  NULL,                   -- reserved for Route-A/official id (future)
  Notes          NVARCHAR(300) NULL
);

-- Optional: fold opponent-name spelling variants → one Guild during migration.
CREATE TABLE GuildAlias (
  Alias   NVARCHAR(100) PRIMARY KEY,
  GuildId INT NOT NULL REFERENCES Guild(Id)
);

CREATE TABLE Season (
  Id        INT IDENTITY PRIMARY KEY,
  Name      NVARCHAR(40) NOT NULL UNIQUE,
  StartDate DATE NULL, EndDate DATE NULL
);

CREATE TABLE Match (
  Id         INT IDENTITY PRIMARY KEY,
  OppGuildId INT NOT NULL REFERENCES Guild(Id),        -- opponent (was free-text `Opponent`)
  [DateTime] DATETIME2 NULL,                           -- sheet gives a date; time may be 00:00
  Type       NVARCHAR(20) NULL,                        -- league | ranked | scrim
  Status     NVARCHAR(4)  NULL,                        -- ✅ | ❌ | ➕  (result, GameVN's perspective)
  SeasonId   INT NULL REFERENCES Season(Id)            -- was free-text `Season`
);

CREATE TABLE Footage (                                 -- was MatchFootage; stores the full link
  Id          INT IDENTITY PRIMARY KEY,
  MatchId     INT NOT NULL REFERENCES Match(Id) ON DELETE CASCADE,
  Uploader    NVARCHAR(40) NOT NULL,
  YoutubeLink NVARCHAR(300) NOT NULL                   -- full URL; API derives videoId for the DTO
);

CREATE TABLE Event (
  Id          INT IDENTITY PRIMARY KEY,
  Pin         BIT NULL,
  EventDate   DATE NULL,
  Title       NVARCHAR(200) NOT NULL,
  Description NVARCHAR(MAX) NULL,
  Banner      NVARCHAR(500) NULL,
  P1 NVARCHAR(500) NULL, P2 NVARCHAR(500) NULL, P3 NVARCHAR(500) NULL,
  P4 NVARCHAR(500) NULL, P5 NVARCHAR(500) NULL,
  Link        NVARCHAR(500) NULL
);

CREATE TABLE ScheduleItem (
  Id       INT IDENTITY PRIMARY KEY,
  DateTime NVARCHAR(60)  NULL,
  Type     NVARCHAR(40)  NULL,
  Activity NVARCHAR(200) NOT NULL
);

-- ── JSON-column store (regenerated wholesale by sync) ──────────────
CREATE TABLE PlayerStat (
  Id      INT IDENTITY PRIMARY KEY,
  Ign     NVARCHAR(100) NOT NULL UNIQUE,              -- maps to Member.Ign
  Matched BIT NOT NULL,
  Reason  NVARCHAR(30) NULL,                          -- not_found|name_mismatch|region_mismatch|no_detail|error
  Detail  NVARCHAR(MAX) NULL CHECK (Detail IS NULL OR ISJSON(Detail)=1)  -- PlayerDetail JSON
);

CREATE TABLE InnerWayCatalogue (
  Id   INT PRIMARY KEY,                               -- upstream id
  Name NVARCHAR(120) NULL,
  Data NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Data)=1)  -- full InnerWayCatalogueEntry JSON
);

CREATE TABLE SetCatalogue (
  Id   INT PRIMARY KEY,
  Name NVARCHAR(120) NULL,
  Data NVARCHAR(MAX) NOT NULL CHECK (ISJSON(Data)=1)  -- full SetCatalogueEntry JSON
);

-- ── Sync bookkeeping (change detection lives mostly in the Function; this is
--    the DB-side record of the last applied state) ──────────────────
CREATE TABLE SyncState (
  Source     NVARCHAR(40) PRIMARY KEY,                -- 'members' | 'matches' | 'events' | 'schedule' | 'player-stats' | 'inner-ways' | 'sets'
  LastRunUtc DATETIME2 NOT NULL,
  LastHash   NVARCHAR(64) NOT NULL                    -- md5/sha of applied payload
);

-- ── Back-office: feature flags + audit (app-owned, never synced) ───
CREATE TABLE FeatureFlag (
  [Key]      NVARCHAR(60) PRIMARY KEY,                -- 'page.formation'|'page.footages'|'page.schedule'
                                                      -- |'page.match-history'|'page.events'|'page.roster-stats'
                                                      -- |'feature.register'|'feature.login' …
  Enabled    BIT NOT NULL DEFAULT 1,
  Label      NVARCHAR(120) NULL,                      -- human label for the admin UI
  UpdatedBy  NVARCHAR(100) NULL,
  UpdatedUtc DATETIME2 NULL
);

CREATE TABLE AuditLog (                                -- who changed what (permissions/roles/flags)
  Id         INT IDENTITY PRIMARY KEY,
  ActorName  NVARCHAR(100) NOT NULL,                  -- Discord username of the Admin/Commander
  Action     NVARCHAR(60)  NOT NULL,                  -- 'member.permission.update'|'member.role.update'|'feature.toggle'
  TargetType NVARCHAR(40)  NOT NULL,                  -- 'Member' | 'FeatureFlag'
  TargetId   NVARCHAR(100) NOT NULL,
  BeforeJson NVARCHAR(MAX) NULL,
  AfterJson  NVARCHAR(MAX) NULL,
  Utc        DATETIME2 NOT NULL
);
```

### Exact field provenance (so mapping is unambiguous)

Sheet columns are read case-insensitively via `findVal` in the frontend today;
replicate that tolerance in the sync mapper.

- **Member** ← Members tab: `Discord`, `IGN`, `Main Weapon`, `Secondary Weapon`,
  `Role`, `Team`, `Formation Permission` (✅→bit), `Footage Permission` (✅→bit),
  `Saturday`, `Sunday`, `Notes`.
- **Guild** ← distinct `Opponent` values across Match History
  (create-on-first-seen; use `GuildAlias` to fold spelling variants).
- **Season** ← distinct `Season` values (may be absent).
- **Match** ← Match History tab: `Opponent` → `OppGuildId` (required; skip empty),
  `Date` (DD/MMM/YYYY → `[DateTime]`), `Type`, `Win`→`Status`, `Season`→`SeasonId`.
- **Footage** ← Match History per-uploader columns: `Kam, Necro, Ruby, VK,
  Yuenshin, canoc, Sniper, LVH, choxu` (frontend `UploaderKey` also permits
  `MADAFAKA, MinhVũ, Initiate`). Cell = YouTube URL → store as `YoutubeLink`;
  the API derives `videoId` from it (reuse `src/app/core/utils/youtube.utils.ts`).
- **Event** ← Events tab: `Pin, Date, Title` (required), `Description, Banner,
  P1..P5, Link`.
- **ScheduleItem** ← Schedule tab: `DateTime, Type, Activity` (required).
- **PlayerStat / InnerWayCatalogue / SetCatalogue** ← produced by the stats sync
  (port of `scripts/fetch-player-stats.js`); already JSON-shaped. Keep the strict
  field allow-list — upstream Player response contains a real account email that
  is **never** to be persisted (see the PRIVACY note in that script).

Typed model shapes to preserve (frontend expects these): see
`src/app/features/**/**.model.ts` for `Player`, `MatchRecord`/`FootageEntry`,
`FootageRecord`, `EventRecord`, `ScheduleRecord`, `PlayerStatsRecord`/`PlayerDetail`,
`InnerWayCatalogueEntry`, `SetCatalogueEntry`. API DTOs should serialize to these
shapes so the frontend change is just the fetch target. In particular the
normalized Match/Footage tables are **flattened back** in the DTO —
`opponent` = `Guild.Name`, `season` = `Season.Name`, `videoId` = derived from
`Footage.YoutubeLink` — so `MatchRecord` / `FootageEntry` / `FootageRecord` stay
byte-for-byte compatible with today's frontend.

---

## 6. Cost-minimization design (the important part)

The binding cost constraint is **Azure SQL serverless vCore-seconds**, not the
Function grant. A serverless DB bills compute whenever it's *awake*, and **any
query wakes it**; it only auto-pauses after an idle window (min 1 hour). So the
enemy is *waking the DB more than necessary*. Two rules:

1. **The sync must not wake the DB unless data actually changed.**
   Do change detection **inside the Function, without touching SQL**:
   - Fetch the sheet/relay payload.
   - Compute a hash of the normalized payload.
   - Compare against the **last hash stored in the Function's own Storage
     (a small blob or Table)** — cheap, not SQL.
   - **Only if the hash differs** open a SQL connection and upsert, then update
     both the blob hash and the `SyncState` row.
   Guild data changes infrequently, so the vast majority of runs never wake SQL.

2. **The API must rarely hit the DB.** Cache public endpoints hard
   (`Cache-Control` + `ETag`); serve from an in-process memory cache with a
   short TTL so bursts of page views collapse to one DB read (or zero while
   cached). Static catalogues (inner-ways, sets) get long TTLs.

Additional knobs:
- **Sync cadence is configurable** via the timer CRON in app settings. Default to
  a modest cadence (e.g. every 3–6 hours for the sheet, once daily for stats)
  rather than hourly — freshness is not latency-critical for a guild page, and
  fewer runs = fewer potential DB wake-ups. Add a `workflow_dispatch`-equivalent
  **manual HTTP trigger** (admin-key protected) for "sync now" after an edit.
- **One Function App hosts both timer functions** → one Storage Account, one plan.
- Keep function executions short (lightweight HTTP + batched upsert) to stay well
  under the 400,000 GB-s grant.
- Set the DB **auto-pause delay to the minimum (1 hour)** so it pauses quickly
  once idle.

Expected steady-state: DB awake only during the occasional *changed* sync and
during actual visitor traffic — comfortably inside 100,000 vCore-s/month.

---

## 7. API contract

Base URL: App Service origin. All responses JSON, shapes matching the frontend
models (§5).

### Public (anonymous, cached)
```
GET /api/public/events        → EventRecord[]        Cache-Control: public, max-age=300
GET /api/public/schedule      → ScheduleRecord[]     Cache-Control: public, max-age=300
GET /api/public/inner-ways    → InnerWayCatalogueEntry[]  max-age=86400 (static)
GET /api/public/sets          → SetCatalogueEntry[]       max-age=86400 (static)
GET /api/public/matches       → MatchRecord[] w/ footages[] STRIPPED   (results only, anon)
GET /api/public/config        → { features: { "page.formation": true, … } }   max-age=60
```
All return `ETag`; honor `If-None-Match` → `304`. `/config` lets the SPA know
which pages/features are enabled (§9A).

### Auth
```
POST /api/auth/discord
  body: { discordAccessToken: string }
  server: validates token via GET https://discord.com/api/users/@me,
          looks up Member by Discord handle (case-insensitive),
          computes role/fp/ftp from Member row,
          returns { token: <app JWT>, session: DiscordUserSession }
  errors: 401 invalid_token | 403 not_a_member
```
`DiscordUserSession` = `{ username, avatarUrl, isAuthorized, role, canLogin, fp, ftp }`.
Role/permissions come from the **app-managed `Member` row** (§5 + §9 ownership),
not the sheet: `role` = `Member.Role` mapped to `Admin | Commander | Warrior`
(bootstrap default from the sheet; `shinigamae` seeded as `Admin`);
`canLogin`/`fp`/`ftp` from their columns. If `CanLogin = 0` → 403 `login_disabled`
and no session/JWT is issued.

App JWT claims: `sub`(username), `role`, `fp`, `ftp`; short TTL (e.g. 1 h);
HMAC-signed with a server secret. **Never trust role/permission from the client.**

### Member-gated (`Authorization: Bearer <app JWT>`)
```
GET /api/member/roster        → Player[] / full Member rows   (any member)
GET /api/member/player-stats  → PlayerStatsRecord[]           (any member)
GET /api/member/matches       → MatchRecord[] w/ footages[]   (requires ftp)
GET /api/member/footages      → FootageRecord[]               (requires ftp)
GET /api/member/formation     → formation data                (requires fp)
```
Authorization middleware: reject if no/invalid JWT (401); if endpoint needs
fp/ftp and claim is false (403). Mirror the current `formationGuard`/`footageGuard`
semantics but enforced **server-side**.

### Commander (role: Commander or Admin — see §8/§9A)
```
GET   /api/commander/members          → editable list: { id, ign, discord, role,
                                          canLogin, fp, ftp }
PATCH /api/commander/members/{id}     body: { canLogin?, fp?, ftp?, role? }
                                        → update app-owned permission/role fields; audited.
                                          Role changes are policy-bounded (§8): a Commander
                                          cannot grant Commander/Admin nor edit an Admin.
POST  /api/commander/events           → create Event/article   [DEFERRED — see §9A]
```

### Admin (role: Admin — superset of Commander)
```
GET   /api/admin/features             → all FeatureFlag rows
PATCH /api/admin/features/{key}       body: { enabled }  → toggle a page/feature; audited
GET   /api/admin/audit                → recent AuditLog entries
POST  /api/admin/sync/{source}        header: X-Admin-Key → on-demand sync trigger
```
An Admin JWT satisfies every Commander route too.

---

## 8. Auth design (Discord → app JWT)

Today: Discord **implicit flow** entirely client-side, token in `localStorage`,
permissions recomputed from the (public) members file each load.

Target:
- SPA still obtains a Discord token, but now **posts it to `/api/auth/discord`**;
  the server validates it against Discord and mints an **app JWT** carrying
  role/fp/ftp. SPA stores the app JWT and sends it as bearer to `/api/member/*`.
  Server never trusts client-supplied claims; membership/permissions come from
  the SQL `Member` row.
- **Optional upgrade (recommended once server exists):** move Discord from the
  deprecated implicit flow to the **Authorization Code flow** — the App Service
  holds the client secret and does the code→token exchange. Cleaner and more
  secure than shipping tokens through the browser hash. Discord app (client id
  `1512670533093949570`) redirect URIs must be updated.
- Keep the `localhost` dev bypass behavior (inject an Admin/fp/ftp dev session)
  behind an env flag so local dev needs no Discord round-trip.

### Roles & authorization
Hierarchy: **Admin ⊇ Commander ⊇ Warrior** (Admin = the existing top role the
frontend calls `Creator`). Enforced by server-side policies, mirrored by client
guards for UX only:
- `Warrior` — normal member; gated pages via fp/ftp.
- `Commander` — Warrior + edit member permissions/roles + (deferred) post events.
- `Admin` — Commander + toggle pages/features + view audit + trigger sync.

**Role-grant policy (privilege-escalation guard):** a Commander may edit
Warrior-level permissions and set roles **up to Commander is NOT allowed** —
i.e. a Commander cannot grant `Commander` or `Admin`, and cannot modify a member
who is already `Admin`. Only an `Admin` can grant `Commander`/`Admin`. Enforce
this in the PATCH handler, not just the UI. (Exact matrix is an open decision —
§15.)

.NET **isolated worker**, Functions v4, **Timer trigger** + an HTTP trigger for
manual runs. Port the existing Node scripts' logic (auth, retry/backoff, date
normalization, field allow-lists) — they are battle-tested; don't reinvent.

### `SheetSyncFn` (timer, default every N hours — configurable)
1. Auth to Google Sheets with the **service account** (reuse the JWT-bearer grant
   logic from `scripts/fetch-data.js`; `GOOGLE_SERVICE_ACCOUNT_JSON`,
   `GOOGLE_SHEET_ID`). Sheet stays private, shared with the SA as Viewer.
2. Fetch tabs `Members!A:Z`, `Schedule!A:Z`, `Match History!A:Z`, `Events!A:J`.
3. Normalize (dates DD/MM/YYYY → DD/MMM/YYYY as today; then → ISO for DATE cols).
4. **Per source: hash payload; compare to last hash in Function Storage; skip if
   unchanged (no SQL).** On change: upsert into SQL (transactional per source),
   update blob hash + `SyncState`.
5. **Member ownership split (critical — enables Commander/Admin edits):** the
   Members upsert matches on `Ign`. On **INSERT** (new member) it sets *all*
   columns, incl. the `[A]` permission/role bootstrap from the sheet. On
   **UPDATE** it writes **only the `[S]` sheet-owned columns** and leaves `Role`,
   `CanLogin`, `FormationPermission`, `FootagePermission` untouched — so
   management edits are never clobbered by the sync (§5). Consequence: once a
   member exists, editing a permission column *in the sheet* has no effect;
   the app is authoritative for those. To avoid pointless syncs, hash **only the
   `[S]` columns** for the Members source.

### `StatsSyncFn` (timer, daily)
1. Requires current roster IGNs (query `Member` from SQL, or reuse the sheet
   fetch in-process to avoid waking SQL — prefer the latter for cost).
2. Port `scripts/fetch-player-stats.js`: the wwmdb Connect/RPC auth
   (`xor`+base64 bearer, `X-Request-Id` nonce), region guard (`SEA`), strict
   field allow-list (**drop the upstream account email**), catalogue fetches
   (inner-ways ~97, sets ~67) with the same gentle delays/backoff.
3. Same hash-then-upsert change detection into `PlayerStat`, `InnerWayCatalogue`,
   `SetCatalogue`.
4. `WWMDB_TOKEN` env-overridable (may rotate).

### Notes
- The DB writer is the **only** component that opens SQL in the sync path, and
  only on change — that's the cost guarantee.
- Match sync upserts opponent guilds first (`Opponent` → `Guild` via `GuildAlias`)
  and seasons, then `Match` (natural key: `OppGuildId` + `[DateTime]` + `Type`),
  then replaces its `Footage` rows (store the full `YoutubeLink`; the API derives
  `videoId`). Reuse `youtube.utils` for the derivation.

---

## 9A. Admin & Commander management (new pages)

Role hierarchy (§8): **Admin ⊇ Commander ⊇ Warrior**. Admin = the existing top
role (frontend `Creator`; seed `shinigamae`). All management is enforced
**server-side**; the SPA pages are just editors over the endpoints in §7.

### Capability matrix
| Capability | Warrior | Commander | Admin |
|---|:--:|:--:|:--:|
| View gated pages per fp/ftp | ✓ | ✓ | ✓ |
| Edit member permissions (canLogin, fp, ftp) | | ✓ | ✓ |
| Edit member role (bounded — §8) | | ✓ | ✓ |
| Post Event articles *(deferred)* | | ✓ | ✓ |
| Toggle pages/features on/off | | | ✓ |
| View audit log / trigger sync | | | ✓ |

### New frontend pages
- **`/admin`** (guard: role=Admin) — feature-flag dashboard: a toggle per page
  (`page.*`) and feature (`feature.*`), backed by `/api/admin/features`.
- **`/manage/members`** (guard: role≥Commander) — member table with editable
  `canLogin` / `fp` / `ftp` toggles and a `role` selector, backed by
  `/api/commander/members`; shows a confirmation on save (audited server-side).
- **Events posting** (deferred) — a "New article" action in the Events area for
  role≥Commander → `POST /api/commander/events`. Wait per the request; the
  `Event` table + endpoint already exist so this is additive only.

New guards: `adminGuard`, `commanderGuard` (mirror `formationGuard`/`footageGuard`
but assert the JWT `role` claim). Guards are UX only — the server re-checks every
request regardless.

### Feature-flag enforcement (both sides)
- **Frontend (cosmetic):** `GET /api/public/config` on boot → hide disabled nav
  items and block their routes via a `featureGuard('page.formation')`.
- **Backend (authoritative):** every endpoint behind a toggleable page checks its
  flag and returns **403/404** when disabled, so turning a page "off" actually
  stops serving its data — not just hiding the link. Admin/management routes are
  exempt so you can never lock yourself out.

### Seed data
Seed one `FeatureFlag` row per current route (all `Enabled=1`) and seed
`shinigamae` as `Admin`. `📳 Caller` members bootstrap to `Commander` on their
first sync INSERT; thereafter role is app-managed.

---

## 10. Solution structure (.NET)

```
backend/
  PLAN.md                       ← this file
  WwmBackend.sln
  src/
    Wwm.Api/                    ASP.NET Core Minimal API (App Service target)
      Program.cs                endpoints, auth, CORS, caching, rate-limit
      Endpoints/                public / member / auth / admin route groups
      Auth/                     Discord validation, JWT issuing, permission filters
      Dtos/                     shapes mirroring frontend models
    Wwm.Sync/                   Azure Functions app (isolated worker)
      SheetSyncFn.cs
      StatsSyncFn.cs
      ManualSyncHttpFn.cs
      Sources/                  GoogleSheetsClient, WwmdbClient (ports of the JS)
      ChangeDetection/          hash + blob-state store
    Wwm.Data/                   shared: EF Core DbContext, entities, migrations
      WwmDbContext.cs
      Entities/
      Migrations/
    Wwm.Core/                   shared mapping (sheet row → entity), normalization
  tests/
    Wwm.Tests/                  mapping + auth-permission unit tests, parity tests
```

Pin: **.NET 10**, ASP.NET Core Minimal API, **EF Core 10** (SQL Server provider),
Azure Functions **v4 isolated**. `Wwm.Data` + `Wwm.Core` shared by both API and
Functions so mapping/entities live in one place.

---

## 11. Phased task checklist (do in order)

### Phase 0 — Provision & scaffold
- [ ] Create resource group; **Azure SQL free** GP-serverless DB (auto-pause 1 h,
      min vCore); capture connection string.
- [ ] Create **Linux App Service F1** + App Service plan.
- [ ] Create **Function App (Consumption)** + its Storage Account (one shared).
- [ ] `dotnet new sln` + projects per §10; add EF Core, Azure Functions packages.
- [ ] Author `WwmDbContext` + entities (§5); create initial migration; apply to DB.

### Phase 1 — Sync engine (Functions → SQL)
- [ ] Port Google Sheets service-account auth + fetch (`fetch-data.js`).
- [ ] Port wwmdb client + catalogues + privacy allow-list (`fetch-player-stats.js`).
- [ ] Implement mappers (sheet row → entity), date/permission normalization,
      youtube-id extraction.
- [ ] Implement change-detection (Function-Storage hash → skip-unchanged → upsert).
- [ ] Wire `SheetSyncFn` (timer), `StatsSyncFn` (timer), `ManualSyncHttpFn` (admin).
- [ ] Verify SQL is populated and matches current `data/*.json` (parity check).

### Phase 1a — One-time data migration (Sheet/JSON → SQL backfill)
> There is **no migration script today**; the initial load is a one-time,
> idempotent backfill built on the same mappers as the sync. (`data-migration.html`
> in the repo root is a *data-sourcing research doc* about wwmdb/NetEase — not
> this.)
- [ ] Seed reference tables first: create `Guild` rows from the distinct
      `Opponent` values (+ `GuildAlias` for spelling variants) and `Season` rows
      from distinct seasons.
- [ ] Backfill `Member`, then `Match` (→ `OppGuildId`/`SeasonId`) and `Footage`
      (→ `YoutubeLink`), then `Event`, `ScheduleItem`, and the JSON-column game
      data (`PlayerStat`, `InnerWayCatalogue`, `SetCatalogue`).
- [ ] Source from the committed `data/*.json` (offline, deterministic) **or** a
      live sheet fetch; make every upsert **idempotent / re-runnable**.
- [ ] Bootstrap app-owned fields once here: seed `shinigamae`=`Admin`, map
      `📳 Caller`→`Commander`, `Formation/Footage Permission ✅`→bit, `CanLogin`=1;
      seed `FeatureFlag` rows (all enabled).
- [ ] Parity-check: row counts + spot-check DTO output equals current
      `data/*.json`. After this, the incremental sync reuses the Guild/Season rows.

### Phase 2 — REST API
- [ ] Public endpoints + memory cache + `ETag`/`Cache-Control` (§7).
- [ ] `/api/auth/discord`: Discord validation + JWT issuing (§8).
- [ ] Member endpoints + JWT auth + fp/ftp permission filters.
- [ ] CORS allow-list (GitHub Pages origin), rate-limiting, HTTPS-only.
- [ ] Admin sync-trigger endpoint (X-Admin-Key).

### Phase 2b — Back-office / management (roles, permissions, feature flags) — §9A
- [ ] Add `CanLogin`, `FeatureFlag`, `AuditLog` (+ `Member.UpdatedBy/UpdatedUtc`)
      to the model + migration; seed flags + `shinigamae`=Admin.
- [ ] Formalize role hierarchy + server-side policies (`adminGuard`/`commanderGuard`);
      implement the role-grant escalation guard (§8).
- [ ] Commander endpoints: list members, PATCH permissions/role (audited).
- [ ] Admin endpoints: features GET/PATCH, audit GET.
- [ ] `GET /api/public/config` + per-endpoint feature-flag enforcement.
- [ ] Frontend `/admin` + `/manage/members` pages, guards, and `featureGuard`.
- [ ] (Deferred) Commander event posting — leave endpoint stubbed.

### Phase 3 — Frontend integration (behind a flag)
- [ ] Add `environment.apiBaseUrl`; feature flag `useBackend`.
- [ ] Rewrite each `*-data.service.ts` to GET the API instead of `data/*.enc`;
      delete client AES path (`crypto.utils.ts` usage, `dataEncryptionKey`).
- [ ] Rework `discord-auth.service.ts`: post Discord token to `/api/auth/discord`,
      store app JWT, attach bearer via HTTP interceptor; keep localhost dev bypass.
- [ ] Guards read the server-verified session (unchanged UX).
- [ ] Parity test SPA against current output; flip flag; remove static-file path.

### Phase 4 — Cleanup / decommission (static path)
- [ ] Remove `scripts/encrypt-data.js`, `*.enc` publishing, `apps-script-gateway.gs`.
- [ ] Retire/repoint `sync-sheets.yml` / `sync-player-stats.yml` (sync now in Functions).
- [ ] Update `README.md` + `SECURITY.md` to the new architecture.

### Phase 5 — (out of scope, future) Retire the Google Sheet
- Admin CRUD endpoints + minimal admin UI; SQL becomes editing source of truth.

---

## 12. Configuration & secrets

| Setting | Where | Purpose |
|---|---|---|
| `SQL_CONNECTION_STRING` | App Service + Function App config | EF Core |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Function App config | Sheets auth (private sheet) |
| `GOOGLE_SHEET_ID` | Function App config | spreadsheet id |
| `WWMDB_TOKEN` | Function App config | 3rd-party relay (rotatable) |
| `WWMDB_ALLOWED_REGIONS` | Function App config | default `SEA` |
| `DISCORD_CLIENT_ID` | App Service | `1512670533093949570` |
| `DISCORD_CLIENT_SECRET` | App Service | only if moving to auth-code flow |
| `JWT_SIGNING_KEY` | App Service | app JWT HMAC secret |
| `ADMIN_KEY` | App Service + Function App | manual sync trigger |
| `SYNC_CRON_SHEET` / `SYNC_CRON_STATS` | Function App | configurable cadence |
| `CORS_ALLOWED_ORIGINS` | App Service | GitHub Pages origin |

Never log secrets; the Google SA JSON and wwmdb token are sensitive. Actions
logs are public — keep the existing diagnostic discipline (counts, yes/no only).

---

## 13. Local dev & testing
- **DB:** LocalDB / SQL Server container; `dotnet ef database update`.
- **Functions:** Azure Functions Core Tools + Azurite (local Storage emulator).
- **API:** `dotnet run` in `Wwm.Api`; SPA points `apiBaseUrl` at `localhost`.
- **Frontend:** keep the `localhost` Discord dev-bypass so no OAuth needed locally.
- **Tests (`Wwm.Tests`):** mapping (sheet row → entity, ✅→bit, date normalize,
  youtube-id extraction, footage privacy allow-list drops email); auth permission
  matrix (anon/member/fp/ftp × endpoints → 200/401/403); **parity** (API JSON for
  each entity deep-equals the current `data/*.json` shape).

---

## 14. Deployment (CI/CD)
- Add GitHub Actions: `dotnet build`/`test`, publish `Wwm.Api` → App Service,
  publish `Wwm.Sync` → Function App (use publish profiles / OIDC).
- Frontend `deploy.yml` largely unchanged (still GitHub Pages); drop the
  `DATA_ENCRYPTION_KEY` injection once the AES path is removed.
- Secrets move from repo secrets to App Service / Function App configuration.

---

## 15. Open decisions / assumptions
- **Sync cadence defaults** — assumed every 3–6 h (sheet) / daily (stats). Confirm
  acceptable freshness with the guild; hourly is possible but costs more DB
  wake-ups (§6).
- **Discord flow** — plan supports keeping implicit flow (minimal change) or
  upgrading to auth-code (recommended). Decide before Phase 2.
- **Region** — pick an Azure region close to players (SEA) that offers the SQL
  free offer; verify at provisioning.
- **`/api/public/matches` for anon** — assumed results without footage URLs. If
  match results are considered gated too, move it under `/api/member/*`.
- **Role-grant policy (privilege escalation)** — assumed: a Commander edits
  Warrior-level permissions/roles only, **cannot grant Commander/Admin**, and
  cannot edit an existing Admin; only an Admin grants Commander/Admin. Confirm the
  exact matrix — this is a security boundary (§8).
- **Toggleable pages/features** — assumed one flag per current route
  (`formation, footages, schedule, match-history, events, roster-stats`) plus
  `feature.register` / `feature.login`. Confirm the list and default states.
- **`CanLogin = 0` semantics** — assumed it blocks issuing any session (login
  denied entirely), not just gated pages. Confirm.
- **Role naming** — plan introduces `Admin` as the top role; the frontend
  currently calls it `Creator`. Assumed rename `Creator → Admin` (or alias).
  Confirm.
- **Guild / Match relational model** — opponents are normalized into a `Guild`
  table (`Match.OppGuildId`), `Season` split into its own table, and `Footage`
  stores the full `YoutubeLink`. `Guild.Tag/Region/NeteaseGuildId` and any
  per-match roster/participant tables are **stubbed, not fully specified** —
  confirm the complete set of "related guild/match records" you want (e.g. link
  our own roster to a match, store opponent guild members, map to NetEase guild
  ids). The DTO flattens all of this back to the current frontend shape (§5).

---

## 16. References
- [1] Azure App Service — gRPC / tiers: https://learn.microsoft.com/en-us/azure/app-service/configure-grpc
- [2] Azure SQL Database free offer: https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer?view=azuresql
- [3] Azure Functions pricing (free grant): https://azure.microsoft.com/en-us/pricing/details/functions/
- Current architecture & security context: repo `README.md`, `SECURITY.md`
- Sync logic to port: `scripts/fetch-data.js`, `scripts/fetch-player-stats.js`
- Auth logic to port: `src/app/core/services/discord-auth.service.ts`, `scripts/apps-script-gateway.gs`
