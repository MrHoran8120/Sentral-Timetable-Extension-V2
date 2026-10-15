const {JSDOM}=require('jsdom');const fs=require('fs');
const gen=new JSDOM(fs.readFileSync(__dirname+'/../bookmarklet/make-bookmark.html','utf8'),{runScripts:'dangerously'});
const g=gen.window.document;
g.getElementById('url').value='https://script.google.com/macros/s/ABC123/exec';g.getElementById('token').value='SECRET9';
g.getElementById('make').click();
console.log('generator error:',JSON.stringify(g.getElementById('err').textContent));
const code=decodeURIComponent(g.getElementById('bm').getAttribute('href').slice('javascript:'.length));
console.log('bookmark length:',code.length,'chars');
function run(label,{owner='G Horan',failFetch=false,now='2026-10-15T14:50:00',html=fs.readFileSync(__dirname+'/fixtures/sentral-timetable.html','utf8')}={}){
  return new Promise(res=>{
    const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://school.sentral.com.au/s-XXXXXX/timetables/timetable?teacher=123'});
    const w=dom.window;let call=null,forms=[];
    const FD=class extends w.Date{constructor(...a){a.length?super(...a):super(now)}static now(){return new w.Date(now).getTime()}};w.Date=FD;
    w.fetch=(u,o)=>{call={u,o};return failFetch?Promise.reject(new TypeError('blocked')):Promise.resolve({})};
    w.HTMLFormElement.prototype.submit=function(){forms.push({payload:this.querySelector('input').value})};
    let c=code;if(owner!=='G Horan')c=c.replace('"owner":"G Horan"','"owner":"'+owner+'"');
    w.eval(c);
    setTimeout(()=>{
      const toast=[...w.document.querySelectorAll('div')].find(d=>d.style.zIndex==='2147483647');
      console.log('\n['+label+']\n toast:',toast?toast.textContent.replace(/\n/g,' | '):'(none)');
      if(call){const b=JSON.parse(call.o.body);console.log(' fetch:',call.o.mode,'| token ok',b.token==='SECRET9','| source',b.source,'| scrapedAt',b.scrapedAt);
        console.log(' ',b.days[0].date,b.days[0].periods.map(p=>p.period+':'+p.start+'-'+p.end+' '+p.class+(p.code?' ['+p.code+']':'')+(p.room?' '+p.room:'')).join(' ; '));}
      if(forms.length)console.log(' backup form used, days:',JSON.parse(forms[0].payload).days.length);
      res();},60);});
}
(async()=>{
  await run('Thursday');
  await run('Wednesday uses Wednesday bells',{now:'2026-10-14T10:00:00'});
  await run('fetch blocked -> form backup',{failFetch:true});
  await run("someone else's timetable",{owner:'Not Me'});
  await run('not a timetable page',{html:'<html><body><h3>G Horan</h3></body></html>'});
  await run('Monday holiday',{now:'2026-10-12T09:00:00'});
})();
