// Shared timetable reader. Finds the column for a given date (YYYY-MM-DD) on a Sentral
// timetable page and returns that day's periods 1-4: class name, class code, room, change label.
// It never reads student lists. Used by the extension, and copied into the bookmark.
(function (root) {
  'use strict';
  var KEEP = ['1', '2', '3', '4'];

  function clean(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
  function stripParens(s) { return clean(s).replace(/^\((.*)\)$/, '$1'); }
  function norm(s) { return clean(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function pad(n) { return ('0' + n).slice(-2); }
  function hasClass(n, c) { return !!(n && n.classList && n.classList.contains(c)); }

  function parseCell(cell) {
    var out = [], blocks = cell.querySelectorAll('.timetable-class');
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i], strong = b.querySelector('strong');
      var codeA = b.querySelector('a[href*="class="]'), roomA = b.querySelector('a[href*="room="]');
      var labelEl = b.querySelector('.label');
      var item = {
        class: clean(strong && strong.textContent),
        code: codeA ? stripParens(codeA.textContent) : '',
        room: roomA ? clean(roomA.textContent) : '',
        note: ''
      };
      if (!item.class) {
        // On call, meetings and events: the title is plain text inside the block.
        var c = b.cloneNode(true), junk = c.querySelectorAll('.period-icon, a[href*="teacher="], a[href*="room="], .label');
        for (var j = 0; j < junk.length; j++) junk[j].parentNode.removeChild(junk[j]);
        item.class = stripParens(c.textContent);
      }
      var label = clean(labelEl && labelEl.textContent);
      if (label && label !== 'OnCall' && label !== 'Event' && norm(label) !== norm(item.class)) item.note = label;
      if (item.class || item.room) out.push(item);
    }
    return out;
  }

  function parseDay(doc, ymd) {
    var tables = doc.querySelectorAll('table.timetable');
    for (var t = 0; t < tables.length; t++) {
      var table = tables[t], dates = [];
      var ths = table.querySelectorAll('th.timetable-date');
      for (var i = 0; i < ths.length; i++) {
        var m = clean(ths[i].textContent).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) dates.push(m[3] + '-' + pad(m[2]) + '-' + pad(m[1]));
      }
      var idx = dates.indexOf(ymd);
      if (idx < 0) continue;
      var ncols = dates.length, left = [];
      for (var q = 0; q < ncols; q++) left.push(0);

      var byPeriod = {}, holiday = false;
      var rows = table.querySelectorAll('tr');
      for (var r = 0; r < rows.length; r++) {
        var tr = rows[r], ph = null, cells = [];
        for (var k = 0; k < tr.children.length; k++) {
          var ch = tr.children[k];
          if (ch.tagName === 'TH' && hasClass(ch, 'timetable-period')) { if (!ph) ph = ch; }
          else if (ch.tagName === 'TD' && (hasClass(ch, 'timetable-dayperiod') || hasClass(ch, 'timetable-holiday'))) cells.push(ch);
        }
        if (!ph && !cells.length) continue;

        // Place cells into day columns, skipping columns still covered by an earlier rowspan.
        var busy = left.map(function (v) { return v > 0; });
        var next = left.map(function (v) { return v > 0 ? v - 1 : 0; });
        var c2 = 0, mine = null;
        for (var n = 0; n < cells.length; n++) {
          while (c2 < ncols && busy[c2]) c2++;
          if (c2 === idx) mine = cells[n];
          var rs = parseInt(cells[n].getAttribute('rowspan') || '1', 10) || 1;
          if (rs > 1 && c2 < ncols) next[c2] = rs - 1;
          c2++;
        }
        left = next;

        if (!mine) { if (busy[idx]) holiday = true; continue; }
        if (hasClass(mine, 'timetable-holiday')) { holiday = true; continue; }
        var label = ph ? clean(ph.textContent) : '';
        if (KEEP.indexOf(label) < 0) continue;
        byPeriod[label] = hasClass(mine, 'inactive') ? [] : parseCell(mine);
      }

      if (holiday) return { date: ymd, periods: [], holiday: true };
      if (!Object.keys(byPeriod).length) return null; // table found but layout not understood

      var periods = [];
      KEEP.forEach(function (p) {
        var items = byPeriod[p] || [];
        if (!items.length) items = [{ class: 'Free', code: '', room: '', note: '' }];
        items.forEach(function (it) { it.period = p; periods.push(it); });
      });
      return { date: ymd, periods: periods };
    }
    return null;
  }

  root.sentralParseDay = parseDay;
})(typeof globalThis !== 'undefined' ? globalThis : this);
