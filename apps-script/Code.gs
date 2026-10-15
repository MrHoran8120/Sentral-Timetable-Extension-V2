/**
 * Timetable mailbox.
 * - The Chrome extension (or bookmark) POSTs today's timetable here.
 * - The phone/desktop app GETs it back, and can ask for a fresh scrape.
 * Every request must carry the secret token. The timetable is kept in one JSON file in YOUR Drive.
 *
 * FIRST-TIME SETUP: run setup() once from the editor (Run button), approve the
 * permissions, then open View > Logs to see your TOKEN. Then Deploy > New deployment >
 * Web app, Execute as: Me, Who has access: Anyone.
 * After changing this code: Deploy > Manage deployments > edit > New version.
 *
 * GET  ?token=T                      the full timetable plus status
 * GET  ?token=T&action=status        status only (cheap)
 * GET  ?token=T&action=requestRefresh  ask the extension for a fresh scrape, returns status
 * POST {token, days:[...], scrapedAt}  store a timetable
 * POST {token, error:"..."}            record that a scrape failed
 */

var FILE_NAME = 'timetable-data.json';

function setup() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TOKEN', token);
  }
  getFile_(); // creates the data file and triggers the Drive permission prompt
  Logger.log('Your TOKEN is: ' + token);
}

function doPost(e) {
  try {
    // Normal posts send JSON as the body. The bookmark's backup route sends a form field called "payload".
    var raw = (e.parameter && e.parameter.payload) ? e.parameter.payload : e.postData.contents;
    var body = JSON.parse(raw);
    if (!tokenOk_(body.token)) return json_({ ok: false, error: 'bad token' });

    var props = PropertiesService.getScriptProperties();
    var now = new Date();

    if (body.error && !body.days) {
      props.setProperty('LAST_ERROR', JSON.stringify({ at: now.toISOString(), message: String(body.error).slice(0, 300) }));
      return json_({ ok: true, recorded: 'error' });
    }
    if (!body.days || !Array.isArray(body.days)) return json_({ ok: false, error: 'no days' });

    var sa = body.scrapedAt ? new Date(body.scrapedAt) : now;
    if (isNaN(sa.getTime()) || sa.getTime() > now.getTime() + 5 * 60 * 1000) sa = now;

    var data = {
      updated: now.toISOString(),
      scrapedAt: sa.toISOString(),
      source: body.source || '',
      days: body.days
    };
    getFile_().setContent(JSON.stringify(data));
    props.setProperty('META', JSON.stringify({ updated: data.updated, scrapedAt: data.scrapedAt }));
    props.deleteProperty('LAST_ERROR');
    return json_({ ok: true, updated: data.updated, days: data.days.length });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!tokenOk_(p.token)) return json_({ ok: false, error: 'bad token' });

  var props = PropertiesService.getScriptProperties();
  if (p.action === 'requestRefresh') {
    props.setProperty('REFRESH_REQUESTED_AT', new Date().toISOString());
  }
  var meta = JSON.parse(props.getProperty('META') || '{}');
  var req = props.getProperty('REFRESH_REQUESTED_AT') || null;
  var status = {
    ok: true,
    updated: meta.updated || null,
    scrapedAt: meta.scrapedAt || null,
    refreshRequestedAt: req,
    pending: !!req && (!meta.updated || req > meta.updated),
    lastError: JSON.parse(props.getProperty('LAST_ERROR') || 'null')
  };
  if (p.action === 'status' || p.action === 'requestRefresh') return json_(status);

  var text = getFile_().getBlob().getDataAsString();
  var data = text ? JSON.parse(text) : { days: [] };
  if (!status.updated) { status.updated = data.updated || null; status.scrapedAt = data.scrapedAt || data.updated || null; }
  for (var k in status) data[k] = status[k];
  if (!data.days) data.days = [];
  return json_(data);
}

function tokenOk_(t) {
  var real = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return !!real && !!t && t === real;
}

function getFile_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FILE_ID');
  if (id) {
    try { return DriveApp.getFileById(id); } catch (err) { /* recreate below */ }
  }
  var file = DriveApp.createFile(FILE_NAME, '', 'application/json');
  props.setProperty('FILE_ID', file.getId());
  return file;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
