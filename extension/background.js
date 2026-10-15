// Sentral-Timetable-Extension-V2: background worker.
//  - Every N minutes (default 15, school hours) it re-reads your Sentral timetable page and uploads periods 1-4 for every day of the fortnight shown.
//  - Every minute it asks your Apps Script whether the phone app has requested a fresh scrape, and does it straight away.
//  - Opening your Sentral timetable page also uploads immediately.
// Settings live in storage.local (not storage.sync) so the token is never copied into a Chrome/Google sync.

importScripts('parser.js'); // for sentralIsCurrent

var DEFAULT_BELL = {
  normal:    { '1': ['08:45', '10:00'], '2': ['10:20', '11:35'], '3': ['11:40', '12:55'], '4': ['13:35', '14:50'] },
  wednesday: { '1': ['08:45', '09:50'], '2': ['10:40', '11:45'], '3': ['11:50', '12:55'], '4': ['13:35', '14:40'] }
};
var DEFAULTS = { owner: 'G Horan', intervalMin: 15, activeFrom: '06:00', activeTo: '18:00', weekdaysOnly: true };
var NOT_SIGNED_IN = 'No timetable found. You are probably signed out of Sentral (or the page layout changed). Open Sentral and sign in.';

function pad(n) { return ('0' + n).slice(-2); }
function ymdOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function toMin(hhmm) { var p = String(hhmm || '').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }

async function getCfg() {
  var cfg = await chrome.storage.local.get(null);
  for (var k in DEFAULTS) if (cfg[k] === undefined) cfg[k] = DEFAULTS[k];
  if (!cfg.bell) cfg.bell = DEFAULT_BELL;
  return cfg;
}

function inActiveWindow(cfg, now) {
  now = now || new Date();
  var dow = now.getDay();
  if (cfg.weekdaysOnly !== false && (dow === 0 || dow === 6)) return false;
  var m = now.getHours() * 60 + now.getMinutes();
  return m >= toMin(cfg.activeFrom) && m < toMin(cfg.activeTo);
}

function buildDay(parsed, bell) {
  var p = parsed.date.split('-');
  var dow = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
  var set = (dow === 3 ? bell.wednesday : bell.normal) || {};
  var day = {
    date: parsed.date,
    periods: parsed.periods.map(function (x) {
      var t = set[x.period] || ['', ''];
      return { period: x.period, start: t[0], end: t[1], class: x.class, code: x.code, room: x.room, note: x.note };
    })
  };
  if (parsed.holiday) day.holiday = true;
  return day;
}

function apiUrl(cfg, query) {
  return cfg.url + (cfg.url.indexOf('?') < 0 ? '?' : '&') + 'token=' + encodeURIComponent(cfg.token) + (query ? '&' + query : '');
}

async function postJson(cfg, obj) {
  var res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(obj)
  });
  var text = await res.text(), json;
  try { json = JSON.parse(text); } catch (e) { throw new Error('Apps Script did not return JSON (check the deployment is "Anyone" and the URL ends in /exec)'); }
  if (!json.ok) throw new Error('Apps Script said: ' + (json.error || 'unknown error'));
  return json;
}

function ownerOk(cfg, headings) {
  var owner = (cfg.owner || '').trim().toLowerCase();
  if (!owner) return true;
  return (headings || []).some(function (h) { return h.toLowerCase() === owner; });
}

function normaliseTimetableUrl(href) {
  try {
    var u = new URL(href);
    if (u.pathname.indexOf('/timetables/timetable') < 0) return null;
    u.hash = '';
    u.searchParams.delete('cycle'); // no cycle = the current one
    return u.toString();
  } catch (e) { return null; }
}

async function saveStatus(st, tabId) {
  await chrome.storage.local.set({ lastStatus: st });
  if (tabId != null) {
    var text = st.state === 'ok' ? 'OK' : st.state === 'skipped' ? '-' : 'ERR';
    var color = st.state === 'ok' ? '#2e7d32' : st.state === 'skipped' ? '#757575' : '#c62828';
    try { chrome.action.setBadgeText({ tabId: tabId, text: text }); chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: color }); } catch (e) {}
  }
}

// info = { headings, hasTable, ymd, days }   days = every day parsed from the page
async function deliver(cfg, info, tabId, reason) {
  var st = { time: new Date().toISOString(), state: 'error', message: '', sent: null, reason: reason };
  var reportable = true;
  try {
    if (!cfg.url || !cfg.token) { reportable = false; throw new Error('Open the extension options and enter the Apps Script URL and token.'); }
    if (!info.hasTable) throw new Error(NOT_SIGNED_IN);
    if (!ownerOk(cfg, info.headings)) {
      reportable = false;
      st.state = 'skipped';
      st.message = 'This page is not the timetable for "' + cfg.owner + '", so nothing was uploaded.';
    } else {
      var days = info.days || [];
      if (!days.length) throw new Error('No days were found on the timetable page, or the layout was not understood.');
      var range = days[0].date + ' to ' + days[days.length - 1].date;
      if (!sentralIsCurrent(days, info.ymd)) {
        if (reason !== 'page') throw new Error('The saved timetable address shows ' + range + ', not the current fortnight. Open your current Sentral timetable once.');
        // You are just looking at another fortnight: leave the stored timetable alone.
        reportable = false;
        st.state = 'skipped';
        st.message = 'This page shows ' + range + ', not the current fortnight, so nothing was uploaded.';
      } else {
        var out = days.map(function (d) { return buildDay(d, cfg.bell); });
        await postJson(cfg, { token: cfg.token, source: 'extension-v2', scrapedAt: new Date().toISOString(), days: out });
        st.state = 'ok';
        st.message = 'Uploaded ' + out.length + ' days (' + range + ').';
        st.sent = out;
      }
    }
  } catch (e) {
    st.message = String((e && e.message) || e);
    if (reportable && cfg.url && cfg.token) {
      try { await postJson(cfg, { token: cfg.token, error: st.message }); } catch (e2) {}
    }
  }
  await saveStatus(st, tabId);
  return st;
}

async function ensureOffscreen() {
  if (chrome.runtime.getContexts) {
    var ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (ctx.length) return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html', reasons: ['DOM_PARSER'],
      justification: 'Read the timetable table from the Sentral page that was fetched'
    });
  } catch (e) {
    if (!/single offscreen/i.test(String(e && e.message))) throw e;
  }
}

// Re-read the Sentral page without opening a tab.
async function scrape(reason) {
  var cfg = await getCfg();
  var fail = async function (msg) {
    var st = { time: new Date().toISOString(), state: 'error', message: msg, sent: null, reason: reason };
    if (cfg.url && cfg.token) { try { await postJson(cfg, { token: cfg.token, error: msg }); } catch (e) {} }
    await saveStatus(st, null);
    return st;
  };
  if (!cfg.timetableUrl) return fail('Open your Sentral timetable page once so the extension learns its address.');
  var html;
  try {
    var res = await fetch(cfg.timetableUrl, { credentials: 'include', redirect: 'follow', cache: 'no-store' });
    html = await res.text();
  } catch (e) {
    return fail('Could not reach Sentral from this computer (' + String((e && e.message) || e) + ').');
  }
  var info;
  try {
    await ensureOffscreen();
    info = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'parse', html: html, ymd: ymdOf(new Date()) });
  } catch (e) {
    return fail('Could not read the Sentral page (' + String((e && e.message) || e) + ').');
  }
  if (!info) return fail('Could not read the Sentral page.');
  return deliver(cfg, info, null, reason);
}

async function pollRequests() {
  var cfg = await getCfg();
  if (!cfg.url || !cfg.token || !inActiveWindow(cfg)) return;
  try {
    var res = await fetch(apiUrl(cfg, 'action=status'), { cache: 'no-store' });
    var j = await res.json();
    if (j && j.ok && j.pending) await scrape('requested');
  } catch (e) { /* offline or Apps Script busy: try again next minute */ }
}

async function handlePage(msg, tabId) {
  var cfg = await getCfg();
  if (msg.hasTable && ownerOk(cfg, msg.headings)) {
    var u = normaliseTimetableUrl(msg.href);
    if (u && u !== cfg.timetableUrl) await chrome.storage.local.set({ timetableUrl: u });
  }
  return deliver(cfg, { headings: msg.headings, hasTable: msg.hasTable, ymd: msg.ymd, days: msg.days }, tabId, 'page');
}

async function ensureAlarms(force) {
  var cfg = await getCfg();
  var every = Math.max(5, +cfg.intervalMin || 15);
  var a = await chrome.alarms.get('scrape');
  if (force || !a || a.periodInMinutes !== every) {
    await chrome.alarms.clear('scrape');
    chrome.alarms.create('scrape', { delayInMinutes: 1, periodInMinutes: every });
  }
  var b = await chrome.alarms.get('poll');
  if (!b) chrome.alarms.create('poll', { delayInMinutes: 1, periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async function (alarm) {
  if (alarm.name === 'poll') return pollRequests();
  if (alarm.name === 'scrape') {
    var cfg = await getCfg();
    if (cfg.url && cfg.token && inActiveWindow(cfg)) await scrape('timer');
  }
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return;
  if (msg.type === 'page') { handlePage(msg, sender.tab ? sender.tab.id : null).then(sendResponse); return true; }
  if (msg.type === 'scrapeNow') { scrape('manual').then(sendResponse); return true; }
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && (changes.intervalMin)) ensureAlarms(true);
});

chrome.runtime.onInstalled.addListener(async function () {
  var cfg = await chrome.storage.local.get(['bell', 'owner']);
  var set = {};
  if (!cfg.bell) set.bell = DEFAULT_BELL;
  if (cfg.owner === undefined) set.owner = DEFAULTS.owner;
  if (Object.keys(set).length) await chrome.storage.local.set(set);
  ensureAlarms(true);
});
chrome.runtime.onStartup.addListener(function () { ensureAlarms(false); });
ensureAlarms(false);
