# Sentral-Timetable-Extension-V2

Shows periods 1 to 4 for the current fortnight from your Sentral timetable on your phone and desktop.

    Sentral (school computer)  --extension, every 15 min-->  Apps Script (personal Google account)  <--app--  phone / desktop
                                  or the bookmark, on click

Only your personal Google account is used for the Apps Script and the phone.
The school account is only used to sign in to Sentral.

What is sent: periods 1 to 4 for each day of the fortnight shown on your timetable page (class name, class code, room, any change label), plus the
bell times from the options. No student data, no passwords.

## 1. Apps Script (personal Google account)

1. Sign in to your personal Google account and open https://script.google.com.
2. New project. Replace the contents of Code.gs with `apps-script/Code.gs`.
3. Choose `setup` in the toolbar and press Run. Approve the permissions.
4. View > Logs: copy the line "Your TOKEN is: ...". Keep it private.
5. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
6. Copy the Web app URL (ends in /exec).

Updating from an earlier version: paste the new Code.gs, then Deploy > Manage deployments > edit > New version.
The URL and token stay the same.

## 2a. Extension: for computers where Chrome allows it

1. chrome://extensions, turn on Developer mode, Load unpacked, choose the `extension` folder.
2. Open its Options and enter the Apps Script URL, token, your name exactly as shown at the top of your
   Sentral timetable, and check the bell times. Save.
3. Open your Sentral timetable page once (current cycle). The extension uploads straight away and remembers
   the address. The toolbar badge shows OK.
4. From then on, with Chrome open and you signed in to Sentral, it:
   - re-reads the timetable every 15 minutes, 6:00 to 18:00 on weekdays (changeable in Options)
   - checks every minute whether the phone app has asked for a fresh scrape, and does it straight away
   Options has a "Scrape now" button and shows exactly what was last sent.

Chrome will show a permission note that the extension can read data on Sentral sites. It only does this on
the timetable address it learned, to read your own timetable.

If your Sentral session expires, the scrape reports "signed out" and the phone app shows it in red.
Sign in to Sentral again and the next scrape works.

## 2b. Bookmark: where Chrome blocks installing extensions

1. Open `bookmarklet/make-bookmark.html` in Chrome (double-click).
2. Enter the URL, token, your name and the bell times, then Make bookmark.
3. Drag "Sync timetable" to the bookmarks bar (Ctrl+Shift+B shows it).
4. On your Sentral timetable page, click it. A box in the corner lists what was sent.

It only runs when you click it, so the phone app's "Update now" cannot trigger it.
The bookmark contains your token. If bookmarks sync to your school account, the token goes with them.

## 3. The app (phone and desktop)

1. Put the contents of the `app` folder on free static hosting, for example GitHub Pages.
   The URL and token are typed into each device and are never part of the hosted files.
2. Open the app address on your phone. Settings > paste the URL and token > Save.
   Shortcut: `https://YOUR-APP-ADDRESS/#url=WEB_APP_URL&token=TOKEN` fills it in once.
3. Install it: Android Chrome menu > Install app. iPhone Safari Share > Add to Home Screen. Desktop Chrome: install icon in the address bar.

In the app:
- A line of small type under the title shows when the timetable was last scraped, for example
  "Last scraped Thu, 15 Oct 2026, 2:31 pm (4 min ago)". It turns red after 2 hours.
- "Update now" (at the end of that line) asks your school computer for a fresh scrape. The extension notices
  within a minute. The app shows "Waiting..." and updates by itself. If no computer answers within 2 minutes it
  says so and keeps listening, so the update appears as soon as a computer with the extension is back online.
- The app re-reads what is already saved every 5 minutes while it is on screen, and whenever you switch back to it.
  The small circular-arrow icon (top right) does the same on demand; the gear icon opens Settings.
- From 8:30 am to 4 pm, today's running period is green with the minutes left, and between periods the next
  one says "Starting in x min".
- A red banner appears if the last scrape failed (for example, signed out of Sentral).

## Quick test of the Apps Script (no extension needed)

    curl -L -d '{"token":"TOKEN","days":[{"date":"2026-10-16","periods":[{"period":"1","start":"09:00","end":"09:50","class":"Test class","room":"T1"}]}]}' "WEB_APP_URL"
    curl -L "WEB_APP_URL?token=TOKEN&action=status"

Do not add `-X POST`: curl would then repeat the POST on Google's redirect and get "411 Length Required".

## Offline tests

The tests need a saved copy of your own Sentral timetable page at `tests/fixtures/sentral-timetable.html`
(in Chrome: Ctrl+S, "Webpage, HTML only"). It is in .gitignore because it holds your name, school and classes.
Then `cd tests && npm install && npm test`.

## Known limits

- The refresh button needs a computer with the extension, Chrome open and Sentral signed in. It cannot
  scrape from the phone.
- The bell times for normal days came from a 2022 sheet. Check them in Options.
- If Sentral changes its page layout, the reader (`extension/parser.js`) may need a small fix.
