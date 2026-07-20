# Guild API — investigation notes (easebar / NetEase gateway)

> **Status:** reconnaissance done, not yet integrated. Hand-off for a later
> session to implement (feeds the `Guild` table in [`PLAN.md`](./PLAN.md) §5).
> **Investigated:** 2026-07-20 (live probes against the endpoints below).
> **Why this exists:** so the next session can pick up without re-probing. It
> records exactly what works, what's blocked, the request/response schemas
> discovered, the reproducible probe harness, and the open unknowns.

---

## 0. TL;DR

A new first-party **guild** data source: NetEase's `easebar` microservice
gateway, msgpack over POST. This is the "durable path" `data-migration.html`
described (official API, vs. the wwmdb relay used today by
`scripts/fetch-player-stats.js`).

- **Guild endpoints (`/club_service/*`) are OPEN — no auth.** `get_club_brief_info_batch`
  works end-to-end; `get_club_info` schema is fully mapped. → usable now for the
  opponent-`Guild` table.
- **Player endpoints (`/flk/*`) are GATEWAY-GATED** (`400 bad request` before the
  body is parsed). Need a signature/session (likely NetEase MPay) we don't have.
  Player lookups stay on the wwmdb relay for now.
- **Blockers before pulling real data:** a valid `hostnum` (region/server) and the
  `field_info` selector keys; plus whatever unlocks `/flk/*`.

---

## 1. Endpoint & protocol

- **Base:** `https://h72naxx2gb-ms-prod.easebar.com/`  (`ms-prod` = microservice prod)
- **Method:** `POST`
- **Body:** **msgpack** (a msgpack-encoded map). `Content-Type: application/x-msgpack`
  is accepted by `club_service`.
- **Response:** **msgpack** bytes. NOTE the quirks:
  - `club_service` replies come back with HTTP **`200`** and (misleading)
    `Content-Type: text/html` even for *application-level* errors — the real
    status is in the body's `code`.
  - Gateway-level rejections (the `/flk/*` routes) are real HTTP `400`
    (`text/plain "bad request"`) or `404` (for GET).

### Response envelope (all `club_service` methods)
```
{ code, result, uid }
```
| field | meaning |
|---|---|
| `code` | `0` = success (`result` is the payload); `2` = app error (`result` is a human message) |
| `result` | payload on success; error string on `code:2` (e.g. `"required param club_id not in params list"`) |
| `uid` | server request trace id, e.g. `"224745-1784566300.85"` |

Handy: the service validates required params **one at a time** and names the
missing one, so the request schema is self-documenting — send `{}` and read the
errors.

---

## 2. Endpoint findings

| Endpoint | Auth | Result | Request schema |
|---|---|---|---|
| `/club_service/get_club_brief_info_batch` | open | ✅ works end-to-end | `{ club_list: [ { club_id:int, hostnum:int }, … ] }` |
| `/club_service/get_club_info` | open | ✅ reachable, schema mapped | `{ club_id:int, hostnum:int, field_info:{…} }` |
| `/flk/find_people/by_number_id` | **gated** | ❌ `400` pre-parse | unknown (unreachable) |
| `/flk/redis_player/get_players_info` | **gated** | ❌ `400` pre-parse | unknown (unreachable) |

### 2.1 `/club_service/get_club_brief_info_batch`  ✅ WORKING
- Request: `{ club_list: [ { club_id, hostnum } ] }`
- Success response: `{ code:0, result: { data: [ …brief club objects… ] }, uid }`
- With `club_id:1` (fake) it returns `result:{data:[]}` — i.e. shape confirmed,
  empty only because no such guild.
- Gotcha: `club_list` items **must be objects** `{club_id, hostnum}`. Passing bare
  ints (`club_list:[1]`) returns `code:2 "interface error."`.
- **This is the primary opponent-guild lookup** (batch → efficient for a sync).

### 2.2 `/club_service/get_club_info`  ✅ reachable
- Required params (discovered progressively): `club_id` (int) → `hostnum` (int) →
  `field_info` (**map/struct**, a field/section selector).
- `field_info` **must be a map**: `{}` → `{code:0, result:{}}` (success, empty
  because `field_info` selects nothing / fake club). `field_info` as `[]`,
  `["base"]`, or `1` → `code:2 "interface error."`.
- **Unknown:** the valid `field_info` keys (which sections: base info, members,
  emblem, …). Resolve by trial once a real `club_id`+`hostnum` is known.

### 2.3 `/flk/find_people/by_number_id` and `/flk/redis_player/get_players_info`  ❌ GATED
- Every POST → HTTP `400 "bad request"`, returned **before** msgpack is parsed
  (body content is irrelevant). GET → `404`.
- Tried and still 400: wwmdb XOR-bearer auth headers (see §4), array-vs-map body,
  `application/msgpack` vs `application/x-msgpack`, adding `hostnum`.
- Conclusion: the `/flk/*` namespace needs a signature/session the public
  `club_service` routes don't — consistent with `data-migration.html`'s note that
  the official path requires **NetEase MPay login**. **Not usable from here yet.**

---

## 3. Evidence log (actual probe output, 2026-07-20)

```
POST /club_service/get_club_info  {}                                  → 200 {code:2, result:"required param club_id not in params list"}
POST /club_service/get_club_info  {club_id:1}                         → 200 {code:2, result:"required param hostnum not in params list"}
POST /club_service/get_club_info  {club_id:1,hostnum:1}               → 200 {code:2, result:"required param field_info not in params list"}
POST /club_service/get_club_info  {club_id:1,hostnum:1,field_info:[]} → 200 {code:2, result:"interface error."}
POST /club_service/get_club_info  {club_id:1,hostnum:1,field_info:{}} → 200 {code:0, result:{}}

POST /club_service/get_club_brief_info_batch {}                                    → 200 {code:2, result:"required param club_list not in params list"}
POST /club_service/get_club_brief_info_batch {club_list:[1]}                       → 200 {code:2, result:"interface error."}
POST /club_service/get_club_brief_info_batch {club_list:[{club_id:1,hostnum:1}]}   → 200 {code:0, result:{data:[]}}

POST /flk/find_people/by_number_id      {number_id:1}    → 400 "bad request"   (also with auth hdrs / array body / +hostnum)
POST /flk/find_people/by_number_id      (GET)            → 404
POST /flk/redis_player/get_players_info {players:[]}     → 400 "bad request"   (also {uids:[]}, {player_ids:[]})
```

---

## 4. Reproducible probe harness

The scratchpad from the investigation is session-scoped (gone next session), so
recreate it like this. Needs Node 20+ (global `fetch`, `crypto.randomUUID`).

```bash
mkdir wwm-guild-probe && cd wwm-guild-probe
npm init -y >/dev/null
npm i @msgpack/msgpack
```

`probe.mjs`:
```js
import { encode, decode } from '@msgpack/msgpack';
const BASE = 'https://h72naxx2gb-ms-prod.easebar.com';

async function call(ep, body, { headers = {}, method = 'POST' } = {}) {
  const res = await fetch(BASE + ep, {
    method,
    headers: { 'Content-Type': 'application/x-msgpack', ...headers },
    body: method === 'GET' ? undefined : encode(body),
    signal: AbortSignal.timeout(20000),
  });
  const raw = new Uint8Array(await res.arrayBuffer());
  let out; try { out = JSON.stringify(decode(raw)); }
  catch { out = 'text:' + Buffer.from(raw).toString('utf8').slice(0, 200); }
  console.log(`${method} ${ep} ${JSON.stringify(body)}\n  ${res.status} → ${out}\n`);
}

// send {} to any club_service method to have it name the required params:
await call('/club_service/get_club_info', {});
await call('/club_service/get_club_brief_info_batch', { club_list: [{ club_id: 1, hostnum: 1 }] });
```

wwmdb-style obfuscated bearer (reconstructed from `scripts/fetch-player-stats.js`;
tried against `/flk/*`, did **not** unlock them — kept for the record):
```js
const TOKEN = 'ab964c45612bda768691108730d0c31c9b77116449fc99c3d4dc29d17db2cd77';
const xor = (s, k) => { s = Buffer.from(s); k = Buffer.from(k); const o = Buffer.alloc(s.length);
  for (let i = 0; i < s.length; i++) o[i] = s[i] ^ k[i % k.length]; return o; };
const nonce = crypto.randomUUID();
const bearer = xor(`${TOKEN}:${Math.floor(Date.now()/1000)}`, nonce).toString('base64');
const authHeaders = { Authorization: `Bearer ${bearer}`, 'X-Request-Id': nonce, 'X-Language': 'en' };
```

---

## 5. Open unknowns / next-session TODO

1. **`hostnum`** — the region/server number for our SEA/oversea guilds. All probes
   used a fake `club_id:1`, so no real lookup was triggered. Find our own guild's
   `club_id` + `hostnum` (from the game, the official Data Tool's network calls,
   or the wwmdb `Guild {"id":…}` relay method).
2. **`field_info` keys** for `get_club_info` — trial the section names once a real
   club is in hand (guess set: `base`, `members`, `emblem`, `notice`, `rank`…).
3. **Unlock `/flk/*`** — identify the required signature/session (MPay?). Inspect
   the official Data Tool's requests to `sixhorse.game.163.com` /
   `*.easebar.com` for the exact auth header/signing. Until then, player lookups
   stay on the wwmdb relay (Route A).
4. **Confirm `code` values** beyond `0`/`2` (e.g. not-found, rate-limited) with a
   real-but-missing club_id.
5. **Field allow-list / PII** — this is NetEase's live backend. When integrating,
   apply the same strict allow-list discipline as `fetch-player-stats.js`
   (drop account/email/PII), attribute the source, cache hard, keep call volume
   low (a sync Function, not per-request).

---

## 6. How it plugs into `PLAN.md`

- The open `club_service` methods are the **first-party data source for the
  `Guild` table** (PLAN §5: `Guild.Name/Tag/Region/NeteaseGuildId`).
  `get_club_brief_info_batch` (batch) is ideal for a sync that resolves/enriches
  opponent guilds; `get_club_info` for a full single-guild view.
- Add a guild-sync path to `StatsSyncFn` (or a new `GuildSyncFn`) once `hostnum`
  is known: given the set of opponent `club_id`s, batch-fetch brief info, upsert
  into `Guild` (populate `NeteaseGuildId`). Same cost discipline as §6 of the plan
  (change-detect, don't wake SQL unless changed).
- `/flk/*` player endpoints would eventually replace the wwmdb Route-A dependency
  in `fetch-player-stats.js` — but only after their auth is solved (item 3 above).
