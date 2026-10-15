// Runs when you open your Sentral timetable page. Reads every day on the page (periods 1-4) with parser.js
// and hands it to background.js. It never reads student lists, passwords or cookies.
(function () {
  'use strict';
  if (window.top !== window) return;

  function pad(n) { return ('0' + n).slice(-2); }
  var now = new Date();
  var ymd = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());

  var headings = [], hs = document.querySelectorAll('h3');
  for (var i = 0; i < hs.length; i++) headings.push((hs[i].textContent || '').replace(/\s+/g, ' ').trim());

  chrome.runtime.sendMessage({
    type: 'page',
    href: location.href,
    headings: headings,
    hasTable: !!document.querySelector('table.timetable'),
    ymd: ymd,
    days: sentralParseAll(document)
  });
})();
