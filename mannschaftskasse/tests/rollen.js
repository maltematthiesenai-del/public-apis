const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/home/user/public-apis/mannschaftskasse';
const M={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0].split('#')[0];if(p==='/')p='/index.html';
 const f=path.join(ROOT,p);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}
 r.writeHead(200,{'Content-Type':M[path.extname(f)]||'text/plain'});r.end(fs.readFileSync(f));});

// Altdaten OHNE Rolle — die müssen stillschweigend zu Spielern werden.
const alt = { version:2, team:{name:'SV Test'}, settings:{monthlyFeeCents:500},
  seasons:[{id:'s1',name:'2026/27',createdAt:1}], currentSeasonId:'s1',
  members:[{id:'m1',name:'Lukas Berger',number:'7',active:true},
           {id:'m2',name:'Marco Schulz',number:'2',active:true}],
  transactions:[], fines:[] };

let fehler=0;
const pruef=(n,ok,info)=>{if(!ok)fehler++;console.log((ok?'  OK    ':'  FEHLER ')+n+(info?'  -> '+info:''));};

(async()=>{
  await new Promise(r=>srv.listen(8841,r));
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:560,height:1100}});
  p.on('pageerror',e=>console.log('SEITENFEHLER:',e.message));
  p.on('dialog',d=>d.accept());
  await p.goto('http://localhost:8841/');
  await p.evaluate(d=>localStorage.setItem('mk.data.v1',JSON.stringify(d)),alt);
  await p.goto('http://localhost:8841/#/spieler');
  await p.reload({waitUntil:'load'}); await p.waitForTimeout(700);

  /* Die Migration läuft beim Laden im Speicher und wird erst beim nächsten
     Speichern zurückgeschrieben — geprüft wird deshalb die Anzeige. */
  const altAnzeige = await p.evaluate(()=>({
    gruppen:[...document.querySelectorAll('#view .group-label')].map(e=>e.textContent.trim()),
    zeilen:[...document.querySelectorAll('#view [data-member] .title')].map(e=>e.textContent.replace(/\s+/g,' ').trim())
  }));
  pruef('Altdaten ohne Rolle erscheinen als Spieler',
    JSON.stringify(altAnzeige.gruppen)===JSON.stringify(['Spieler']) && altAnzeige.zeilen.length===2,
    altAnzeige.gruppen.join('|')+' mit '+altAnzeige.zeilen.join(', '));

  // Und nach dem nächsten Speichern steht die Rolle auch in den Daten.
  const spaeter = async () => await p.evaluate(()=>JSON.parse(localStorage.getItem('mk.data.v1'))
    .members.filter(m=>m.id==='m1'||m.id==='m2').map(m=>m.role||'(leer)'));

  // Trainer anlegen
  await p.click('[data-action="new-member"]'); await p.waitForTimeout(400);
  const dialogTitel = await p.evaluate(()=>document.querySelector('.modal-head h2').textContent.trim());
  const rollenFeld = await p.evaluate(()=>!!document.querySelector('#m-role'));
  pruef('Dialog heißt „Person hinzufügen"', dialogTitel==='Person hinzufügen', dialogTitel);
  pruef('Rollenauswahl vorhanden', rollenFeld);
  await p.fill('#m-name','Jörg Trainer');
  await p.selectOption('#m-role','trainer');
  await p.click('[data-save]'); await p.waitForTimeout(500);

  // Betreuer anlegen
  await p.click('[data-action="new-member"]'); await p.waitForTimeout(400);
  await p.fill('#m-name','Anna Betreuerin');
  await p.selectOption('#m-role','betreuer');
  await p.click('[data-save]'); await p.waitForTimeout(500);

  pruef('Rolle steht nach dem Speichern in den Daten',
    (await spaeter()).every(r=>r==='spieler'), (await spaeter()).join(', '));

  const gruppen = await p.evaluate(()=>[...document.querySelectorAll('#view .group-label')].map(e=>e.textContent.trim()));
  pruef('Kader nach Rollen gruppiert', JSON.stringify(gruppen)===JSON.stringify(['Spieler','Trainerstab','Betreuer']), gruppen.join(' | '));

  const reihenfolge = await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('#view .list > *').forEach(el=>{
      if(el.classList.contains('group-label')) out.push('['+el.textContent.trim()+']');
      else if(el.dataset.member) out.push(el.querySelector('.title').textContent.replace(/\s+/g,' ').trim());
    });
    return out;});
  console.log('  Kader:', reihenfolge.join('  '));

  const kachel = await p.evaluate(()=>{
    const t=[...document.querySelectorAll('.tile')].find(x=>/Spieler im Kader/.test(x.textContent));
    return {wert:t.querySelector('.value').textContent.trim(), sub:t.querySelector('.sub')?t.querySelector('.sub').textContent.trim():''};});
  pruef('Kachel zählt nur Spieler', kachel.wert==='2', 'Wert '+kachel.wert+' | '+kachel.sub);
  pruef('Stab wird getrennt ausgewiesen', /2 im Trainer- und Betreuerstab/.test(kachel.sub), kachel.sub);

  // NACHTRÄGLICH ändern: Betreuerin wird Spielerin
  await p.evaluate(()=>{
    const z=[...document.querySelectorAll('#view [data-member]')].find(e=>/Anna/.test(e.textContent));
    z.click();});
  await p.waitForTimeout(400);
  await p.click('[data-edit]'); await p.waitForTimeout(400);
  const vorgewaehlt = await p.evaluate(()=>document.querySelector('#m-role').value);
  pruef('Dialog zeigt die bisherige Rolle', vorgewaehlt==='betreuer', vorgewaehlt);
  await p.selectOption('#m-role','spieler');
  await p.fill('#m-number','9');
  await p.click('[data-save]'); await p.waitForTimeout(600);

  const nachher = await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('#view .list > *').forEach(el=>{
      if(el.classList.contains('group-label')) out.push('['+el.textContent.trim()+']');
      else if(el.dataset.member) out.push(el.querySelector('.title').textContent.replace(/\s+/g,' ').trim());});
    return out;});
  console.log('  Nach der Änderung:', nachher.join('  '));
  pruef('Anna steht jetzt bei den Spielern', nachher.indexOf('Anna Betreuerin · 9') < nachher.indexOf('[Trainerstab]'));
  pruef('Betreuer-Gruppe ist verschwunden', !nachher.includes('[Betreuer]'));

  // Beitragsdialog: Umfang wählbar
  await p.evaluate(()=>{location.hash='#/mehr';}); await p.waitForTimeout(600);
  await p.click('[data-action="book-fees"]'); await p.waitForTimeout(500);
  const scope = await p.evaluate(()=>[...document.querySelectorAll('[data-scope]')].map(c=>c.textContent.trim()+(c.getAttribute('aria-pressed')==='true'?' (gewählt)':'')));
  pruef('Beitrag: Umfang wählbar, Spieler vorgewählt', scope.length===2 && /gewählt/.test(scope[0]), scope.join(' | '));
  await p.click('[data-save]'); await p.waitForTimeout(600);
  const gebucht = await p.evaluate(()=>JSON.parse(localStorage.getItem('mk.data.v1')).transactions.length);
  pruef('Nur die 3 Spieler bekommen den Beitrag', gebucht===3, gebucht+' Buchungen');

  await p.evaluate(()=>{location.hash='#/spieler';}); await p.waitForTimeout(700);
  await p.screenshot({path:process.env.SP+'/rollen-kader.png'});
  console.log(fehler===0?'\nALLES WIE GEWÜNSCHT':'\n'+fehler+' FEHLER');
  await b.close(); srv.close(); process.exit(fehler?1:0);
})();
