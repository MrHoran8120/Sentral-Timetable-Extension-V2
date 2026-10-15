const {JSDOM}=require('jsdom');const fs=require('fs');
const HTML=fs.readFileSync(__dirname+'/../app/index.html','utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function ymd(d){const p=n=>('0'+n).slice(-2);return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function boot({configured=true,server}){
  let skew=0;
  const dom=new JSDOM(HTML,{runScripts:'dangerously',url:'https://app.example/index.html'+(configured?'#url='+encodeURIComponent('https://script.google.com/macros/s/ABC/exec')+'&token=TK':''),pretendToBeVisual:true,
    beforeParse(w){
      w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
      const si=w.setInterval.bind(w),st=w.setTimeout.bind(w);
      w.setInterval=(f,ms)=>si(f,Math.max(20,ms/100));w.setTimeout=(f,ms)=>st(f,ms>5000?Math.max(20,ms/100):ms);
      const RN=w.Date.now.bind(w.Date);w.Date.now=()=>RN()+skew;
      w.fetch=async(u)=>{const q=new URL(u).searchParams;server.log.push(q.get('action')||'full');
        if(server.statusDown&&q.get('action')==='status') throw new TypeError('Failed to fetch');
        if(q.get('token')!=='TK') return {json:async()=>({ok:false,error:'bad token'})};
        return {json:async()=>server.respond(q.get('action'))};};
      w.matchMedia=w.matchMedia||(()=>({matches:false}));
    }});
  return {w:dom.window,d:dom.window.document,skew:v=>skew=v};
}
const today=ymd(new Date());
function mkServer(o={}){
  const s={log:[],pending:false,scrapedAt:new Date(Date.now()-4*60000).toISOString(),lastError:null,polls:0,failAfter:null,...o};
  s.respond=(action)=>{
    if(action==='requestRefresh'){s.pending=true;s.requested=new Date().toISOString();}
    if(action==='status'){s.polls++; if(s.pending&&s.completeAfter&&s.polls>=s.completeAfter){s.pending=false;s.scrapedAt=new Date().toISOString();}}
    const st={ok:true,updated:s.scrapedAt,scrapedAt:s.scrapedAt,refreshRequestedAt:s.requested||null,pending:s.pending,lastError:s.lastError};
    if(action==='status'||action==='requestRefresh') return st;
    return {...st,days:[{date:today,periods:s.periods||[{period:'1',start:'00:00',end:'23:59',class:'Test class',code:'9T1',room:'212',note:''}]}]};};
  return s;
}
const txt=(d,id)=>d.getElementById(id).textContent;
(async()=>{
  console.log('[1] not configured');
  let a=boot({configured:false,server:mkServer()}); await sleep(100);
  console.log(' updated:',txt(a.d,'updated'),'| stamp:',JSON.stringify(txt(a.d,'stamp')));
  a.d.getElementById('scrapeBtn').click(); console.log(' button opens settings:',a.d.getElementById('settings').open);

  console.log('\n[2] configured: timestamp in small type + class code');
  let s=mkServer(); a=boot({server:s}); await sleep(150);
  console.log(' stamp:',txt(a.d,'stamp'),'| class:',a.d.getElementById('stamp').className,'| font-size css 12px:',/\.stamp \{[^}]*font-size:12px/.test(HTML));
  console.log(' period text:',a.d.querySelector('.period .meta').textContent,'| now-highlight:',a.d.querySelector('.period').className);

  console.log('\n[3] old data (3 h) turns the stamp warning colour');
  s=mkServer({scrapedAt:new Date(Date.now()-3*3600e3).toISOString()}); a=boot({server:s}); await sleep(150);
  console.log(' stamp:',txt(a.d,'stamp'),'| class:',a.d.getElementById('stamp').className);

  console.log('\n[4] Get latest from Sentral: status text sampled every 40 ms through a request (timers are sped up 100x)');
  s=mkServer({completeAfter:2}); a=boot({server:s}); await sleep(150);
  const before=txt(a.d,'stamp'); a.d.getElementById('scrapeBtn').click();
  console.log(' right after click: button disabled',a.d.getElementById('scrapeBtn').disabled,'| status:',txt(a.d,'scrapeStatus'));
  const seen=[];
  for(let i=0;i<40;i++){await sleep(40);const t=txt(a.d,'scrapeStatus');if(seen[seen.length-1]!==t)seen.push(t);}
  seen.forEach(t=>console.log('  -',JSON.stringify(t)));
  console.log(' button enabled:',!a.d.getElementById('scrapeBtn').disabled,'| stamp changed:',before!==txt(a.d,'stamp'),'| server calls:',s.log.join(','));

  console.log('\n[5] nobody answers for 2 minutes, then a computer answers later');
  s=mkServer(); a=boot({server:s}); await sleep(150); a.d.getElementById('scrapeBtn').click(); await sleep(100);
  a.skew(130000); await sleep(400);
  console.log(' after 2 min:',txt(a.d,'scrapeStatus'),'| button enabled again:',!a.d.getElementById('scrapeBtn').disabled);
  s.completeAfter=s.polls+1; const seen2=[];
  for(let i=0;i<40;i++){await sleep(40);const t=txt(a.d,'scrapeStatus');if(seen2[seen2.length-1]!==t)seen2.push(t);}
  console.log(' then:',JSON.stringify(seen2.map(t=>t.slice(0,32))));

  console.log('\n[6] pending request already waiting when the app opens');
  s=mkServer({pending:true,requested:new Date(Date.now()-5*60000).toISOString()}); a=boot({server:s}); await sleep(150);
  console.log(' status:',txt(a.d,'scrapeStatus'));

  console.log('\n[7] last scrape failed -> banner');
  s=mkServer({lastError:{at:new Date(Date.now()-600000).toISOString(),message:'No timetable found. You are probably signed out of Sentral.'}}); a=boot({server:s}); await sleep(150);
  console.log(' banner:',[...a.d.querySelectorAll('.banner')].map(b=>b.textContent).join(' || '));

  console.log('\n[8] demo mode');
  a=boot({configured:false,server:mkServer()}); a.d.getElementById('demoBtn').click(); await sleep(100);
  console.log(' updated:',txt(a.d,'updated'),'| stamp:',txt(a.d,'stamp'),'| periods:',a.d.querySelectorAll('.period').length);

  console.log('\n[9] settings: bad URL or empty token is not saved');
  a=boot({configured:false,server:mkServer()}); await sleep(50);
  const trySave=(u,t)=>{a.d.getElementById('settingsBtn').click();a.d.getElementById('url').value=u;a.d.getElementById('token').value=t;a.d.getElementById('saveBtn').click();
    return (a.w.localStorage.getItem('tt.url')===u.trim()?'SAVED':'refused')+' | open:'+a.d.getElementById('settings').open+' | msg:'+JSON.stringify(txt(a.d,'setErr'));};
  console.log(' missing h  :',trySave('ttps://script.google.com/macros/s/ABC/exec','TK'));
  console.log(' no /exec   :',trySave('https://script.google.com/macros/s/ABC/dev','TK'));
  console.log(' no token   :',trySave('https://script.google.com/macros/s/ABC/exec',''));
  console.log(' good       :',trySave(' https://script.google.com/macros/s/ABC/exec ','TK'));
  console.log(' workspace  :',trySave('https://script.google.com/macros/a/school.edu/s/ABC/exec','TK'));

  console.log('\n[10] status checks fail while waiting -> still gives up after 2 minutes');
  s=mkServer(); a=boot({server:s}); await sleep(150); s.statusDown=true; a.d.getElementById('scrapeBtn').click(); await sleep(100);
  console.log(' while failing:',txt(a.d,'scrapeStatus'));
  a.skew(130000); await sleep(400);
  console.log(' after 2 min  :',txt(a.d,'scrapeStatus'),'| button enabled again:',!a.d.getElementById('scrapeBtn').disabled);
  s.statusDown=false; s.completeAfter=s.polls+1; const seen3=[];
  for(let i=0;i<40;i++){await sleep(40);const t=txt(a.d,'scrapeStatus');if(seen3[seen3.length-1]!==t)seen3.push(t);}
  console.log(' back online  :',JSON.stringify(seen3.map(t=>t.slice(0,40))));

  console.log('\n[11] live view through a school day (green = .now, "next" = starting soon)');
  const bells=[['1','08:45','10:00','On call'],['2','10:20','11:35','Free'],['3','11:40','12:55','10AccSE2'],['4','13:35','14:50','7TECH3']];
  s=mkServer({periods:bells.map(([period,start,end,c])=>({period,start,end,class:c,code:'',room:'',note:''}))});
  a=boot({server:s}); await sleep(150);
  for(const hm of ['07:00','08:29','08:30','09:30','10:05','11:36','12:00','13:00','14:49','15:30','16:30']){
    const t=new Date();t.setHours(+hm.slice(0,2),+hm.slice(3),0,0);a.skew(t.getTime()-Date.now());
    a.d.querySelector('.daynav strong').click(); await sleep(30);
    const rows=[...a.d.querySelectorAll('.period')].map(n=>{const k=n.className.replace('period','').trim(),l=n.querySelector('.live');
      return n.querySelector('.pnum').firstChild.textContent+(k?'['+k+']':'')+(l?' "'+l.textContent+'"':'');});
    console.log(' ',hm,rows.join('  '));
  }
  process.exit(0);
})();
