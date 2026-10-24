/* Einkaufszettel — UI and actions. Data lives in Firestore (see store.js);
   both phones subscribe to the same household and see changes live. */

import { firebaseConfig } from './config.js';
import { createStore } from './store.js';
import {
  MARKETS, OFFER_MARKETS, CATS, CAT_BY_ID, DEFAULT_ORDER, UNITS,
  euro, esc, fold, slug, today, fmtDay, ago, parseNum, fmtQty, cap, mk,
  parseEntry, guessCat, prepOffer, offersFor as matchOffers, activeOffers as liveOffers
} from './core.js';

// Shown under Einstellungen → App; bump together with CACHE in sw.js.
const APP_VERSION = '2026-10-24.2';
const OFFER_MODEL = 'claude-opus-5-5';
const PERSON_COLORS = ['#0B7A5C', '#B5527A', '#3D6FD8', '#C26A1B', '#7A55C7', '#1F8A9E'];

const S = {
  store: null, me: null, started: false,
  canWrite: true, live: false, pending: false, loaded: false,
  lists: [], items: [], history: [], offers: [], offersMeta: null, members: {},
  histMap: new Map(),
  listId: null, view: 'list', offerFilter: 'match',
  editing: null, importPreview: null, importMarket: null, authMode: 'signin',
  unsubs: []
};

const $ = (s) => document.querySelector(s);
const offersFor = (item) => matchOffers(item, S.offers);
const activeOffers = () => liveOffers(S.offers);

/* ---------- Theme ---------- */

function loadTheme() { try { return localStorage.getItem('ez-theme') || 'system'; } catch (e) { return 'system'; } }
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
  document.querySelectorAll('[data-theme-set]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-set') === t));
  });
}
function setTheme(t) {
  applyTheme(t);
  try { localStorage.setItem('ez-theme', t); } catch (e) { }
  if (S.store && S.me) S.store.setUserPrefs(S.me.uid, { theme: t }).catch(() => { });
}

/* ---------- Toast & writes ---------- */

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
function handleErr(e) {
  const c = e && e.code;
  console.warn(e);
  if (c === 'permission-denied') { S.canWrite = false; render(); toast('Nicht gespeichert: Dein Konto ist nicht freigeschaltet.'); }
  else if (c === 'resource-exhausted') toast('Zu viele Änderungen auf einmal. Bitte kurz warten.');
  else if (c === 'not-found') toast('Der Eintrag existiert nicht mehr.');
  else toast('Nicht gespeichert. Bitte nochmal versuchen.');
}
// Firestore applies writes locally at once and confirms later, so the UI never
// waits on the network; only failures surface.
function write(fn) {
  if (!S.store) { toast('Keine Verbindung zum Speicher.'); return Promise.resolve(false); }
  return Promise.resolve().then(fn).then(() => true, (e) => { handleErr(e); return false; });
}
function arm(btn, label, fn) {
  if (btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.textContent = btn.dataset.label; fn(); return; }
  btn.dataset.label = btn.textContent;
  btn.classList.add('armed'); btn.textContent = label;
  setTimeout(() => { if (btn.classList.contains('armed')) { btn.classList.remove('armed'); btn.textContent = btn.dataset.label; } }, 3500);
}

/* ---------- Data actions ---------- */

function currentList() {
  return S.lists.find((l) => l.id === S.listId) || S.lists[0] || null;
}
function histId(key) { return slug(key).slice(0, 150); }

function learn(name, unit, category, bump) {
  const key = fold(name);
  if (!key) return;
  const h = S.histMap.get(key);
  const data = { name, unit: unit || '', category, count: (h ? h.count || 0 : 0) + (bump ? 1 : 0), lastUsed: Date.now() };
  write(() => S.store.set('history', histId(key), data));
}

function addItem(raw, extra = {}) {
  const p = parseEntry(raw);
  if (!p.name) return;
  const list = extra.list || currentList();
  if (!list) { toast('Lege zuerst eine Liste an.'); return; }
  const key = fold(p.name);
  const dup = S.items.find((i) => i.listId === list.id && fold(i.name) === key);
  if (dup && !dup.done) {
    if (p.qty != null) write(() => S.store.update('items', dup.id, { qty: p.qty, unit: p.unit || dup.unit || '', updatedAt: Date.now() }));
    toast(dup.name + ' steht schon auf der Liste.');
    return;
  }
  if (dup && dup.done) {
    write(() => S.store.update('items', dup.id, { done: false, doneBy: null, doneAt: null, qty: p.qty != null ? p.qty : dup.qty, unit: p.unit || dup.unit || '', updatedAt: Date.now() }));
    toast(dup.name + ' ist wieder auf der Liste.');
    return;
  }
  const h = S.histMap.get(key);
  const now = Date.now();
  const doc = {
    listId: list.id, name: p.name, qty: p.qty,
    unit: p.unit || (p.qty != null && h ? h.unit || '' : ''),
    category: extra.category || (h && h.category) || guessCat(p.name),
    note: extra.note || '', done: false,
    addedBy: S.me.uid, doneBy: null, doneAt: null, createdAt: now, updatedAt: now
  };
  write(() => S.store.set('items', S.store.newId('items'), doc));
  learn(p.name, doc.unit, doc.category, true);
  if (extra.list) toast(p.name + ' steht jetzt auf ' + extra.list.name + '.');
}

function toggleItem(id) {
  const it = S.items.find((i) => i.id === id);
  if (!it) return;
  const done = !it.done;
  write(() => S.store.update('items', id, { done, doneBy: done ? S.me.uid : null, doneAt: done ? Date.now() : null, updatedAt: Date.now() }));
}

function clearDone(listId) {
  const done = S.items.filter((i) => i.listId === listId && i.done);
  write(() => S.store.batch(done.map((i) => ({ op: 'delete', coll: 'items', id: i.id }))))
    .then((ok) => { if (ok) toast(done.length + ' erledigte Artikel entfernt.'); });
}

function createList(name, market) {
  const order = S.lists.reduce((m, l) => Math.max(m, l.order || 0), 0) + 1;
  const id = S.store.newId('lists');
  S.listId = id;
  write(() => S.store.set('lists', id, { name, market, order, catOrder: DEFAULT_ORDER.slice(), createdAt: Date.now(), createdBy: S.me.uid }));
}

function deleteList(list) {
  const ops = S.items.filter((i) => i.listId === list.id).map((i) => ({ op: 'delete', coll: 'items', id: i.id }));
  ops.push({ op: 'delete', coll: 'lists', id: list.id });
  write(() => S.store.batch(ops)).then((ok) => { if (ok) toast('Liste „' + list.name + '“ gelöscht.'); });
}

/* ---------- People ---------- */

function personColor(uid) {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return PERSON_COLORS[h % PERSON_COLORS.length];
}
function person(uid) {
  const m = uid && S.members[uid];
  return { name: (m && m.name) || 'Jemand', color: (m && m.color) || (uid ? personColor(uid) : 'var(--other)') };
}
function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
}
function avatar(uid, cls) {
  if (!uid) return '';
  const p = person(uid);
  return '<span class="' + cls + '" style="--c:' + esc(p.color) + '" title="' + esc(p.name) + '" aria-label="' + esc(p.name) + '">' + esc(initials(p.name)) + '</span>';
}

/* ---------- Rendering: header ---------- */

function renderSync() {
  const el = $('#sync');
  let st, txt;
  if (S.store && S.store.isDemo) { st = 'live'; txt = 'Demo'; }
  else if (!navigator.onLine) { st = 'off'; txt = 'Offline'; }
  else if (S.live && S.pending) { st = 'wait'; txt = 'Speichert …'; }
  else if (S.live) { st = 'live'; txt = 'Live synchron'; }
  else { st = 'wait'; txt = 'Verbinde …'; }
  el.setAttribute('data-state', st);
  el.lastElementChild.textContent = txt;
  $('#offlineBanner').hidden = navigator.onLine;
}

function renderChips() {
  const cur = currentList();
  let html = S.lists.map((l) => {
    const open = S.items.filter((i) => i.listId === l.id && !i.done).length;
    return '<button type="button" class="chip" data-list="' + esc(l.id) + '" aria-pressed="' + Boolean(cur && cur.id === l.id) + '" style="--m:' + mk(l.market).color + '">' +
      '<span class="dot"></span>' + esc(l.name) + (open ? ' <span class="count num">' + open + '</span>' : '') + '</button>';
  }).join('');
  if (S.loaded && S.canWrite) html += '<button type="button" class="chip ghost" data-act="new-list">+ Liste</button>';
  $('#listChips').innerHTML = html;
}

/* ---------- Rendering: list ---------- */

function itemRow(it) {
  const offers = it.done ? [] : offersFor(it);
  const meta = [];
  if (it.note) meta.push('<span>' + esc(it.note) + '</span>');
  if (offers.length) {
    const o = offers[0];
    meta.push('<span class="tag' + (o._state === 'soon' ? ' later' : '') + '">' + esc(mk(o.market).name) + ' ' + euro.format(o.price) +
      (o._state === 'soon' && o.validFrom ? ' ab ' + esc(fmtDay(o.validFrom).split(',')[0]) : '') + '</span>' +
      (offers.length > 1 ? '<span>+' + (offers.length - 1) + ' weitere</span>' : ''));
  }
  const q = fmtQty(it.qty, it.unit);
  return '<li class="item' + (it.done ? ' done' : '') + '" data-id="' + esc(it.id) + '">' +
    '<button type="button" class="check" data-act="toggle" aria-label="' + esc(it.name) + (it.done ? ' wieder auf die Liste' : ' abhaken') + '"><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span></button>' +
    '<button type="button" class="ibody" data-act="edit">' +
    '<span class="line1">' + (q ? '<span class="qty">' + esc(q) + '</span>' : '') + '<span class="iname">' + esc(it.name) + '</span></span>' +
    (meta.length ? '<span class="imeta">' + meta.join('') + '</span>' : '') +
    '</button>' + avatar(it.done ? it.doneBy : it.addedBy, 'who') + '</li>';
}

function catOrderOf(list) {
  const order = (list.catOrder && list.catOrder.length ? list.catOrder : DEFAULT_ORDER).filter((c) => CAT_BY_ID[c]);
  DEFAULT_ORDER.forEach((c) => { if (order.indexOf(c) < 0) order.push(c); });
  return order;
}

function renderList() {
  const body = $('#listBody');
  $('#roBanner').hidden = S.canWrite;
  $('#addInput').disabled = !S.canWrite;
  if (!S.loaded) { body.innerHTML = '<div class="empty"><p>Listen werden geladen …</p></div>'; return; }
  const list = currentList();
  if (!list) {
    body.innerHTML = '<div class="empty"><h2>Noch keine Liste</h2><p>Lege für jeden Markt eine eigene Liste an. Ihr seht beide sofort jede Änderung.</p>' +
      (S.canWrite ? '<div class="row"><button class="btn primary" data-act="quick-lists" type="button">Lidl, Aldi Nord und Rewe anlegen</button></div>' : '') +
      '</div>';
    return;
  }
  const items = S.items.filter((i) => i.listId === list.id);
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  if (!items.length) {
    body.innerHTML = '<div class="empty"><h2>' + esc(list.name) + ' ist leer</h2><p>Tippe oben ein, was ihr braucht. Menge geht gleich mit: „2 kg Äpfel“, „3x Joghurt“, „Milch 2“.</p></div>';
    return;
  }
  let html = '';
  const onOffer = open.filter((i) => offersFor(i).length).length;
  if (onOffer) html += '<div class="hint-offers"><span class="tag">%</span>' + onOffer + (onOffer === 1 ? ' Artikel ist' : ' Artikel sind') + ' gerade irgendwo im Angebot.</div>';
  catOrderOf(list).forEach((cid) => {
    const g = open.filter((i) => (CAT_BY_ID[i.category] ? i.category : 'sonst') === cid)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    if (!g.length) return;
    html += '<section class="group"><h3>' + esc(CAT_BY_ID[cid].name) + '<span class="num">' + g.length + '</span></h3><ul class="items">' + g.map(itemRow).join('') + '</ul></section>';
  });
  if (!open.length) html += '<div class="empty"><h2>Alles im Wagen</h2><p>Alle Artikel sind abgehakt.</p></div>';
  if (done.length) {
    html += '<section class="group"><h3>Im Wagen · ' + done.length + (S.canWrite ? '<button class="linkbtn danger" type="button" data-act="clear-done">Erledigte entfernen</button>' : '') + '</h3><ul class="items">' + done.map(itemRow).join('') + '</ul></section>';
  }
  body.innerHTML = html;
}

/* ---------- Suggestions ---------- */

function renderSuggest() {
  const box = $('#suggest');
  const q = fold(parseEntry($('#addInput').value).name);
  if (!q || document.activeElement !== $('#addInput')) { box.hidden = true; return; }
  const list = currentList();
  const onList = {};
  S.items.forEach((i) => { if (list && i.listId === list.id && !i.done) onList[fold(i.name)] = 1; });
  const hits = S.history.filter((h) => {
    const f = fold(h.name);
    return f !== q && !onList[f] && (f.indexOf(q) === 0 || f.indexOf(' ' + q) >= 0 || (q.length >= 3 && f.indexOf(q) >= 0));
  }).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 5);
  if (!hits.length) { box.hidden = true; return; }
  box.innerHTML = hits.map((h) => '<li><button type="button" data-suggest="' + esc(h.name) + '">' + esc(h.name) + '<small>' + esc((CAT_BY_ID[h.category] || CAT_BY_ID.sonst).name) + '</small></button></li>').join('');
  box.hidden = false;
}

/* ---------- Rendering: offers ---------- */

function offerCard(o, matched, inSheet) {
  const disc = o.oldPrice && o.oldPrice > o.price ? Math.round((1 - o.price / o.oldPrice) * 100) : 0;
  const valid = o._state === 'soon' && o.validFrom ? 'ab ' + fmtDay(o.validFrom) : (o.validTo ? 'bis ' + fmtDay(o.validTo) : '');
  return '<li class="offer' + (matched ? ' match' : '') + '">' +
    '<div class="otitle">' + esc(o.title) + '</div>' +
    '<div class="oprice"><strong>' + euro.format(o.price) + '</strong>' +
    (o.oldPrice ? '<s>' + euro.format(o.oldPrice) + '</s>' : '') + (disc >= 5 ? '<span class="disc">−' + disc + ' %</span>' : '') + '</div>' +
    '<div class="osub"><span class="mk" style="--m:' + mk(o.market).color + '">' + esc(mk(o.market).name) + '</span>' +
    (o.brand ? '<span>' + esc(o.brand) + '</span>' : '') + (o.size ? '<span>' + esc(o.size) + '</span>' : '') +
    (valid ? '<span>' + esc(valid) + '</span>' : '') + '</div>' +
    (matched ? '<div class="osub" style="grid-column:1/-1"><span>Passt zu: ' + esc(matched) + '</span></div>' : '') +
    (S.canWrite && !matched && !inSheet ? '<button type="button" class="linkbtn oadd" data-act="offer-add" data-offer="' + esc(o.id) + '">+ Auf die Liste</button>' : '') +
    '</li>';
}

function renderOffers() {
  const f = S.offerFilter;
  const segs = [['match', 'Für meine Listen'], ['all', 'Alle']].concat(OFFER_MARKETS.map((m) => [m, MARKETS[m].name]));
  $('#offerFilter').innerHTML = segs.map((s) => '<button type="button" class="chip" data-offer-filter="' + s[0] + '" aria-pressed="' + (f === s[0]) + '"' +
    (MARKETS[s[0]] ? ' style="--m:' + MARKETS[s[0]].color + '"><span class="dot"></span>' : '>') + esc(s[1]) + '</button>').join('');

  const meta = S.offersMeta;
  const act = activeOffers();
  const counts = OFFER_MARKETS.map((m) => MARKETS[m].name + ' ' + act.filter((o) => o.market === m).length).join(' · ');
  $('#offersMeta').textContent = act.length ? counts + (meta && meta.updatedAt ? ' · aktualisiert ' + ago(meta.updatedAt) : '') : 'Noch keine aktuellen Angebote eingetragen.';

  const hasKey = Boolean(getApiKey()) || (S.store && S.store.isDemo);
  $('#flyerNoKey').hidden = hasKey;
  $('#flyerTool').hidden = !hasKey;

  const q = fold($('#offerSearch').value);
  const body = $('#offersBody');
  if (!S.loaded) { body.innerHTML = '<div class="empty"><p>Angebote werden geladen …</p></div>'; return; }

  if (f === 'match') {
    const rows = [];
    const seen = {};
    S.items.filter((i) => !i.done).forEach((it) => {
      offersFor(it).forEach((o) => {
        if (q && fold(o.title).indexOf(q) < 0) return;
        if (!seen[o.id]) { seen[o.id] = []; rows.push(o); }
        if (seen[o.id].indexOf(it.name) < 0) seen[o.id].push(it.name);
      });
    });
    if (!rows.length) {
      body.innerHTML = '<div class="empty"><h2>Gerade nichts im Angebot</h2><p>' +
        (act.length ? 'Keiner eurer Artikel ist in den eingetragenen Angeboten. Unter „Alle“ siehst du sämtliche Angebote.' : 'Trag die Angebote der Woche unten ein. Danach markiert die Liste alles, was irgendwo günstiger ist.') + '</p></div>';
      return;
    }
    rows.sort((a, b) => a.market.localeCompare(b.market) || a.price - b.price);
    body.innerHTML = '<ul class="offers">' + rows.map((o) => offerCard(o, seen[o.id].join(', '))).join('') + '</ul>';
    return;
  }
  const list = act.filter((o) => (f === 'all' || o.market === f) && (!q || fold(o.title + ' ' + (o.brand || '')).indexOf(q) >= 0))
    .sort((a, b) => a.market.localeCompare(b.market) || a.title.localeCompare(b.title, 'de'));
  body.innerHTML = list.length ? '<ul class="offers">' + list.map((o) => offerCard(o, '')).join('') + '</ul>'
    : '<div class="empty"><h2>Keine Angebote</h2><p>' + (q ? 'Nichts gefunden für „' + esc($('#offerSearch').value) + '“.' : 'Für diesen Markt ist nichts eingetragen. Unten kannst du Angebote eintragen.') + '</p></div>';
}

function renderOfferBadge() {
  let n = 0;
  S.items.forEach((i) => { if (!i.done && offersFor(i).length) n++; });
  const b = $('#offerBadge');
  b.hidden = !n; b.textContent = n;
}

function renderImportPreview() {
  const box = $('#flyerPreview');
  const p = S.importPreview;
  if (!p) { box.innerHTML = ''; return; }
  if (!p.length) { box.innerHTML = '<p class="status">Auf den Bildern wurden keine Angebote erkannt. Versuche schärfere oder näher aufgenommene Bilder.</p>'; return; }
  box.innerHTML = '<div class="eyebrow" style="margin-bottom:8px">' + p.length + ' erkannt · prüfen und übernehmen</div><ul class="preview">' +
    p.map((o, i) => '<li><label><input type="checkbox" data-prev="' + i + '" checked><span>' + esc(o.title) + (o.size ? ' · ' + esc(o.size) : '') +
      (o.validTo ? ' <small class="muted">bis ' + esc(fmtDay(o.validTo)) + '</small>' : '') + '</span><b class="num">' + euro.format(o.price) + '</b></label></li>').join('') +
    '</ul><div class="row" style="justify-content:flex-start;margin-top:10px"><button class="btn primary" type="button" data-act="import-save">Übernehmen</button><button class="btn" type="button" data-act="import-cancel">Verwerfen</button></div>';
}

/* ---------- Rendering: settings ---------- */

function renderSettings() {
  const box = $('#settingsBody');
  if (box.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) { S.settingsStale = true; return; }
  S.settingsStale = false;
  let html = '';
  const me = S.me ? person(S.me.uid) : null;
  html += '<div class="card"><h2>Konto</h2><div class="me">' + (S.me ? avatar(S.me.uid, 'av') : '') +
    '<div style="min-width:0"><div style="font-weight:700">' + esc(me ? me.name : '') + '</div><div class="status" style="overflow-wrap:anywhere">' + esc(S.me ? S.me.email : '') + '</div></div></div>' +
    '<div class="field"><label for="myName">Angezeigter Name</label><input id="myName" data-myname value="' + esc(me ? me.name : '') + '"' + (S.canWrite ? '' : ' disabled') + '></div>' +
    (S.canWrite ? '' : '<p class="status err" style="margin:0">Dein Konto ist noch nicht freigeschaltet.</p>') + '</div>';

  html += '<div class="card"><h2>Listen</h2><div class="lists-edit">';
  S.lists.forEach((l, idx) => {
    const order = catOrderOf(l);
    const dis = S.canWrite ? '' : ' disabled';
    html += '<div class="lrow"><div class="grid2">' +
      '<div class="field"><label for="ln-' + idx + '">Name</label><input id="ln-' + idx + '" data-lname="' + esc(l.id) + '" value="' + esc(l.name) + '"' + dis + '></div>' +
      '<div class="field"><label for="lm-' + idx + '">Markt</label><select id="lm-' + idx + '" data-lmarket="' + esc(l.id) + '"' + dis + '>' +
      Object.keys(MARKETS).map((m) => '<option value="' + m + '"' + (l.market === m ? ' selected' : '') + '>' + esc(MARKETS[m].name) + '</option>').join('') +
      '</select></div></div>' +
      '<details><summary class="lbl" style="cursor:pointer">Reihenfolge der Gänge im Laden</summary><ul class="order" style="margin-top:8px">' +
      order.map((cid, i) => '<li><span>' + esc(CAT_BY_ID[cid].name) + '</span>' +
        '<button type="button" aria-label="Nach oben" data-move="' + esc(l.id) + '" data-cat="' + cid + '" data-dir="-1"' + (i === 0 || !S.canWrite ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" aria-label="Nach unten" data-move="' + esc(l.id) + '" data-cat="' + cid + '" data-dir="1"' + (i === order.length - 1 || !S.canWrite ? ' disabled' : '') + '>↓</button></li>').join('') +
      '</ul></details>' +
      (S.canWrite ? '<div><button class="btn danger" type="button" data-del-list="' + esc(l.id) + '">Liste löschen</button></div>' : '') +
      '</div>';
  });
  if (S.canWrite) html += '<button class="btn" type="button" data-act="new-list">+ Neue Liste</button>';
  html += '</div></div>';

  html += '<div class="card"><h2>Vorschläge</h2><p class="status" style="margin:0">Die App merkt sich ' + S.history.length + ' Artikel mit Gang und Einheit und schlägt sie beim Tippen vor.</p>' +
    (S.canWrite && S.history.length ? '<div><button class="btn danger" type="button" data-act="clear-history">Gelernte Artikel löschen</button></div>' : '') + '</div>';

  const act = activeOffers().length;
  html += '<div class="card"><h2>Angebote</h2><p class="status" style="margin:0">' + act + ' aktuelle, ' + (S.offers.length - act) + ' abgelaufene Angebote gespeichert.</p>' +
    (S.canWrite && S.offers.length > act ? '<div><button class="btn" type="button" data-act="prune-offers">Abgelaufene entfernen</button></div>' : '') + '</div>';
  box.innerHTML = html;

  const k = getApiKey();
  $('#apiKeyStatus').textContent = k ? 'Schlüssel gespeichert (…' + k.slice(-4) + ').' : 'Kein Schlüssel gespeichert.';
  $('#appVersion').textContent = 'Version ' + APP_VERSION + (S.store && S.store.isDemo ? ' · Demo' : '');
}

/* ---------- Render dispatcher ---------- */

let renderQueued = false;
function render() {
  if (renderQueued || !S.started) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderSync();
    renderChips();
    renderOfferBadge();
    if (S.view === 'list') renderList();
    if (S.view === 'offers') renderOffers();
    if (S.view === 'settings') renderSettings();
  });
}

const APP_VIEWS = ['list', 'offers', 'settings'];
const ALL_VIEWS = APP_VIEWS.concat(['auth', 'verify', 'gate']);
function showOnly(v) {
  ALL_VIEWS.forEach((n) => { $('#view-' + n).hidden = n !== v; });
  const inApp = APP_VIEWS.indexOf(v) >= 0;
  $('#tabbar').hidden = !inApp;
  $('#listChips').hidden = v !== 'list';
  $('#sync').hidden = !inApp;
}
function setView(v) {
  S.view = v;
  showOnly(v);
  document.querySelectorAll('.tab').forEach((t) => {
    if (t.getAttribute('data-view') === v) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  render();
}

/* ---------- Edit sheet ---------- */

function openSheet(id) {
  const it = S.items.find((i) => i.id === id);
  if (!it) return;
  S.editing = id;
  $('#sheetTitle').textContent = it.name;
  $('#eName').value = it.name;
  $('#eQty').value = it.qty != null ? String(it.qty).replace('.', ',') : '';
  $('#eUnit').innerHTML = UNITS.map((u) => '<option value="' + u + '"' + ((it.unit || '') === u ? ' selected' : '') + '>' + (u || '–') + '</option>').join('');
  $('#eCat').innerHTML = CATS.map((c) => '<option value="' + c.id + '"' + (it.category === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
  $('#eList').innerHTML = S.lists.map((l) => '<option value="' + esc(l.id) + '"' + (it.listId === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('');
  $('#eNote').value = it.note || '';
  const offers = offersFor(it);
  $('#eOffers').innerHTML = offers.length ? '<div class="lbl" style="margin-bottom:6px">Im Angebot</div><ul class="offers">' + offers.slice(0, 4).map((o) => offerCard(o, '', true)).join('') + '</ul>' : '';
  let audit = '';
  if (it.addedBy || it.createdAt) audit += '<div>' + avatar(it.addedBy, 'av sm') + '<span>Hinzugefügt von ' + esc(person(it.addedBy).name) + ' · ' + esc(ago(it.createdAt)) + '</span></div>';
  if (it.done) audit += '<div>' + avatar(it.doneBy, 'av sm') + '<span>Abgehakt von ' + esc(person(it.doneBy).name) + ' · ' + esc(ago(it.doneAt)) + '</span></div>';
  $('#eAudit').innerHTML = audit;
  ['eName', 'eQty', 'eUnit', 'eCat', 'eList', 'eNote', 'eSave', 'eDelete'].forEach((k) => { $('#' + k).disabled = !S.canWrite; });
  $('#backdrop').hidden = false;
  $('#sheet').hidden = false;
}
function closeSheet() {
  S.editing = null;
  $('#sheet').hidden = true;
  $('#backdrop').hidden = true;
  const del = $('#eDelete');
  if (del.classList.contains('armed')) { del.classList.remove('armed'); del.textContent = del.dataset.label; }
}
function saveSheet() {
  const id = S.editing;
  const it = S.items.find((i) => i.id === id);
  if (!it) { closeSheet(); toast('Der Artikel wurde inzwischen gelöscht.'); return; }
  const name = cap($('#eName').value.trim()) || it.name;
  const data = {
    name, qty: parseNum($('#eQty').value), unit: $('#eUnit').value,
    category: $('#eCat').value, listId: $('#eList').value, note: $('#eNote').value.trim(), updatedAt: Date.now()
  };
  closeSheet();
  write(() => S.store.update('items', id, data));
  if (data.category !== it.category || data.unit !== it.unit || name !== it.name) learn(name, data.unit, data.category, false);
}

/* ---------- Offers import ---------- */

function getApiKey() { try { return localStorage.getItem('ez-anthropic-key') || ''; } catch (e) { return ''; } }

function normalizeOffer(o, market) {
  if (!o || typeof o !== 'object') return null;
  const price = parseNum(o.price);
  const title = String(o.title || '').trim().slice(0, 120);
  if (!title || price == null || price <= 0 || price > 1000) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const old = parseNum(o.oldPrice);
  return {
    market, title, brand: String(o.brand || '').trim().slice(0, 60),
    price: Math.round(price * 100) / 100,
    oldPrice: old && old > price ? Math.round(old * 100) / 100 : null,
    size: String(o.size || '').trim().slice(0, 40),
    validFrom: iso.test(o.validFrom) ? o.validFrom : null,
    validTo: iso.test(o.validTo) ? o.validTo : null,
    keywords: Array.isArray(o.keywords) ? o.keywords.map((k) => String(k).toLowerCase().slice(0, 40)).slice(0, 6) : []
  };
}
function offerId(o) { return (o.market + '-' + slug(o.title) + '-' + (o.validTo || 'offen')).slice(0, 180); }

// Shrink each picture to at most 1568 px on the long side (the size Claude reads
// best at) and send it as JPEG, so a full-resolution screenshot costs less.
function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1568 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

const OFFER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['offers'],
  properties: {
    offers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'brand', 'price', 'oldPrice', 'size', 'validFrom', 'validTo', 'keywords'],
        properties: {
          title: { type: 'string' },
          brand: { type: 'string' },
          price: { type: 'number' },
          oldPrice: { type: 'number' },
          size: { type: 'string' },
          validFrom: { type: 'string' },
          validTo: { type: 'string' },
          keywords: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
};

async function readFlyer() {
  const status = $('#flyerStatus');
  let files = Array.from($('#flyerFiles').files || []);
  const market = $('#flyerMarket').value;
  status.classList.remove('err');
  const fail = (msg) => { status.textContent = msg; status.classList.add('err'); };
  if (!files.length) { fail('Wähle zuerst ein oder mehrere Prospekt-Bilder aus.'); return; }
  if (files.length > 10) { files = files.slice(0, 10); toast('Es werden die ersten 10 Bilder ausgelesen.'); }
  const key = getApiKey();
  if (!key && !S.store.isDemo) { fail('Trag zuerst unter Einstellungen einen API-Schlüssel ein.'); return; }
  const btn = $('#flyerRead');
  btn.disabled = true;
  status.textContent = 'Claude liest den Prospekt. Das dauert meist 20–60 Sekunden …';
  const t = today();
  const prompt = 'Die Bilder zeigen Seiten aus dem aktuellen Wochenprospekt von ' + MARKETS[market].name + ' (Deutschland). Heute ist ' + t + ' (' + fmtDay(t) + ').\n' +
    'Lies jedes Lebensmittel-, Getränke- und Drogerie-Angebot aus, das klar lesbar ist. Lass Non-Food-Aktionsware wie Kleidung, Werkzeug oder Möbel weg. Erfinde nichts, was nicht auf den Bildern steht.\n' +
    'Felder: title = Produktname wie im Prospekt, ohne Marke. brand = Marke oder "". price = Angebotspreis in Euro. oldPrice = Normalpreis, 0 wenn keiner angegeben ist. ' +
    'size = Packungsgröße wie "500 g" oder "". validFrom und validTo = Datum als YYYY-MM-DD oder "" wenn unbekannt. ' +
    'keywords = 1 bis 4 allgemeine deutsche Wörter für die Produktart in Kleinschreibung, z. B. ["milch","vollmilch"] oder ["hähnchen","hähnchenbrust"], damit man das Angebot auf einer Einkaufsliste wiederfindet.\n' +
    'Steht nur ein Wochentag da (z. B. "ab Montag"), rechne das Datum ab heute. Ist kein Ende angegeben, gilt das Angebot bis zum folgenden Samstag.';
  try {
    let raw;
    if (S.store.isDemo) {
      await new Promise((r) => setTimeout(r, 600));
      raw = [{ title: 'Bananen (Demo)', brand: '', price: 1.11, oldPrice: 1.49, size: '1 kg', validFrom: '', validTo: '', keywords: ['banane', 'bananen'] }];
    } else {
      const images = await Promise.all(files.map(imageToBase64));
      const { Anthropic } = await import('./vendor/anthropic.js');
      const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      try {
        const msg = await client.beta.messages.create({
          model: OFFER_MODEL,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: OFFER_SCHEMA } },
          messages: [{
            role: 'user',
            content: images.map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } }))
              .concat([{ type: 'text', text: prompt }])
          }]
        });
        if (msg.stop_reason === 'refusal') { fail('Claude hat diese Bilder nicht ausgelesen. Versuche andere Ausschnitte.'); return; }
        if (msg.stop_reason === 'max_tokens') { fail('Zu viele Angebote auf einmal. Lies weniger Bilder pro Durchgang aus.'); return; }
        const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
        raw = JSON.parse(text).offers;
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) fail('Der API-Schlüssel wurde abgelehnt. Prüfe ihn unter Einstellungen.');
        else if (e instanceof Anthropic.PermissionDeniedError) fail('Dein API-Konto darf dieses Modell nicht nutzen oder hat kein Guthaben.');
        else if (e instanceof Anthropic.RateLimitError) fail('Gerade zu viele Anfragen. Versuch es in ein paar Minuten noch einmal.');
        else if (e instanceof Anthropic.BadRequestError) fail('Die Anfrage wurde abgelehnt: ' + (e.message || '').slice(0, 160));
        else if (e instanceof Anthropic.APIConnectionError) fail('Keine Verbindung zu Claude. Prüfe dein Internet.');
        else if (e instanceof Anthropic.APIError) fail('Claude ist gerade nicht erreichbar. Bitte später noch einmal versuchen.');
        else if (e instanceof SyntaxError) fail('Die Antwort ließ sich nicht auswerten. Bitte noch einmal versuchen.');
        else throw e;
        return;
      }
    }
    S.importPreview = (Array.isArray(raw) ? raw : []).map((o) => normalizeOffer(o, market)).filter(Boolean);
    S.importMarket = market;
    status.textContent = '';
    renderImportPreview();
  } catch (e) {
    console.warn(e);
    fail(e && e.message === 'image' ? 'Ein Bild ließ sich nicht öffnen. Nimm JPG, PNG oder WebP.' : 'Das Auslesen hat nicht geklappt. Bitte noch einmal versuchen.');
  } finally {
    btn.disabled = false;
  }
}

function saveImport() {
  const p = S.importPreview || [];
  const picked = p.filter((o, i) => { const cb = document.querySelector('[data-prev="' + i + '"]'); return cb && cb.checked; });
  if (!picked.length) { toast('Nichts ausgewählt.'); return; }
  const market = S.importMarket;
  const now = Date.now();
  const ops = picked.map((o) => ({ op: 'set', coll: 'offers', id: offerId(o), data: Object.assign({}, o, { source: 'foto', addedBy: S.me.uid, createdAt: now }) }));
  S.offers.filter((o) => o.market === market && o._state === 'expired').forEach((o) => ops.push({ op: 'delete', coll: 'offers', id: o.id }));
  ops.push({ op: 'set', coll: 'meta', id: 'offers', data: { updatedAt: now, by: S.me.uid } });
  write(() => S.store.batch(ops));
  S.importPreview = null; $('#flyerFiles').value = '';
  renderImportPreview();
  S.offerFilter = 'match';
  toast(picked.length + ' Angebote von ' + MARKETS[market].name + ' gespeichert.');
  render();
}

/* ---------- Events ---------- */

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  const act = t.getAttribute('data-act');

  if (t.hasAttribute('data-view')) { setView(t.getAttribute('data-view')); return; }
  if (t.hasAttribute('data-list')) {
    S.listId = t.getAttribute('data-list');
    try { localStorage.setItem('ez-list', S.listId); } catch (err) { }
    render();
    return;
  }
  if (t.hasAttribute('data-theme-set')) { setTheme(t.getAttribute('data-theme-set')); return; }
  if (t.hasAttribute('data-auth-mode')) { setAuthMode(t.getAttribute('data-auth-mode')); return; }
  if (t.hasAttribute('data-suggest')) {
    const p = parseEntry($('#addInput').value);
    addItem((p.qty != null ? p.qty + ' ' + (p.unit || '') + ' ' : '') + t.getAttribute('data-suggest'));
    $('#addInput').value = ''; $('#suggest').hidden = true; $('#addInput').focus();
    return;
  }
  if (t.hasAttribute('data-offer-filter')) { S.offerFilter = t.getAttribute('data-offer-filter'); renderOffers(); return; }
  if (t.hasAttribute('data-move')) {
    const l = S.lists.find((x) => x.id === t.getAttribute('data-move'));
    if (!l) return;
    const order = catOrderOf(l);
    const i = order.indexOf(t.getAttribute('data-cat')), j = i + Number(t.getAttribute('data-dir'));
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    write(() => S.store.update('lists', l.id, { catOrder: order }));
    return;
  }
  if (t.hasAttribute('data-del-list')) {
    const dl = S.lists.find((x) => x.id === t.getAttribute('data-del-list'));
    if (dl) arm(t, 'Mit allen Artikeln löschen?', () => deleteList(dl));
    return;
  }

  const row = t.closest('.item');
  if (act === 'toggle' && row) { if (S.canWrite) toggleItem(row.getAttribute('data-id')); return; }
  if (act === 'edit' && row) { openSheet(row.getAttribute('data-id')); return; }
  if (act === 'clear-done') { const cl = currentList(); if (cl) arm(t, 'Wirklich entfernen?', () => clearDone(cl.id)); return; }
  if (act === 'new-list') { createList('Neue Liste', 'none'); setView('settings'); toast('Liste angelegt. Gib ihr hier einen Namen.'); return; }
  if (act === 'quick-lists') {
    const base = S.lists.reduce((m, l) => Math.max(m, l.order || 0), 0);
    write(() => S.store.batch(OFFER_MARKETS.map((m, i) => ({
      op: 'set', coll: 'lists', id: m,
      data: { name: MARKETS[m].name, market: m, order: base + i + 1, catOrder: DEFAULT_ORDER.slice(), createdAt: Date.now(), createdBy: S.me.uid }
    }))));
    S.listId = 'lidl';
    return;
  }
  if (act === 'offer-add') {
    const o = S.offers.find((x) => x.id === t.getAttribute('data-offer'));
    if (!o) return;
    const target = S.lists.find((x) => x.market === o.market) || currentList();
    if (target) addItem(o.title, { list: target, note: 'Angebot ' + euro.format(o.price) + ' bei ' + mk(o.market).name });
    else toast('Lege zuerst eine Liste an.');
    return;
  }
  if (act === 'import-save') { saveImport(); return; }
  if (act === 'import-cancel') { S.importPreview = null; renderImportPreview(); return; }
  if (act === 'clear-history') {
    arm(t, 'Wirklich alle löschen?', () => {
      write(() => S.store.batch(S.history.map((h) => ({ op: 'delete', coll: 'history', id: h.id }))))
        .then((ok) => { if (ok) toast('Gelernte Artikel gelöscht.'); });
    });
    return;
  }
  if (act === 'prune-offers') {
    const ex = S.offers.filter((x) => x._state === 'expired');
    write(() => S.store.batch(ex.map((x) => ({ op: 'delete', coll: 'offers', id: x.id }))))
      .then((ok) => { if (ok) toast(ex.length + ' abgelaufene Angebote entfernt.'); });
  }
});

$('#addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!S.canWrite) return;
  const v = $('#addInput').value;
  if (!v.trim()) return;
  addItem(v);
  $('#addInput').value = '';
  $('#suggest').hidden = true;
});
$('#addInput').addEventListener('input', renderSuggest);
$('#addInput').addEventListener('focus', renderSuggest);
$('#addInput').addEventListener('blur', () => { setTimeout(() => { $('#suggest').hidden = true; }, 150); });
$('#offerSearch').addEventListener('input', renderOffers);

$('#settingsBody').addEventListener('change', (e) => {
  const t = e.target;
  if (t.hasAttribute('data-lname')) {
    const v = t.value.trim(), id = t.getAttribute('data-lname');
    if (v) write(() => S.store.update('lists', id, { name: v }));
  }
  if (t.hasAttribute('data-lmarket')) {
    const id = t.getAttribute('data-lmarket'), m = t.value;
    write(() => S.store.update('lists', id, { market: m }));
  }
  if (t.hasAttribute('data-myname')) {
    const v = t.value.trim().slice(0, 40);
    if (v) write(() => S.store.set('members', S.me.uid, { name: v, color: person(S.me.uid).color }));
  }
});
$('#settingsBody').addEventListener('focusout', () => {
  setTimeout(() => { if (S.settingsStale) renderSettings(); }, 0);
});

$('#eSave').addEventListener('click', saveSheet);
$('#eCancel').addEventListener('click', closeSheet);
$('#backdrop').addEventListener('click', closeSheet);
$('#eDelete').addEventListener('click', () => {
  const id = S.editing;
  arm($('#eDelete'), 'Wirklich löschen?', () => {
    closeSheet();
    write(() => S.store.remove('items', id));
  });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.editing) closeSheet(); });

$('#flyerRead').addEventListener('click', readFlyer);
$('#manualForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const o = normalizeOffer({
    title: $('#mTitle').value, price: $('#mPrice').value, oldPrice: $('#mOld').value,
    validTo: $('#mTo').value || null, keywords: []
  }, $('#mMarket').value);
  if (!o) { toast('Bitte Produkt und Preis angeben.'); return; }
  const now = Date.now();
  write(() => S.store.batch([
    { op: 'set', coll: 'offers', id: offerId(o), data: Object.assign(o, { source: 'manuell', addedBy: S.me.uid, createdAt: now }) },
    { op: 'set', coll: 'meta', id: 'offers', data: { updatedAt: now, by: S.me.uid } }
  ]));
  e.target.reset();
  toast('Angebot gespeichert.');
});

$('#apiKeySave').addEventListener('click', () => {
  const v = $('#apiKey').value.trim();
  try {
    if (v) localStorage.setItem('ez-anthropic-key', v); else localStorage.removeItem('ez-anthropic-key');
  } catch (e) { toast('Konnte den Schlüssel auf diesem Gerät nicht speichern.'); return; }
  $('#apiKey').value = '';
  toast(v ? 'Schlüssel gespeichert.' : 'Schlüssel entfernt.');
  render();
});
$('#logout').addEventListener('click', () => { S.store.auth.signOut(); });
$('#checkUpdate').addEventListener('click', async () => {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
  if (!reg) { location.reload(); return; }
  await reg.update().catch(() => { });
  if (reg.waiting) { reg.waiting.postMessage('skip-waiting'); toast('Update wird geladen …'); }
  else toast('Du hast die neueste Version.');
});

window.addEventListener('online', render);
window.addEventListener('offline', render);
setInterval(() => {
  // Offers expire at midnight; refresh their state without touching the store.
  S.offers.forEach(prepOffer);
  render();
}, 5 * 60 * 1000);

/* ---------- Static selects ---------- */

const marketOpts = OFFER_MARKETS.map((m) => '<option value="' + m + '">' + MARKETS[m].name + '</option>').join('');
$('#flyerMarket').innerHTML = marketOpts;
$('#mMarket').innerHTML = marketOpts;
$('#flyerLinks').innerHTML = OFFER_MARKETS.map((m) => '<a href="' + MARKETS[m].url + '" target="_blank" rel="noopener">Prospekt ' + MARKETS[m].name + ' ↗</a>').join('');

/* ---------- Login ---------- */

const AUTH_ERRORS = {
  'auth/invalid-credential': 'E-Mail oder Passwort stimmt nicht.',
  'auth/wrong-password': 'E-Mail oder Passwort stimmt nicht.',
  'auth/user-not-found': 'Zu dieser E-Mail gibt es noch kein Konto.',
  'auth/email-already-in-use': 'Für diese E-Mail gibt es schon ein Konto. Melde dich an.',
  'auth/weak-password': 'Das Passwort braucht mindestens 6 Zeichen.',
  'auth/invalid-email': 'Diese E-Mail-Adresse sieht nicht richtig aus.',
  'auth/missing-password': 'Bitte gib ein Passwort ein.',
  'auth/too-many-requests': 'Zu viele Versuche. Warte ein paar Minuten.',
  'auth/network-request-failed': 'Keine Verbindung. Prüfe dein Internet.',
  'auth/operation-not-allowed': 'Die Anmeldung mit E-Mail ist in Firebase noch nicht eingeschaltet.'
};
function authError(e) { return AUTH_ERRORS[e && e.code] || 'Das hat nicht geklappt. Bitte noch einmal versuchen.'; }

function setAuthMode(mode) {
  S.authMode = mode;
  const up = mode === 'signup';
  $('#authTitle').textContent = up ? 'Konto erstellen' : 'Anmelden';
  $('#authIntro').textContent = up ? 'Jede Person bekommt ein eigenes Konto. So sieht man, wer was eingetragen hat.' : 'Melde dich an, um eure gemeinsamen Listen zu sehen.';
  $('#authNameField').hidden = !up;
  $('#authSubmit').textContent = up ? 'Konto erstellen' : 'Anmelden';
  $('#authPass').setAttribute('autocomplete', up ? 'new-password' : 'current-password');
  $('#authSwitch').innerHTML = up
    ? '<span>Schon ein Konto?</span><button type="button" data-auth-mode="signin">Anmelden</button>'
    : '<span>Noch kein Konto?</span><button type="button" data-auth-mode="signup">Konto erstellen</button>';
  $('#authErr').textContent = '';
}

$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#authEmail').value.trim(), pass = $('#authPass').value, name = $('#authName').value.trim();
  const btn = $('#authSubmit');
  $('#authErr').textContent = '';
  if (S.authMode === 'signup' && !name) { $('#authErr').textContent = 'Bitte gib deinen Vornamen ein.'; return; }
  btn.disabled = true;
  try {
    if (S.authMode === 'signup') {
      try { localStorage.setItem('ez-pending-name', name); } catch (err) { }
      await S.store.auth.signUp(name, email, pass);
    } else {
      await S.store.auth.signIn(email, pass);
    }
  } catch (err) {
    $('#authErr').textContent = authError(err);
  } finally {
    btn.disabled = false;
  }
});
$('#authReset').addEventListener('click', async () => {
  const email = $('#authEmail').value.trim();
  if (!email) { $('#authErr').textContent = 'Gib oben deine E-Mail ein, dann schicken wir dir einen Link.'; return; }
  try { await S.store.auth.resetPassword(email); toast('Link zum Zurücksetzen ist unterwegs.'); }
  catch (err) { $('#authErr').textContent = authError(err); }
});
$('#verifyDone').addEventListener('click', async () => {
  const u = await S.store.auth.refresh().catch(() => null);
  if (u && u.emailVerified) onUser(u);
  else toast('Noch nicht bestätigt. Tippe zuerst auf den Link in der E-Mail.');
});
$('#verifyResend').addEventListener('click', () => {
  S.store.auth.sendVerification().then(() => toast('E-Mail ist unterwegs.'), (err) => toast(authError(err)));
});
$('#verifyLogout').addEventListener('click', () => S.store.auth.signOut());

/* ---------- Boot ---------- */

function gate(title, html) {
  showOnly('gate');
  $('#view-gate').innerHTML = '<div class="empty" style="max-width:460px"><h2>' + esc(title) + '</h2>' + html + '</div>';
}

function onErr(e) {
  console.warn(e);
  if (e && e.code === 'permission-denied') { S.canWrite = false; S.loaded = true; }
  S.live = false;
  render();
}

function subscribe() {
  const got = {};
  const mark = (k, meta) => {
    got[k] = true;
    if (got.lists && got.items) S.loaded = true;
    if (k === 'items') { S.live = !meta.fromCache; S.pending = meta.pending; }
  };
  S.unsubs.push(S.store.listen('lists', (docs, meta) => {
    S.lists = docs.sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0));
    if (!S.lists.find((l) => l.id === S.listId)) {
      let remembered = null;
      try { remembered = localStorage.getItem('ez-list'); } catch (e) { }
      S.listId = (S.lists.find((l) => l.id === remembered) || S.lists[0] || {}).id || null;
    }
    mark('lists', meta); render();
  }, onErr));
  S.unsubs.push(S.store.listen('items', (docs, meta) => {
    S.items = docs;
    mark('items', meta); render();
    if (S.editing && !S.items.find((i) => i.id === S.editing)) { closeSheet(); toast('Der Artikel wurde gerade gelöscht.'); }
  }, onErr));
  S.unsubs.push(S.store.listen('history', (docs) => {
    S.history = docs;
    S.histMap = new Map();
    S.history.forEach((h) => S.histMap.set(fold(h.name), h));
  }, onErr));
  S.unsubs.push(S.store.listen('offers', (docs) => { S.offers = docs.map(prepOffer); render(); }, onErr));
  S.unsubs.push(S.store.listen('members', (docs) => {
    S.members = {};
    docs.forEach((d) => { S.members[d.id] = d; });
    // First visit of this person: introduce them to the household.
    if (S.me && !S.members[S.me.uid] && S.canWrite) {
      let name = S.me.name;
      try { name = name || localStorage.getItem('ez-pending-name') || ''; } catch (e) { }
      name = name || (S.me.email || '').split('@')[0];
      write(() => S.store.set('members', S.me.uid, { name: name.slice(0, 40), color: personColor(S.me.uid) }));
    }
    render();
  }, onErr));
  S.unsubs.push(S.store.listenDoc('meta', 'offers', (d) => { S.offersMeta = d; render(); }, onErr));
}

function stopApp() {
  S.unsubs.forEach((u) => { try { u(); } catch (e) { } });
  S.unsubs = [];
  Object.assign(S, { started: false, loaded: false, canWrite: true, live: false, lists: [], items: [], history: [], offers: [], members: {}, offersMeta: null });
}

function onUser(u) {
  if (!u) {
    stopApp();
    S.me = null;
    setAuthMode(S.authMode);
    showOnly('auth');
    return;
  }
  if (!u.emailVerified) {
    stopApp();
    S.me = u;
    $('#verifyEmail').textContent = u.email;
    showOnly('verify');
    return;
  }
  if (S.started && S.me && S.me.uid === u.uid) return;
  stopApp();
  S.me = u;
  S.started = true;
  subscribe();
  S.store.getUserPrefs(u.uid).then((p) => {
    const t = p && p.theme;
    if (t && t !== loadTheme()) { applyTheme(t); try { localStorage.setItem('ez-theme', t); } catch (e) { } }
  }, () => { });
  setView('list');
}

async function boot() {
  applyTheme(loadTheme());
  const demo = location.hash === '#demo';
  const config = demo ? 'demo' : firebaseConfig;
  $('#demoBar').hidden = !demo;
  if (!config) {
    gate('Noch nicht eingerichtet', '<p>Für die Synchronisierung fehlt noch das Firebase-Projekt. Die Anleitung steht in der README im Ordner <code>einkaufszettel</code>.</p><p><a href="#demo" onclick="setTimeout(function(){location.reload()},0)">Demo ansehen</a></p>');
    return;
  }
  try {
    S.store = await createStore(config);
  } catch (e) {
    console.error(e);
    gate('Start fehlgeschlagen', '<p>Die App konnte nicht geladen werden. Prüfe deine Verbindung und öffne sie erneut.</p>');
    return;
  }
  S.store.auth.onChange(onUser);
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

boot();
