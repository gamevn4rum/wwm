import fs from 'fs';
import https from 'https';
import crypto from 'crypto';

const API_KEY = process.env.GOOGLE_API_KEY;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;

if (!API_KEY || !SHEET_ID) {
  console.error('Missing required env vars: GOOGLE_API_KEY, GOOGLE_SHEET_ID');
  process.exit(1);
}

const BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Pages mapped to their sheet/range names */
const PAGES = [
  { file: 'members.json',       range: 'Members!A:Z' },
  { file: 'formation.json',     range: 'Formation!A:Z' },
  { file: 'schedule.json',      range: 'Schedule!A:Z' },
  { file: 'match-history.json', range: 'Match History!A:Z' },
  { file: 'events.json',        range: 'Events!A:Z' },
  { file: 'footages.json',      range: 'Footages!A:Z' },
];

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        if (res.statusCode === 404) {
          resolve({ _notFound: true });
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}\n${raw}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(new Error(`Invalid JSON from ${url}: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
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
 * consistent format regardless of whether data came from the JSON cache or
 * directly from the Google Sheets API.
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

async function fetchPage({ file, range }) {
  const url = `${BASE_URL}/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
  const data = await fetchJson(url);
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

  const results = await Promise.allSettled(PAGES.map(fetchPage));

  let hasError = false;
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`✗ ${PAGES[i].file}: ${result.reason.message}`);
      hasError = true;
    }
  });

  if (hasError) {
    process.exit(1);
  }
}

main();
