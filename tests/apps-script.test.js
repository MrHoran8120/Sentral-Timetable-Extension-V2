const fs=require('fs');const vm=require('vm');
const props={};let fileText='';let uid=0;
const ctx=vm.createContext({Logger:{log:()=>{}},console,JSON,Date,Math,Array,Object,String,isNaN,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>k in props?props[k]:null,setProperty:(k,v)=>{props[k]=v},deleteProperty:k=>{delete props[k]}})},
 Utilities:{getUuid:()=>'aaaaaaaa-bbbb-cccc-dddd-'+(++uid+'').padStart(12,'0')},
 DriveApp:{createFile:()=>({getId:()=>'F1'}),getFileById:()=>({setContent:t=>{fileText=t},getBlob:()=>({getDataAsString:()=>fileText})})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({s,setMimeType(){return this}})}});
vm.runInContext(fs.readFileSync(__dirname+'/../apps-script/Code.gs','utf8'),ctx);
const run=(code)=>vm.runInContext(code,ctx);
const get=(p)=>JSON.parse(run(`doGet(${JSON.stringify({parameter:p})})`).s);
const post=(o,form)=>JSON.parse(run(`doPost(${JSON.stringify(form?{parameter:{payload:JSON.stringify(o)}}:{parameter:{},postData:{contents:JSON.stringify(o)}})})`).s);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 run('setup()'); const T=props.TOKEN; console.log('token length',T.length);
 console.log('bad token get :',get({token:'nope'}).error,'| no token:',get({}).error,'| bad token post:',post({token:'x',days:[]}).error);
 console.log('empty status  :',JSON.stringify(get({token:T,action:'status'})));
 const day={date:'2026-10-15',periods:[{period:'1',class:'X'}]};
 console.log('post data     :',JSON.stringify(post({token:T,days:[day],scrapedAt:new Date(Date.now()-120000).toISOString()})));
 let s=get({token:T,action:'status'}); console.log('status        : pending',s.pending,'| scrapedAt is 2 min before updated:',(new Date(s.updated)-new Date(s.scrapedAt))>100000);
 await sleep(15);
 console.log('request       : pending',get({token:T,action:'requestRefresh'}).pending);
 console.log('status again  : pending',get({token:T,action:'status'}).pending);
 await sleep(15);
 post({token:T,days:[day]});
 console.log('after upload  : pending',get({token:T,action:'status'}).pending);
 console.log('error report  :',JSON.stringify(post({token:T,error:'Signed out'})),'->',JSON.stringify(get({token:T,action:'status'}).lastError));
 post({token:T,days:[day]}); console.log('error cleared :',get({token:T,action:'status'}).lastError);
 const full=get({token:T}); console.log('full data     : days',full.days.length,'| has scrapedAt',!!full.scrapedAt,'| pending',full.pending);
 console.log('future scrapedAt clamped:',(()=>{post({token:T,days:[day],scrapedAt:'2099-01-01T00:00:00Z'});const x=get({token:T,action:'status'});return new Date(x.scrapedAt)<new Date('2030-01-01')})());
 console.log('form route    :',JSON.stringify(post({token:T,days:[day]},true)));
})();
