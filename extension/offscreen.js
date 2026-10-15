// Chrome extensions' background workers have no DOM, so this hidden page reads the
// Sentral HTML that background.js fetched.
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'parse') return;
  var doc = new DOMParser().parseFromString(msg.html, 'text/html');
  var headings = [], hs = doc.querySelectorAll('h3');
  for (var i = 0; i < hs.length; i++) headings.push((hs[i].textContent || '').replace(/\s+/g, ' ').trim());
  sendResponse({
    headings: headings,
    hasTable: !!doc.querySelector('table.timetable'),
    ymd: msg.ymd,
    days: sentralParseAll(doc)
  });
});
