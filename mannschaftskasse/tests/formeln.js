const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/home/user/public-apis/mannschaftskasse';
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0].split('#')[0];if(p==='/')p='/index.html';
 const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}
 r.writeHead(200,{'Content-Type':M[path.extname(f)]||'text/plain'});r.end(fs.readFileSync(f));});

// --- deterministischer Zufall, damit Abweichungen reproduzierbar sind ---
let seed = 20260811;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd()*a.length)];
const int = (a,b) => a + Math.floor(rnd()*(b-a+1));

const SAISON = 's-aktuell';
const members = Array.from({length:8},(_,i)=>({id:'m'+i,name:'Spieler '+i,number:String(i+1),active:true}));
const KAT_IN=['Strafe','Mitgliedsbeitrag','Spende','Getränkekasse'];
const KAT_OUT=['Getränke','Ausrüstung','Mannschaftsabend','Schiedsrichter'];

function datum(monateZurueck, tag) {
  const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-monateZurueck); d.setDate(tag);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}

const transactions=[];
for (let i=0;i<140;i++){
  const typ = rnd()<0.62 ? 'in':'out';
  const cents = int(1,400)*25;                 // 0,25 € bis 100 €
  const mz = int(0,13);
  const t = { id:'t'+i, createdAt:i, seasonId:SAISON, type:typ, cents,
              category: typ==='in'?pick(KAT_IN):pick(KAT_OUT),
              memberId: typ==='in' && rnd()<0.75 ? pick(members).id : null,
              date: datum(mz, int(1,28)), note:'B'+i, status:'open' };
  const w = rnd();
  if (w < 0.35) {                               // voll bezahlt, ohne Raten
    t.status='paid'; t.paidDate = rnd()<0.5 ? t.date : datum(Math.max(0,mz-1), int(1,28));
  } else if (w < 0.75) {                        // Raten
    const n = int(1,3); t.payments=[];
    let rest = cents;
    for (let k=0;k<n && rest>0;k++){
      const teil = (k===n-1 && rnd()<0.45) ? rest : Math.min(rest, int(1,Math.max(1,Math.floor(rest/25)))*25);
      if (teil<=0) break;
      t.payments.push({id:'p'+i+'_'+k, cents:teil, date: datum(Math.max(0,mz-k), int(1,28))});
      rest -= teil;
    }
    if (!t.payments.length) delete t.payments;
    else { const sum=t.payments.reduce((a,p)=>a+p.cents,0); t.status = sum>=cents?'paid':'open';
           if (t.status==='paid') t.paidDate=t.payments.map(p=>p.date).sort().pop(); }
  }
  transactions.push(t);
}

const daten = { version:2, team:{name:'Prüfteam'}, settings:{monthlyFeeCents:500},
  seasons:[{id:SAISON,name:'2026/27',createdAt:1}], currentSeasonId:SAISON,
  members, transactions, fines:[] };

// --- unabhängige Nachrechnung, reine Ganzzahlen ---
const flows = t => (t.payments && t.payments.length)
  ? t.payments.map(p=>({date:p.date,cents:p.cents}))
  : (t.status==='paid' ? [{date:t.paidDate||t.date,cents:t.cents}] : []);
const bezahlt = t => flows(t).reduce((a,f)=>a+f.cents,0);
const offen   = t => Math.max(0, t.cents - bezahlt(t));

const erwartet = {
  kasse: transactions.reduce((a,t)=>a+(t.type==='in'?bezahlt(t):-bezahlt(t)),0),
  einnahmen: transactions.filter(t=>t.type==='in').reduce((a,t)=>a+bezahlt(t),0),
  ausgaben: transactions.filter(t=>t.type==='out').reduce((a,t)=>a+bezahlt(t),0),
  offenIn: transactions.filter(t=>t.type==='in').reduce((a,t)=>a+offen(t),0),
  offenOut: transactions.filter(t=>t.type==='out').reduce((a,t)=>a+offen(t),0),
};
erwartet.ausgabenKategorie = transactions.filter(t=>t.type==='out').reduce((a,t)=>a+bezahlt(t),0);
erwartet.jeKategorie = {};
transactions.filter(t=>t.type==='out').forEach(t=>{
  const b=bezahlt(t); if(b>0) erwartet.jeKategorie[t.category]=(erwartet.jeKategorie[t.category]||0)+b; });

// Monatsreihe der letzten 6 Monate
const monate=[]; { const d=new Date(); d.setDate(1);
  for(let i=5;i>=0;i--){const x=new Date(d.getFullYear(),d.getMonth()-i,1);
    monate.push(x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0'));}}
erwartet.monat = {};
monate.forEach(k=>erwartet.monat[k]={in:0,out:0});
transactions.forEach(t=>flows(t).forEach(f=>{
  const k=f.date.slice(0,7); if(erwartet.monat[k]) erwartet.monat[k][t.type]+=f.cents;}));

// Offene Forderungen je Spieler
erwartet.jeSpieler={};
members.forEach(m=>{erwartet.jeSpieler[m.id]=transactions
  .filter(t=>t.memberId===m.id && t.type==='in').reduce((a,t)=>a+offen(t),0);});

// --- App auslesen ---
const zuCent = s => { const m=String(s).replace(/[^\d,.\-−+]/g,'').replace('−','-');
  const neg=m.startsWith('-'); const x=m.replace(/[-+]/g,'');
  const k=x.lastIndexOf(','); let g=x,b='00';
  if(k>-1){g=x.slice(0,k);b=(x.slice(k+1)+'00').slice(0,2);}
  const c=parseInt(g.replace(/[.,]/g,'')||'0',10)*100+parseInt(b,10);
  return neg?-c:c; };

(async()=>{
  await new Promise(r=>srv.listen(8829,r));
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:1400,height:1000}});
  p.on('pageerror',e=>console.log('FEHLER:',e.message));
  await p.goto('http://localhost:8829/');
  await p.evaluate(d=>localStorage.setItem('mk.data.v1',JSON.stringify(d)),daten);
  await p.goto('http://localhost:8829/#/uebersicht');
  await p.reload({waitUntil:'load'}); await p.waitForTimeout(900);

  const ist = await p.evaluate(()=>{
    const kz=l=>{const z=[...document.querySelectorAll('.statrow')]
      .find(x=>x.querySelector('span').textContent.trim()===l);return z?z.querySelector('b').textContent:'?';};
    const tabelle=[...document.querySelectorAll('.table-view table.data tbody tr')]
      .map(tr=>[...tr.querySelectorAll('td')].map(td=>td.textContent.trim()));
    const kategorien=[...document.querySelectorAll('.meter')]
      .map(m=>[m.querySelector('.meter-head span').textContent.trim(),
               m.querySelector('.meter-head b').textContent.trim()]);
    const spieler=[...document.querySelectorAll('.dtable-row')].map(r=>[
      r.querySelector('.cell-title').textContent.trim(),
      r.querySelector('.cell-amount').textContent.trim()]);
    return { kasse:document.querySelector('.balance .bal-value').textContent.trim(),
             einnahmen:kz('Einnahmen'), ausgaben:kz('Ausgaben'),
             offenIn:kz('Offene Forderungen'), offenOut:kz('Offene Auslagen'),
             tabelle, kategorien, spieler };
  });

  let fehler=0;
  const vgl=(name,soll,istText)=>{const i=zuCent(istText);
    const ok=i===soll;if(!ok)fehler++;
    console.log((ok?'  OK  ':'  FEHLER ')+name.padEnd(22)+' erwartet '+(soll/100).toFixed(2).padStart(10)+
      '  angezeigt '+(i/100).toFixed(2).padStart(10));};

  console.log('=== Kennzahlen ('+transactions.length+' Buchungen, davon '+
    transactions.filter(t=>t.payments).length+' mit Raten) ===');
  vgl('Kassenstand',erwartet.kasse,ist.kasse);
  vgl('Einnahmen',erwartet.einnahmen,ist.einnahmen);
  vgl('Ausgaben',erwartet.ausgaben,ist.ausgaben);
  vgl('Offene Forderungen',erwartet.offenIn,ist.offenIn);
  vgl('Offene Auslagen',erwartet.offenOut,ist.offenOut);
  console.log('  Probe: Einnahmen − Ausgaben =',((erwartet.einnahmen-erwartet.ausgaben)/100).toFixed(2),
              '| Kassenstand',(erwartet.kasse/100).toFixed(2),
              erwartet.einnahmen-erwartet.ausgaben===erwartet.kasse?'✓':'✗');

  console.log('=== Diagramm, Monat für Monat ===');
  const namen=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  ist.tabelle.forEach(r=>{
    const [mn,jahr]=r[0].split(' ');
    const k=jahr+'-'+String(namen.indexOf(mn)+1).padStart(2,'0');
    const e=erwartet.monat[k]||{in:0,out:0};
    vgl(r[0]+' Einnahmen',e.in,r[1]);
    vgl(r[0]+' Ausgaben',e.out,r[2]);
    vgl(r[0]+' Saldo',e.in-e.out,r[3]);
  });

  console.log('=== Ausgaben nach Kategorie (jede einzeln) ===');
  ist.kategorien.forEach(([name,betrag])=>vgl(name, erwartet.jeKategorie[name]||0, betrag));

  console.log('=== Offene Beträge je Spieler ===');
  ist.spieler.forEach(([name,betrag])=>{
    const m=members.find(x=>name.startsWith(x.name));
    if(!m){console.log('  ? unbekannt:',name);return;}
    vgl(name,erwartet.jeSpieler[m.id],betrag);
  });

  console.log('=== Saldo über der Buchungsliste ===');
  await p.evaluate(()=>{location.hash='#/buchungen';}); await p.waitForTimeout(700);
  const saldoZeile = await p.evaluate(()=>document.querySelector('.section-title').textContent.trim());
  vgl('Saldo (ungefiltert)', erwartet.kasse, saldoZeile.split('Saldo')[1]);

  console.log('=== Saison: Kassenstand und Übernahme ===');
  await p.evaluate(()=>{location.hash='#/mehr';}); await p.waitForTimeout(700);
  const saisonStand = await p.evaluate(()=>
    document.querySelector('.list-row[data-season] .amount').textContent.trim());
  vgl('Kassenstand der Saison', erwartet.kasse, saisonStand);

  await p.click('[data-action="new-season"]'); await p.waitForTimeout(500);
  const dlg = await p.evaluate(()=>({
    uebernahme: document.querySelector('.checkline span strong').textContent.trim(),
    hinweis: [...document.querySelectorAll('.modal .hint')].map(e=>e.textContent).join(' ')
  }));
  vgl('Übernahme in neue Saison', erwartet.kasse, dlg.uebernahme);
  const m = dlg.hinweis.match(/stehen noch\s*([\d.,]+\s*€)/);
  vgl('Hinweis offene Forderungen', erwartet.offenIn, m?m[1]:'0');

  console.log(fehler===0?'\nALLE SUMMEN STIMMEN':'\n'+fehler+' ABWEICHUNG(EN)');
  await b.close(); srv.close();
  process.exit(fehler===0?0:1);
})();
