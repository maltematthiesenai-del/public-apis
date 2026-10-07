const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/home/user/public-apis/mannschaftskasse';
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0].split('#')[0];if(p==='/')p='/index.html';
 const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}
 r.writeHead(200,{'Content-Type':M[path.extname(f)]||'text/plain'});r.end(fs.readFileSync(f));});

const S='s1';
const daten={version:2,team:{name:'SV Beispielheim II'},settings:{monthlyFeeCents:500},
 seasons:[{id:S,name:'2026/27',createdAt:1}],currentSeasonId:S,
 members:[
  {id:'m1',name:'Marco Schulz',number:'10',active:true,role:'spieler'},
  {id:'m2',name:'Lukas Berger',number:'7',active:true,role:'spieler'},
  {id:'m3',name:'Bernd Klein',number:'1',active:true,role:'spieler'},
  {id:'m4',name:'Jörg Wegener',number:'',active:true,role:'trainer'},
  {id:'m5',name:'Anna Fischer',number:'',active:true,role:'betreuer'}],
 transactions:[
  {id:'a',createdAt:1,seasonId:S,type:'in',cents:1500,category:'Strafe',memberId:'m1',date:'2026-09-20',note:'Rote Karte',status:'open'},
  {id:'b',createdAt:2,seasonId:S,type:'in',cents:1000,category:'Strafe',memberId:'m1',date:'2026-09-28',note:'Zu spät',status:'open'},
  // Teilzahlung: davon sind nur 4,00 € offen
  {id:'c',createdAt:3,seasonId:S,type:'in',cents:1000,category:'Mitgliedsbeitrag',memberId:'m2',date:'2026-09-01',note:'Beitrag',status:'open',
    payments:[{id:'p1',cents:600,date:'2026-09-15'}]},
  // Lukas hat beides offen -> prüft die Aufteilung in zwei Spalten
  {id:'k',createdAt:11,seasonId:S,type:'in',cents:600,category:'Strafe',memberId:'m2',date:'2026-09-19',note:'Handy in der Kabine',status:'open'},
  {id:'d',createdAt:4,seasonId:S,type:'in',cents:2000,category:'Strafe',memberId:'m4',date:'2026-09-05',note:'Trainerstrafe',status:'open'},
  {id:'e',createdAt:5,seasonId:S,type:'in',cents:500,category:'Mitgliedsbeitrag',memberId:'m5',date:'2026-09-05',note:'Beitrag',status:'open'},
  {id:'f',createdAt:6,seasonId:S,type:'in',cents:3000,category:'Spende',memberId:null,date:'2026-09-06',note:'Ohne Zuordnung',status:'open'},
  {id:'g',createdAt:7,seasonId:S,type:'in',cents:900,category:'Strafe',memberId:'m3',date:'2026-09-07',note:'Bezahlt schon',status:'paid',paidDate:'2026-09-08'}],
 fines:[]};

let fehler=0;
const pruef=(n,ok,info)=>{if(!ok)fehler++;console.log((ok?'  OK    ':'  FEHLER ')+n+(info?'  -> '+info:''));};

(async()=>{
  await new Promise(r=>srv.listen(8851,r));
  const b=await chromium.launch();
  const c=await b.newContext({viewport:{width:460,height:1000},deviceScaleFactor:2,
    permissions:['clipboard-read','clipboard-write']});
  const p=await c.newPage();
  const err=[]; p.on('pageerror',e=>err.push(e.message));
  await p.goto('http://localhost:8851/');
  await p.evaluate(d=>localStorage.setItem('mk.data.v1',JSON.stringify(d)),daten);
  // navigator.share gibt es im Testbrowser nicht -> der Knopf muss kopieren.
  await p.goto('http://localhost:8851/#/uebersicht');
  await p.reload({waitUntil:'load'}); await p.waitForTimeout(800);

  const knopf = await p.evaluate(()=>!!document.querySelector('[data-action="share-claims"]'));
  pruef('Knopf „Liste teilen" bei den offenen Beträgen', knopf);
  await p.click('[data-action="share-claims"]'); await p.waitForTimeout(500);

  const anfang = await p.evaluate(()=>({
    rollen:[...document.querySelectorAll('[data-role-toggle]')].map(c=>c.textContent.trim()+(c.getAttribute('aria-pressed')==='true'?'✓':'✗')),
    text:document.querySelector('[data-preview]').textContent,
    summe:document.querySelector('[data-sum]').textContent
  }));
  pruef('Trainer ist ab Werk NICHT ausgewählt',
    anfang.rollen.join(' ')==='Spieler✓ Trainer✗ Betreuer✓', anfang.rollen.join(' '));
  pruef('Trainer taucht im Text nicht auf', !/Jörg/.test(anfang.text));
  pruef('Betreuerin ist dabei', /Anna Fischer \(Betreuer\)/.test(anfang.text));
  pruef('Buchung ohne Person fehlt (richtig so)', !/Ohne Zuordnung/.test(anfang.text));
  pruef('Bereits bezahlte Strafe fehlt', !/Bernd Klein/.test(anfang.text));
  pruef('Teilzahlung zählt nur den Rest (6,00 Strafe + 4,00 Beitrag)',
    /Lukas Berger \(7\): 10,00 €/.test(anfang.text));
  pruef('Gesamtsumme stimmt (25+10+5 = 40,00 €)', /Gesamt: 40,00 €/.test(anfang.text));
  pruef('Zusammenfassung über der Vorschau', /3 Personen · 40,00 €/.test(anfang.summe), anfang.summe);

  // Unterteilung: bei jeder Person Strafen und Beiträge getrennt
  pruef('Aufteilung bei einer Person mit beidem',
    /Lukas Berger \(7\): 10,00 €\n   Strafen 6,00 € · Beiträge 4,00 €/.test(anfang.text));
  pruef('Bei nur einer Art keine überflüssige Zusatzzeile',
    /Marco Schulz \(10\): 25,00 €\n(Anna|\n)/.test(anfang.text));
  pruef('Spaltensummen unter der Gesamtsumme',
    /Davon Strafen 31,00 € · Beiträge 9,00 €/.test(anfang.text));
  pruef('Keine leere Spalte „Sonstiges"', !/Sonstiges/.test(anfang.text));
  console.log('--- Vorschau ---\n'+anfang.text+'\n----------------');

  // Trainer dazuschalten
  await p.click('[data-role-toggle="trainer"]'); await p.waitForTimeout(300);
  const mitTrainer = await p.evaluate(()=>document.querySelector('[data-preview]').textContent);
  pruef('Trainer lässt sich dazuschalten', /Jörg Wegener \(Trainer\): 20,00 €/.test(mitTrainer) && /Gesamt: 60,00 €/.test(mitTrainer));
  await p.click('[data-role-toggle="trainer"]'); await p.waitForTimeout(300);

  // Einzelposten
  await p.click('#sh-details'); await p.waitForTimeout(300);
  const detail = await p.evaluate(()=>document.querySelector('[data-preview]').textContent);
  pruef('Einzelposten mit Datum und Restbetrag',
    /20\.09\.2026 Rote Karte — 15,00 €/.test(detail) && /Beitrag — 4,00 €/.test(detail));
  await p.click('#sh-details'); await p.waitForTimeout(300);

  // Kopieren
  await p.click('[data-send]'); await p.waitForTimeout(600);
  const inZwischenablage = await p.evaluate(()=>navigator.clipboard.readText());
  pruef('Text landet in der Zwischenablage', /Offene Beträge · SV Beispielheim II/.test(inZwischenablage) && /Gesamt: 40,00 €/.test(inZwischenablage));

  // Druckansicht
  await p.click('[data-print]'); await p.waitForTimeout(500);
  const druck = await p.evaluate(()=>document.querySelector('#printRoot').innerHTML);
  pruef('Druckdokument gefüllt',
    /Offene Beträge · Saison 2026\/27/.test(druck) && /Gesamt/.test(druck) && !/Jörg/.test(druck));
  pruef('Spalten Strafen und Beiträge nebeneinander',
    /<th class="r">Strafen<\/th><th class="r">Beiträge<\/th>/.test(druck));
  pruef('Keine leere Spalte „Sonstiges"', !/Sonstiges/.test(druck));
  pruef('Spaltensummen im Tabellenfuß',
    /<tfoot>[\s\S]*31,00 €[\s\S]*9,00 €[\s\S]*40,00 €[\s\S]*<\/tfoot>/.test(druck));
  await p.emulateMedia({media:'print'});
  const sichtbar = await p.evaluate(()=>{
    const pr=getComputedStyle(document.querySelector('#printRoot')).display;
    const app=getComputedStyle(document.querySelector('.layout')).display;
    return {druckbereich:pr, oberflaeche:app};});
  pruef('Im Druck nur das Dokument', sichtbar.druckbereich==='block' && sichtbar.oberflaeche==='none', JSON.stringify(sichtbar));

  /* Entweder alles dunkel oder alles hell: das Blatt ist hell, allein die
     Kopfzeile ist dunkel. */
  const farben = await p.evaluate(()=>{
    const hell=(el)=>{const c=getComputedStyle(el).backgroundColor.match(/\d+/g)||[255,255,255];
      return (+c[0]+ +c[1]+ +c[2])/3;};
    const blatt=[...document.querySelectorAll('.doc table, .doc tr, .doc td, .doc th, .doc .lead')];
    return {
      seite:hell(document.body), kopf:hell(document.querySelector('.doc .band')),
      dunkleKoerper:blatt.filter(e=>hell(e)<200 && getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)').length
    };});
  pruef('Blatt hell, Kopfzeile dunkel', farben.seite>240 && farben.kopf<60, JSON.stringify(farben));
  pruef('Kein weiterer dunkler Block auf dem Blatt', farben.dunkleKoerper===0);

  /* Das Blatt erbt die Klassen der Oberfläche mit. Helles Limette gehört
     auf Dunkel, auf Weiß ist es unlesbar — es darf nur in der Kopfzeile
     vorkommen. (Die Klasse .pos der App hat genau das einmal verursacht.) */
  const blass = await p.evaluate(()=>{
    const schlimm=[];
    document.querySelectorAll('.doc *').forEach(el=>{
      if (el.closest('.band')) return;
      if (!el.firstChild || el.firstChild.nodeType!==3) return;
      const c=(getComputedStyle(el).color.match(/\d+/g)||[0,0,0]).map(Number);
      // Luminanz grob nach WCAG. Gedämpftes Grau ist erlaubt, das helle
      // Limette der Oberfläche (0,84) nicht — auf Weiß liest es sich nicht.
      const L=(0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255;
      if (L>0.78) schlimm.push(el.className+' '+getComputedStyle(el).color);
    });
    return schlimm;});
  pruef('Keine unlesbar helle Schrift auf dem Blatt', blass.length===0, blass.join(' | '));

  /* A4 im Hochformat: 210 mm minus 2 × 15 mm Rand = 180 mm Satzspiegel.
     Nichts darf darüber hinausragen, sonst skaliert der Browser das Blatt
     herunter oder schiebt eine leere Seite hinterher. */
  await p.setViewportSize({width:680, height:1123});   // 180 mm bei 96 dpi
  await p.waitForTimeout(200);
  const masse = await p.evaluate(()=>{
    const doc=document.querySelector('.doc');
    const tab=document.querySelector('.doc table');
    return {
      breite:doc.getBoundingClientRect().width,
      ueberlauf:Math.max(doc.scrollWidth-doc.clientWidth, tab.scrollWidth-tab.clientWidth),
      seitenbreite:document.documentElement.scrollWidth
    };});
  pruef('Blatt bleibt im Satzspiegel (180 mm)', masse.breite<=680.5, masse.breite.toFixed(1)+'px');
  pruef('Nichts läuft seitlich über', masse.ueberlauf<=1 && masse.seitenbreite<=681,
    JSON.stringify(masse));

  if (process.env.SP) {
    // preferCSSPageSize: sonst überschreibt Playwright den Seitenrand aus
    // @page — und genau der macht die randlose Kopfzeile aus.
    await p.pdf({path:process.env.SP+'/offene-betraege.pdf', preferCSSPageSize:true});
  }
  await p.emulateMedia({media:'screen'});
  if (process.env.SP) await p.screenshot({path:process.env.SP+'/teilen-dialog.png'});

  console.log('Konsolenfehler:', err.length?err.join(' / '):'keine');
  console.log(fehler===0?'\nTEILEN FUNKTIONIERT':'\n'+fehler+' FEHLER');
  await b.close(); srv.close(); process.exit(fehler?1:0);
})();
