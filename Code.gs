/**
 * WC2026 հաշիվգուշակոցի — read-only JSON API.
 *
 * Deployed as a Google Apps Script Web App (Deploy ▸ New deployment ▸ Web app,
 * "Execute as: Me", "Who has access: Anyone"). The dashboard fetches the /exec
 * URL with a plain GET; this script ONLY reads the sheet and returns JSON.
 *
 * doGet (the public Web App) is READ-ONLY — it never writes to the sheet. It
 * reads the match rows (row 2 downward) and returns them as JSON.
 *
 * OPTIONAL auto-sync: syncFinals() fills finished results from ESPN into BLANK
 * column-L cells. It runs ONLY if you install its time trigger (run
 * setupAutoSync once) and ONLY ever fills blank cells — it never overwrites a
 * value you typed. The public Web App still cannot write; only this owner-run
 * trigger can. See README.md.
 */

// ===== CONFIG ==========================================================
// SHEET_ID is the long middle part of the sheet URL:
//   https://docs.google.com/spreadsheets/d/<THIS_IS_THE_ID>/edit
var SHEET_ID = '131cIpvgfjt2qAF-or1BYO9JWlWX3bCmDZhyRF5YRBIs';
// The tab is selected by its gid (from the URL: ...#gid=<THIS>) — robust against
// renames/spaces. SHEET_NAME is only a fallback if the gid isn't found.
var SHEET_GID  = 62010908;
var SHEET_NAME = 'Sheet 1';

// Player columns E..K, in order. `col` is the 0-based offset inside an A..L row
// (A=0, B=1, ... E=4 ... K=10, L=11). This is the single source of truth for
// column order and the (Armenian) display names.
var PLAYERS = [
  { key: 'garik',   name: 'Գարիկ',  col: 4 },  // E
  { key: 'khazhak', name: 'Խաժակ',  col: 5 },  // F
  { key: 'sasha',   name: 'Սաշա',   col: 6 },  // G
  { key: 'arman',   name: 'Արման',  col: 7 },  // H
  { key: 'parthev', name: 'Պարթև',  col: 8 },  // I
  { key: 'vahe',    name: 'Վահե',   col: 9 },  // J
  { key: 'artyom',  name: 'Արտյոմ', col: 10 }  // K
];

var FIRST_DATA_ROW = 2;   // first match row
var MAX_MATCHES    = 200; // safety cap (2026 WC = 104 matches; leaves headroom)
// Optional round/stage label per match — column M (0-based index 12), right of L.
// Blank for every row = one default group (back-compatible with the matchday-1 sheet).
var STAGE_COL      = 12;  // M

// ===== Web app entry point =============================================
function doGet(e) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    // Prefer the exact tab by gid; fall back to name, then the first tab.
    var sheet = getSheetByGid_(ss, SHEET_GID) || ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    if (!sheet) throw new Error('Tab not found (gid ' + SHEET_GID + ' / name "' + SHEET_NAME + '")');

    // DYNAMIC range: row 2 down to the last row with content (capped), 13 cols A..M.
    // The sheet can grow (matchday 2/3, knockouts) with NO code change.
    var lastRow = Math.min(sheet.getLastRow(), FIRST_DATA_ROW + MAX_MATCHES - 1);
    var rowCount = Math.max(0, lastRow - FIRST_DATA_ROW + 1);
    var grid = rowCount ? sheet.getRange(FIRST_DATA_ROW, 1, rowCount, 13).getValues() : [];

    var matches = grid.map(function (r, i) {
      var predictions = {};
      PLAYERS.forEach(function (p) { predictions[p.key] = normScore_(r[p.col]); });
      var actual = normScore_(r[11]); // column L
      return {
        row:      FIRST_DATA_ROW + i,  // stable sheet-row id
        weekday:  str_(r[0]),          // A
        group:    str_(r[1]),          // B
        matchup:  str_(r[2]),          // C (raw, always present)
        teams:    splitTeams_(r[2]),   // C parsed best-effort
        datetime: str_(r[3]),          // D (free-text Armenian local time)
        stage:    str_(r[STAGE_COL]),  // M (round/matchday label; blank = single group)
        predictions: predictions,      // E..K, each "x-y" or null
        actual:   actual,              // L, "x-y" or null
        played:   actual !== null
      };
    }).filter(function (m) {
      // Keep only real match rows: a splittable "Home vs Away" matchup OR an actual
      // result. This naturally skips a totals/summary row and blanks wherever they sit
      // (the client computes its own totals, so no sheet totals row is needed).
      return (m.teams.home && m.teams.away) || m.actual !== null;
    });

    return json_({
      ok: true,
      players: PLAYERS.map(function (p) { return { key: p.key, name: p.name }; }),
      matches: matches,
      meta: {
        generatedAt: new Date().toISOString(), // server UTC, when the script ran
        matchCount: matches.length
      }
    });
  } catch (err) {
    // Always return JSON (never an HTML error page) so the client can parse it.
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

// ===== helpers =========================================================
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function str_(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

/** Find a tab by its gid (the #gid=... number in the sheet URL). */
function getSheetByGid_(ss, gid) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  return null;
}

/**
 * Normalize a score cell to "x-y" (ASCII hyphen) or null.
 * Accepts "1-0", "1 - 0", "1–0" (en dash), "2:1", etc. Returns null for blank
 * or anything that isn't a clean two-number score. Caps each side at 99.
 */
function normScore_(v) {
  var s = str_(v);
  if (!s) return null;
  var m = s.replace(/[‒-―−]/g, '-') // figure/en/em/minus -> '-'
           .match(/^\s*(\d{1,3})\s*[-:]\s*(\d{1,3})\s*$/);
  if (!m) return null;
  var h = Number(m[1]), a = Number(m[2]);
  if (h > 99 || a > 99) return null;
  return h + '-' + a;
}

/**
 * Best-effort split of a "Mexico vs Canada" matchup cell into {home, away}.
 * Splits on " vs ", " vs. ", " ընդդեմ ", or " - ". If it can't split cleanly,
 * returns {home:'', away:''} and the client falls back to the raw matchup.
 */
function splitTeams_(v) {
  var s = str_(v);
  if (!s) return { home: '', away: '' };
  var parts = s.replace(/[‒-―−]/g, '-')
               .split(/\s+(?:vs?\.?|ընդդեմ|-)\s+/i);
  return (parts.length === 2)
    ? { home: parts[0].trim(), away: parts[1].trim() }
    : { home: '', away: '' };
}

// ===== OPTIONAL: auto-sync the 90-MINUTE result into blank column-L cells =====
// This runs server-side as YOU, on a time trigger — NOT via the public Web App
// (so no one can write through the URL). Install once: run setupAutoSync().
//
// It writes ONLY the regulation (first-90-minute) score, for EVERY stage: for a
// knockout that goes to extra time or penalties it reads ESPN's per-half data and
// sums only the first two halves, so ET goals and shootouts are NEVER scored (they
// still show live in the app). It only fills BLANK column-L cells and never
// overwrites a value you typed.

var ESPN_SB_  = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';
var ESPN_SUM_ = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary';
var YEREVAN_OFFSET_MIN = 240;   // UTC+4 (matches column-D local time)
var SYNC_LOOKBACK_MIN  = 360;   // only try to fill matches whose kickoff was within the last 6h
var MONTHS_ = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
var TEAM_ALIASES = {
  'korea republic':'south korea','republic of korea':'south korea','korea dpr':'north korea',
  'usa':'united states','us':'united states','turkiye':'turkey','cote divoire':'ivory coast',
  'czech republic':'czechia','bosnia herzegovina':'bosnia and herzegovina','china pr':'china','ir iran':'iran'
};

/** Run ONCE from the Apps Script editor to turn auto-sync on (every 10 minutes). */
function setupAutoSync() {
  removeAutoSync();
  ScriptApp.newTrigger('syncFinals').timeBased().everyMinutes(10).create();
  return 'Auto-sync ON: syncFinals() runs every 10 min, filling the 90-min result into blank column L.';
}
/** Run to turn auto-sync off. */
function removeAutoSync() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === 'syncFinals') ScriptApp.deleteTrigger(ts[i]);
  }
}

/** The trigger body. Fills blank column-L cells with the 90-minute result. */
function syncFinals() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getSheetByGid_(ss, SHEET_GID) || ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  if (!sheet) return;
  var lastRow = Math.min(sheet.getLastRow(), FIRST_DATA_ROW + MAX_MATCHES - 1);
  var rowCount = Math.max(0, lastRow - FIRST_DATA_ROW + 1);
  if (!rowCount) return;
  var grid = sheet.getRange(FIRST_DATA_ROW, 1, rowCount, 13).getValues();
  var now = (Date.now ? Date.now() : new Date().getTime());

  var candidates = [], days = {};
  for (var i = 0; i < grid.length; i++) {
    var r = grid[i], teams = splitTeams_(r[2]);
    if (!(teams.home && teams.away)) continue;     // not a match row
    if (normScore_(r[11]) !== null) continue;      // column L already has a value -> never overwrite
    var k = parseKickoffMs_(r[3]);
    if (k == null || now < k || now > k + SYNC_LOOKBACK_MIN * 60000) continue; // recently kicked off only
    candidates.push({ rowIndex: FIRST_DATA_ROW + i, home: teams.home, away: teams.away });
    days[dayStr_(k, YEREVAN_OFFSET_MIN)] = true;   // Yerevan day
    days[dayStr_(k, 0)] = true;                    // + UTC day (covers the midnight crossing)
  }
  if (!candidates.length) return;

  var byPair = {};
  for (var d in days) {
    var evs = espnScoreboard_(d);
    for (var e = 0; e < evs.length; e++) byPair[evs[e].key] = evs[e];
  }

  var wrote = 0;
  for (var c = 0; c < candidates.length; c++) {
    var cand = candidates[c], ev = byPair[pairKey_(cand.home, cand.away)];
    if (!ev || ev.state !== 'post') continue;      // only completed matches
    var reg = regulationScores_(ev);               // {normName: number}, first 90 min only
    if (!reg) continue;                            // couldn't determine 90-min safely -> skip
    var hs = pick_(reg, cand.home), as = pick_(reg, cand.away);
    if (hs == null || as == null) continue;
    sheet.getRange(cand.rowIndex, 12).setValue(hs + '-' + as); // column L (1-based col 12)
    wrote++;
  }
  if (wrote) SpreadsheetApp.flush();
}

// 90-minute scores for a finished event, keyed by normalized team name.
// Plain full time -> the scoreboard final IS the 90-min score. Extra time / penalties
// -> read the summary's per-half linescores and sum only the first two halves.
function regulationScores_(ev) {
  if (!ev.extra && ev.scores) return ev.scores;    // regular FT: scoreboard score = 90 min
  var reg = summaryRegulation_(ev.id);             // ET/pens: derive 90 min from per-half data
  if (reg) return reg;
  if (!ev.extra && ev.scores) return ev.scores;    // (defensive) plain FT but summary failed
  return null;                                     // ET/pens without per-half data -> don't guess
}

function espnScoreboard_(day) {
  var out = [];
  try {
    var resp = UrlFetchApp.fetch(ESPN_SB_ + '?dates=' + day, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return out;
    var events = (JSON.parse(resp.getContentText()).events) || [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i], comp = (ev.competitions && ev.competitions[0]) || {}, cs = comp.competitors || [];
      if (cs.length !== 2) continue;
      var n0 = cs[0].team && (cs[0].team.displayName || cs[0].team.name);
      var n1 = cs[1].team && (cs[1].team.displayName || cs[1].team.name);
      if (!n0 || !n1) continue;
      var type = (ev.status && ev.status.type) || {};
      var detail = String((type.detail || '') + ' ' + (type.description || ''));
      var scores = {};
      scores[normTeam_(n0)] = numOrNull_(cs[0].score);
      scores[normTeam_(n1)] = numOrNull_(cs[1].score);
      out.push({
        id: ev.id, key: pairKey_(n0, n1), state: type.state || 'pre',
        extra: /extra|a\.?e\.?t|pen|shoot/i.test(detail), scores: scores
      });
    }
  } catch (err) { /* ESPN unreachable -> write nothing this run */ }
  return out;
}

// Sum the first two halves of ESPN's per-half linescores -> {normName: 90minGoals}.
function summaryRegulation_(eventId) {
  try {
    var resp = UrlFetchApp.fetch(ESPN_SUM_ + '?event=' + eventId, { muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return null;
    var hdr = JSON.parse(resp.getContentText()).header || {};
    var cs = ((hdr.competitions && hdr.competitions[0]) || {}).competitors || [];
    if (cs.length !== 2) return null;
    var reg = {};
    for (var i = 0; i < cs.length; i++) {
      var nm = cs[i].team && (cs[i].team.displayName || cs[i].team.name);
      var ls = cs[i].linescores;
      if (!nm || !ls || ls.length < 2) return null;   // need both halves, else bail (don't guess)
      var v0 = numOrNull_(ls[0].displayValue != null ? ls[0].displayValue : ls[0].value);
      var v1 = numOrNull_(ls[1].displayValue != null ? ls[1].displayValue : ls[1].value);
      if (v0 == null || v1 == null) return null;
      reg[normTeam_(nm)] = v0 + v1;
    }
    return reg;
  } catch (err) { return null; }
}

function pick_(map, name) { var v = map[normTeam_(name)]; return (v == null) ? null : v; }
function numOrNull_(v) { if (v === undefined || v === null || v === '') return null; var n = Number(v); return isNaN(n) ? null : n; }
function normTeam_(name) {
  var s = String(name == null ? '' : name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[.'`]/g, '').replace(/\s+/g, ' ').trim();
  return TEAM_ALIASES[s] || s;
}
function pairKey_(a, b) { var x = [normTeam_(a), normTeam_(b)]; x.sort(); return x[0] + '~' + x[1]; }
function parseKickoffMs_(s) {
  s = str_(s);
  var m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}).*?(\d{1,2}):(\d{2})/);
  if (!m) return null;
  var mon = MONTHS_[m[1].toLowerCase().slice(0, 3)];
  if (mon == null) return null;
  return Date.UTC(Number(m[3]), mon, Number(m[2]), Number(m[4]), Number(m[5])) - YEREVAN_OFFSET_MIN * 60000;
}
function dayStr_(ms, offsetMin) {
  var d = new Date(ms + offsetMin * 60000);
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return '' + d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate());
}
