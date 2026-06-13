/**
 * WC2026 հաշիվգուշակոցի — read-only JSON API.
 *
 * Deployed as a Google Apps Script Web App (Deploy ▸ New deployment ▸ Web app,
 * "Execute as: Me", "Who has access: Anyone"). The dashboard fetches the /exec
 * URL with a plain GET; this script ONLY reads the sheet and returns JSON.
 *
 * It is structurally incapable of editing the sheet: it never calls
 * setValue/setValues/appendRow/deleteRow. The only data it exposes is the
 * rectangle A2:L25 (the 24 matches) plus E26:K26 (the sheet's own totals row).
 *
 * See README.md for the full deploy runbook.
 */

// ===== CONFIG — the organizer edits these two lines =====================
// SHEET_ID is the long middle part of the sheet URL:
//   https://docs.google.com/spreadsheets/d/<THIS_IS_THE_ID>/edit
var SHEET_ID = 'PASTE_SPREADSHEET_ID_HERE';
// Exact name of the tab that holds the predictions (bottom-left tab label).
var SHEET_NAME = 'Sheet1';

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
var LAST_DATA_ROW  = 25;  // last match row (24 matches: rows 2..25)
var TOTALS_ROW     = 26;  // sheet's live totals row

// ===== Web app entry point =============================================
function doGet(e) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    if (!sheet) throw new Error('Sheet/tab not found: "' + SHEET_NAME + '"');

    // ONE rectangular read for all 24 match rows (A2:L25 = 24 rows x 12 cols).
    var grid = sheet
      .getRange(FIRST_DATA_ROW, 1, LAST_DATA_ROW - FIRST_DATA_ROW + 1, 12)
      .getValues();

    // ONE read for the sheet's own live totals (E26:K26).
    var totalsRow = sheet
      .getRange(TOTALS_ROW, 5, 1, 7) // start col E(5), 7 cols => E..K
      .getValues()[0];

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
        predictions: predictions,      // E..K, each "x-y" or null
        actual:   actual,              // L, "x-y" or null
        played:   actual !== null
      };
    }).filter(function (m) {
      // Drop fully-empty trailing rows so a partly-filled sheet renders cleanly.
      return m.matchup !== '' || m.actual !== null;
    });

    var sheetTotals = {};
    PLAYERS.forEach(function (p, idx) {
      var v = totalsRow[idx];
      sheetTotals[p.key] = (v === '' || v === null) ? 0 : (Number(v) || 0);
    });

    return json_({
      ok: true,
      players: PLAYERS.map(function (p) { return { key: p.key, name: p.name }; }),
      matches: matches,
      sheetTotals: sheetTotals,
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
