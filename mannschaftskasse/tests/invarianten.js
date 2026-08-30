const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/home/user/public-apis/mannschaftskasse';
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0].split('#')[0];if(p==='/')p='/index.html';
 const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}
 r.writeHead(200,{'Content-Type':M[path.extname(f)]||'text/plain'});r.end(fs.readFileSync(f));});

let seed=99887; const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
const int=(a,b)=>a+Math.floor(rnd()*(b-a+1));
const pick=a=>a[Math.floor(rnd()*a.length)];

const S1='sa', S2='sb';
const members=Array.from({length:6},(_,i)=>({id:'m'+i,name:'Spieler '+i,number:String(i+1),active:true}));
function datum(mz,tag){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-mz);d.setDate(tag);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

const transactions=[];
for(let i=0;i<90;i++){
  const typ=rnd()<0.65?'in':'out';
  const cents=int(1,80)*25;
  const mz=int(0,5);
  // BEWUSST: ein Teil der Forderungen OHNE Spieler — das kommt in echt vor.
  const mit = typ==='in' && rnd()<0.7;
  const t={id:'t'+i,createdAt:i,seasonId: rnd()<0.8?S1:S2, type:typ,cents,
    category: typ==='in'?pick(['Strafe','Mitgliedsbeitrag','Spende']):pick(['Getränke','Ausrüstung']),
    memberId: mit?pick(members).id:null, date:datum(mz,int(1,28)), note:'B'+i, status:'open'};
  const w=rnd();
  if(w<0.35){t.status='paid';t.paidDate=t.date;}
  else if(w<0.7){const n=int(1,2);t.payments=[];let rest=cents;
    for(let k=0;k<n&&rest>0;k++){const teil=Math.min(rest,int(1,Math.max(1,Math.floor(rest/25)))*25);
      if(teil<=0)break;t.payments.push({id:'p'+i+k,cents:teil,date:datum(Math.max(0,mz-k),int(1,28))});rest-=teil;}
    if(!t.payments.length)delete t.payments;
    else{const sm=t.payments.reduce((a,p)=>a+p.cents,0);t.status=sm>=cents?'paid':'open';
      if(t.status==='paid')t.paidDate=t.payments.map(p=>p.date).sort().pop();}}
  transactions.push(t);
}
const daten={version:2,team:{name:'Invarianten'},settings:{monthlyFeeCents:500},
  seasons:[{id:S1,name:'2026/27',createdAt:1},{id:S2,name:'2025/26',createdAt:0}],
  currentSeasonId:S1,members,transactions,fines:[]};

const zuCent=s=>{const raw=String(s).trim();const neg=/^[-−]/.test(raw);
  const x=raw.replace(/[^\d.,]/g,'');const k=x.lastIndexOf(',');let g=x,b='00';
  if(k>-1){g=x.slice(0,k);b=(x.slice(k+1)+'00').slice(0,2);}
  const c=parseInt(g.replace(/[.,]/g,'')||'0',10)*100+parseInt(b,10);return neg?-c:c;};

let fehler=0;
const pruef=(name,a,b,hinweis)=>{const ok=a===b;if(!ok)fehler++;
  console.log((ok?'  OK    ':'  FEHLER ')+name.padEnd(46)+
    (a/100).toFixed(2).padStart(11)+'  vs '+(b/100).toFixed(2).padStart(11)+
    (ok?'':'   Differenz '+((a-b)/100).toFixed(2)+(hinweis?'  <- '+hinweis:'')));};

(async()=>{
  await new Promise(r=>srv.listen(8833,r));
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1400,height:1100}});
  p.on('pageerror',e=>console.log('SEITENFEHLER:',e.message));
  p.on('dialog',d=>d.accept());
  await p.goto('http://localhost:8833/');
  await p.evaluate(d=>localStorage.setItem('mk.data.v1',JSON.stringify(d)),daten);
  await p.goto('http://localhost:8833/#/uebersicht');
  await p.reload({waitUntil:'load'}); await p.waitForTimeout(900);

  const lies=async()=>await p.evaluate(()=>{
    const kz=l=>{const z=[...document.querySelectorAll('.statrow')]
      .find(x=>x.querySelector('span').textContent.trim()===l);return z?z.querySelector('b').textContent:'0';};
    return { kasse:document.querySelector('.balance .bal-value').textContent,
      ein:kz('Einnahmen'), aus:kz('Ausgaben'), offIn:kz('Offene Forderungen'), offOut:kz('Offene Auslagen'),
      tabelleSpieler:[...document.querySelectorAll('.dtable-row')].map(r=>r.querySelector('.cell-amount').textContent) };
  });

  const u=await lies();
  console.log('=== Invarianten der Übersicht (Saison 2026/27) ===');
  pruef('Kassenstand  ==  Einnahmen − Ausgaben', zuCent(u.kasse), zuCent(u.ein)-zuCent(u.aus));

  // Offene Forderungen laut Kachel vs. Summe der Spielertabelle
  const tabSumme=u.tabelleSpieler.reduce((a,x)=>a+zuCent(x),0);
  pruef('Kachel „Offene Forderungen" == Tabelle', zuCent(u.offIn), tabSumme,
        'Forderungen ohne Spieler fehlen in der Tabelle');

  // Kaderansicht: dieselbe Kachel vs. Summe der Spielerzeilen
  await p.evaluate(()=>{location.hash='#/spieler';}); await p.waitForTimeout(700);
  const kader=await p.evaluate(()=>{
    const k=[...document.querySelectorAll('.tile')].find(t=>/Offene Forderungen/.test(t.textContent));
    return { kachel:k.querySelector('.value').textContent,
      ohne:k.querySelector('.sub')?k.querySelector('.sub').textContent:'0',
      zeilen:[...document.querySelectorAll('#view .list-row')].map(r=>{
        const a=r.querySelector('.amount'); return a?a.textContent:'0';}) };
  });
  // Die Zeilen zeigen nur zugeordnete Forderungen; der Rest steht als Hinweis
  // unter der Kachel. Zusammen muss es die Kachel ergeben.
  pruef('Kader: Kachel == Zeilen + Hinweis „ohne Spieler"', zuCent(kader.kachel),
        kader.zeilen.reduce((a,x)=>a+zuCent(x),0) + zuCent(kader.ohne));

  // Buchungsliste: Saldo == Kassenstand
  await p.evaluate(()=>{location.hash='#/buchungen';}); await p.waitForTimeout(700);
  const saldo=await p.evaluate(()=>document.querySelector('.section-title').textContent);
  pruef('Buchungsliste: Saldo == Kassenstand', zuCent(saldo.split('Saldo')[1]), zuCent(u.kasse));

  // Filter „Nur offen": Summe der angezeigten Restbeträge == offene Kacheln
  await p.selectOption('#flt-status','open'); await p.waitForTimeout(700);
  const nurOffen=await p.evaluate(()=>[...document.querySelectorAll('#view .tx-row')].map(r=>({
    betrag:r.querySelector('.amount').textContent, art:r.querySelector('.avatar').classList.contains('in')?'in':'out'})));
  const offenIn=nurOffen.filter(x=>x.art==='in').reduce((a,x)=>a+Math.abs(zuCent(x.betrag)),0);
  const offenOut=nurOffen.filter(x=>x.art==='out').reduce((a,x)=>a+Math.abs(zuCent(x.betrag)),0);
  pruef('Filter „offen": Summe in  == Kachel', offenIn, zuCent(u.offIn));
  pruef('Filter „offen": Summe out == Kachel', offenOut, zuCent(u.offOut));

  // Saisonwechsel: Summe beider Saisons == Summe aller Buchungen
  await p.evaluate(()=>{location.hash='#/mehr';}); await p.waitForTimeout(700);
  const staende=await p.evaluate(()=>[...document.querySelectorAll('.list-row[data-season] .amount')].map(a=>a.textContent));
  const flows=t=>(t.payments&&t.payments.length)?t.payments.map(x=>x.cents):(t.status==='paid'?[t.cents]:[]);
  const gesamt=transactions.reduce((a,t)=>{const s=flows(t).reduce((x,c)=>x+c,0);return a+(t.type==='in'?s:-s);},0);
  pruef('Summe aller Saisons == alle Buchungen', staende.reduce((a,x)=>a+zuCent(x),0), gesamt);

  // Alle offenen Forderungen abhaken: Kassenstand steigt genau um die offenen Forderungen
  const vorher=zuCent(u.kasse), offenVorher=zuCent(u.offIn);
  await p.click('[data-action="settle-all"]'); await p.waitForTimeout(800);
  await p.evaluate(()=>{location.hash='#/uebersicht';}); await p.waitForTimeout(800);
  const n=await lies();
  pruef('Nach „alle abhaken": Kasse == vorher + offen', zuCent(n.kasse), vorher+offenVorher);
  pruef('Nach „alle abhaken": offene Forderungen == 0', zuCent(n.offIn), 0);
  pruef('Nach „alle abhaken": Kasse == Ein − Aus', zuCent(n.kasse), zuCent(n.ein)-zuCent(n.aus));

  console.log(fehler===0?'\nALLE INVARIANTEN HALTEN':'\n'+fehler+' VERLETZUNG(EN)');
  await b.close(); srv.close();
  process.exit(fehler?1:0);
})();
