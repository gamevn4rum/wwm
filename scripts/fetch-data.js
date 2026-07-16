import fs from 'fs';
import https from 'https';
import crypto from 'crypto';

// ── Auth configuration ──────────────────────────────────────────────────────
//
// Preferred: a Google service account. Set GOOGLE_SERVICE_ACCOUNT_JSON to the
// full JSON key file contents (as a single secret). The sheet is then shared
// with the service account's client_email as *Viewer* and can be fully private
// — no API key, and nothing that would work from a browser.
//
// Legacy/transition: an API key (GOOGLE_API_KEY) still works, but it requires
// the sheet to be link-readable ("anyone with the link"), i.e. public. Prefer
// the service account and remove the key once migrated.
//
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const API_KEY  = process.env.GOOGLE_API_KEY;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

if (!SHEET_ID) {
  console.error('Missing required env var: GOOGLE_SHEET_ID');
  process.exit(1);
}
if (!SERVICE_ACCOUNT_JSON && !API_KEY) {
  console.error('Provide GOOGLE_SERVICE_ACCOUNT_JSON (preferred) or GOOGLE_API_KEY.');
  process.exit(1);
}

const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

// ── Resilience knobs ────────────────────────────────────────────────────────
// Google's APIs occasionally stall a connection or return a transient 429/5xx.
// A single blip used to fail the whole hourly sync, so every request now has a
// hard socket timeout and is retried with exponential backoff.
const REQUEST_TIMEOUT_MS = 30_000;
const RETRY_ATTEMPTS     = 3;
const RETRY_BASE_DELAY_MS = 1_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry `fn` while it rejects with a *retriable* error (network failure,
 * socket timeout, 429, or 5xx). Permanent errors (e.g. 403, bad key) throw
 * immediately so real misconfiguration still surfaces.
 */
async function withRetry(fn, { attempts = RETRY_ATTEMPTS, label = 'request' } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!err.retriable || attempt === attempts) throw err;
      const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `↻ ${label} failed (attempt ${attempt}/${attempts}): ` +
        `${err.message.split('\n')[0]} — retrying in ${delay}ms`
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** client_email of the service account, kept for diagnostics (not secret). */
let saClientEmail = null;

/** Pages mapped to their sheet/range names */
const PAGES = [
  { file: 'members.json',       range: 'Members!A:Z' },
  { file: 'formation.json',     range: 'Formation!A:Z' },
  { file: 'schedule.json',      range: 'Schedule!A:Z' },
  // Match History now also carries the per-uploader footage URL columns —
  // footages.json/Footages tab was retired and merged into this one.
  { file: 'match-history.json', range: 'Match History!A:Z' },
  { file: 'events.json',        range: 'Events!A:Z' },
];

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Low-level HTTPS request returning parsed JSON.
 *
 * Errors carry a `retriable` flag consumed by withRetry(): network failures
 * and socket timeouts are transient, as are 429/5xx responses; other non-2xx
 * responses (e.g. 403 PERMISSION_DENIED) are permanent and thrown as-is.
 */
function request(method, url, { headers = {}, body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        if (res.statusCode === 404) {
          resolve({ _notFound: true });
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`HTTP ${res.statusCode} for ${url}\n${raw}`);
          err.statusCode = res.statusCode;
          err.retriable = res.statusCode === 429 || res.statusCode >= 500;
          reject(err);
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
        }
      });
    });
    req.on('error', (err) => {
      // Network-level failures (ECONNRESET, ETIMEDOUT, socket hang up) and the
      // timeout abort below are all transient.
      if (err.retriable === undefined) err.retriable = true;
      reject(err);
    });
    req.setTimeout(timeoutMs, () => {
      const err = new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
      err.retriable = true;
      req.destroy(err);
    });
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Mint a short-lived OAuth access token from a service-account key using the
 * JWT-bearer grant. Uses Node's built-in crypto — no external dependencies.
 */
async function getAccessToken() {
  if (!SERVICE_ACCOUNT_JSON) return null;

  let sa;
  try {
    sa = JSON.parse(SERVICE_ACCOUNT_JSON);
  } catch (e) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ${e.message}`);
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('Service account JSON must contain client_email and private_key.');
  }
  saClientEmail = sa.client_email;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss:   sa.client_email,
    // drive.metadata.readonly is only used by the 403 diagnostic below, to
    // check whether GOOGLE_SHEET_ID is among the files shared with this SA.
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.metadata.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), sa.private_key);
  const assertion = `${signingInput}.${base64url(signature)}`;

  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString();

  const token = await withRetry(
    () =>
      request('POST', 'https://oauth2.googleapis.com/token', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(form),
        },
        body: form,
      }),
    { label: 'OAuth token' }
  );

  if (!token.access_token) {
    throw new Error('Token endpoint did not return an access_token.');
  }
  return token.access_token;
}

/**
 * On PERMISSION_DENIED: list the files the service account can actually see
 * (Drive metadata) and say whether GOOGLE_SHEET_ID is one of them. Prints only
 * counts and a yes/no match — no names or IDs, since Actions logs are public.
 */
async function diagnoseAccess(accessToken) {
  try {
    const data = await request(
      'GET',
      'https://www.googleapis.com/drive/v3/files?pageSize=100&fields=files(id)',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const files = data.files ?? [];
    const match = files.some((f) => f.id === SHEET_ID);
    console.error(
      `\nDiagnostic: the service account can see ${files.length} file(s) via the Drive API.\n` +
      (match
        ? 'GOOGLE_SHEET_ID IS among them — sharing looks right; check that the Google Sheets API is enabled in the service account\'s project.'
        : files.length === 0
          ? 'GOOGLE_SHEET_ID is NOT among them and nothing is shared with this account — the Share step did not take effect. Re-share the sheet with the exact client_email above.'
          : 'GOOGLE_SHEET_ID is NOT among them, but something else IS shared with this account — the GOOGLE_SHEET_ID secret most likely points to a different spreadsheet than the one you shared.')
    );
  } catch (e) {
    console.error(`\nDiagnostic Drive check failed: ${e.message}`);
  }
}

function parseRows({ values }) {
  if (!values || values.length < 2) return [];
  const [headers, ...rows] = values;
  return rows.map((row) =>
    headers.reduce((acc, key, i) => {
      acc[key] = row[i] ?? null;
      return acc;
    }, {})
  );
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Converts any string value matching DD/MM/YYYY or DD/MM/YY (numeric month)
 * to DD/MMM/YYYY (named month) so that the Angular parsers always receive a
 * consistent format.
 */
function normalizeRowDates(row) {
  const result = {};
  for (const [key, val] of Object.entries(row)) {
    if (typeof val === 'string') {
      const m = val.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
      if (m) {
        const mm = parseInt(m[2], 10);
        if (mm >= 1 && mm <= 12) {
          const year = m[3].length === 2 ? `20${m[3]}` : m[3];
          result[key] = `${m[1]}/${MONTHS[mm - 1]}/${year}`;
          continue;
        }
      }
    }
    result[key] = val;
  }
  return result;
}

async function fetchPage({ file, range }, accessToken) {
  const path = `${BASE_URL}/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const url = accessToken ? path : `${path}?key=${API_KEY}`;
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

  const data = await withRetry(() => request('GET', url, { headers }), { label: file });
  if (data._notFound) {
    console.warn(`⚠ ${file} — range "${range}" not found (404), skipped`);
    return;
  }

  const rows = parseRows(data).map(normalizeRowDates);
  const newContent = JSON.stringify(rows, null, 2);
  const outPath = `./data/${file}`;

  if (fs.existsSync(outPath)) {
    const existingContent = fs.readFileSync(outPath, 'utf8');
    if (md5(existingContent) === md5(newContent)) {
      console.log(`– ${file} — no changes (${rows.length} rows)`);
      return;
    }
  }

  fs.writeFileSync(outPath, newContent, 'utf8');
  console.log(`✓ ${file} — updated (${rows.length} rows)`);
}

async function main() {
  fs.mkdirSync('./data', { recursive: true });

  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    // A transient failure minting the token means we can't fetch anything this
    // run. Rather than error the hourly sync, keep all last-good data and exit
    // cleanly; the next run recovers. Permanent auth errors (bad key, denied
    // grant) still fail loudly.
    if (err.retriable) {
      console.warn(
        `⚠ Could not mint an access token after ${RETRY_ATTEMPTS} attempts ` +
        `(${err.message.split('\n')[0]}). Keeping all last-good data and exiting successfully.`
      );
      return;
    }
    console.error(`✗ Authentication failed: ${err.message}`);
    process.exit(1);
  }

  if (accessToken) {
    console.log(`🔑 Authenticated with service account ${saClientEmail} (sheet can be private).`);
  } else {
    console.warn('⚠ Using API key — this requires the sheet to be publicly link-readable. Migrate to GOOGLE_SERVICE_ACCOUNT_JSON.');
  }

  const results = await Promise.allSettled(PAGES.map((p) => fetchPage(p, accessToken)));

  let hasError = false;
  let hasPermissionError = false;
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const err = result.reason;
      // Transient error that survived all retries: leave data/<file> untouched
      // (last-good stays served) and don't fail the run.
      if (err.retriable) {
        console.warn(
          `⚠ ${PAGES[i].file}: ${err.message.split('\n')[0]} — ` +
          `kept last-good data after ${RETRY_ATTEMPTS} attempts.`
        );
        return;
      }
      console.error(`✗ ${PAGES[i].file}: ${err.message}`);
      hasError = true;
      if (err.statusCode === 403 || err.message.includes('HTTP 403')) hasPermissionError = true;
    }
  });

  if (hasPermissionError && accessToken) {
    console.error(
      '\nThe service account authenticated, but Google denied access to the ' +
      'spreadsheet (403 PERMISSION_DENIED). To fix:\n' +
      `  1. Open the sheet → Share → add ${saClientEmail} as Viewer.\n` +
      '  2. Confirm the GOOGLE_SHEET_ID secret matches that sheet\'s ID.\n' +
      "  3. Confirm the Google Sheets API is enabled in the service account's project."
    );
    await diagnoseAccess(accessToken);
  }

  if (hasError) {
    process.exit(1);
  }
}

main();
