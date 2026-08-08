/* =============================================================================
   Mannschaftskasse — Buchführung für die Fußballmannschaft
   Reines Frontend: alle Daten liegen im localStorage des Geräts.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------
     Konstanten
     ------------------------------------------------------------------ */

  var STORAGE_KEY = 'mk.data.v1';
  var THEME_KEY = 'mk.theme';

  // Wird unter „Mehr" angezeigt — daran erkennt man, ob eine Aktualisierung
  // auf dem Gerät angekommen ist. Bei Änderungen mitzählen.
  var APP_VERSION = '2026-08-08.2';

  var CATEGORIES = {
    in: ['Strafe', 'Mitgliedsbeitrag', 'Getränkekasse', 'Spende', 'Sonstige Einnahme'],
    out: ['Getränke', 'Ausrüstung', 'Mannschaftsabend', 'Schiedsrichter', 'Turnier / Fahrt', 'Sonstige Ausgabe']
  };

  // Kategorien, die typischerweise erst noch bezahlt werden müssen.
  var DEFAULT_OPEN_CATEGORIES = ['Strafe', 'Mitgliedsbeitrag'];

  var NAV = [
    { id: 'uebersicht', label: 'Übersicht', icon: 'i-home' },
    { id: 'buchungen', label: 'Buchungen', icon: 'i-list' },
    { id: 'spieler', label: 'Spieler', icon: 'i-users' },
    { id: 'strafen', label: 'Strafen', icon: 'i-card' },
    { id: 'mehr', label: 'Mehr', icon: 'i-more' }
  ];

  var DEFAULT_FINES = [
    ['Zu spät zum Training', 500],
    ['Zu spät zum Spiel', 1000],
    ['Unentschuldigt gefehlt', 1500],
    ['Gelbe Karte (Meckern)', 500],
    ['Gelb-Rote / Rote Karte', 1500],
    ['Handy klingelt in der Kabine', 500],
    ['Falsche Kleidung', 300],
    ['Geburtstag ohne Kuchen', 1000],
    ['Elfmeter verschossen', 500]
  ];

  /* ---------------------------------------------------------------------
     Helfer
     ------------------------------------------------------------------ */

  /* Beträge werden bewusst selbst formatiert statt über Intl: So steht auf
     jedem Gerät derselbe Euro-Betrag in deutscher Schreibweise — unabhängig
     davon, welche Sprache und Region im Handy eingestellt sind. */

  function groupThousands(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function money(cents) {
    var v = Math.abs(Math.round(cents || 0));
    var text = groupThousands(Math.floor(v / 100)) + ',' + pad(v % 100) + ' €';
    return (cents < 0 ? '−' : '') + text;
  }

  function moneySigned(cents) {
    var s = cents > 0 ? '+' : cents < 0 ? '−' : '';
    return s + money(Math.abs(cents || 0));
  }

  // Für Achsenbeschriftungen: volle Euro ohne Nachkommastellen.
  function moneyShort(cents) {
    return groupThousands(Math.round((cents || 0) / 100)) + ' €';
  }

  function parseAmount(value) {
    if (value == null) return NaN;
    var clean = String(value).replace(/[^\d,.\-]/g, '').replace(/\./g, '.').trim();
    // Deutsches Format: Komma ist das Dezimaltrennzeichen.
    if (clean.indexOf(',') > -1) clean = clean.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(clean);
    if (!isFinite(n)) return NaN;
    return Math.round(n * 100);
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function fmtDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso || '';
    return p[2] + '.' + p[1] + '.' + p[0];
  }

  function monthLabel(key) {
    var names = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    var p = key.split('-');
    return names[parseInt(p[1], 10) - 1] + ' ' + p[0].slice(2);
  }

  function monthLabelLong(key) {
    var names = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
      'August', 'September', 'Oktober', 'November', 'Dezember'];
    var p = key.split('-');
    return names[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function icon(id, cls) {
    return '<svg class="ic ' + (cls || '') + '" aria-hidden="true"><use href="#' + id + '"></use></svg>';
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------------------------------------------------------------------
     Datenhaltung
     ------------------------------------------------------------------ */

  var state = null;

  function defaultState() {
    var year = new Date().getFullYear();
    var month = new Date().getMonth();
    var season = month >= 6 ? year + '/' + String(year + 1).slice(2) : (year - 1) + '/' + String(year).slice(2);
    return {
      version: 1,
      team: { name: 'Meine Mannschaft', season: season },
      settings: { monthlyFeeCents: 500 },
      members: [],
      transactions: [],
      fines: DEFAULT_FINES.map(function (f, i) {
        return { id: uid() + i, label: f[0], cents: f[1] };
      })
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var data = JSON.parse(raw);
      var base = defaultState();
      return {
        version: 1,
        team: Object.assign(base.team, data.team || {}),
        settings: Object.assign(base.settings, data.settings || {}),
        members: Array.isArray(data.members) ? data.members : [],
        transactions: Array.isArray(data.transactions) ? data.transactions : [],
        fines: Array.isArray(data.fines) ? data.fines : base.fines
      };
    } catch (e) {
      console.warn('Gespeicherte Daten konnten nicht gelesen werden:', e);
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Speichern fehlgeschlagen — Speicher voll?');
    }
  }

  function commit() { save(); render(); }

  /* ---------------------------------------------------------------------
     Auswertungen
     ------------------------------------------------------------------ */

  function signedCents(t) { return t.type === 'in' ? t.cents : -t.cents; }

  function balanceCents() {
    return state.transactions.reduce(function (sum, t) {
      return t.status === 'paid' ? sum + signedCents(t) : sum;
    }, 0);
  }

  function totals() {
    var r = { in: 0, out: 0, openIn: 0, openOut: 0 };
    state.transactions.forEach(function (t) {
      if (t.status === 'paid') r[t.type] += t.cents;
      else if (t.type === 'in') r.openIn += t.cents;
      else r.openOut += t.cents;
    });
    return r;
  }

  function memberById(id) {
    for (var i = 0; i < state.members.length; i++) if (state.members[i].id === id) return state.members[i];
    return null;
  }

  function memberName(id) {
    var m = memberById(id);
    return m ? m.name : null;
  }

  function memberStats(id) {
    var r = { openIn: 0, openOut: 0, paidIn: 0, count: 0 };
    state.transactions.forEach(function (t) {
      if (t.memberId !== id) return;
      r.count++;
      if (t.status === 'open') { if (t.type === 'in') r.openIn += t.cents; else r.openOut += t.cents; }
      else if (t.type === 'in') r.paidIn += t.cents;
    });
    return r;
  }

  function sortedTransactions() {
    return state.transactions.slice().sort(function (a, b) {
      if (a.date === b.date) return (b.createdAt || 0) - (a.createdAt || 0);
      return a.date < b.date ? 1 : -1;
    });
  }

  function lastMonths(n) {
    var keys = [];
    var d = new Date();
    d.setDate(1);
    for (var i = n - 1; i >= 0; i--) {
      var x = new Date(d.getFullYear(), d.getMonth() - i, 1);
      keys.push(x.getFullYear() + '-' + pad(x.getMonth() + 1));
    }
    return keys;
  }

  function monthlySeries(n) {
    var keys = lastMonths(n);
    var map = {};
    keys.forEach(function (k) { map[k] = { key: k, in: 0, out: 0 }; });
    state.transactions.forEach(function (t) {
      if (t.status !== 'paid') return;
      var k = String(t.date).slice(0, 7);
      if (map[k]) map[k][t.type] += t.cents;
    });
    return keys.map(function (k) { return map[k]; });
  }

  /* ---------------------------------------------------------------------
     Toast
     ------------------------------------------------------------------ */

  var toastTimer = null;

  function toast(text, actionLabel, onAction) {
    var root = $('#toastRoot');
    root.innerHTML = '';
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span>' + esc(text) + '</span>';
    if (actionLabel) {
      var b = document.createElement('button');
      b.textContent = actionLabel;
      b.addEventListener('click', function () {
        root.innerHTML = '';
        onAction && onAction();
      });
      el.appendChild(b);
    }
    root.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { root.innerHTML = ''; }, actionLabel ? 6000 : 2600);
  }

  /* ---------------------------------------------------------------------
     Modal
     ------------------------------------------------------------------ */

  var modalCleanup = null;

  function openModal(opts) {
    closeModal();
    var root = $('#modalRoot');
    var back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
        '<div class="modal-head">' +
          '<h2>' + esc(opts.title) + '</h2>' +
          '<button class="icon-btn" data-close aria-label="Schließen">' + icon('i-close') + '</button>' +
        '</div>' +
        '<div class="modal-body">' + opts.body + '</div>' +
        (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div>';
    root.appendChild(back);

    back.addEventListener('click', function (e) {
      if (e.target === back || e.target.closest('[data-close]')) closeModal();
    });
    function onKey(e) { if (e.key === 'Escape') closeModal(); }
    document.addEventListener('keydown', onKey);
    modalCleanup = function () { document.removeEventListener('keydown', onKey); };

    if (opts.onMount) opts.onMount($('.modal', back));
    var focusEl = $('[data-autofocus]', back);
    if (focusEl) setTimeout(function () { focusEl.focus(); }, 40);
    return back;
  }

  function closeModal() {
    if (modalCleanup) { modalCleanup(); modalCleanup = null; }
    $('#modalRoot').innerHTML = '';
  }

  /* ---------------------------------------------------------------------
     Formular-Bausteine
     ------------------------------------------------------------------ */

  /* Umschalter mit gleitender Markierung. Die Markierung wandert per CSS
     (:has) — deshalb sind hier immer genau zwei Optionen vorgesehen. */
  function segmented(name, options, value, extraClass) {
    return '<div class="segmented ' + (extraClass || '') + '" data-segmented="' + name + '">' +
      '<span class="seg-ind" aria-hidden="true"></span>' +
      options.map(function (o) {
        return '<button type="button" data-value="' + esc(o.value) + '" aria-pressed="' +
          (o.value === value ? 'true' : 'false') + '">' + esc(o.label) + '</button>';
      }).join('') + '</div>';
  }

  function wireSegmented(root, name, onChange) {
    var box = root.querySelector('[data-segmented="' + name + '"]');
    if (!box) return;
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-value]');
      if (!btn) return;
      $$('button', box).forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      onChange && onChange(btn.dataset.value);
    });
  }

  function segValue(root, name) {
    var btn = root.querySelector('[data-segmented="' + name + '"] button[aria-pressed="true"]');
    return btn ? btn.dataset.value : null;
  }

  function memberOptions(selectedId, emptyLabel) {
    var opts = ['<option value="">' + esc(emptyLabel || '— keinem Spieler zugeordnet —') + '</option>'];
    activeFirst().forEach(function (m) {
      opts.push('<option value="' + m.id + '"' + (m.id === selectedId ? ' selected' : '') + '>' +
        esc(m.name) + (m.active === false ? ' (inaktiv)' : '') + '</option>');
    });
    return opts.join('');
  }

  function activeFirst() {
    return state.members.slice().sort(function (a, b) {
      if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
      return a.name.localeCompare(b.name, 'de');
    });
  }

  function categoryOptions(type, selected) {
    return CATEGORIES[type].map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === selected ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
  }

  /* ---------------------------------------------------------------------
     Buchungs-Dialog
     ------------------------------------------------------------------ */

  function transactionDialog(existing, preset) {
    var t = existing || Object.assign({
      type: 'in', cents: 0, category: CATEGORIES.in[0], memberId: '',
      date: todayISO(), note: '', status: 'paid'
    }, preset || {});

    var body =
      '<div class="form-grid">' +
        segmented('type', [
          { value: 'in', label: 'Einnahme' },
          { value: 'out', label: 'Ausgabe' }
        ], t.type, t.type === 'in' ? 'tone-in' : 'tone-out') +

        '<div class="field">' +
          '<label for="f-amount">Betrag</label>' +
          '<div class="amount-input">' +
            '<input id="f-amount" type="text" inputmode="decimal" data-autofocus ' +
              'value="' + (t.cents ? (t.cents / 100).toFixed(2).replace('.', ',') : '') + '" placeholder="0,00">' +
            '<span class="cur">€</span>' +
          '</div>' +
        '</div>' +

        '<div class="form-row">' +
          '<div class="field">' +
            '<label for="f-category">Kategorie</label>' +
            '<select id="f-category">' + categoryOptions(t.type, t.category) + '</select>' +
          '</div>' +
          '<div class="field">' +
            '<label for="f-date">Datum</label>' +
            '<input id="f-date" type="date" value="' + esc(t.date) + '">' +
          '</div>' +
        '</div>' +

        '<div class="field">' +
          '<label for="f-member">Spieler</label>' +
          '<select id="f-member">' + memberOptions(t.memberId) + '</select>' +
        '</div>' +

        '<div class="field">' +
          '<label>Status</label>' +
          segmented('status', [
            { value: 'paid', label: 'Bezahlt' },
            { value: 'open', label: 'Offen' }
          ], t.status) +
          '<span class="hint" data-status-hint></span>' +
        '</div>' +

        '<div class="field">' +
          '<label for="f-note">Notiz <span class="hint">(optional)</span></label>' +
          '<input id="f-note" type="text" value="' + esc(t.note) + '" placeholder="z. B. Auswärtsspiel Musterdorf">' +
        '</div>' +
      '</div>';

    var footer =
      (existing ? '<button class="btn btn-danger btn-icon-only" data-delete>Löschen</button>' : '') +
      '<button class="btn" data-close>Abbrechen</button>' +
      '<button class="btn btn-primary" data-save>Speichern</button>';

    openModal({
      title: existing ? 'Buchung bearbeiten' : 'Neue Buchung',
      body: body,
      footer: footer,
      onMount: function (modal) {
        var typeNow = t.type;

        function updateStatusHint() {
          var s = segValue(modal, 'status');
          var el = $('[data-status-hint]', modal);
          el.textContent = s === 'paid'
            ? 'Das Geld ist geflossen — die Buchung zählt zum Kassenstand.'
            : (typeNow === 'in'
              ? 'Der Spieler schuldet der Kasse den Betrag noch.'
              : 'Die Kasse schuldet den Betrag noch (z. B. verauslagt).');
        }

        wireSegmented(modal, 'type', function (v) {
          typeNow = v;
          var box = modal.querySelector('[data-segmented="type"]');
          box.classList.toggle('tone-in', v === 'in');
          box.classList.toggle('tone-out', v === 'out');
          $('#f-category', modal).innerHTML = categoryOptions(v, null);
          updateStatusHint();
        });
        wireSegmented(modal, 'status', updateStatusHint);
        updateStatusHint();

        // Strafen und Beiträge stehen meistens erst noch aus.
        $('#f-category', modal).addEventListener('change', function (e) {
          if (existing) return;
          var wantOpen = DEFAULT_OPEN_CATEGORIES.indexOf(e.target.value) > -1;
          var box = modal.querySelector('[data-segmented="status"]');
          $$('button', box).forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.dataset.value === (wantOpen ? 'open' : 'paid')));
          });
          updateStatusHint();
        });

        $('[data-save]', modal).addEventListener('click', function () {
          var cents = parseAmount($('#f-amount', modal).value);
          if (!isFinite(cents) || cents <= 0) {
            toast('Bitte einen Betrag größer als 0 eingeben.');
            $('#f-amount', modal).focus();
            return;
          }
          var rec = {
            id: existing ? existing.id : uid(),
            createdAt: existing ? existing.createdAt : Date.now(),
            type: segValue(modal, 'type'),
            cents: cents,
            category: $('#f-category', modal).value,
            memberId: $('#f-member', modal).value || null,
            date: $('#f-date', modal).value || todayISO(),
            note: $('#f-note', modal).value.trim(),
            status: segValue(modal, 'status')
          };
          if (existing) {
            var i = state.transactions.findIndex(function (x) { return x.id === existing.id; });
            state.transactions[i] = rec;
          } else {
            state.transactions.push(rec);
          }
          closeModal();
          commit();
          toast(existing ? 'Buchung gespeichert.' : 'Buchung angelegt.');
        });

        var del = $('[data-delete]', modal);
        if (del) del.addEventListener('click', function () { deleteTransaction(existing.id); closeModal(); });
      }
    });
  }

  function deleteTransaction(id) {
    var i = state.transactions.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    var removed = state.transactions.splice(i, 1)[0];
    commit();
    toast('Buchung gelöscht.', 'Rückgängig', function () {
      state.transactions.splice(i, 0, removed);
      commit();
    });
  }

  function toggleStatus(id) {
    var t = state.transactions.find(function (x) { return x.id === id; });
    if (!t) return;
    t.status = t.status === 'open' ? 'paid' : 'open';
    commit();
    toast(t.status === 'paid' ? 'Als bezahlt markiert.' : 'Als offen markiert.');
  }

  /* ---------------------------------------------------------------------
     Spieler-Dialog
     ------------------------------------------------------------------ */

  function memberDialog(existing) {
    var m = existing || { name: '', number: '', active: true };
    var body =
      '<div class="form-grid">' +
        '<div class="field">' +
          '<label for="m-name">Name</label>' +
          '<input id="m-name" type="text" data-autofocus value="' + esc(m.name) + '" placeholder="Vorname Nachname">' +
        '</div>' +
        '<div class="field">' +
          '<label for="m-number">Trikotnummer <span class="hint">(optional)</span></label>' +
          '<input id="m-number" type="text" inputmode="numeric" value="' + esc(m.number || '') + '" placeholder="z. B. 10">' +
        '</div>' +
        '<label class="checkline">' +
          '<input type="checkbox" id="m-active"' + (m.active !== false ? ' checked' : '') + '>' +
          '<span>Aktiv im Kader</span>' +
        '</label>' +
      '</div>';

    openModal({
      title: existing ? 'Spieler bearbeiten' : 'Spieler hinzufügen',
      body: body,
      footer:
        (existing ? '<button class="btn btn-danger btn-icon-only" data-delete>Löschen</button>' : '') +
        '<button class="btn" data-close>Abbrechen</button>' +
        '<button class="btn btn-primary" data-save>Speichern</button>',
      onMount: function (modal) {
        $('[data-save]', modal).addEventListener('click', function () {
          var name = $('#m-name', modal).value.trim();
          if (!name) { toast('Bitte einen Namen eingeben.'); return; }
          var rec = {
            id: existing ? existing.id : uid(),
            name: name,
            number: $('#m-number', modal).value.trim(),
            active: $('#m-active', modal).checked
          };
          if (existing) {
            var i = state.members.findIndex(function (x) { return x.id === existing.id; });
            state.members[i] = rec;
          } else {
            state.members.push(rec);
          }
          closeModal();
          commit();
        });

        var del = $('[data-delete]', modal);
        if (del) del.addEventListener('click', function () {
          var stats = memberStats(existing.id);
          if (stats.count > 0 && !confirm('Zu ' + existing.name + ' gibt es ' + stats.count +
            ' Buchung(en). Der Spieler wird gelöscht, die Buchungen bleiben erhalten (ohne Zuordnung). Fortfahren?')) return;
          state.transactions.forEach(function (t) { if (t.memberId === existing.id) t.memberId = null; });
          state.members = state.members.filter(function (x) { return x.id !== existing.id; });
          closeModal();
          commit();
          toast('Spieler gelöscht.');
        });
      }
    });
  }

  function memberDetail(id) {
    var m = memberById(id);
    if (!m) return;
    var st = memberStats(id);
    var rows = sortedTransactions().filter(function (t) { return t.memberId === id; });

    var body =
      '<div class="tiles" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:14px">' +
        '<div class="tile"><div class="label">Offen an die Kasse</div><div class="value ' +
          (st.openIn > 0 ? 'neg' : '') + '">' + money(st.openIn) + '</div></div>' +
        '<div class="tile"><div class="label">Bereits eingezahlt</div><div class="value">' + money(st.paidIn) + '</div></div>' +
      '</div>' +
      (st.openOut > 0
        ? '<p class="hint" style="margin-bottom:12px">Die Kasse schuldet ' + esc(m.name) + ' noch ' +
          money(st.openOut) + ' (verauslagt).</p>'
        : '') +
      '<div class="card"><div class="list">' +
        (rows.length ? rows.map(transactionRow).join('') : '<div class="empty">Noch keine Buchungen.</div>') +
      '</div></div>';

    openModal({
      title: m.name + (m.number ? ' · Nr. ' + m.number : ''),
      body: body,
      footer:
        '<button class="btn" data-edit>Bearbeiten</button>' +
        '<button class="btn btn-primary" data-book>Buchung für ' + esc(m.name.split(' ')[0]) + '</button>',
      onMount: function (modal) {
        $('[data-edit]', modal).addEventListener('click', function () { memberDialog(m); });
        $('[data-book]', modal).addEventListener('click', function () {
          transactionDialog(null, { memberId: m.id });
        });
        modal.addEventListener('click', function (e) {
          var row = e.target.closest('[data-tx]');
          if (row) transactionDialog(state.transactions.find(function (x) { return x.id === row.dataset.tx; }));
        });
      }
    });
  }

  /* ---------------------------------------------------------------------
     Strafen
     ------------------------------------------------------------------ */

  function fineDialog(existing) {
    var f = existing || { label: '', cents: 500 };
    var body =
      '<div class="form-grid">' +
        '<div class="field">' +
          '<label for="s-label">Bezeichnung</label>' +
          '<input id="s-label" type="text" data-autofocus value="' + esc(f.label) + '" placeholder="z. B. Zu spät zum Training">' +
        '</div>' +
        '<div class="field">' +
          '<label for="s-amount">Betrag</label>' +
          '<div class="amount-input">' +
            '<input id="s-amount" type="text" inputmode="decimal" value="' + (f.cents / 100).toFixed(2).replace('.', ',') + '">' +
            '<span class="cur">€</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    openModal({
      title: existing ? 'Strafe bearbeiten' : 'Strafe hinzufügen',
      body: body,
      footer:
        (existing ? '<button class="btn btn-danger btn-icon-only" data-delete>Löschen</button>' : '') +
        '<button class="btn" data-close>Abbrechen</button>' +
        '<button class="btn btn-primary" data-save>Speichern</button>',
      onMount: function (modal) {
        $('[data-save]', modal).addEventListener('click', function () {
          var label = $('#s-label', modal).value.trim();
          var cents = parseAmount($('#s-amount', modal).value);
          if (!label) { toast('Bitte eine Bezeichnung eingeben.'); return; }
          if (!isFinite(cents) || cents <= 0) { toast('Bitte einen Betrag größer als 0 eingeben.'); return; }
          if (existing) {
            existing.label = label; existing.cents = cents;
          } else {
            state.fines.push({ id: uid(), label: label, cents: cents });
          }
          closeModal();
          commit();
        });
        var del = $('[data-delete]', modal);
        if (del) del.addEventListener('click', function () {
          state.fines = state.fines.filter(function (x) { return x.id !== existing.id; });
          closeModal();
          commit();
          toast('Strafe gelöscht.');
        });
      }
    });
  }

  function bookFineDialog(fineId) {
    var f = state.fines.find(function (x) { return x.id === fineId; });
    if (!f) return;
    var players = activeFirst().filter(function (m) { return m.active !== false; });

    if (!players.length) {
      toast('Lege zuerst Spieler an.');
      location.hash = '#/spieler';
      return;
    }

    var body =
      '<div class="form-grid">' +
        '<div class="field">' +
          '<label for="b-amount">Betrag je Spieler</label>' +
          '<div class="amount-input">' +
            '<input id="b-amount" type="text" inputmode="decimal" value="' + (f.cents / 100).toFixed(2).replace('.', ',') + '">' +
            '<span class="cur">€</span>' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="field">' +
            '<label for="b-date">Datum</label>' +
            '<input id="b-date" type="date" value="' + todayISO() + '">' +
          '</div>' +
          '<div class="field">' +
            '<label>Status</label>' +
            segmented('status', [{ value: 'open', label: 'Offen' }, { value: 'paid', label: 'Bezahlt' }], 'open') +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label>Wer muss zahlen? <span class="hint" data-count>(0 ausgewählt)</span></label>' +
          '<div style="max-height:38vh;overflow:auto;border:1px solid var(--line);border-radius:var(--r-md);padding:2px 10px">' +
            players.map(function (m) {
              return '<label class="checkline"><input type="checkbox" data-player value="' + m.id + '">' +
                '<span>' + esc(m.name) + (m.number ? ' <span class="hint">· ' + esc(m.number) + '</span>' : '') + '</span></label>';
            }).join('') +
          '</div>' +
        '</div>' +
      '</div>';

    openModal({
      title: f.label,
      body: body,
      footer: '<button class="btn" data-close>Abbrechen</button>' +
        '<button class="btn btn-primary" data-save>Buchen</button>',
      onMount: function (modal) {
        function refreshCount() {
          var n = $$('[data-player]:checked', modal).length;
          $('[data-count]', modal).textContent = '(' + n + ' ausgewählt)';
        }
        modal.addEventListener('change', refreshCount);
        refreshCount();

        $('[data-save]', modal).addEventListener('click', function () {
          var cents = parseAmount($('#b-amount', modal).value);
          var ids = $$('[data-player]:checked', modal).map(function (c) { return c.value; });
          if (!isFinite(cents) || cents <= 0) { toast('Bitte einen Betrag größer als 0 eingeben.'); return; }
          if (!ids.length) { toast('Bitte mindestens einen Spieler auswählen.'); return; }
          var date = $('#b-date', modal).value || todayISO();
          var status = segValue(modal, 'status');
          ids.forEach(function (mid) {
            state.transactions.push({
              id: uid(), createdAt: Date.now(), type: 'in', cents: cents,
              category: 'Strafe', memberId: mid, date: date, note: f.label, status: status
            });
          });
          closeModal();
          commit();
          toast(ids.length + '× „' + f.label + '“ gebucht (' + money(cents * ids.length) + ').');
        });
      }
    });
  }

  /* ---------------------------------------------------------------------
     Mitgliedsbeiträge für alle buchen
     ------------------------------------------------------------------ */

  function feesDialog() {
    var players = activeFirst().filter(function (m) { return m.active !== false; });
    if (!players.length) { toast('Lege zuerst Spieler an.'); return; }

    var d = new Date();
    var body =
      '<div class="form-grid">' +
        '<p class="hint">Bucht einen Mitgliedsbeitrag für alle ' + players.length + ' aktiven Spieler auf einmal.</p>' +
        '<div class="field">' +
          '<label for="fee-amount">Beitrag je Spieler</label>' +
          '<div class="amount-input">' +
            '<input id="fee-amount" type="text" inputmode="decimal" value="' +
              (state.settings.monthlyFeeCents / 100).toFixed(2).replace('.', ',') + '"><span class="cur">€</span>' +
          '</div>' +
        '</div>' +
        '<div class="form-row">' +
          '<div class="field">' +
            '<label for="fee-date">Datum</label>' +
            '<input id="fee-date" type="date" value="' + todayISO() + '">' +
          '</div>' +
          '<div class="field">' +
            '<label for="fee-note">Notiz</label>' +
            '<input id="fee-note" type="text" value="Beitrag ' + monthLabelLong(d.getFullYear() + '-' + pad(d.getMonth() + 1)) + '">' +
          '</div>' +
        '</div>' +
        '<div class="field"><label>Status</label>' +
          segmented('status', [{ value: 'open', label: 'Offen' }, { value: 'paid', label: 'Bezahlt' }], 'open') +
        '</div>' +
      '</div>';

    openModal({
      title: 'Beiträge buchen',
      body: body,
      footer: '<button class="btn" data-close>Abbrechen</button>' +
        '<button class="btn btn-primary" data-save>Für alle buchen</button>',
      onMount: function (modal) {
        $('[data-save]', modal).addEventListener('click', function () {
          var cents = parseAmount($('#fee-amount', modal).value);
          if (!isFinite(cents) || cents <= 0) { toast('Bitte einen Betrag größer als 0 eingeben.'); return; }
          var date = $('#fee-date', modal).value || todayISO();
          var note = $('#fee-note', modal).value.trim();
          var status = segValue(modal, 'status');
          players.forEach(function (m) {
            state.transactions.push({
              id: uid(), createdAt: Date.now(), type: 'in', cents: cents,
              category: 'Mitgliedsbeitrag', memberId: m.id, date: date, note: note, status: status
            });
          });
          state.settings.monthlyFeeCents = cents;
          closeModal();
          commit();
          toast('Beiträge für ' + players.length + ' Spieler gebucht.');
        });
      }
    });
  }

  /* ---------------------------------------------------------------------
     Diagramm: Einnahmen vs. Ausgaben je Monat
     ------------------------------------------------------------------ */

  function niceMax(v) {
    if (v <= 0) return 10000; // 100 €
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10];
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] * mag >= v) return steps[i] * mag;
    }
    return 10 * mag;
  }

  function monthChart() {
    var data = monthlySeries(6);
    var max = niceMax(data.reduce(function (m, d) { return Math.max(m, d.in, d.out); }, 0));

    var W = 560, H = 208;
    var padL = 46, padR = 10, padT = 12, padB = 26;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var bandW = plotW / data.length;
    var barW = Math.min(22, (bandW - 14) / 2);
    var gap = 2; // Flächenabstand zwischen benachbarten Balken

    function y(cents) { return padT + plotH - (cents / max) * plotH; }

    // Rechteck mit abgerundeter Oberkante, eckig auf der Grundlinie.
    function bar(x, cents, fill) {
      var h = (cents / max) * plotH;
      if (h <= 0) return '';
      var r = Math.min(6, h, barW / 2);
      var top = padT + plotH - h;
      var d = 'M' + x + ' ' + (padT + plotH) +
        ' V' + (top + r) +
        ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + (-r) +
        ' h' + (barW - 2 * r) +
        ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r +
        ' V' + (padT + plotH) + ' Z';
      return '<path d="' + d + '" fill="' + fill + '"/>';
    }

    var ticks = [0, max / 2, max];
    var svg = ['<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="Einnahmen und Ausgaben der letzten sechs Monate">'];

    // Sanfter Verlauf in den Balken — die Farben kommen aus dem Stylesheet,
    // damit sie beim Wechsel zwischen hell und dunkel mitgehen.
    svg.push('<defs>' +
      ['in', 'out'].map(function (k) {
        var c = 'var(--series-' + k + ')';
        return '<linearGradient id="mk-grad-' + k + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" style="stop-color:' + c + ';stop-opacity:1"/>' +
          '<stop offset="100%" style="stop-color:' + c + ';stop-opacity:.72"/>' +
          '</linearGradient>';
      }).join('') + '</defs>');

    ticks.forEach(function (t) {
      var yy = y(t);
      svg.push('<line class="' + (t === 0 ? 'axis-line' : 'grid-line') + '" x1="' + padL + '" x2="' + (W - padR) +
        '" y1="' + yy + '" y2="' + yy + '"/>');
      svg.push('<text class="tick" x="' + (padL - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' +
        moneyShort(t) + '</text>');
    });

    data.forEach(function (d, i) {
      var bx = padL + i * bandW;
      svg.push('<rect class="band-bg" x="' + (bx + 2) + '" y="' + padT + '" width="' + (bandW - 4) +
        '" height="' + plotH + '" rx="6" data-band-bg="' + i + '"/>');
      var cx = bx + bandW / 2;
      svg.push(bar(cx - barW - gap / 2, d.in, 'url(#mk-grad-in)'));
      svg.push(bar(cx + gap / 2, d.out, 'url(#mk-grad-out)'));
      svg.push('<text class="tick" x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle">' +
        esc(monthLabel(d.key)) + '</text>');
      svg.push('<rect class="band-hit" x="' + bx + '" y="' + padT + '" width="' + bandW +
        '" height="' + plotH + '" data-band="' + i + '"/>');
    });

    svg.push('</svg>');

    var table = '<details class="table-view"><summary>Zahlen als Tabelle</summary>' +
      '<table class="data"><thead><tr><th>Monat</th><th>Einnahmen</th><th>Ausgaben</th><th>Saldo</th></tr></thead><tbody>' +
      data.map(function (d) {
        return '<tr><td>' + esc(monthLabelLong(d.key)) + '</td><td>' + money(d.in) + '</td><td>' +
          money(d.out) + '</td><td>' + moneySigned(d.in - d.out) + '</td></tr>';
      }).join('') +
      '</tbody></table></details>';

    return '<section class="card">' +
      '<div class="card-head"><h2>Letzte 6 Monate</h2></div>' +
      '<div class="legend" style="padding-top:8px">' +
        '<span><i style="background:var(--series-in)"></i>Einnahmen</span>' +
        '<span><i style="background:var(--series-out)"></i>Ausgaben</span>' +
      '</div>' +
      '<div class="chart-wrap" data-chart>' + svg.join('') +
        '<div class="chart-tip" data-tip></div>' +
      '</div>' + table +
      '</section>';
  }

  function wireChart(root) {
    var wrap = $('[data-chart]', root);
    if (!wrap) return;
    var tip = $('[data-tip]', wrap);
    var data = monthlySeries(6);

    function show(i, hitRect, clientY) {
      var d = data[i];
      tip.innerHTML =
        '<div class="tip-title">' + esc(monthLabelLong(d.key)) + '</div>' +
        '<div class="tip-row"><span><i style="background:var(--series-in)"></i>Einnahmen</span><b>' + money(d.in) + '</b></div>' +
        '<div class="tip-row"><span><i style="background:var(--series-out)"></i>Ausgaben</span><b>' + money(d.out) + '</b></div>' +
        '<div class="tip-row"><span>Saldo</span><b>' + moneySigned(d.in - d.out) + '</b></div>';
      tip.classList.add('on');

      var wr = wrap.getBoundingClientRect();
      var hr = hitRect.getBoundingClientRect();
      var half = tip.offsetWidth / 2 + 4;
      var left = hr.left - wr.left + hr.width / 2;
      tip.style.left = Math.max(half, Math.min(wr.width - half, left)) + 'px';
      var top = (clientY == null ? hr.top + 20 : clientY) - wr.top - tip.offsetHeight - 12;
      tip.style.top = Math.max(0, top) + 'px';

      $$('[data-band-bg]', wrap).forEach(function (b) { b.classList.toggle('on', b.dataset.bandBg === String(i)); });
    }

    function hide() {
      tip.classList.remove('on');
      $$('[data-band-bg]', wrap).forEach(function (b) { b.classList.remove('on'); });
    }

    wrap.addEventListener('pointermove', function (e) {
      var hit = e.target.closest('[data-band]');
      if (hit) show(parseInt(hit.dataset.band, 10), hit, e.clientY); else hide();
    });
    wrap.addEventListener('pointerdown', function (e) {
      var hit = e.target.closest('[data-band]');
      if (hit) show(parseInt(hit.dataset.band, 10), hit, e.clientY);
    });
    wrap.addEventListener('pointerleave', hide);
  }

  /* ---------------------------------------------------------------------
     Zeilen-Bausteine
     ------------------------------------------------------------------ */

  function transactionRow(t) {
    var name = memberName(t.memberId);
    /* Unterzeile knapp halten: Steht kein Spieler dabei, sagt die Kategorie am
       meisten — sonst der Name. Alles Weitere steht beim Öffnen der Buchung. */
    var sub = [fmtDate(t.date), name || t.category].join(' · ');
    return '<button class="list-row" data-tx="' + t.id + '">' +
      '<span class="avatar ' + t.type + '">' + (t.type === 'in' ? '+' : '−') + '</span>' +
      '<span class="grow">' +
        '<span class="title">' + esc(t.note || t.category) + '</span>' +
        '<span class="sub">' + esc(sub) + '</span>' +
      '</span>' +
      '<span class="end">' +
        '<span class="amount num ' + (t.type === 'in' ? 'pos' : 'neg') + '">' +
          (t.type === 'in' ? '+' : '−') + money(t.cents) + '</span>' +
        (t.status === 'open' ? '<span class="badge open">offen</span>' : '') +
      '</span>' +
      '</button>';
  }

  /* ---------------------------------------------------------------------
     Ansichten
     ------------------------------------------------------------------ */

  var views = {};

  views.uebersicht = function () {
    var bal = balanceCents();
    var tot = totals();
    var recent = sortedTransactions().slice(0, 6);

    var debtors = state.members.map(function (m) {
      var items = state.transactions.filter(function (t) {
        return t.memberId === m.id && t.status === 'open' && t.type === 'in';
      });
      return {
        m: m,
        open: items.reduce(function (s, t) { return s + t.cents; }, 0),
        count: items.length
      };
    }).filter(function (x) { return x.open > 0; })
      .sort(function (a, b) { return b.open - a.open; });

    var html = '';

    html += '<section class="hero">' +
      '<div class="label">Kassenstand</div>' +
      '<div class="value ' + (bal < 0 ? 'neg' : '') + '">' + money(bal) + '</div>' +
      '<div class="meta">' + esc(state.team.name) + ' · Saison ' + esc(state.team.season) +
        ' · ' + state.transactions.length + ' Buchungen</div>' +
      '</section>';

    html += '<div class="tiles">' +
      '<div class="tile"><div class="label">Einnahmen</div><div class="value pos">' + money(tot.in) + '</div>' +
        '<div class="sub">verbucht</div></div>' +
      '<div class="tile"><div class="label">Ausgaben</div><div class="value neg">' + money(tot.out) + '</div>' +
        '<div class="sub">verbucht</div></div>' +
      '<div class="tile"><div class="label">Offene Forderungen</div><div class="value">' + money(tot.openIn) + '</div>' +
        '<div class="sub">Spieler an Kasse</div></div>' +
      '<div class="tile"><div class="label">Offene Auslagen</div><div class="value">' + money(tot.openOut) + '</div>' +
        '<div class="sub">Kasse an Spieler</div></div>' +
      '</div>';

    html += monthChart();

    if (debtors.length) {
      html += '<section class="card">' +
        '<div class="card-head"><h2>Offene Beträge</h2>' +
          '<a class="btn btn-sm btn-ghost" href="#/spieler">Alle Spieler</a></div>' +
        '<div class="list" style="margin-top:10px">' +
        debtors.slice(0, 5).map(function (d) {
          return '<button class="list-row" data-member="' + d.m.id + '">' +
            '<span class="avatar">' + esc(initials(d.m.name)) + '</span>' +
            '<span class="grow"><span class="title">' + esc(d.m.name) + '</span>' +
            '<span class="sub">' + d.count + ' offene Buchung' + (d.count === 1 ? '' : 'en') + '</span></span>' +
            '<span class="end"><span class="amount num">' + money(d.open) + '</span></span></button>';
        }).join('') +
        '</div></section>';
    }

    html += '<section class="card">' +
      '<div class="card-head"><h2>Letzte Buchungen</h2>' +
        '<a class="btn btn-sm btn-ghost" href="#/buchungen">Alle</a></div>' +
      '<div class="list" style="margin-top:10px">' +
      (recent.length ? recent.map(transactionRow).join('')
        : '<div class="empty"><strong>Noch nichts gebucht</strong>Leg mit „Neue Buchung“ los — oder lade unter „Mehr“ Beispieldaten.</div>') +
      '</div></section>';

    return html;
  };

  var txFilter = { q: '', type: 'all', status: 'all', member: 'all' };

  views.buchungen = function () {
    var rows = sortedTransactions().filter(function (t) {
      if (txFilter.type !== 'all' && t.type !== txFilter.type) return false;
      if (txFilter.status !== 'all' && t.status !== txFilter.status) return false;
      if (txFilter.member !== 'all' && (t.memberId || '') !== txFilter.member) return false;
      if (txFilter.q) {
        var hay = [t.note, t.category, memberName(t.memberId), fmtDate(t.date)].join(' ').toLowerCase();
        if (hay.indexOf(txFilter.q.toLowerCase()) < 0) return false;
      }
      return true;
    });

    var sum = rows.reduce(function (s, t) { return t.status === 'paid' ? s + signedCents(t) : s; }, 0);

    var html = '<section class="filterbar">' +
      '<span class="search">' + icon('i-search') +
        '<input type="search" id="q" placeholder="Suchen…" value="' + esc(txFilter.q) + '"></span>' +
      '<select id="f-type">' +
        opt('all', 'Alle Arten', txFilter.type) + opt('in', 'Einnahmen', txFilter.type) + opt('out', 'Ausgaben', txFilter.type) +
      '</select>' +
      '<select id="f-status">' +
        opt('all', 'Alle', txFilter.status) + opt('open', 'Nur offen', txFilter.status) + opt('paid', 'Nur bezahlt', txFilter.status) +
      '</select>' +
      '<select id="f-member">' + opt('all', 'Alle Spieler', txFilter.member) +
        state.members.map(function (m) { return opt(m.id, m.name, txFilter.member); }).join('') +
      '</select>' +
      '</section>';

    html += '<p class="section-title">' + rows.length + ' Buchung' + (rows.length === 1 ? '' : 'en') +
      ' · Saldo ' + moneySigned(sum) + '</p>';

    html += '<section class="card"><div class="list">';
    if (!rows.length) {
      html += '<div class="empty"><strong>Keine Buchungen gefunden</strong>Passe die Filter an oder lege eine neue Buchung an.</div>';
    } else {
      var lastMonth = null;
      rows.forEach(function (t) {
        var mk = String(t.date).slice(0, 7);
        if (mk !== lastMonth) {
          lastMonth = mk;
          html += '<div class="group-label">' + esc(monthLabelLong(mk)) + '</div>';
        }
        html += transactionRow(t);
      });
    }
    html += '</div></section>';
    return html;
  };

  function opt(value, label, selected) {
    return '<option value="' + esc(value) + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' +
      esc(label) + '</option>';
  }

  views.spieler = function () {
    var list = activeFirst();
    var tot = totals();

    var html = '<div class="tiles" style="grid-template-columns:repeat(2,minmax(0,1fr))">' +
      '<div class="tile"><div class="label">Spieler im Kader</div><div class="value">' +
        list.filter(function (m) { return m.active !== false; }).length + '</div></div>' +
      '<div class="tile"><div class="label">Offene Forderungen</div><div class="value">' + money(tot.openIn) + '</div></div>' +
      '</div>';

    html += '<section class="card">' +
      '<div class="card-head"><h2>Kader</h2>' +
        '<button class="btn btn-sm" data-action="new-member">Hinzufügen</button></div>' +
      '<div class="list" style="margin-top:10px">';

    if (!list.length) {
      html += '<div class="empty"><strong>Noch keine Spieler</strong>Füge deine Mitspieler hinzu, um Strafen und Beiträge zuordnen zu können.</div>';
    } else {
      list.forEach(function (m) {
        var st = memberStats(m.id);
        var sub = st.openIn > 0 ? 'offen: ' + money(st.openIn)
          : st.count ? 'alles bezahlt' : 'noch keine Buchung';
        html += '<button class="list-row" data-member="' + m.id + '">' +
          '<span class="avatar">' + esc(initials(m.name)) + '</span>' +
          '<span class="grow"><span class="title">' + esc(m.name) +
            (m.number ? ' <span class="hint">· ' + esc(m.number) + '</span>' : '') + '</span>' +
            '<span class="sub">' + esc(sub) + '</span></span>' +
          '<span class="end">' +
            (st.openIn > 0 ? '<span class="amount num neg">' + money(st.openIn) + '</span>'
              : '<span class="badge paid">' + icon('i-check') + '</span>') +
            (m.active === false ? '<span class="badge">inaktiv</span>' : '') +
          '</span>' +
          '</button>';
      });
    }
    html += '</div></section>';
    return html;
  };

  views.strafen = function () {
    var html = '<p class="section-title">Strafenkatalog</p>' +
      '<p class="hint" style="color:var(--muted);margin-top:-8px">Antippen, um die Strafe für einen oder mehrere Spieler zu buchen.</p>';

    html += '<section class="card"><div class="list">';
    if (!state.fines.length) {
      html += '<div class="empty"><strong>Kein Eintrag</strong>Lege deine erste Strafe an.</div>';
    } else {
      state.fines.forEach(function (f) {
        html += '<button class="list-row" data-fine="' + f.id + '">' +
          '<span class="avatar in">' + icon('i-card') + '</span>' +
          '<span class="grow"><span class="title">' + esc(f.label) + '</span></span>' +
          '<span class="end"><span class="amount num">' + money(f.cents) + '</span></span>' +
          '</button>';
      });
    }
    html += '</div></section>';

    html += '<div style="display:flex;gap:9px;flex-wrap:wrap">' +
      '<button class="btn" data-action="new-fine">Strafe hinzufügen</button>' +
      '<button class="btn" data-action="edit-fines">Katalog bearbeiten</button>' +
      '</div>';
    return html;
  };

  views.mehr = function () {
    var theme = localStorage.getItem(THEME_KEY) || 'dark';
    var tot = totals();

    var html = '<section class="card">' +
      '<div class="card-head"><h2>Mannschaft</h2></div>' +
      '<div class="card-body form-grid">' +
        '<div class="form-row">' +
          '<div class="field"><label for="t-name">Name</label>' +
            '<input id="t-name" type="text" value="' + esc(state.team.name) + '"></div>' +
          '<div class="field"><label for="t-season">Saison</label>' +
            '<input id="t-season" type="text" value="' + esc(state.team.season) + '"></div>' +
        '</div>' +
        '<div class="field"><label for="t-fee">Mitgliedsbeitrag je Spieler</label>' +
          '<div class="amount-input"><input id="t-fee" type="text" inputmode="decimal" value="' +
            (state.settings.monthlyFeeCents / 100).toFixed(2).replace('.', ',') + '"><span class="cur">€</span></div></div>' +
        '<button class="btn btn-primary" data-action="save-team">Speichern</button>' +
      '</div></section>';

    html += '<section class="card">' +
      '<div class="card-head"><h2>Schnellaktionen</h2></div>' +
      '<div class="card-body" style="display:flex;gap:9px;flex-wrap:wrap">' +
        '<button class="btn" data-action="book-fees">Beiträge für alle buchen</button>' +
        '<button class="btn" data-action="settle-all">Alle offenen Forderungen abhaken</button>' +
      '</div></section>';

    html += '<section class="card">' +
      '<div class="card-head"><h2>Darstellung</h2></div>' +
      '<div class="card-body">' +
        '<div class="chips">' +
          '<button class="chip" data-theme="auto" aria-pressed="' + (theme === 'auto') + '">Automatisch</button>' +
          '<button class="chip" data-theme="light" aria-pressed="' + (theme === 'light') + '">Hell</button>' +
          '<button class="chip" data-theme="dark" aria-pressed="' + (theme === 'dark') + '">Dunkel</button>' +
        '</div>' +
      '</div></section>';

    html += '<section class="card">' +
      '<div class="card-head"><h2>Daten</h2></div>' +
      '<div class="card-body" style="display:flex;flex-direction:column;gap:10px">' +
        '<p class="hint">Alle Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig — und gib die Sicherung an deinen Nachfolger als Kassenwart weiter.</p>' +
        '<div style="display:flex;gap:9px;flex-wrap:wrap">' +
          '<button class="btn" data-action="export-csv">CSV exportieren</button>' +
          '<button class="btn" data-action="export-json">Sicherung speichern</button>' +
          '<button class="btn" data-action="import-json">Sicherung laden</button>' +
        '</div>' +
        '<div style="display:flex;gap:9px;flex-wrap:wrap">' +
          '<button class="btn btn-sm btn-ghost" data-action="demo">Beispieldaten laden</button>' +
          '<button class="btn btn-sm btn-danger" data-action="reset">Alles löschen</button>' +
        '</div>' +
      '</div></section>';

    html += '<section class="card">' +
      '<div class="card-head"><h2>Version</h2></div>' +
      '<div class="card-body" style="display:flex;flex-direction:column;gap:10px">' +
        '<p class="hint">Installiert ist Fassung <strong class="num">' + esc(APP_VERSION) + '</strong>. ' +
          'Die App holt sich Neues beim Start automatisch, sobald Empfang da ist.</p>' +
        '<div><button class="btn btn-sm" data-action="check-update">Jetzt nach Aktualisierung suchen</button></div>' +
      '</div></section>';

    html += '<p class="hint" style="text-align:center;color:var(--muted)">' +
      state.members.length + ' Spieler · ' + state.transactions.length + ' Buchungen · ' +
      'offen: ' + money(tot.openIn) + '</p>';

    return html;
  };

  /* ---------------------------------------------------------------------
     Export / Import
     ------------------------------------------------------------------ */

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function slug(s) {
    return String(s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mannschaft';
  }

  function exportCSV() {
    var sep = ';';
    var head = ['Datum', 'Art', 'Kategorie', 'Spieler', 'Notiz', 'Betrag', 'Status'];
    var lines = [head.join(sep)];
    sortedTransactions().slice().reverse().forEach(function (t) {
      lines.push([
        fmtDate(t.date),
        t.type === 'in' ? 'Einnahme' : 'Ausgabe',
        t.category,
        memberName(t.memberId) || '',
        t.note || '',
        (signedCents(t) / 100).toFixed(2).replace('.', ','),
        t.status === 'open' ? 'offen' : 'bezahlt'
      ].map(function (v) {
        var s = String(v);
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(sep));
    });
    lines.push('');
    lines.push(['', '', '', '', 'Kassenstand', (balanceCents() / 100).toFixed(2).replace('.', ','), ''].join(sep));
    // BOM, damit Excel die Umlaute richtig liest.
    download('kasse-' + slug(state.team.name) + '-' + todayISO() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv');
    toast('CSV exportiert.');
  }

  function exportJSON() {
    download('mannschaftskasse-backup-' + todayISO() + '.json', JSON.stringify(state, null, 2), 'application/json');
    toast('Sicherung gespeichert.');
  }

  function importJSON() {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result));
          if (!data || !Array.isArray(data.transactions)) throw new Error('Unbekanntes Format');
          if (!confirm('Die Sicherung ersetzt alle aktuellen Daten. Fortfahren?')) return;
          state = {
            version: 1,
            team: Object.assign(defaultState().team, data.team || {}),
            settings: Object.assign(defaultState().settings, data.settings || {}),
            members: data.members || [],
            transactions: data.transactions || [],
            fines: data.fines || defaultState().fines
          };
          commit();
          toast('Sicherung geladen.');
        } catch (e) {
          toast('Datei konnte nicht gelesen werden.');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function loadDemo() {
    if (state.transactions.length && !confirm('Beispieldaten werden zu den vorhandenen Daten hinzugefügt. Fortfahren?')) return;
    var names = ['Lukas Berger', 'Tim Hoffmann', 'Jonas Weber', 'Marco Schulz', 'Ali Yilmaz',
      'David Kraus', 'Sven Richter', 'Nico Bauer'];
    var created = names.map(function (n, i) {
      var m = { id: uid() + i, name: n, number: String(i + 2), active: true };
      state.members.push(m);
      return m;
    });
    state.team.name = state.team.name === 'Meine Mannschaft' ? 'SV Beispielheim II' : state.team.name;

    function push(daysAgo, type, cents, cat, mid, note, status) {
      var d = new Date();
      d.setDate(d.getDate() - daysAgo);
      state.transactions.push({
        id: uid() + Math.random(), createdAt: Date.now() - daysAgo * 86400000,
        type: type, cents: cents, category: cat, memberId: mid || null,
        date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
        note: note || '', status: status || 'paid'
      });
    }

    push(125, 'in', 24500, 'Sonstige Einnahme', null, 'Kassenübernahme vom Vorjahr');

    [110, 80, 50, 20].forEach(function (d, k) {
      created.forEach(function (m, i) {
        push(d, 'in', 500, 'Mitgliedsbeitrag', m.id, 'Monatsbeitrag', (k === 3 && i > 4) ? 'open' : 'paid');
      });
    });
    push(96, 'out', 8450, 'Ausrüstung', null, 'Neue Trainingsbälle');
    push(74, 'in', 500, 'Strafe', created[1].id, 'Zu spät zum Training', 'paid');
    push(70, 'in', 1500, 'Strafe', created[3].id, 'Gelb-Rote Karte', 'open');
    push(63, 'out', 3200, 'Getränke', null, 'Kasten Wasser & Iso');
    push(58, 'in', 5000, 'Spende', null, 'Sponsor Bäckerei Krug');
    push(41, 'out', 12000, 'Mannschaftsabend', null, 'Grillabend nach dem Derby');
    push(33, 'in', 500, 'Strafe', created[5].id, 'Handy klingelt in der Kabine', 'open');
    push(28, 'out', 2500, 'Schiedsrichter', null, 'Spielleitung Pokal');
    push(12, 'in', 1000, 'Strafe', created[0].id, 'Geburtstag ohne Kuchen', 'open');
    push(9, 'out', 4200, 'Getränke', null, 'Getränke Heimspiel');
    push(4, 'in', 2400, 'Getränkekasse', null, 'Einnahmen Getränkekasse');

    commit();
    toast('Beispieldaten geladen.');
  }

  function resetAll() {
    if (!confirm('Wirklich alle Spieler, Buchungen und Einstellungen löschen? Das lässt sich nicht rückgängig machen.')) return;
    state = defaultState();
    commit();
    toast('Alle Daten gelöscht.');
  }

  function settleAll() {
    var open = state.transactions.filter(function (t) { return t.status === 'open' && t.type === 'in'; });
    if (!open.length) { toast('Es gibt keine offenen Forderungen.'); return; }
    if (!confirm(open.length + ' offene Forderung(en) über ' +
      money(open.reduce(function (s, t) { return s + t.cents; }, 0)) + ' als bezahlt markieren?')) return;
    open.forEach(function (t) { t.status = 'paid'; });
    commit();
    toast(open.length + ' Buchungen als bezahlt markiert.');
  }

  /* ---------------------------------------------------------------------
     Katalog bearbeiten
     ------------------------------------------------------------------ */

  function editFinesDialog() {
    var body = '<div class="list">' +
      (state.fines.length ? state.fines.map(function (f) {
        return '<button class="list-row" data-edit-fine="' + f.id + '">' +
          '<span class="grow"><span class="title">' + esc(f.label) + '</span>' +
          '<span class="sub">antippen zum Bearbeiten</span></span>' +
          '<span class="end"><span class="amount num">' + money(f.cents) + '</span></span></button>';
      }).join('') : '<div class="empty">Noch keine Strafen im Katalog.</div>') +
      '</div>';

    openModal({
      title: 'Katalog bearbeiten',
      body: body,
      footer: '<button class="btn" data-close>Fertig</button>' +
        '<button class="btn btn-primary" data-add>Strafe hinzufügen</button>',
      onMount: function (modal) {
        $('[data-add]', modal).addEventListener('click', function () { fineDialog(null); });
        modal.addEventListener('click', function (e) {
          var row = e.target.closest('[data-edit-fine]');
          if (row) fineDialog(state.fines.find(function (x) { return x.id === row.dataset.editFine; }));
        });
      }
    });
  }

  /* ---------------------------------------------------------------------
     Router & Rendering
     ------------------------------------------------------------------ */

  function currentView() {
    var id = (location.hash || '').replace(/^#\/?/, '') || 'uebersicht';
    return views[id] ? id : 'uebersicht';
  }

  function navHTML(id) {
    return NAV.map(function (n) {
      return '<a href="#/' + n.id + '" class="' + (n.id === id ? 'active' : '') + '">' +
        icon(n.icon) + '<span>' + n.label + '</span></a>';
    }).join('');
  }

  function render() {
    var id = currentView();
    var title = (NAV.find(function (n) { return n.id === id; }) || NAV[0]).label;

    document.title = title + ' · ' + state.team.name;
    $('#viewTitle').textContent = title;
    $('#brandTeam').textContent = state.team.name;
    $('#brandSeason').textContent = 'Saison ' + state.team.season;
    $('#navDesktop').innerHTML = navHTML(id);
    $('#navMobile').innerHTML = navHTML(id, true);

    // Jede Ansicht bringt ihre eigenen Aktionen mit; die Kopfzeile bleibt ruhig.
    $('#topbarActions').innerHTML = '';

    var view = $('#view');
    view.innerHTML = views[id]();
    if (id === 'uebersicht') wireChart(view);
    if (id === 'buchungen') wireFilters(view);
    if (id === 'mehr') wireSettings(view);
  }

  function wireFilters(root) {
    var q = $('#q', root);
    var timer = null;
    q.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        txFilter.q = q.value;
        render();
        var el = $('#q');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }, 220);
    });
    $('#f-type', root).addEventListener('change', function (e) { txFilter.type = e.target.value; render(); });
    $('#f-status', root).addEventListener('change', function (e) { txFilter.status = e.target.value; render(); });
    $('#f-member', root).addEventListener('change', function (e) { txFilter.member = e.target.value; render(); });
  }

  function wireSettings(root) {
    root.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-theme]');
      if (!chip) return;
      var v = chip.dataset.theme;
      // „Automatisch" wird ausdrücklich gespeichert — ohne Eintrag gilt Dunkel.
      localStorage.setItem(THEME_KEY, v);
      if (v === 'auto') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', v);
      render();
    });
  }

  /* ---------------------------------------------------------------------
     Globale Aktionen
     ------------------------------------------------------------------ */

  var actions = {
    'new-transaction': function () { transactionDialog(null); },
    'new-member': function () { memberDialog(null); },
    'new-fine': function () { fineDialog(null); },
    'edit-fines': editFinesDialog,
    'book-fees': feesDialog,
    'settle-all': settleAll,
    'export-csv': exportCSV,
    'export-json': exportJSON,
    'import-json': importJSON,
    'demo': loadDemo,
    'reset': resetAll,
    'check-update': function () {
      if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
        toast('Diese Fassung aktualisiert sich nicht selbst.');
        return;
      }
      toast('Suche nach Aktualisierung …');
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (!reg) { location.reload(); return; }
        return reg.update().then(function () {
          if (reg.waiting) { reg.waiting.postMessage('skip-waiting'); return; }
          // Nichts Neues da: trotzdem frisch laden, dann ist es eindeutig.
          setTimeout(function () { location.reload(); }, 900);
        });
      }).catch(function () { location.reload(); });
    },
    'save-team': function () {
      var name = $('#t-name').value.trim();
      var season = $('#t-season').value.trim();
      var fee = parseAmount($('#t-fee').value);
      if (name) state.team.name = name;
      if (season) state.team.season = season;
      if (isFinite(fee) && fee >= 0) state.settings.monthlyFeeCents = fee;
      commit();
      toast('Gespeichert.');
    }
  };

  document.addEventListener('click', function (e) {
    var actionEl = e.target.closest('[data-action]');
    if (actionEl && actions[actionEl.dataset.action]) {
      e.preventDefault();
      actions[actionEl.dataset.action]();
      return;
    }
    var tx = e.target.closest('#view [data-tx]');
    if (tx) {
      transactionDialog(state.transactions.find(function (x) { return x.id === tx.dataset.tx; }));
      return;
    }
    var mem = e.target.closest('#view [data-member]');
    if (mem) { memberDetail(mem.dataset.member); return; }

    var fine = e.target.closest('#view [data-fine]');
    if (fine) { bookFineDialog(fine.dataset.fine); return; }
  });

  /* Beim Wechsel der Ansicht blendet der Browser weich über, sofern er die
     View Transitions kennt — sonst wird einfach direkt neu gezeichnet. */
  window.addEventListener('hashchange', function () {
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduced) document.startViewTransition(render);
    else render();
  });

  /* ---------------------------------------------------------------------
     Start
     ------------------------------------------------------------------ */

  state = load();
  if (!location.hash) location.hash = '#/uebersicht';
  render();

  /* ---------------------------------------------------------------------
     Aktualisierung der installierten App

     Drei Dinge sorgen dafür, dass eine neue Fassung auch auf dem Handy
     ankommt: der Service Worker wird nicht aus dem Browser-Zwischenspeicher
     gelesen, beim Start und beim Zurückholen aus dem Hintergrund wird nach
     einer neuen Fassung gesucht, und übernimmt eine neue das Ruder, lädt
     die Seite genau einmal neu.
     ------------------------------------------------------------------ */

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    var hatteController = !!navigator.serviceWorker.controller;
    var laedtNeu = false;

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // Beim allerersten Besuch gab es noch keinen — dann ist nichts zu tun.
      if (!hatteController || laedtNeu) return;
      laedtNeu = true;
      location.reload();
    });

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .then(function (reg) {
          reg.update();

          // Eine bereits wartende Fassung sofort übernehmen lassen.
          if (reg.waiting) reg.waiting.postMessage('skip-waiting');
          reg.addEventListener('updatefound', function () {
            var neu = reg.installing;
            if (!neu) return;
            neu.addEventListener('statechange', function () {
              if (neu.state === 'installed' && navigator.serviceWorker.controller) {
                toast('Neue Fassung wird geladen …');
              }
            });
          });

          // Beim Zurückholen aus dem Hintergrund erneut nachsehen.
          document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') reg.update();
          });
        })
        .catch(function () { /* Offline-Betrieb ist eine Zugabe, kein Muss. */ });
    });
  }
})();
