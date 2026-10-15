# Handover: Sentral-Timetable-Extension-V2

For Claude Code in VS Code. Read this first, then README.md (setup steps for the user).
Everything below was built and tested in a chat session with no real Chrome, no real Apps Script and no
live Sentral. All tests so far use mocks and one saved copy of the user's Sentral timetable page.
Your job is to take it from "passes against mocks" to "works for real".

## 1. The user and the goal

- G Horan, high school teacher in NSW (Australian English; metric units only).
- Wants today's lessons (periods 1 to 4 only, for the current day only) from their own Sentral timetable
  shown in an app on their phone and desktop.
- Sentral login is a school Google account on a school-managed Chrome. The phone is signed in to a
  different, personal Google account. So the Apps Script must live under the PERSONAL account, deployed
  "Anyone", with a shared token as the only protection.
- School Chrome blocks "Load unpacked" extensions, so there are two desktop routes:
  1. Extension (for computers that allow it): scrapes automatically every 15 minutes.
  2. Bookmark (fallback): a javascript: bookmark the user clicks on the Sentral page.
- The phone app shows a small "Last scraped" date/time stamp and has a "Get latest from Sentral" button
  that asks the computer running the extension to scrape now.
- It must be copyable by colleagues: nothing hard-coded to this user; each person runs their own Apps Script,
  and enters URL/token/name/bell times in settings.
- The user is a computing teacher, comfortable with code. Keep replies short and plain.

## 2. Architecture

    Sentral (school Chrome)
       |  extension (alarm every 15 min, background fetch + offscreen parse)   or   bookmark (on click)
       v  POST {token, days:[today], scrapedAt}
    Apps Script web app (personal Google account; data in a Drive JSON file; status in Script Properties)
       ^  GET ?token=T [&action=status|requestRefresh]
       |  app (PWA on phone/desktop, hosted on static hosting such as GitHub Pages)
       |  "Get latest" -> action=requestRefresh -> extension polls action=status every minute, sees pending, scrapes

File map:

    apps-script/Code.gs        doGet/doPost, token check, META/LAST_ERROR/REFRESH_REQUESTED_AT in Script Properties
    extension/manifest.json    MV3. permissions: storage, alarms, offscreen. hosts: *.sentral.com.au, script.google.com(+usercontent)
    extension/parser.js        sentralParseDay(doc, 'YYYY-MM-DD') shared by content script, offscreen page and the bookmark
    extension/content.js       on the timetable page: parse today, send {type:'page'} to background
    extension/background.js    alarms ('scrape' every N min, 'poll' every 1 min), scrape(), deliver(), buildDay() (adds bell times)
    extension/offscreen.*      DOMParser host, because a service worker has no DOM
    extension/options.*        URL, token, owner name, interval, active hours, bell times JSON, "Scrape now", last status
    bookmarklet/make-bookmark.html   generator; inlines parser.js; produces the javascript: bookmark
    app/index.html (+sw.js, manifest.json, icons)   the PWA
    tests/                     offline tests (npm install; npm test), fixture = the user's saved Sentral page

The bookmarklet generator contains a COPY of parser.js (inserted at build time between the
`<script id="parser-src">` tags). If parser.js changes, regenerate it: replace the contents of that tag.

## 3. Data contract

POST body (Content-Type text/plain to avoid a CORS preflight; or form field `payload` for the bookmark's backup route):

    { "token": "...", "source": "extension-v2|sentral-bookmark", "scrapedAt": "ISO",
      "days": [ { "date": "2026-10-15",
                  "periods": [ { "period":"1", "start":"08:45", "end":"10:00",
                                 "class":"Software Engineering Accelerated Yr10", "code":"10AccSE2",
                                 "room":"212", "note":"" } ] } ] }
    or { "token": "...", "error": "message" }     (records LAST_ERROR; cleared by the next successful upload)

GET ?token=T returns the stored data plus: ok, updated, scrapedAt, refreshRequestedAt, pending, lastError.
`pending` = refreshRequestedAt > updated (both server time). action=status returns only the status fields.
action=requestRefresh sets refreshRequestedAt = now and returns status.

Notes: periods are only "1".."4". A period with no lesson is `{class:"Free"}`. On call and events come through
as class "On call" / the event title. A holiday day has `periods: []`. A cell holding two classes yields two entries
with the same period. Each upload REPLACES the stored data (today only).

## 4. What the real Sentral page looks like (from the saved fixture)

- URL shape: `https://school.sentral.com.au/s-XXXXXX/timetables/timetable?teacher=123` (`&cycle=16` = Term 4 Weeks 1-2).
  The `s-XXXXXX` path segment may be per-session or per-school. UNKNOWN. The extension stores the address from
  the last page visit and strips `cycle`, so if that segment rotates, the background scrape will fail until the
  user visits the page again.
- Two `table.timetable` per page (week A, week B of a two-week cycle). Header rows: `th.timetable-day` (MonA..FriB),
  `th.timetable-date` (day name, then DD/MM/YYYY). Body rows: `th.timetable-period` labels 0,1,2,3,4,5,L1,L2,Meet1,R
  (repeated at column boundaries), `td.timetable-dayperiod` cells, `td.timetable-spacer`.
- A holiday is one `td.timetable-holiday rowspan=10` in the first body row, so later rows have fewer cells.
  parser.js tracks rowspans to map cells to date columns.
- Lesson cell: `.timetable-class` with `<strong>` class name, `a[href*="class="]` "(9CT1)", `a[href*="room="]` room,
  teacher link, optional `.label` (OnCall, Event, others unknown). On call/event cells have an empty `<strong>`
  and the title as plain text.
- The page shows NO period start/end times. Times come from the bell-times setting.
- No student names appear on this page. Other views (class/room pages) were not seen.
- The page's Options menu has "Download as iCal" (`?teacher=123&action=export`). The user's notes said Sentral gives
  them no export, but the link is in the saved page. NOT TESTED. If it returns lesson times it could replace scraping
  (and give the bell times). Ask the user to click it while signed in.
- The parser identifies today by DATE, not by Sentral's `today` class (verified both give the same result on the fixture).

## 5. Status

Built and passing against mocks (run `cd tests && npm install && npm test`; output is printed for reading, not asserted):

| Test file | Covers |
|---|---|
| parser.test.js | Day mapping for 10 dates incl. holiday column, week-B table, weekend (null), two classes in a cell, no-`today`-class case |
| extension-background.test.js | alarms created; timer scrape; poll with/without pending; outside active hours; signed-out page; page-visit upload and URL learning; wrong-owner skip; missing address; Wednesday bell times |
| apps-script.test.js | token checks, status, requestRefresh -> pending -> cleared by upload, error report/clear, scrapedAt clamp, form-field route |
| app.test.js | not configured, small-type stamp, stamp turns red after 2 h, request/wait/answer sequence, 2-minute timeout then late answer, pending on open, error banner, demo, settings refuses a bad URL / empty token, 2-minute timeout still happens when status checks fail |
| bookmark.test.js | generator output; bookmark on the fixture; Wednesday; fetch blocked -> form backup; wrong owner; non-timetable page; holiday |

NEVER RUN FOR REAL (everything below is unverified):

- Apps Script deployment itself (DriveApp, Script Properties, the "Anyone" web app, 302 redirect on POST).
- The app calling the real web app cross-origin from a hosted page (relies on Apps Script returning CORS headers on
  GET after the redirect; POST is not used by the app).
- The extension loaded in a real Chrome: MV3 service-worker lifecycle with alarms, `chrome.offscreen`
  (Chrome 109+), `getContexts`, badge text.
- `fetch(timetableUrl, {credentials:'include'})` from the service worker carrying the user's Sentral session cookies.
- The bookmark inside Sentral's page (a CSP `connect-src` could block `fetch` to script.google.com; the form-post
  backup might also be blocked by `form-action`; school policy may block javascript: bookmarks).
- PWA install, service worker caching, offline start.

## 5a. Real-world test checklist

The list above was written before any live testing. This checklist is the current state.

Done for real on 2026-10-15 (Apps Script on the personal Google account, deployed with `clasp --user personal`;
extension in the work Chrome, app served locally at localhost:5173 in both the work and private Chrome):

- [x] Apps Script deployed "Anyone"; wrong token refused on GET and POST; CORS header present on GET and its redirect
- [x] Work Chrome allows Load unpacked
- [x] Extension learns the timetable address from a page visit and uploads (badge OK)
- [x] Options > Scrape now: background fetch carries the Sentral sign-in; 4 periods uploaded
- [x] App reads the data cross-origin; periods, bell times, codes, rooms and the small stamp show correctly
- [x] "Get latest from Sentral" round trip (with Until temporarily set to 23:00)

Still to test:

- [ ] App Settings refuses a URL that is not `https://script.google.com/macros/s/.../exec` (e.g. missing "h") and an empty token (fix added 2026-10-15)
- [ ] "Get latest": if the app cannot reach the Apps Script while waiting, it still gives up after 2 minutes, says it cannot reach the Apps Script, and recovers by itself when back online (fix added 2026-10-15; test by turning Wi-Fi off after clicking)
- [ ] 15-minute timer scrapes by itself during school hours (stamp advances) and survives the service worker going idle
- [ ] Signed out of Sentral -> red "last scrape failed" banner in the app; signing in and scraping clears it
- [ ] Viewing another fortnight (`&cycle=`) does not raise a false error (known issue, not fixed yet)
- [ ] Bookmark route on the real Sentral page (CSP / javascript: policy)
- [ ] App hosted (GitHub Pages, `app` folder only), installed on the phone, opens offline, picks up a new deploy (cache now `timetable-shell-v3`)
- [ ] Phone app Settings filled in and showing today's lessons

## 6. Start here: test plan in order

1. `cd tests && npm install && npm test`. Read the output. Everything should look like the tables above.
   If anything differs, fix it before going further. Consider converting the printed checks into real assertions.
2. Deploy Apps Script on the user's PERSONAL account (README step 1). Run the two curl commands in README.
   Expect: POST returns `{"ok":true,...}`; `?action=status` shows `pending:false` and a `scrapedAt`. Then
   `?action=requestRefresh` should flip `pending` to true, and another POST should flip it back.
3. Serve `app/` locally (`npx serve app` or `python -m http.server`) and open
   `http://localhost:PORT/#url=WEB_APP_URL&token=TOKEN`. Check: stamp appears in small type, today's periods show,
   "Get latest from Sentral" sets pending on the server. Watch the browser console for CORS errors on the GET.
   If CORS fails, the app needs a different read route (for example JSONP with a `callback` param in doGet).
4. Bookmark: generate it from `bookmarklet/make-bookmark.html`, click it on the real Sentral timetable page in the
   user's school Chrome. Expected: green box listing four periods, then the app's stamp changes. Failure modes to
   report back: nothing happens (javascript: URLs blocked), red box, or the box says sent but the server has nothing
   (CSP blocked fetch and the form backup).
5. Extension in a Chrome that allows it (the user's home computer or another school-unmanaged profile):
   a. Load unpacked, set Options (URL, token, name "G Horan"), open the Sentral timetable page. Badge should show OK
      and Options should show the exact JSON sent.
   b. Options > Scrape now. This exercises the background fetch + offscreen path with no tab. Expected: OK and the
      app's stamp updates. If it says "No timetable found... signed out" while signed in, the cookies are not being
      sent or the page is built by JavaScript. Capture the fetched HTML (log its length and the first 300 characters).
      Fallback design if needed: open the timetable in a background tab or minimised window and let content.js read it.
   c. Timer: set interval to 5 minutes, leave Chrome open, check the stamp advances. Then let the service worker go
      idle (about 30 s) and confirm the alarms still fire.
   d. Request button: tap "Get latest from Sentral" on the phone app. Within about a minute the extension should
      scrape and the app should show "Updated from Sentral." If nothing happens, check `chrome://serviceworker-internals`
      and that the active window (default 06:00 to 18:00 weekdays) covers the current time.
   e. Signed out: sign out of Sentral, scrape. The app should show the red "last scrape failed" banner. Sign in again,
      scrape, banner clears.
6. PWA: host `app/` (GitHub Pages: ONLY the `app` folder, see section 8), install on a phone, test offline start and
   that a new deploy replaces the old one (cache name is `timetable-shell-v2`; bump it when changing app files).

## 7. Likely trouble spots

- Background fetch cookies / SameSite, or Sentral rendering the table with JavaScript (the fixture was saved from a
  live browser, so it proves nothing about raw server HTML). Test 5b settles this.
- Sentral address segment `s-XXXXXX` rotating. Compare the address across two sign-ins.
- Apps Script limits for consumer accounts. The 1-minute poll costs one short execution per minute, only in
  active hours. If quota is a problem, make the poll every 2 to 5 minutes or add a cheap cache.
- `chrome.alarms` period under 1 minute is not used. The 1-minute poll means "Get latest" can take up to a minute.
- Bookmark and extension options hold the token. Bookmarks sync to the school Google account. Documented in README.
- Parser assumptions: two tables per page; five date columns each; one holiday rowspan pattern. A different school's
  Sentral may differ. Add fixtures for other layouts if colleagues try it.

## 8. Constraints and decisions to keep

- Only today's periods 1 to 4. No student data, no rosters, no marks, no attendance. The owner-name check
  (the page's h3 must equal the configured name) stops uploading someone else's timetable.
- Settings use `chrome.storage.local`, NOT `sync`, so the token never goes into a Google account's sync.
- The Apps Script is deployed "Execute as: Me, Anyone can access". The token is the only protection. Never commit a
  real token or Web app URL to a repository.
- `tests/fixtures/sentral-timetable.html` is the user's own saved page (name, school, class codes, session-like
  path). Keep it out of any public repo. The user's GitHub Pages repo should contain only the `app` folder.
  Suggested .gitignore for a private repo: `tests/node_modules/`.
- Do not add features the user has not asked for. They have asked for: today-only periods 1-4; 15-minute scraping where
  the extension is allowed; a click-to-update fallback; last-scraped stamp in small type; a refresh button; copyable by
  others; application name "Sentral-Timetable-Extension-V2".
- Check school policy before the user shares this with colleagues (scraping a school system into personal Google
  accounts may be restricted). Say so once if it comes up; do not lecture.

## 9. Open questions for the user

1. Are Thursday's (normal day) bell times 8:45-10:00, 10:20-11:35, 11:40-12:55, 13:35-14:50? They came from a 2022 sheet.
   Wednesday uses the user's current summer sheet: 8:45-9:50, 10:40-11:45, 11:50-12:55, 13:35-14:40. Other days and terms unknown.
2. Does "Download as iCal" work for them (section 4)?
3. Where will the app be hosted (GitHub Pages or other)?
4. Is the extension allowed anywhere they use (home computer)? Or is the bookmark the only route at school?
5. Is publishing the extension privately on the Chrome Web Store ($5 one-off) worth trying for school Chrome? It may still be blocked by policy.

## 10. Reasonable next steps once the above passes

- Convert tests to real assertions and add CI.
- Make bell times per-term (summer/winter) and per-day.
- Optionally show more than today (the data model already supports several days; only the extension limits it to today).
- Chrome Web Store listing for easier colleague installs.
