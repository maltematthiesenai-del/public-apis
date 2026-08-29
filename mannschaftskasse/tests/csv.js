const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const ROOT='/home/user/public-apis/mannschaftskasse';
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0].split('#')[0];if(p==='/')p='/index.html';
 const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}
 r.writeHead(200,{'Content-Type':M[path.extname(f)]||'text/plain'});r.end(fs.readFileSync(f));});

let seed=4711; const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
const int=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const S='s1';
const transactions=[];
for(let i=0;i<40;i++){
  const typ=rnd()<0.6?'in':'out'; const cents=int(1,200)*25;
  const t={id:'t'+i,createdAt:i,seasonId:S,type:typ,cents,category:typ==='in'?'Strafe':'Getränke',
           memberId:null,date:'2026-0'+int(1,9)+'-1'+int(0,9),note:'B'+i,status:'open'};
  const w=rnd();
  if(w<0.4){t.status='paid';t.paidDate=t.date;}
  else if(w<0.75){const teil=Math.min(cents,int(1,Math.max(1,Math.floor(cents/25)))*25);
    t.payments=[{id:'p'+i,cents:teil,date:t.date}];
    t.status = teil>=cents?'paid':'open'; if(t.status==='paid')t.paidDate=t.date;}
  transactions.push(t);
}
const daten={version:2,team:{name:'CSV Test'},settings:{monthlyFeeCents:500},
  seasons:[{id:S,name:'2026/27',createdAt:1}],currentSeasonId:S,members:[],transactions,fines:[]};

const flows=t=>(t.payments&&t.payments.length)?t.payments.map(p=>({date:p.date,cents:p.cents}))
  :(t.status==='paid'?[{date:t.paidDate||t.date,cents:t.cents}]:[]);
const bez=t=>flows(t).reduce((a,f)=>a+f.cents,0);
const off=t=>Math.max(0,t.cents-bez(t));
const soll={ein:transactions.filter(t=>t.type==='in').reduce((a,t)=>a+bez(t),0),
            aus:transactions.filter(t=>t.type==='out').reduce((a,t)=>a+bez(t),0),
            offIn:transactions.filter(t=>t.type==='in').reduce((a,t)=>a+off(t),0),
            offOut:transactions.filter(t=>t.type==='out').reduce((a,t)=>a+off(t),0)};
soll.kasse=soll.ein-soll.aus;

const zuCent=s=>{const x=String(s).trim().replace(/[-−]/,'');const neg=/^[-−]/.test(String(s).trim());
  const k=x.lastIndexOf(',');let g=x,b='00';if(k>-1){g=x.slice(0,k);b=(x.slice(k+1)+'00').slice(0,2);}
  const c=parseInt(g.replace(/[.,]/g,'')||'0',10)*100+parseInt(b,10);return neg?-c:c;};

(async()=>{
  await new Promise(r=>srv.listen(8831,r));
  const b=await chromium.launch();
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'csv-'));
  const c=await b.newContext({acceptDownloads:true});
  const p=await c.newPage(); p.on('dialog',d=>d.accept());
  await p.goto('http://localhost:8831/');
  await p.evaluate(d=>localStorage.setItem('mk.data.v1',JSON.stringify(d)),daten);
  await p.goto('http://localhost:8831/#/mehr'); await p.reload({waitUntil:'load'}); await p.waitForTimeout(700);
  const [dl]=await Promise.all([p.waitForEvent('download'), p.click('[data-action="export-csv"]')]);
  const datei=path.join(dir,'k.csv'); await dl.saveAs(datei);
  const text=fs.readFileSync(datei,'utf8').replace(/^﻿/,'');
  const zeilen=text.split('\r\n').filter(z=>z.trim());
  const kopf=zeilen[0].split(';');
  const daten_z=zeilen.slice(1).filter(z=>!/^;;;;/.test(z));
  const summen=zeilen.filter(z=>/^;;;;/.test(z));

  const iBez=kopf.indexOf('Bezahlt'), iOff=kopf.indexOf('Offen'), iArt=kopf.indexOf('Art');
  let bezIn=0,bezOut=0,offIn=0,offOut=0;
  daten_z.forEach(z=>{const f=z.split(';');
    if(f[iArt]==='Einnahme'){bezIn+=zuCent(f[iBez]);offIn+=zuCent(f[iOff]);}
    else{bezOut+=zuCent(f[iBez]);offOut+=zuCent(f[iOff]);}});

  let fehler=0;
  const vgl=(n,s,i)=>{const ok=s===i;if(!ok)fehler++;
    console.log((ok?'  OK  ':'  FEHLER ')+n.padEnd(34)+'erwartet '+(s/100).toFixed(2).padStart(10)+'  in der Datei '+(i/100).toFixed(2).padStart(10));};

  console.log('=== Spaltensummen der '+daten_z.length+' Datenzeilen ===');
  vgl('Bezahlt, Einnahmen',soll.ein,bezIn);
  vgl('Bezahlt, Ausgaben',soll.aus,bezOut);
  vgl('Offen, Einnahmen',soll.offIn,offIn);
  vgl('Offen, Ausgaben',soll.offOut,offOut);
  console.log('=== Zusammenfassungszeilen ===');
  summen.forEach(z=>{const f=z.split(';');
    if(f[4]==='Summe Einnahmen'){vgl('Zeile Summe Einnahmen (bezahlt)',soll.ein,zuCent(f[iBez]));vgl('Zeile Summe Einnahmen (offen)',soll.offIn,zuCent(f[iOff]));}
    if(f[4]==='Summe Ausgaben'){vgl('Zeile Summe Ausgaben (bezahlt)',soll.aus,zuCent(f[iBez]));vgl('Zeile Summe Ausgaben (offen)',soll.offOut,zuCent(f[iOff]));}
    if(f[4]==='Kassenstand'){vgl('Zeile Kassenstand',soll.kasse,zuCent(f[iBez]));}});
  console.log('  Probe: Spalte Bezahlt (Ein − Aus) = '+((bezIn-bezOut)/100).toFixed(2)+
    ' | Kassenstand '+(soll.kasse/100).toFixed(2)+((bezIn-bezOut)===soll.kasse?' ✓':' ✗'));
  if((bezIn-bezOut)!==soll.kasse)fehler++;
  console.log(fehler===0?'\nCSV-SUMMEN STIMMEN':'\n'+fehler+' ABWEICHUNG(EN)');
  await b.close(); srv.close(); fs.rmSync(dir,{recursive:true,force:true});
  process.exit(fehler?1:0);
})();
