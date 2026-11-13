/* ============================================================
   Daily Log — personal salary tracker
   Vanilla JS, localStorage, offline-first.
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'daily-log.v1';
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DEFAULT_STATE = {
    version: 1,
    settings: { dayRate: 500, divisor: 8 },
    records: {},
    theme: 'system'
  };

  var $ = function (sel) { return document.querySelector(sel); };

  /* ---------------- date helpers ---------------- */
  function pad2(n) { return String(n).padStart(2, '0'); }
  function keyOf(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function fromKey(k) { var p = k.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function todayKey() { return keyOf(new Date()); }
  function isSameDay(a, b) { return keyOf(a) === keyOf(b); }
  function addDays(k, n) { var d = fromKey(k); d.setDate(d.getDate() + n); return keyOf(d); }

  /* ---------------- number helpers ---------------- */
  var moneyFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  function money(n) { return 'HK$' + moneyFmt.format(Number(n) || 0); }
  function compactMoney(n) { return intFmt.format(Math.round(Number(n) || 0)); }
  function round2(n) { return Math.round(n * 100) / 100; }
  function round1(n) { return Math.round(n * 10) / 10; }
  function trimNum(n) { return Number.isInteger(n) ? String(n) : String(round1(n)); }
  function clockOffLabel(hours) {
    var total = 9 * 60 + Math.round(hours * 60);
    var hh = Math.floor(total / 60) % 24;
    var mm = total % 60;
    var ampm = hh >= 12 ? 'PM' : 'AM';
    var h12 = hh % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + pad2(mm) + ' ' + ampm;
  }

  /* ---------------- state ---------------- */
  function readState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      var parsed = JSON.parse(raw);
      var out = structuredClone(DEFAULT_STATE);
      if (parsed && typeof parsed === 'object') {
        if (parsed.settings) {
          if (isFinite(parsed.settings.dayRate)) out.settings.dayRate = Math.max(0, Number(parsed.settings.dayRate));
          if (Number(parsed.settings.divisor) === 9) out.settings.divisor = 9;
        }
        if (parsed.records && typeof parsed.records === 'object') out.records = parsed.records;
        if (['system', 'light', 'dark'].indexOf(parsed.theme) > -1) out.theme = parsed.theme;
      }
      return out;
    } catch (e) {
      return structuredClone(DEFAULT_STATE);
    }
  }

  var state = readState();
  var selected = todayKey();
  var view = (function () { var d = fromKey(selected); return { y: d.getFullYear(), m: d.getMonth() }; })();
  var deferredInstall = null;
  var lastKnownToday = todayKey();

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Storage is full — export a backup');
    }
  }

  /* ---------------- domain ---------------- */
  function hourlyRate() {
    var d = Number(state.settings.divisor) || 8;
    return (Number(state.settings.dayRate) || 0) / d;
  }
  function earningsFor(hours) { return round2((Number(hours) || 0) * hourlyRate()); }
  function recordOf(k) { return state.records[k] || null; }

  function upsert(k, patch) {
    var cur = state.records[k] || { hours: 0, note: '' };
    var next = { hours: cur.hours || 0, note: cur.note || '' };
    if ('hours' in patch) next.hours = patch.hours;
    if ('note' in patch) next.note = patch.note;
    var hasHours = Number(next.hours) > 0;
    var hasNote = String(next.note || '').trim().length > 0;
    if (hasHours || hasNote) {
      state.records[k] = { hours: Number(next.hours) || 0, note: String(next.note || '') };
    } else {
      delete state.records[k];
    }
    persist();
  }

  function monthStats(y, m) {
    var prefix = y + '-' + pad2(m + 1);
    var total = 0, hours = 0, days = 0;
    Object.keys(state.records).forEach(function (k) {
      if (k.indexOf(prefix) !== 0) return;
      var h = Number(state.records[k].hours) || 0;
      if (h <= 0) return;
      total += earningsFor(h);
      hours += h;
      days += 1;
    });
    return { total: round2(total), hours: round1(hours), days: days, avg: days ? total / days : 0 };
  }

  /* ---------------- rendering ---------------- */
  function render() {
    renderHero();
    renderEditor();
    renderCalendar();
    renderSettings();
  }

  function renderHero() {
    var s = monthStats(view.y, view.m);
    var now = new Date();
    var isCurrent = view.y === now.getFullYear() && view.m === now.getMonth();
    $('#heroLabel').textContent = isCurrent ? 'This month' : MONTHS[view.m] + ' ' + view.y;
    $('#heroTotal').textContent = money(s.total);
    $('#heroDays').textContent = s.days + (s.days === 1 ? ' day' : ' days');
    $('#heroHours').textContent = trimNum(s.hours) + ' hrs';
    $('#heroAvg').textContent = s.days ? 'Avg ' + money(s.avg) + ' / day' : 'No entries yet';
    $('#heroRate').textContent = '1 hr = ' + money(hourlyRate());
  }

  function renderEditor() {
    var d = fromKey(selected);
    var tKey = todayKey();

    var kicker = 'Log entry';
    if (selected === tKey) kicker = 'Today';
    else if (selected === addDays(tKey, -1)) kicker = 'Yesterday';
    else if (selected === addDays(tKey, 1)) kicker = 'Tomorrow';
    else kicker = WEEKDAYS[d.getDay()];
    $('#edKicker').textContent = kicker;
    $('#edDateLabel').textContent = WEEKDAYS_SHORT[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear();

    var rec = recordOf(selected);
    var hours = rec ? Number(rec.hours) || 0 : 0;

    $('#edEarnings').textContent = money(earningsFor(hours));

    var hourBtns = $('#offGroup').querySelectorAll('.seg');
    Array.prototype.forEach.call(hourBtns, function (btn) {
      var on = Number(btn.dataset.hours) === hours;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    var hoursInput = $('#hoursInput');
    if (document.activeElement !== hoursInput) hoursInput.value = hours ? trimNum(hours) : '';

    var noteInput = $('#noteInput');
    if (document.activeElement !== noteInput) noteInput.value = rec ? (rec.note || '') : '';

    $('#minusBtn').disabled = hours <= 0;
    $('#plusBtn').disabled = hours >= 24;

    var dateInput = $('#dateInput');
    if (dateInput.value !== selected) dateInput.value = selected;
  }

  function renderCalendar() {
    $('#calLabel').textContent = MONTHS[view.m] + ' ' + view.y;

    var firstDow = new Date(view.y, view.m, 1).getDay();
    var daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    var tKey = todayKey();
    var html = '';

    for (var i = 0; i < firstDow; i++) html += '<div></div>';

    for (var day = 1; day <= daysInMonth; day++) {
      var k = view.y + '-' + pad2(view.m + 1) + '-' + pad2(day);
      var rec = state.records[k];
      var h = rec ? Number(rec.hours) || 0 : 0;
      var dow = new Date(view.y, view.m, day).getDay();
      var cls = 'cal';
      if (h > 0) cls += ' has';
      if (k === tKey) cls += ' is-today';
      if (k === selected) cls += ' is-sel';
      if (dow === 0 || dow === 6) cls += ' is-weekend';
      html += '<button type="button" class="' + cls + '" data-date="' + k + '" aria-label="' + k + '">' +
        '<span class="d">' + day + '</span>' +
        '<span class="h">' + (h > 0 ? trimNum(h) + 'h' : '') + '</span>' +
        '<span class="a">' + (h > 0 ? compactMoney(earningsFor(h)) : '') + '</span>' +
        '</button>';
    }

    $('#calGrid').innerHTML = html;

    var s = monthStats(view.y, view.m);
    $('#calMonthTotal').textContent = 'Total ' + money(s.total) + ' \u00b7 ' + s.days + 'd \u00b7 ' + trimNum(s.hours) + 'h';
  }

  function renderSettings() {
    var rateInput = $('#rateInput');
    if (document.activeElement !== rateInput) rateInput.value = state.settings.dayRate;

    var divBtns = $('#divisorGroup').querySelectorAll('.seg');
    Array.prototype.forEach.call(divBtns, function (b) {
      b.setAttribute('aria-pressed', Number(b.dataset.divisor) === Number(state.settings.divisor) ? 'true' : 'false');
    });

    var themeBtns = $('#themeGroup').querySelectorAll('.seg');
    Array.prototype.forEach.call(themeBtns, function (b) {
      b.setAttribute('aria-pressed', b.dataset.theme === state.theme ? 'true' : 'false');
    });

    $('#hourlyHint').textContent =
      '1 hour = ' + money(hourlyRate()) + '  \u00b7  ' + money(state.settings.dayRate) + ' \u00f7 ' + state.settings.divisor + ' hrs';
  }

  /* ---------------- theme ---------------- */
  function applyTheme() {
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = state.theme === 'dark' || (state.theme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
    $('#themeColorMeta').setAttribute('content', dark ? '#0b0f14' : '#f4f5f7');
  }

  /* ---------------- feedback ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1900);
  }

  var savedTimer = null;
  function flashSaved() {
    var el = $('#saveHint');
    el.classList.add('show');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(function () { el.classList.remove('show'); }, 1200);
  }

  /* ---------------- navigation ---------------- */
  function selectDate(k) {
    selected = k;
    var d = fromKey(k);
    if (d.getFullYear() !== view.y || d.getMonth() !== view.m) view = { y: d.getFullYear(), m: d.getMonth() };
    render();
    revealEditorIfHidden();
  }

  function revealEditorIfHidden() {
    var card = $('#editorCard');
    var r = card.getBoundingClientRect();
    if (r.bottom < 120 || r.top > window.innerHeight - 120) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /* ---------------- export ---------------- */
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportJSON() {
    var payload = {
      app: 'daily-log',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      records: state.records
    };
    download('daily-log-' + todayKey() + '.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('Backup exported');
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCSV() {
    var rows = [['date', 'hours', 'clock_off', 'earnings_hkd', 'note']];
    Object.keys(state.records).sort().forEach(function (k) {
      var rec = state.records[k];
      var h = Number(rec.hours) || 0;
      if (h <= 0) return;
      rows.push([k, trimNum(h), clockOffLabel(h), earningsFor(h).toFixed(2), rec.note || '']);
    });
    if (rows.length === 1) { toast('Nothing to export yet'); return; }
    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    download('daily-log-' + todayKey() + '.csv', csv, 'text/csv');
    toast('CSV exported');
  }

  /* ---------------- import ---------------- */
  function importJSON(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        var incoming = (data && data.records) ? data.records : data;
        if (!incoming || typeof incoming !== 'object') throw new Error('No records found in this file');

        var clean = {};
        Object.keys(incoming).forEach(function (k) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
          var entry = incoming[k];
          var h = typeof entry === 'number' ? entry : Number(entry && entry.hours);
          if (!isFinite(h)) return;
          h = Math.max(0, Math.min(24, h));
          var note = entry && typeof entry === 'object' && entry.note ? String(entry.note).slice(0, 80) : '';
          if (h > 0 || note) clean[k] = { hours: round1(h), note: note };
        });

        var count = Object.keys(clean).length;
        if (!count) throw new Error('No valid dated records in this file');

        var overlaps = Object.keys(clean).filter(function (k) { return !!state.records[k]; }).length;
        var msg = 'Import ' + count + ' day' + (count === 1 ? '' : 's') + '?';
        if (overlaps) msg += '\n\n' + overlaps + ' existing day' + (overlaps === 1 ? '' : 's') + ' will be overwritten.';
        if (!window.confirm(msg)) return;

        if (data && data.settings && typeof data.settings === 'object') {
          var rate = Number(data.settings.dayRate);
          var div = Number(data.settings.divisor);
          if (isFinite(rate) && rate >= 0) state.settings.dayRate = rate;
          if (div === 8 || div === 9) state.settings.divisor = div;
        }

        Object.keys(clean).forEach(function (k) { state.records[k] = clean[k]; });
        persist();
        render();
        toast(count + ' day' + (count === 1 ? '' : 's') + ' imported');
      } catch (err) {
        window.alert('Import failed: ' + (err && err.message ? err.message : 'invalid file'));
      }
    };
    reader.readAsText(file);
  }

  /* ---------------- sheet ---------------- */
  function openSheet() {
    $('#sheet').classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeSheet() {
    $('#sheet').classList.remove('is-open');
    document.body.style.overflow = '';
  }

  /* ---------------- events ---------------- */
  function bind() {
    $('#prevDay').addEventListener('click', function () { selectDate(addDays(selected, -1)); });
    $('#nextDay').addEventListener('click', function () { selectDate(addDays(selected, 1)); });

    $('#dateInput').addEventListener('change', function (e) {
      if (e.target.value) selectDate(e.target.value);
    });

    $('#offGroup').addEventListener('click', function (e) {
      var btn = e.target.closest('.seg');
      if (!btn) return;
      var h = Number(btn.dataset.hours);
      upsert(selected, { hours: h });
      render();
      flashSaved();
    });

    $('#minusBtn').addEventListener('click', function () {
      var cur = Number((recordOf(selected) || {}).hours) || 0;
      upsert(selected, { hours: Math.max(0, round1(cur - 0.5)) });
      render();
      flashSaved();
    });

    $('#plusBtn').addEventListener('click', function () {
      var cur = Number((recordOf(selected) || {}).hours) || 0;
      upsert(selected, { hours: Math.min(24, round1(cur + 0.5)) });
      render();
      flashSaved();
    });

    $('#hoursInput').addEventListener('input', function (e) {
      var raw = e.target.value;
      var n = raw === '' ? 0 : Number(raw);
      if (!isFinite(n)) return;
      upsert(selected, { hours: Math.max(0, Math.min(24, round1(n))) });
      renderHero();
      renderCalendar();
      var rec = recordOf(selected);
      $('#edEarnings').textContent = money(earningsFor(rec ? rec.hours : 0));
      var hourBtns = $('#offGroup').querySelectorAll('.seg');
      Array.prototype.forEach.call(hourBtns, function (btn) {
        btn.setAttribute('aria-pressed', Number(btn.dataset.hours) === Number(rec ? rec.hours : 0) ? 'true' : 'false');
      });
      $('#minusBtn').disabled = !(rec && rec.hours > 0);
      $('#plusBtn').disabled = !!(rec && rec.hours >= 24);
      flashSaved();
    });

    $('#hoursInput').addEventListener('blur', function () { render(); });
    $('#hoursInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') e.target.blur(); });

    $('#noteInput').addEventListener('input', function (e) {
      upsert(selected, { note: e.target.value });
      flashSaved();
    });

    $('#clearDay').addEventListener('click', function () {
      if (!state.records[selected]) { toast('This day is already empty'); return; }
      if (!window.confirm('Clear the record for ' + selected + '?')) return;
      delete state.records[selected];
      persist();
      render();
      toast('Cleared');
    });

    $('#calGrid').addEventListener('click', function (e) {
      var cell = e.target.closest('[data-date]');
      if (!cell) return;
      selectDate(cell.dataset.date);
    });

    $('#calPrev').addEventListener('click', function () {
      view = view.m === 0 ? { y: view.y - 1, m: 11 } : { y: view.y, m: view.m - 1 };
      render();
    });
    $('#calNext').addEventListener('click', function () {
      view = view.m === 11 ? { y: view.y + 1, m: 0 } : { y: view.y, m: view.m + 1 };
      render();
    });
    $('#calToday').addEventListener('click', function () { selectDate(todayKey()); });

    $('#settingsBtn').addEventListener('click', openSheet);
    $('#closeSheet').addEventListener('click', closeSheet);
    $('#sheetBackdrop').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

    $('#rateInput').addEventListener('input', function (e) {
      var n = Number(e.target.value);
      if (!isFinite(n) || n < 0) return;
      state.settings.dayRate = n;
      persist();
      renderHero();
      renderCalendar();
      renderEditor();
      renderSettings();
    });
    $('#rateInput').addEventListener('blur', function () { if (!(state.settings.dayRate > 0)) { state.settings.dayRate = 500; persist(); render(); } });

    $('#divisorGroup').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-divisor]');
      if (!btn) return;
      state.settings.divisor = Number(btn.dataset.divisor);
      persist();
      render();
    });

    $('#themeGroup').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-theme]');
      if (!btn) return;
      state.theme = btn.dataset.theme;
      persist();
      applyTheme();
      render();
    });

    document.addEventListener('click', function (e) {
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.dataset.act;
      if (a === 'export-json') exportJSON();
      else if (a === 'export-csv') exportCSV();
      else if (a === 'import-json') $('#importFile').click();
    });

    $('#importFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importJSON(f);
      e.target.value = '';
    });

    $('#resetBtn').addEventListener('click', function () {
      if (!window.confirm('Delete every record and reset settings to default?\n\nThis cannot be undone — export a backup first if you might need it.')) return;
      var theme = state.theme;
      state = structuredClone(DEFAULT_STATE);
      state.theme = theme;
      persist();
      applyTheme();
      render();
      closeSheet();
      toast('All data cleared');
    });

    $('#installBtn').addEventListener('click', function () {
      if (deferredInstall) {
        deferredInstall.prompt();
        deferredInstall.userChoice.then(function () { deferredInstall = null; });
        return;
      }
      toast('Use your browser menu → “Add to Home screen”');
    });

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredInstall = e;
      $('#installBtn').textContent = 'Install on this device';
      $('#installHint').textContent = 'Adds an icon to your home screen and runs full screen.';
    });

    window.addEventListener('appinstalled', function () {
      deferredInstall = null;
      toast('Installed — open it from your home screen');
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (todayKey() !== lastKnownToday) {
        lastKnownToday = todayKey();
        render();
      }
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (state.theme === 'system') applyTheme();
    });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    applyTheme();
    bind();
    render();
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () { /* offline caching unavailable */ });
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
