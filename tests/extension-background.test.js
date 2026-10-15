const {JSDOM}=require('jsdom');const fs=require('fs');const vm=require('vm');
const EXT=__dirname+'/../extension/';
const SENTRAL=fs.readFileSync(__dirname+'/fixtures/sentral-timetable.html','utf8');
const LOGIN='<html><body><h1>Sign in</h1><form></form></body></html>';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function env({now='2026-10-15T14:50:00',sentral=SENTRAL,pending=false,store={}}){
  // offscreen document, running the real offscreen.js + parser.js
  let offListener=null;
  const ow=new JSDOM('<html></html>',{runScripts:'outside-only'}).window;
  ow.chrome={runtime:{onMessage:{addListener:f=>offListener=f}}};
  ow.eval(fs.readFileSync(EXT+'parser.js','utf8'));ow.eval(fs.readFileSync(EXT+'offscreen.js','utf8'));
  const posts=[],fetches=[];let alarmL=null,msgL=null,created=0;
  const alarms={};
  const FD=class extends Date{constructor(...a){a.length?super(...a):super(now)}static now(){return new Date(now).getTime()}};
  const data={...store};
  const chrome={
    storage:{local:{
      get:async k=>{ if(k===null||k===undefined) return {...data}; const o={}; (Array.isArray(k)?k:[k]).forEach(x=>{if(x in data)o[x]=data[x]}); return o;},
      set:async o=>{Object.assign(data,o);},},
      onChanged:{addListener:()=>{}}},
    alarms:{get:async n=>alarms[n],clear:async n=>{delete alarms[n]},create:(n,o)=>{alarms[n]=o},onAlarm:{addListener:f=>alarmL=f}},
    offscreen:{createDocument:async()=>{created++}},
    action:{setBadgeText:()=>{},setBadgeBackgroundColor:()=>{}},
    runtime:{getContexts:async()=>created?[{}]:[],onMessage:{addListener:f=>msgL=f},onInstalled:{addListener:()=>{}},onStartup:{addListener:()=>{}},
      sendMessage:async m=>new Promise(res=>offListener(m,{},res))}};
  const fetchMock=async(u,o={})=>{
    fetches.push({u,method:o.method||'GET'});
    if(u.includes('sentral.com.au')) return {text:async()=>sentral};
    if(u.includes('script.google.com')){
      if(o.method==='POST'){const b=JSON.parse(o.body);posts.push(b);return {text:async()=>JSON.stringify({ok:true})};}
      return {json:async()=>({ok:true,pending}),text:async()=>JSON.stringify({ok:true,pending})};
    }
    throw new Error('unexpected '+u);};
  const ctx=vm.createContext({chrome,fetch:fetchMock,URL,Date:FD,JSON,Promise,Error,Object,Array,Math,String,Number,parseInt,encodeURIComponent,console});
  vm.runInContext(fs.readFileSync(EXT+'background.js','utf8'),ctx);
  return {data,posts,fetches,alarms,fireAlarm:n=>alarmL({name:n}),send:m=>new Promise(res=>{msgL(m,{tab:{id:7}},res)})};
}
const base={url:'https://script.google.com/macros/s/X/exec',token:'T0K',owner:'G Horan',
  timetableUrl:'https://school.sentral.com.au/s-XXXXXX/timetables/timetable?teacher=123'};
const show=p=>p.days[0].periods.map(x=>x.period+' '+x.start+'-'+x.end+' '+x.class+(x.code?' ['+x.code+']':'')+(x.room?' '+x.room:'')).join(' ; ');

(async()=>{
  let e=env({store:base}); await sleep(30);
  console.log('alarms set:',JSON.stringify(e.alarms));

  console.log('\n[1] timer alarm, Thu 14:50, signed in');
  await e.fireAlarm('scrape'); await sleep(100);
  console.log(' posts:',e.posts.length,'| source',e.posts[0]&&e.posts[0].source,'| token ok',e.posts[0]&&e.posts[0].token==='T0K','| scrapedAt',e.posts[0]&&e.posts[0].scrapedAt);
  console.log(' ',show(e.posts[0])); console.log(' status:',e.data.lastStatus.state,e.data.lastStatus.message);

  console.log('\n[2] poll: request pending -> scrapes; not pending -> does not');
  e=env({store:base,pending:true}); await sleep(30); await e.fireAlarm('poll'); await sleep(100);
  console.log(' pending=true  posts:',e.posts.length,'reason:',e.data.lastStatus&&e.data.lastStatus.reason);
  e=env({store:base,pending:false}); await sleep(30); await e.fireAlarm('poll'); await sleep(100);
  console.log(' pending=false posts:',e.posts.length);

  console.log('\n[3] outside active hours (Sun 10:00 and Thu 19:30): timer and poll do nothing');
  for(const t of ['2026-10-18T10:00:00','2026-10-15T19:30:00']){
    e=env({store:base,now:t,pending:true}); await sleep(30); await e.fireAlarm('scrape'); await e.fireAlarm('poll'); await sleep(100);
    console.log(' ',t,'fetches:',e.fetches.length,'posts:',e.posts.length);}

  console.log('\n[4] signed out of Sentral (login page returned)');
  e=env({store:base,sentral:LOGIN}); await sleep(30); await e.fireAlarm('scrape'); await sleep(100);
  console.log(' posts:',JSON.stringify(e.posts.map(p=>p.error?{error:p.error.slice(0,60)}:'DATA')),'| status:',e.data.lastStatus.state);

  console.log('\n[5] page visit: learns normalised address, uploads; wrong owner skipped');
  e=env({store:{url:base.url,token:base.token,owner:'G Horan'}}); await sleep(30);
  const dom=new JSDOM(SENTRAL,{runScripts:'outside-only'});dom.window.eval(fs.readFileSync(EXT+'parser.js','utf8'));
  const heads=[...dom.window.document.querySelectorAll('h3')].map(h=>h.textContent.replace(/\s+/g,' ').trim());
  const msg={type:'page',href:'https://school.sentral.com.au/s-XXXXXX/timetables/timetable?teacher=123&cycle=16#x',headings:heads,hasTable:true,ymd:'2026-10-15',parsed:dom.window.sentralParseDay(dom.window.document,'2026-10-15')};
  let st=await e.send(msg); console.log(' state:',st.state,'| learned url:',e.data.timetableUrl,'| posts',e.posts.length);
  e=env({store:{...base,owner:'Someone Else'}}); await sleep(30); st=await e.send(msg); console.log(' wrong owner ->',st.state,'| posts',e.posts.length,'| url learned:',!!e.data.timetableUrl&&e.data.timetableUrl!==base.timetableUrl);

  console.log('\n[6] no address learned yet');
  e=env({store:{url:base.url,token:base.token}}); await sleep(30); st=await e.send({type:'scrapeNow'}); console.log(' ',st.state,'|',st.message,'| error reported:',e.posts.some(p=>p.error));

  console.log('\n[7] Wednesday uses Wednesday bell times');
  e=env({store:base,now:'2026-10-14T10:00:00'}); await sleep(30); await e.fireAlarm('scrape'); await sleep(100);
  console.log(' ',show(e.posts[0]));
})();
