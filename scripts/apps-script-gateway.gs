/**
 * ─────────────────────────────────────────────────────────────────────────
 *  GameVN・WWM — Apps Script data gateway  (DRAFT / reference)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS IS
 *  A server-side trust boundary for the static site. It runs *as you* (the
 *  sheet owner), so it can read a fully PRIVATE spreadsheet, validate the
 *  caller's Discord token, and return protected data ONLY to authorised
 *  members. Nothing sensitive (no key, no full sheet) ever reaches a browser
 *  that isn't allowed to see it — which the current static/encrypted model
 *  cannot guarantee.
 *
 *  HOW IT WORKS
 *    Browser  ──GET── {gateway}?token=<discord_access_token>&data=formation
 *    Gateway  ── validates token against Discord /users/@me
 *             ── looks the username up in the Members tab
 *             ── checks the permission the dataset requires (fp / ftp)
 *             ── returns the dataset JSON, or a 403-style error object
 *
 *  DEPLOY: see the setup guide (link shared in chat) → "Option D".
 *  Paste this into Extensions → Apps Script, set SHEET_ID below, then
 *  Deploy → New deployment → Web app → Execute as: Me, Access: Anyone.
 * ─────────────────────────────────────────────────────────────────────────
 */

// The (now private) spreadsheet ID.
const SHEET_ID = 'PUT_YOUR_SPREADSHEET_ID_HERE';

// dataset key (from ?data=) → { tab, permission }
//   permission: 'member' = any registered member
//               'fp'     = Formation Permission column === '✅'
//               'ftp'    = Footage Permission  column === '✅'
const DATASETS = {
  members:      { tab: 'Members',       permission: 'member' },
  formation:    { tab: 'Formation',     permission: 'fp'     },
  schedule:     { tab: 'Schedule',      permission: 'member' },
  matchHistory: { tab: 'Match History', permission: 'ftp'    },
  events:       { tab: 'Events',        permission: 'member' },
};

function doGet(e) {
  try {
    const token   = (e.parameter.token || '').trim();
    const dataKey = (e.parameter.data  || '').trim();

    const spec = DATASETS[dataKey];
    if (!spec) return json({ error: 'unknown_dataset' }, 400);
    if (!token) return json({ error: 'missing_token' }, 401);

    // 1) Identity: ask Discord who this token belongs to. A forged/expired
    //    token fails here — identity is never taken from the caller's claims.
    const profile = discordProfile(token);
    if (!profile) return json({ error: 'invalid_token' }, 401);

    // 2) Membership + permissions come from the private Members tab.
    const members = readTab('Members');
    const record  = members.find((m) => m['Discord'] === profile.username);
    if (!record) return json({ error: 'not_a_member' }, 403);

    if (spec.permission === 'fp'  && record['Formation Permission'] !== '✅') {
      return json({ error: 'forbidden' }, 403);
    }
    if (spec.permission === 'ftp' && record['Footage Permission'] !== '✅') {
      return json({ error: 'forbidden' }, 403);
    }

    // 3) Authorised — return the requested dataset.
    return json({ data: readTab(spec.tab) }, 200);
  } catch (err) {
    return json({ error: 'server_error', detail: String(err) }, 500);
  }
}

/** Calls Discord's /users/@me; returns the profile or null on any failure. */
function discordProfile(accessToken) {
  const res = UrlFetchApp.fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return null;
  return JSON.parse(res.getContentText());
}

/** Reads a tab into an array of objects keyed by the header row. */
function readTab(tabName) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tabName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] === '' ? null : row[i]; });
    return obj;
  });
}

/**
 * Apps Script cannot set arbitrary HTTP status codes on a web-app response,
 * so the status is carried in the JSON body as `status` for the client to
 * branch on, while the payload stays machine-readable.
 */
function json(payload, status) {
  payload.status = status;
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
