import fs from 'fs';
import crypto from 'crypto';

// ── What this does ───────────────────────────────────────────────────────────
//
// Enriches the guild roster with in-game player stats (level, weapon mastery,
// school, region, and full gear loadout) pulled from the community site
// wwmdb.vlt.fyi, matched to each member by their IGN. Also refreshes two
// static, non-player-specific catalogues from the same relay: Inner Ways
// (descriptions + cumulative rank effects, from wwmdb.vlt.fyi/inner-ways) and
// Sets (2pc/4pc gear-set bonuses, from wwmdb.vlt.fyi/sets).
//
// Pipeline position: run AFTER fetch-data.js (which produces data/members.json)
// and BEFORE encrypt-data.js (which encrypts data/player-stats.json). Reads the
// `IGN` column from data/members.json; writes data/player-stats.json,
// data/inner-ways.json and data/sets.json.
//
// ⚠ This is a "Route A" integration: it rides wwmdb's own private relay of
// NetEase's official game API. The bearer scheme below is reconstructed from
// wwmdb's public JavaScript, so it can break without notice if they rotate the
// token or change the scheme. If every lookup suddenly fails auth, refresh
// WWMDB_TOKEN (grab the new token from their bundle) — the rest still holds.
//
// ⚠ PRIVACY: the upstream Player response includes the player's real NetEase
// account email. We NEVER copy it out — this script uses a strict field
// allow-list, so account/email data is dropped at ingestion and never written.

// ── Config ───────────────────────────────────────────────────────────────────
// Token is env-overridable precisely because it may rotate; the default is the
// value currently embedded in wwmdb's public bundle.
const TOKEN =
  process.env.WWMDB_TOKEN ||
  'ab964c45612bda768691108730d0c31c9b77116449fc99c3d4dc29d17db2cd77';

const API_BASE = 'https://wwmdb.vlt.fyi/api/wwm.v1.WwmService';

const MEMBERS_PATH = './data/members.json';
const OUT_PATH = './data/player-stats.json';
// Static game-data catalogues (inner ways, gear sets), not player-specific —
// plaintext, same as the other static data/*.json files (not in
// encrypt-data.js's list).
const INNER_WAYS_OUT_PATH = './data/inner-ways.json';
const SETS_OUT_PATH = './data/sets.json';

// Be a good neighbour: this hits a third party's relay, and stats change slowly.
const DELAY_BETWEEN_MEMBERS_MS = 400;
// Catalogue detail calls (per inner-way / per-set) are cheaper individually but
// there are a lot of them (97 inner ways, 67 sets) — same "gentle" spacing.
const DELAY_BETWEEN_CATALOGUE_ITEMS_MS = 250;
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;

// Only regions we expect our members to play on. A name that matches but is on
// a foreign region is almost certainly a different person, so we reject it.
// Set WWMDB_ALLOWED_REGIONS="" to disable the region guard entirely.
const ALLOWED_REGIONS =
  process.env.WWMDB_ALLOWED_REGIONS === undefined
    ? ['SEA']
    : process.env.WWMDB_ALLOWED_REGIONS.split(',').map((r) => r.trim()).filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Auth ─────────────────────────────────────────────────────────────────────
// bearer = base64( repeating-key-XOR( `${token}:${unixSeconds}`, nonce ) )
// with the same nonce sent as X-Request-Id. Reconstructed from wwmdb's bundle.
function xor(str, key) {
  const s = Buffer.from(str, 'utf8');
  const k = Buffer.from(key, 'utf8');
  const out = Buffer.alloc(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s[i] ^ k[i % k.length];
  return out;
}

function makeAuthHeaders() {
  const nonce = crypto.randomUUID();
  const payload = `${TOKEN}:${Math.floor(Date.now() / 1000)}`;
  return {
    Authorization: `Bearer ${xor(payload, nonce).toString('base64')}`,
    'X-Request-Id': nonce,
    'X-Language': 'en',
    'Content-Type': 'application/json',
  };
}

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

// ── Transport ────────────────────────────────────────────────────────────────
async function callOnce(method, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/${method}`, {
      method: 'POST',
      headers: makeAuthHeaders(),
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} for ${method}: ${text.slice(0, 200)}`);
      err.statusCode = res.status;
      err.retriable = res.status === 429 || res.status >= 500;
      throw err;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ${method}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error(`${method} timed out after ${REQUEST_TIMEOUT_MS}ms`);
      e.retriable = true;
      throw e;
    }
    if (err.retriable === undefined) err.retriable = true; // network-level
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function call(method, body) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await callOnce(method, body);
    } catch (err) {
      lastErr = err;
      if (!err.retriable || attempt === RETRY_ATTEMPTS) throw err;
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}

// ── Shaping (strict PII allow-list) ──────────────────────────────────────────
function shapeGearSlot(slot) {
  return {
    equipItemId: slot.equipItemId ?? null,
    name: slot.name ?? '',
    slotName: slot.slotName ?? '',
    tier: slot.tier ?? null,
    level: slot.level ?? null,
    set: slot.set ? { id: slot.set.id ?? null, name: slot.set.name ?? '' } : null,
    attributes: Array.isArray(slot.attributes)
      ? slot.attributes.map((a) => ({ name: a.name ?? '', value: a.value ?? null }))
      : [],
    affixes: Array.isArray(slot.affixes)
      ? slot.affixes.map((a) => ({ name: a.name ?? '', value: a.value ?? null, tier: a.tier ?? null }))
      : [],
  };
}

function shapeInnerWay(iw) {
  return {
    id: iw.id ?? null,
    name: iw.name ?? '',
    tier: iw.tier ?? null,
  };
}

/**
 * Shape the *detailed* InnerWay({id}) response (from wwmdb.vlt.fyi/inner-ways),
 * not the plain InnerWays({}) list — the list has no description text at all.
 * `effect` is the base passive's mechanical description (matches a player's
 * live `tier`, since that's the same passive rank the base tier represents).
 * `maxEffect` is the *cumulative* description at full advancement (the last
 * uprank's briefDesc already reads as the full stacked effect, not a delta) —
 * we don't know which uprank an individual player has actually bought (that
 * isn't exposed by the live Player() call), so this is deliberately framed as
 * "fully upgraded", not "this player's current effect".
 */
function shapeInnerWayDetail(item) {
  const upranks = Array.isArray(item.upranks) ? item.upranks : [];
  const lastUprank = upranks.length ? upranks[upranks.length - 1] : null;
  return {
    id: item.id ?? null,
    name: item.name ?? '',
    tier: item.tier ?? null,
    path: item.path ? { id: item.path.id ?? null, name: item.path.name ?? '' } : null,
    weapon: item.weapon ? { id: item.weapon.id ?? null, name: item.weapon.name ?? '' } : null,
    effectTypes: Array.isArray(item.effectTypes)
      ? item.effectTypes.map((e) => ({ id: e.id ?? null, name: e.name ?? '' }))
      : [],
    lore: item.desc ?? '',
    effect: item.passiveSkill?.description ?? '',
    maxAdvancedLevel: item.maxAdvancedLevel ?? null,
    maxEffect: lastUprank?.briefDesc ?? null,
  };
}

/**
 * Shape the Suit({id}) response (from wwmdb.vlt.fyi/sets). bonuses2 is a
 * player-level-scaled stat table (active once 2+ pieces are equipped);
 * bonuses4 is a named proc effect (active once 4 pieces are equipped).
 */
function shapeSuitDetail(item) {
  return {
    id: item.id ?? null,
    name: item.name ?? '',
    shortName: item.shortName ?? '',
    bonuses2: Array.isArray(item.bonuses2)
      ? item.bonuses2.map((b) => ({
          attrId: b.attrId ?? null,
          attrName: b.attrName ?? '',
          values: Array.isArray(b.values)
            ? b.values.map((v) => ({ level: v.level ?? null, value: v.value ?? null }))
            : [],
        }))
      : [],
    bonuses4: Array.isArray(item.bonuses4)
      ? item.bonuses4.map((b) => ({ id: b.id ?? null, name: b.name ?? '', description: b.description ?? '' }))
      : [],
  };
}

/** Copy ONLY known-safe fields. Never `account`/email or any raw upstream spread. */
function shapePlayer(player) {
  const gear = [];
  if (player.gearSlots && typeof player.gearSlots === 'object') {
    for (const [key, slot] of Object.entries(player.gearSlots)) {
      if (slot && typeof slot === 'object') gear.push({ slot: key, ...shapeGearSlot(slot) });
    }
  }
  const innerWays = Array.isArray(player.innerWays) ? player.innerWays.map(shapeInnerWay) : [];
  return {
    name: player.name ?? '',
    numberId: player.numberId ?? null, // public in-game id, not the email
    level: player.level ?? null,
    weaponMasteryMax: player.weaponMasteryMax ?? null,
    school: typeof player.school === 'string' ? player.school : null,
    region: player.tag ?? null,       // e.g. "SEA"
    server: player.hostNum ?? null,   // e.g. 10410
    hostTag: player.hostTag ?? null,
    gender: player.gender ?? null,
    language: player.language ?? null,
    createTime: player.createTime ?? null,
    gear,
    innerWays,
  };
}

// ── Members input ────────────────────────────────────────────────────────────
function findIgn(row) {
  const key = Object.keys(row).find((k) => k.toLowerCase() === 'ign');
  const val = key ? row[key] : null;
  return val != null ? String(val).trim() : '';
}

// ── Per-member lookup ────────────────────────────────────────────────────────
async function fetchOne(ign) {
  let search;
  try {
    search = await call('SearchUser', { search: ign });
  } catch (err) {
    // An unknown IGN comes back as a hard 404 from SearchUser — that's a
    // legitimate "no such player", not a transport failure to keep-last-good on.
    if (err.statusCode === 404) return { ign, matched: false, reason: 'not_found' };
    throw err;
  }
  const user = search?.user;
  if (!user || !user.id) return { ign, matched: false, reason: 'not_found' };

  // SearchUser returns a single best match, which can be a *different* player
  // (searching "Kerry" can return someone other than "Kerry-VIII"). Require an
  // exact, case-insensitive name match before trusting it.
  if ((user.name ?? '').trim().toLowerCase() !== ign.toLowerCase()) {
    return { ign, matched: false, reason: 'name_mismatch', foundName: user.name ?? '' };
  }
  if (ALLOWED_REGIONS.length && user.overseaTag && !ALLOWED_REGIONS.includes(user.overseaTag)) {
    return { ign, matched: false, reason: 'region_mismatch', foundRegion: user.overseaTag };
  }

  const detail = await call('Player', { id: user.id, hostnum: user.hostnum });
  const player = detail?.player;
  if (!player) return { ign, matched: false, reason: 'no_detail' };

  return { ign, matched: true, player: shapePlayer(player) };
}

/**
 * Fetch a list of ids via `listMethod`, then the full detail for each id via
 * `detailMethod`, shaping each with `shapeFn`. Per-id failures keep the
 * last-good entry for that id (from `previousById`) rather than dropping it or
 * failing the whole catalogue — one bad id shouldn't wipe 96 good ones.
 */
async function syncDetailCatalogue({ label, outPath, listMethod, detailMethod, shapeFn }) {
  let ids;
  try {
    const list = await call(listMethod, {});
    ids = Array.isArray(list?.items) ? list.items.map((it) => it.id).filter((id) => id != null) : [];
  } catch (err) {
    console.warn(`⚠ ${label} list fetch failed: ${err.message.split('\n')[0]}; keeping last-good file`);
    return;
  }

  const previous = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : [];
  const previousById = new Map(previous.map((e) => [e.id, e]));

  const catalogue = [];
  let fetched = 0;
  let kept = 0;
  for (const id of ids) {
    try {
      const detail = await call(detailMethod, { id });
      const item = detail?.item;
      if (!item) throw new Error('empty item');
      catalogue.push(shapeFn(item));
      fetched++;
    } catch (err) {
      const prev = previousById.get(id);
      if (prev) {
        catalogue.push(prev);
        kept++;
      } else {
        console.warn(`⚠ ${label} #${id} fetch failed: ${err.message.split('\n')[0]}; no last-good entry, skipping`);
      }
    }
    await sleep(DELAY_BETWEEN_CATALOGUE_ITEMS_MS);
  }

  const newContent = JSON.stringify(catalogue, null, 2);
  if (fs.existsSync(outPath) && md5(fs.readFileSync(outPath, 'utf8')) === md5(newContent)) {
    console.log(`– ${outPath} — no changes (${catalogue.length} entries)`);
    return;
  }
  fs.writeFileSync(outPath, newContent, 'utf8');
  console.log(`✓ ${outPath} — ${catalogue.length} entries (${fetched} fetched, ${kept} kept last-good)`);
}

async function syncInnerWaysCatalogue() {
  await syncDetailCatalogue({
    label: 'InnerWay',
    outPath: INNER_WAYS_OUT_PATH,
    listMethod: 'InnerWays',
    detailMethod: 'InnerWay',
    shapeFn: shapeInnerWayDetail,
  });
}

async function syncSetsCatalogue() {
  await syncDetailCatalogue({
    label: 'Suit',
    outPath: SETS_OUT_PATH,
    listMethod: 'Suits',
    detailMethod: 'Suit',
    shapeFn: shapeSuitDetail,
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await syncInnerWaysCatalogue();
  await syncSetsCatalogue();

  if (!fs.existsSync(MEMBERS_PATH)) {
    console.error(`✗ ${MEMBERS_PATH} not found — run fetch-data.js first.`);
    process.exit(1);
  }

  let members;
  try {
    members = JSON.parse(fs.readFileSync(MEMBERS_PATH, 'utf8'));
  } catch (e) {
    console.error(`✗ Could not parse ${MEMBERS_PATH}: ${e.message}`);
    process.exit(1);
  }

  const igns = [...new Set(members.map(findIgn).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
  console.log(`Looking up ${igns.length} member IGN(s) on wwmdb…`);

  // Preserve last-good output so a bad run doesn't wipe existing stats.
  const previous = fs.existsSync(OUT_PATH)
    ? JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'))
    : [];
  const prevByIgn = new Map(previous.map((r) => [r.ign, r]));

  const records = [];
  let matched = 0;
  let missed = 0;
  let kept = 0;

  for (const ign of igns) {
    try {
      const rec = await fetchOne(ign);
      if (rec.matched) {
        matched++;
        console.log(`✓ ${ign} — L${rec.player.level} · ${rec.player.school ?? '?'} · ${rec.player.gear.length} gear`);
        records.push(rec);
      } else {
        // Miss: keep last-good matched data if we had any, rather than losing it.
        const prev = prevByIgn.get(ign);
        if (prev && prev.matched) {
          kept++;
          console.warn(`↺ ${ign} — ${rec.reason}; kept last-good stats`);
          records.push(prev);
        } else {
          missed++;
          console.warn(`⚠ ${ign} — ${rec.reason}${rec.foundName ? ` (found "${rec.foundName}")` : ''}`);
          records.push(rec);
        }
      }
    } catch (err) {
      // Network/auth failure on one member: keep last-good if present.
      const prev = prevByIgn.get(ign);
      if (prev) {
        kept++;
        console.warn(`↺ ${ign} — ${err.message.split('\n')[0]}; kept last-good`);
        records.push(prev);
      } else {
        missed++;
        console.warn(`✗ ${ign} — ${err.message.split('\n')[0]}`);
        records.push({ ign, matched: false, reason: 'error' });
      }
    }
    await sleep(DELAY_BETWEEN_MEMBERS_MS);
  }

  records.sort((a, b) => a.ign.localeCompare(b.ign));
  const newContent = JSON.stringify(records, null, 2);

  if (fs.existsSync(OUT_PATH) && md5(fs.readFileSync(OUT_PATH, 'utf8')) === md5(newContent)) {
    console.log(`– player-stats.json — no changes (${records.length} records)`);
    return;
  }
  fs.writeFileSync(OUT_PATH, newContent, 'utf8');
  console.log(
    `✓ player-stats.json — ${matched} matched, ${kept} kept last-good, ${missed} unmatched (${records.length} total)`
  );
}

main();
