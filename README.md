# WC2026 հաշիվգուշակոցի — Live Leaderboard

A gorgeous, responsive, **live** dashboard for a private 2026 FIFA World Cup score‑prediction
pool of 7 players. It reads predictions and results straight from your Google Sheet, computes
points/ranks in the browser, and shows a ranked leaderboard, per‑player hit breakdown, and a
color‑coded match‑by‑match grid.

- **`index.html`** — the entire frontend (Tailwind via CDN + vanilla JS, **zero build step**).
- **`Code.gs`** — the Google Apps Script that exposes your sheet as read‑only JSON.

> **Want to see it first?** Just open `index.html?demo` in a browser — it loads realistic sample
> data (and even reveals one more result per refresh, so you can watch the leaderboard re‑rank).

---

## How it works

```
Google Sheet ──▶ Apps Script Web App (doGet → JSON) ──▶ index.html (fetch + compute + render)
   private              public /exec URL, read-only          GitHub Pages (static)
```

The API is intentionally "dumb": it ships the raw score strings. **The browser computes all
points, breakdown counts, and rankings.** Row 26's totals are used only as a cross‑check — if the
sheet's number disagrees with the computed one, a small `!` appears, but the displayed score is
always the freshly computed value.

**Scoring:** exact score = **3**, correct draw (not exact) = **2**, correct win/loss side
(not exact) = **1**, otherwise / blank / not‑yet‑played = **0**. An exact draw (e.g. 1‑1 vs 1‑1)
scores 3, not 2.

---

## Sheet layout it expects (rows 2–25 = the 24 matches, row 26 = totals)

| Col | Content |
|-----|---------|
| A | weekday | 
| B | group |
| C | matchup, e.g. `Mexico vs Canada` |
| D | date/time (your local Armenian time, free text) |
| E–K | the 7 players' predictions as text `x-y` (E=Գարիկ … K=Արտյոմ) |
| L | actual result `x-y` (blank if not played) |
| Row 26, E–K | each player's live total (cross‑check only) |

> ⚠️ **Do not insert or reorder rows/columns.** The script reads fixed cells (`A2:L25`, `E26:K26`).
> Moving things will silently mis‑map data. To change player columns/names, edit `PLAYERS` in `Code.gs`.

---

## Part 1 — Deploy the data API (Apps Script Web App)

1. Open your sheet **"WC2026 հաշիվգուշակոցի"** → **Extensions → Apps Script**.
2. Delete the stub code in `Code.gs`, then paste the full contents of this repo's **`Code.gs`**.
3. Set the two config lines at the top:
   - `SHEET_ID` — the long middle part of your sheet URL:
     `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`
   - `SHEET_NAME` — the exact tab label at the bottom (e.g. `Sheet1`). Save (💾).
4. **Deploy → New deployment → ⚙️ → Web app**:
   - Description: `WC2026 API`
   - **Execute as: _Me_**
   - **Who has access: _Anyone_** (the truly anonymous option — *not* "Anyone with Google account")
   - **Deploy**.
5. **Authorize**: pick your account → "Google hasn't verified this app" → **Advanced → Go to
   (project) → Allow**. (Normal for your own script.)
6. Copy the **Web app URL** ending in `/exec`. Open it in a browser tab — you should see raw JSON
   starting with `{"ok":true,...`.

### Updating `Code.gs` later (keeps the same URL — important!)

**Deploy → Manage deployments → ✏️ Edit → Version: _New version_ → Deploy.**
Do **not** use "New deployment" for code edits — that mints a *new* `/exec` URL and breaks the live
site until you re‑paste it. (This is the #1 mistake.)

---

## Part 2 — Publish the dashboard (GitHub Pages)

1. In **`index.html`**, set `CONFIG.WEB_APP_URL` (near the top of the `<script type="module">`) to
   the `/exec` URL you copied:
   ```js
   WEB_APP_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
   ```
2. Create a GitHub repo and push these files:
   ```bash
   git init
   git add index.html Code.gs README.md
   git commit -m "WC2026 live leaderboard"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
3. Repo **Settings → Pages → Source: _Deploy from branch_ → `main` / `root` → Save.** Wait ~1 min.
4. Open `https://<you>.github.io/<repo>/`. Done — it auto‑refreshes every 45s.

> Any static host works too (e.g. drag the folder onto **Netlify Drop**). Both the page and the
> API are HTTPS, so there's no mixed‑content issue.

---

## Configuration knobs (top of `index.html`)

| Key | Default | What it does |
|-----|---------|--------------|
| `WEB_APP_URL` | _(paste yours)_ | the Apps Script `/exec` endpoint |
| `POLL_MS` | `45000` | live refresh cadence (ms) |
| `HIDE_UPCOMING_PREDICTIONS` | `false` | set `true` to hide picks until a match kicks off (anti‑copying) |
| `TZ` / `LOCALE` | `Asia/Yerevan` / `hy-AM` | timezone + locale for the "updated" clock |

URL flags: `?demo` = sample data, no API needed · `?test` = run the scoring test suite (results in
the browser console).

---

## Verifying it works

- **Scoring logic:** open `index.html?test` → console shows `tests: N/N passed`.
- **API:** open the `/exec` URL → `{"ok":true,...}`, `meta.matchCount` matches your filled rows.
- **Live:** open the dashboard, type a new result into column L of an in‑progress match → within
  ≤45s (or instantly on tab refocus / the ⟳ button) the cell recolors, the total counts up, and the
  leaderboard re‑orders.
- **Offline resilience:** kill your network → the board keeps showing the last good data with a
  greyed "Հնացած/Անջատ" indicator instead of going blank.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Dashboard shows "Միացրեք ձեր տվյալները" | `WEB_APP_URL` still has the placeholder — paste your `/exec` URL. |
| `/exec` shows `{"ok":false,"error":...}` | Wrong `SHEET_ID`/`SHEET_NAME`, or the tab was renamed. |
| Cells look mis‑aligned to players | A row/column was inserted or moved — restore the layout, or update `PLAYERS`/row constants in `Code.gs`. |
| Many `!` mismatch flags | Row‑26's formula differs from the ruleset (e.g. counts exact draws as 2). The computed score is the correct one; fix the sheet formula if you want them to agree. |
| Changed `Code.gs` but site unchanged | You created a new deployment. Use **Manage deployments → Edit → New version** to keep the URL. |
