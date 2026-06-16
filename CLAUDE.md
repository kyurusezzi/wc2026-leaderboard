# WC2026 հաշիվգուշակոցի — project guide (read me first)

Live leaderboard web app for a **private 2026 FIFA World Cup score-prediction pool** (7 players, Armenian UI). Reads a Google Sheet, computes scoring/ranks **in the browser**, and shows live scores + tactical lineups.

- **Live site:** https://kyurusezzi.github.io/wc2026-leaderboard/ (GitHub Pages)
- **Repo:** github.com/kyurusezzi/wc2026-leaderboard — git identity is **local** to this repo: `kyurusezzi <kyaruntsg@gmail.com>` (global is a different/work identity; don't touch it). Push uses SSH host alias `git@github.com-kyurusezzi:…`.
- **Data API:** a Google Apps Script Web App `/exec` (URL in `index.html` → `CONFIG.WEB_APP_URL`).

## Files (only two that matter)
- **`index.html`** — THE ENTIRE FRONTEND. One self-contained file: Tailwind via CDN + one inline `<script type="module">`. **ZERO build step.** Module sections (physical order `1,3,4,2,5,6,7,8,9,10` — pure helpers live in the SCORING block so the `?test` harness, which runs before the data section, can reach them):
  `1 CONFIG · 3 SCORING (parseScore/scoreOne/aggregatePlayer/computeStandings + parseKickoff/matchTimeState + normTeam/pairKey + lineOf) · 3b BRACKET HELPERS (parseSlotCode/parsePool/parseSlotLabel/computeBestThirds — pure) · 4 TESTS (runTests, ?test) · 2 DATA (fetch/poll/backoff/cache/store + ESPN: refreshLiveScores/liveByKey/resolveEventId/fetchLineups + fetchStandings/fetchBracket) · 5 state/buildViewModel · 6 ui-helpers · 7 header · 8 leaderboard (FLIP) · 9 grid (visibleGroups/matchRowDesktop/matchCardMobile/actualChip + lineup modal) · 9b BRACKET (bracketViewModel/renderBracketDesktop/renderBracketMobile + #bracket routing) · 10 main/boot`.
- **`Code.gs`** — Google Apps Script. `doGet` (public Web App, **READ-ONLY**) returns the sheet as JSON. `syncFinals` (owner-run **time trigger**, opt-in via `setupAutoSync`) auto-fills BLANK column L with the 90-minute result. `normTeam_`/`TEAM_ALIASES`/`pairKey_` mirror the frontend — **keep them in sync**.
- `README.md` — deploy runbook.

## Architecture
Sheet → `doGet` JSON (`{players, matches[], meta}`) → `index.html` **computes everything client-side**. The API is "dumb"; the browser scores. Live scores + lineups come straight from **ESPN's keyless endpoints in the browser** (not the sheet).

## NON-NEGOTIABLE INVARIANTS
- `index.html` stays **one file, zero build** (Tailwind CDN + inline module). No framework/bundler/npm.
- **Scoring source of truth = column L** (the actual result). Live/ESPN data is **display-only** — never fed into `scoreOne`/`computeStandings`/leaderboard.
- **Scoring = the 90-MINUTE result, every stage.** ET goals + penalty shootouts are shown live but **never scored**.
- Every ESPN fetch is wrapped so failure is an **invisible no-op** (board never blanks).
- `doGet` is read-only; only the owner-run `syncFinals` trigger writes, and **only into BLANK column L** (never overwrites a manual entry).

## Scoring rules
exact=**3**, correct draw (not exact)=**2**, correct win/loss side (not exact)=**1**, else/blank/unplayed=**0**. An exact draw (`1-1` vs `1-1`)=3, not 2.

## Sheet layout (one match per row, from row 2; the table grows downward)
`A`=weekday · `B`=group (`Group A`) · `C`=matchup (`Home vs. Away`) · `D`=datetime (`June 18, 2026 at 20:00`, **Asia/Yerevan, UTC+4**) · `E–K`=the 7 players' predictions (`x-y`) · `L`=actual (`x-y`/blank) · `M`=stage label (`1-ին փուլ`, `2-րդ փուլ`, …). `doGet` reads row 2→last dynamically; a row counts as a match if `C` splits into 2 teams **or** `L` is filled (so totals/blank rows are skipped). The **grouping UI appears only when ≥2 distinct `M` values** exist. Players E→K: Գարիկ, Խաժակ, Սաշա, Արման, Պարթև, Վահե, Արտյոմ.

## Live data (ESPN — keyless, CORS `*`)
- Scores: `site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD`
- Lineups: `…/summary?event={id}` → `rosters[]` (formation, starting XI, subs, `uniform.color` kit, `team.logos` crest; player photos are sparse → kit-colour numbered fallback). 90-min for ET/pens = sum of the first two `linescores` halves.
- **Standings (bracket projection):** `site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings` → `children[]` = 12 groups, each `standings.entries[]` with `team` + stats (rank, points, pointDifferential=GD, pointsFor=GF, wins/ties/losses). `team.abbreviation` = 3-letter code; **circular national flag** = `team.logos[0].href` (standings) or `team.logo` (scoreboard), both `…/i/teamlogos/countries/500/{abbr}.png`.
- **Knockout bracket feed:** the scoreboard with the knockout date **range in one fetch** (`?dates=20260628-20260719`) returns all 32 events, tagged by `season.slug` (`round-of-32`/`round-of-16`/`quarterfinals`/`semifinals`/`3rd-place-match`/`final`). Unresolved slots are encoded in the competitor name/abbr (`Group A Winner`/`1A`, `Group B 2nd Place`/`2B`, `Third Place Group A/B/C/D/F`/`3RD`, `Round of 32 1 Winner`, …) — ESPN swaps in the real team (+ score) once known. Per round, events numbered 1..N by ascending `event.id` == ESPN's own feed-ref numbering (so the topology is exact). **No FIFA best-8-thirds allocation table needed** — ESPN resolves the third-place assignment server-side.
- ESPN↔sheet matching = `normTeam` + `TEAM_ALIASES` + `pairKey` (order-insensitive). `normTeam` strips diacritics, `&`→`and`, `-`→space. **Known name diffs that need aliases:** USA↔United States, Türkiye↔Turkey, Ivory Coast↔Côte d'Ivoire, **Cabo Verde↔Cape Verde**, **Bosnia and Herzegovina↔Bosnia-Herzegovina**, Czechia↔Czech Republic, Korea Republic↔South Korea. When a result doesn't sync, suspect a new name mismatch first.

## VERIFY before claiming done (always — this project rewards real verification)
- `node --check` the extracted module; run `?test` in node (regex the `<script type=module>` out of `index.html`, shim `location`/`window`, `import` + call `runTests()` → all pass, ~75).
- **Real headless render** with Chrome: `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=14000 --screenshot=/tmp/x.png "file://$PWD/index.html?demo"` (also `?test`, `?lineup=<row>`), then **Read the screenshot**. Test against REAL data (live `/exec` + ESPN), and test the **default/closed** states too, not just the happy path.
- Code.gs logic: node harness stubbing `UrlFetchApp`/`SpreadsheetApp`/`ScriptApp` + real ESPN fetch.

## Ship process
- **Frontend:** edit `index.html` → verify → `git commit && git push` → GitHub Pages redeploys (~1 min); poll the live URL for the change. Hard-refresh (browsers cache).
- **Code.gs:** the user pastes it into the Apps Script editor + **Save** — the `syncFinals` **trigger runs the SAVED code**, so a code change needs **paste+Save, NOT a redeploy**. "Deploy → Manage deployments → New version" is only for `doGet` changes (keeps the same `/exec` URL). Using "**New deployment**" mints a new URL and breaks the site — the #1 footgun.

## Gotchas / lessons learned
- **CSS specificity:** an `#id` rule beat Tailwind's `.hidden` → the lineup modal got stuck open. Use `:not(.hidden)` / base `display:none`. (Tests always opened it, so they missed it — test default + close states.)
- Apps Script has latency spikes (cold start) → `REQUEST_TIMEOUT_MS=25s`, backoff cap 2 min.
- Tabs don't survive chat copy → hand fixtures to the user as **per-column paste blocks**, not TSV.
- The "soon" badge window is 120 min; the live badge is driven by **ESPN state**, not just the clock, so late kickoffs / long stoppage don't lose the badge.

## Current state (mid-June 2026)
Matchday 1 + 2 fixtures are in the sheet (M = `1-ին փուլ` / `2-րդ փուլ`), auto-sync trigger is enabled. **Pending:** user to re-paste `Code.gs` so the Cabo Verde + Bosnia alias fixes reach the running trigger. **Matchday 3 + knockout fixtures** to be generated later — method: ESPN scoreboard, per-group take the 2 earliest remaining games = next matchday, map ESPN names → the user's sheet spellings, convert kickoffs to Yerevan (UTC+4), output as `weekday / Group X / Home vs. Away / Month DD, YYYY at HH:MM`.

## Knockout bracket page (`#bracket`) — BUILT
A second view, reached by the header nav tab (`🗺️ Փլեյ-օֆ`) or the `#bracket` hash deep-link. Shows the **knockout bracket with REAL countries**: a **live projected** bracket during the group stage that **auto-resolves to the real bracket** once ESPN fills the draw. Display-only — never touches prediction scoring; `Code.gs` untouched.

- **Source = ESPN only.** The knockout scoreboard feed (range fetch) is the bracket skeleton (rounds, venues, dates, feed-forward, auto-resolving teams + scores); the standings feed projects the still-placeholder **R32** slots during the group stage. See the **Live data** section for both endpoints.
- **Projection depth:** R32 winner/runner-up slots show that group's CURRENT ESPN leader/runner-up (dashed "proj." chip); the 8 third-place slots show their pool label (`3-րդ՝ C/E/F/H/I`) + a **best-thirds race** panel (12 thirds ranked, top-8 highlighted); R16+ feed-ref slots show `Հաղթող`/`Պարտվող` until ESPN resolves them. `phase` flips projected → live → final automatically.
- **Layout:** chips = abbr + circular flag (the reference image). Desktop = two-sided symmetric bracket with the champion (🏆/ՉԵՄՊԻՈՆ) centered; mobile = one-sided horizontal **swipe** bracket. Both built from one `bracketViewModel` (DFS over the topology tree → sibling-adjacent ordering so the CSS-flex connectors line up); `.bk-*` classes, pitch-green/`.glass` palette.
- **Routing:** `view.page` (`leaderboard`|`bracket`); `applyRoute()` toggles `#content` vs `#bracket-view`; `render()` early-returns on the bracket page (keeps `lastVM` fresh for the header pill). `ensureBracket()` lazy-fetches + throttles (`BRACKET_POLL_MS`), refreshing only while the page is open. Every fetch is an invisible no-op → blocked ESPN shows a calm message, never blanks.
