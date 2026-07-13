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

/** Low-level HTTPS request returning parsed JSON. */
function request(method, url, { headers = {}, body } = {}) {
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
          reject(new Error(`HTTP ${res.statusCode} for ${url}\n${raw}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
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
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
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

  const token = await request('POST', 'https://oauth2.googleapis.com/token', {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(form),
    },
    body: form,
  });

  if (!token.access_token) {
    throw new Error('Token endpoint did not return an access_token.');
  }
  return token.access_token;
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

  const data = await request('GET', url, { headers });
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

  const accessToken = await getAccessToken();
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
      console.error(`✗ ${PAGES[i].file}: ${result.reason.message}`);
      hasError = true;
      if (result.reason.message.includes('HTTP 403')) hasPermissionError = true;
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
  }

  if (hasError) {
    process.exit(1);
  }
}

main();
