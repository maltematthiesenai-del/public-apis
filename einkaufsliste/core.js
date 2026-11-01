/* Pure logic shared by the app: markets, aisles, parsing what people type,
   and matching list items against offers. No DOM, no storage. */

/* ---------- Constants ---------- */

var MARKETS = {
  lidl: { name: 'Lidl', color: 'var(--lidl)', url: 'https://www.lidl.de/' },
  aldi: { name: 'Aldi Nord', color: 'var(--aldi)', url: 'https://www.aldi-nord.de/angebote.html' },
  rewe: { name: 'Rewe', color: 'var(--rewe)', url: 'https://www.rewe.de/angebote/' },
  none: { name: 'Anderer Markt', color: 'var(--other)', url: '' }
};
var OFFER_MARKETS = ['lidl', 'aldi', 'rewe'];

// Keywords are folded (ä→a, ß→ss). German compounds put the head noun last,
// so a keyword matches when a word ends with it ("Vollmilch" → milch).
// A leading "=" means the word must match exactly (short words like "Eis").
var CATS = [
  { id: 'obst', name: 'Obst & Gemüse', k: ['obst', 'gemuse', 'apfel', 'birne', 'banane', 'orange', 'mandarine', 'clementine', 'zitrone', 'limette', 'traube', 'beere', 'kiwi', 'mango', 'ananas', 'melone', 'pfirsich', 'nektarine', 'pflaume', 'avocado', 'tomate', 'gurke', 'paprika', 'salat', 'zwiebel', 'knoblauch', 'kartoffel', 'mohre', 'karotte', 'brokkoli', 'blumenkohl', 'zucchini', 'aubergine', 'pilz', 'champignon', 'spinat', 'lauch', 'porree', 'sellerie', 'radieschen', 'kohl', 'kurbis', 'ingwer', 'petersilie', 'schnittlauch', 'basilikum', 'rucola', 'spargel', 'bete', 'feldsalat', 'kraut', 'minze', 'dill', 'fenchel'] },
  { id: 'brot', name: 'Brot & Backwaren', k: ['brot', 'brotchen', 'toast', 'baguette', 'croissant', 'brezel', 'laugenstange', 'kuchen', 'wrap', 'tortilla', 'zwieback', 'semmel', 'ciabatta', 'bagel', 'muffin'] },
  { id: 'kuehl', name: 'Kühlregal', k: ['milch', 'joghurt', 'jogurt', 'quark', 'butter', 'kase', 'sahne', 'schmand', 'fraiche', 'mozzarella', 'feta', 'gouda', 'parmesan', '=ei', '=eier', 'margarine', 'skyr', 'kefir', 'pudding', 'tofu', 'hummus', 'gnocchi', 'tortellini', 'teig', 'aufstrich'] },
  { id: 'fleisch', name: 'Fleisch & Fisch', k: ['fleisch', 'hack', 'hahnchen', 'pute', 'putenbrust', 'rind', 'schwein', 'schnitzel', 'wurst', 'salami', 'schinken', 'bacon', 'speck', 'lachs', 'fisch', 'garnele', 'wurstchen', 'aufschnitt', 'filet', 'steak', 'gulasch', 'kassler', 'frikadelle', 'geflugel', 'hahnchenbrust', 'chicken', 'mett'] },
  { id: 'tk', name: 'Tiefkühl', k: ['tiefkuhl', '=tk', 'pizza', '=eis', 'eiscreme', 'pommes', 'fischstabchen', 'kroketten', 'rahmspinat', 'erbsen', 'beeren-mix'] },
  { id: 'vorrat', name: 'Vorrat & Konserven', k: ['nudel', 'spaghetti', 'penne', 'fusilli', 'lasagne', 'reis', 'mehl', 'zucker', 'salz', 'pfeffer', 'gewurz', '=ol', 'olivenol', 'rapsol', 'sonnenblumenol', 'speiseol', 'essig', 'ketchup', 'senf', 'mayo', 'mayonnaise', 'bruhe', 'dose', 'konserve', 'bohne', 'linse', 'kichererbse', 'tomatenmark', 'passata', 'haferflocken', 'musli', 'cornflakes', 'honig', 'marmelade', 'konfiture', 'nutella', 'kaffee', 'tee', 'kakao', 'backpulver', 'hefe', 'sosse', 'sauce', 'pesto', 'couscous', 'bulgur', 'thunfisch', 'mais', 'knackebrot', 'muesli', 'brotaufstrich', 'vanillezucker'] },
  { id: 'suess', name: 'Süßes & Snacks', k: ['schokolade', 'chips', 'keks', 'gummibar', 'bonbon', 'riegel', 'nusse', 'nuss', 'salzstange', 'popcorn', 'cracker', 'praline', 'snack', 'waffel', 'lakritz', 'fruchtgummi', 'schoko'] },
  { id: 'getraenke', name: 'Getränke', k: ['wasser', 'cola', 'limo', 'limonade', 'bier', 'wein', 'sekt', 'schorle', 'sprudel', 'eistee', 'energy', 'smoothie', 'radler', 'spezi', 'fanta', 'sprite', 'saft', 'getrank'] },
  { id: 'drogerie', name: 'Drogerie & Haushalt', k: ['shampoo', 'duschgel', 'seife', 'zahnpasta', 'zahncreme', 'zahnburste', 'deo', 'toilettenpapier', 'klopapier', 'kuchenrolle', 'taschentucher', 'spulmittel', 'waschmittel', 'mullbeutel', 'schwamm', 'putzmittel', 'reiniger', 'windel', 'creme', 'rasierer', 'watte', 'spultabs', 'tabs', 'alufolie', 'frischhaltefolie', 'backpapier', 'batterie', 'weichspuler', 'futter', 'katzenstreu', 'pflaster', 'tampon', 'binde', 'kerze'] },
  { id: 'sonst', name: 'Sonstiges', k: [] }
];
var CAT_BY_ID = {};
CATS.forEach(function (c) { CAT_BY_ID[c.id] = c; });
var DEFAULT_ORDER = CATS.map(function (c) { return c.id; });
var UNITS = ['', 'Stk', 'g', 'kg', 'ml', 'l', 'Pkg', 'Dose', 'Fl', 'Bund', 'Becher', 'Glas', 'Netz'];
var STOP = { bio: 1, und: 1, mit: 1, fur: 1, frisch: 1, frische: 1, frischer: 1, frisches: 1, oder: 1, von: 1, der: 1, die: 1, das: 1, ohne: 1, extra: 1, mini: 1, gross: 1, klein: 1, natur: 1, original: 1, classic: 1, stuck: 1, packung: 1, pack: 1, versch: 1, sorten: 1, verschiedene: 1, sorte: 1, deutsche: 1, deutscher: 1, aus: 1, ca: 1, je: 1, xxl: 1, family: 1, angebot: 1 };

var euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
var numFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
var dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
var rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto' });

/* ---------- Helpers ---------- */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function fold(s) {
  return String(s || '').toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
function stem(w) {
  if (w.length >= 6 && w.slice(-2) === 'en') return w.slice(0, -2);
  if (w.length >= 5 && /[ens]$/.test(w)) return w.slice(0, -1);
  return w;
}
// Does `word` have `kw` as its head (last part of the compound)?
function headMatch(word, kw) {
  if (kw.charAt(0) === '=') return word === kw.slice(1);
  if (kw.length < 4) return word === kw;
  var sw = stem(word), sk = stem(kw);
  return word.slice(-kw.length) === kw || sw.slice(-sk.length) === sk || sw.slice(-kw.length) === kw;
}
function words(s) {
  return fold(s).split(' ').filter(function (t) { return /^[a-z]{3,}$/.test(t) && !STOP[t]; });
}
function slug(s) { return fold(s).replace(/ /g, '-').slice(0, 120); }
function today() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDays(iso, n) {
  var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtDay(iso) { try { return dayFmt.format(new Date(iso + 'T12:00:00')); } catch (e) { return iso; } }
function ago(ts) {
  if (!ts) return '';
  var s = Math.round((ts - Date.now()) / 1000), a = Math.abs(s);
  if (a < 60) return 'gerade eben';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}
function parseNum(v) {
  if (v == null || v === '') return null;
  var n = parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
}
function fmtQty(q, u) {
  if (q == null || q === '') return u ? u : '';
  return u ? numFmt.format(q) + ' ' + u : numFmt.format(q) + '×';
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function mk(m) { return MARKETS[m] || MARKETS.none; }

var UNIT_MAP = { x: '', '×': '', stk: 'Stk', 'stück': 'Stk', stueck: 'Stk', g: 'g', gr: 'g', kg: 'kg', ml: 'ml', l: 'l', liter: 'l', pkg: 'Pkg', pck: 'Pkg', packung: 'Pkg', packungen: 'Pkg', pack: 'Pkg', dose: 'Dose', dosen: 'Dose', fl: 'Fl', flasche: 'Fl', flaschen: 'Fl', bund: 'Bund', becher: 'Becher', glas: 'Glas', 'gläser': 'Glas', netz: 'Netz' };
var UNIT_RE = '(x|×|stk|stück|stueck|gr|g|kg|ml|liter|l|pkg|pck|packungen|packung|pack|dosen|dose|flaschen|flasche|fl|bund|becher|gläser|glas|netz)';
// "2 kg Äpfel", "3x Joghurt", "Milch 2", "Hack 500 g"
function parseEntry(raw) {
  var s = String(raw || '').trim().replace(/\s+/g, ' ');
  var qty = null, unit = '', m;
  m = s.match(new RegExp('^(\\d+(?:[.,]\\d+)?)\\s*' + UNIT_RE + '?\\.?\\s+(.+)$', 'i'));
  if (m) { qty = parseNum(m[1]); unit = m[2] ? UNIT_MAP[m[2].toLowerCase()] : ''; s = m[3]; }
  else {
    m = s.match(new RegExp('^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*' + UNIT_RE + '?\\.?$', 'i'));
    if (m) { s = m[1]; qty = parseNum(m[2]); unit = m[3] ? UNIT_MAP[m[3].toLowerCase()] : ''; }
  }
  return { name: cap(s.trim()), qty: qty, unit: unit || '' };
}
function guessCat(name) {
  var ws = fold(name).split(' ').filter(Boolean).reverse();
  for (var i = 0; i < ws.length; i++) {
    var best = null, bl = 0;
    for (var c = 0; c < CATS.length; c++) {
      var ks = CATS[c].k;
      for (var j = 0; j < ks.length; j++) {
        if (ks[j].length > bl && headMatch(ws[i], ks[j])) { best = CATS[c].id; bl = ks[j].length; }
      }
    }
    if (best) return best;
  }
  return 'sonst';
}

/* ---------- Offers matching ---------- */

function offerState(o) {
  var t = today();
  if (o.validTo && o.validTo < t) return 'expired';
  if (o.validFrom && o.validFrom > t) return o.validFrom <= addDays(t, 7) ? 'soon' : 'expired';
  return 'now';
}
function prepOffer(o) {
  var ws = words(o.title);
  (o.keywords || []).forEach(function (k) { words(k).forEach(function (w) { ws.push(w); }); });
  o._w = ws;
  o._state = offerState(o);
  return o;
}
function itemMatches(item, o) {
  var t = words(item.name);
  if (!t.length || !o._w.length) return false;
  var head = t[t.length - 1];
  var whole = t.join('');
  return o._w.some(function (w) {
    return headMatch(w, head) || headMatch(whole, w) || (w.length >= 4 && headMatch(head, w));
  });
}
function offersFor(item, offers) {
  var r = offers.filter(function (o) { return o._state !== 'expired' && itemMatches(item, o); });
  r.sort(function (a, b) { return (a._state === 'now' ? 0 : 1) - (b._state === 'now' ? 0 : 1) || a.price - b.price; });
  return r;
}
function activeOffers(offers) { return offers.filter(function (o) { return o._state !== 'expired'; }); }

export {
  MARKETS, OFFER_MARKETS, CATS, CAT_BY_ID, DEFAULT_ORDER, UNITS,
  euro, numFmt, esc, fold, stem, headMatch, words, slug, today, addDays, fmtDay, ago,
  parseNum, fmtQty, cap, mk, parseEntry, guessCat,
  offerState, prepOffer, itemMatches, offersFor, activeOffers
};
