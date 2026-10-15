var DEFAULT_BELL = {
  normal:    { '1': ['08:45', '10:00'], '2': ['10:20', '11:35'], '3': ['11:40', '12:55'], '4': ['13:35', '14:50'] },
  wednesday: { '1': ['08:45', '09:50'], '2': ['10:40', '11:45'], '3': ['11:50', '12:55'], '4': ['13:35', '14:40'] }
};
var $ = function (id) { return document.getElementById(id); };

function showStatus(s) {
  if (!s) return;
  $('last').textContent = new Date(s.time).toLocaleString('en-AU') + ' · ' + s.state.toUpperCase() + ' · ' + s.message;
  $('last').className = s.state === 'ok' ? 'ok' : s.state === 'error' ? 'bad' : 'hint';
  if (s.sent) { $('sent').hidden = false; $('sent').textContent = JSON.stringify(s.sent, null, 2); }
}

chrome.storage.local.get(null, function (cfg) {
  $('url').value = cfg.url || '';
  $('token').value = cfg.token || '';
  $('owner').value = cfg.owner === undefined ? 'G Horan' : cfg.owner;
  $('interval').value = cfg.intervalMin || 15;
  $('from').value = cfg.activeFrom || '06:00';
  $('to').value = cfg.activeTo || '18:00';
  $('weekdays').checked = cfg.weekdaysOnly !== false;
  $('bell').value = JSON.stringify(cfg.bell || DEFAULT_BELL, null, 2);
  $('tturl').textContent = cfg.timetableUrl
    ? 'Timetable address being scraped: ' + cfg.timetableUrl
    : 'The extension learns your timetable address the first time you open your Sentral timetable page.';
  showStatus(cfg.lastStatus);
});

function save(done) {
  var bell;
  try { bell = JSON.parse($('bell').value); } catch (e) {
    $('msg').className = 'bad'; $('msg').textContent = 'Bell times are not valid JSON: ' + e.message; return;
  }
  chrome.storage.local.set({
    url: $('url').value.trim(), token: $('token').value.trim(), owner: $('owner').value.trim(),
    intervalMin: Math.max(5, parseInt($('interval').value, 10) || 15),
    activeFrom: $('from').value || '06:00', activeTo: $('to').value || '18:00',
    weekdaysOnly: $('weekdays').checked, bell: bell
  }, function () { $('msg').className = 'ok'; $('msg').textContent = 'Saved.'; if (done) done(); });
}

$('save').onclick = function () { save(); };
$('now').onclick = function () {
  save(function () {
    $('msg').className = 'hint'; $('msg').textContent = 'Scraping…';
    chrome.runtime.sendMessage({ type: 'scrapeNow' }, function (st) {
      $('msg').textContent = ''; showStatus(st);
    });
  });
};
