const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(__dirname+'/fixtures/sentral-timetable.html','utf8');
const mk=(h)=>{const d=new JSDOM(h,{runScripts:'outside-only'});d.window.eval(fs.readFileSync(__dirname+'/../extension/parser.js','utf8'));return d.window;};
const show=(w,ymd)=>{const r=w.sentralParseDay(w.document,ymd);
  console.log(ymd, r? (r.holiday?'HOLIDAY':'')+JSON.stringify(r.periods.map(p=>p.period+':'+p.class+(p.code?' ['+p.code+']':'')+(p.room?' '+p.room:''))) : 'null');};
const w=mk(html);
['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-19','2026-10-20','2026-10-23','2026-10-17','2026-11-02'].forEach(d=>show(w,d));
// no "today" classes at all (simulates a fetched page where JS adds them) -> same Thursday result
const w2=mk(html.replace(/ today"/g,'"').replace(/ today /g,' '));
console.log('--- without today classes'); show(w2,'2026-10-15');
// cross-check vs old today-class method for Thursday
const old=[...w.document.querySelectorAll('table.timetable')[0].querySelectorAll('tr')].filter(tr=>tr.querySelector('td.today')&&tr.querySelector('th.timetable-period')).map(tr=>tr.querySelector('th.timetable-period').textContent.trim()+':'+tr.querySelector('td.today').textContent.replace(/\s+/g,' ').trim().slice(0,45));
console.log('today-class view of Thursday:',JSON.stringify(old.filter(x=>'1234'.includes(x[0]))));
