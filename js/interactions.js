// === Interaction Layer ===
// Adds life to the UI: animated stat count-ups, a command palette (Cmd/Ctrl-K),
// keyboard navigation, and click ripples. Self-contained — hooks the existing DOM
// via observers/delegation so it never touches app logic.

(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ic = (n) => (window.ICON ? window.ICON(n) : '');

  /* ---------------------------------------------------------- count-up */
  function countUp(el) {
    if (el.dataset.counting === '1') return;
    const raw = (el.dataset.cv || el.textContent || '').trim();
    const m = raw.match(/-?\d[\d,]*\.?\d*/);
    if (!m) return;
    const numStr = m[0];
    const target = parseFloat(numStr.replace(/,/g, ''));
    if (!isFinite(target)) return;
    if (reduce) return;
    const prefix = raw.slice(0, m.index);
    const suffix = raw.slice(m.index + numStr.length);
    const decimals = (numStr.split('.')[1] || '').length;
    const grouped = numStr.indexOf(',') >= 0;
    el.dataset.cv = raw;
    el.dataset.counting = '1';
    const fmt = (v) => {
      let s = decimals ? v.toFixed(decimals) : Math.round(v).toString();
      if (grouped) { const p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); s = p.join('.'); }
      return prefix + s + suffix;
    };
    const dur = 720, t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * e);
      if (p < 1) requestAnimationFrame(tick);
      else { el.textContent = raw; el.dataset.counting = '0'; }
    };
    requestAnimationFrame(tick);
  }

  function animateStats(root) {
    $$('.stat-value, .insight-value', root).forEach((el) => { el.dataset.counting = '0'; countUp(el); });
  }

  function watch(id, cb) {
    const el = document.getElementById(id);
    if (!el) return;
    let raf = 0;
    new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => cb(el)); })
      .observe(el, { childList: true });
    if (el.children.length) cb(el);
  }

  /* ---------------------------------------------------------- trade-row stagger */
  function indexRows(tb) { $$('tr', tb).forEach((tr, i) => tr.style.setProperty('--row-i', Math.min(i, 12))); }

  /* ---------------------------------------------------------- filled range sliders */
  function fillRange(el) {
    const min = +el.min || 0, max = +el.max || 100, v = +el.value;
    const p = max > min ? ((v - min) / (max - min)) * 100 : 50;
    el.style.setProperty('--rng', p.toFixed(1) + '%');
  }
  function fillAllRanges() { $$('input[type="range"]').forEach(fillRange); }
  document.addEventListener('input', (e) => { if (e.target && e.target.type === 'range') fillRange(e.target); });
  // re-sync fills after view changes / when the edit form is populated programmatically
  document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-item, [data-edit], [data-pb-edit], [data-action], #journal-date')) setTimeout(fillAllRanges, 70);
  });

  /* ---------------------------------------------------------- ripple */
  document.addEventListener('pointerdown', (e) => {
    if (reduce) return;
    const btn = e.target.closest('.btn, .nav-item, .cmdk-item, .theme-toggle');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const d = Math.max(r.width, r.height);
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.width = s.style.height = d + 'px';
    s.style.left = (e.clientX - r.left - d / 2) + 'px';
    s.style.top = (e.clientY - r.top - d / 2) + 'px';
    const pos = getComputedStyle(btn).position;
    if (pos === 'static') btn.style.position = 'relative';
    if (getComputedStyle(btn).overflow === 'visible') btn.style.overflow = 'hidden';
    btn.appendChild(s);
    setTimeout(() => s.remove(), 620);
  }, { passive: true });

  /* ---------------------------------------------------------- command palette */
  const commands = () => {
    const nav = (view, label, ico) => ({ group: 'Navigate', ico, label, run: () => clickNav(view) });
    const act = (sel, label, ico) => ({ group: 'Actions', ico, label, run: () => { const el = $(sel); if (el) el.click(); } });
    return [
      nav('dashboard', 'Dashboard', ic('dashboard')),
      nav('trades', 'Trades', ic('trades')),
      nav('analytics', 'Reports', ic('reports')),
      nav('journal', 'Daily Journal', ic('journal')),
      nav('playbooks', 'Playbooks', ic('playbooks')),
      nav('ai', 'AI Coach', ic('ai')),
      nav('new-trade', 'Add Trade', ic('add')),
      nav('settings', 'Settings', ic('settings')),
      { group: 'Actions', ico: ic('sun'), label: 'Toggle light / dark theme', run: () => { const t = $('#theme-toggle'); if (t) t.click(); } },
      act('#import-csv', 'Import trades (CSV)', ic('upload')),
      act('#nt-connect', 'Connect / sync NinjaTrader', ic('sync')),
      act('#export-json', 'Export all data (JSON)', ic('download')),
      act('#download-template', 'Download CSV template', ic('file')),
      act('#load-sample', 'Load sample data', ic('star')),
    ];
  };
  function clickNav(view) { const b = $(`.nav-item[data-view="${view}"]`); if (b) b.click(); }

  let pal, palInput, palList, palItems = [], palActive = 0, palOpen = false;
  function buildPalette() {
    pal = document.createElement('div');
    pal.className = 'cmdk-overlay';
    pal.innerHTML = `
      <div class="cmdk" role="dialog" aria-label="Command palette">
        <div class="cmdk-input-wrap">
          <span class="cmdk-search">${ic('search')}</span>
          <input class="cmdk-input" type="text" placeholder="Search actions, pages…" aria-label="Search" />
          <span class="kbd-hint"><span class="kbd">esc</span></span>
        </div>
        <div class="cmdk-list"></div>
      </div>`;
    document.body.appendChild(pal);
    palInput = $('.cmdk-input', pal);
    palList = $('.cmdk-list', pal);
    pal.addEventListener('click', (e) => { if (e.target === pal) closePalette(); });
    palInput.addEventListener('input', renderPalette);
    palInput.addEventListener('keydown', onPaletteKey);

    const fab = document.createElement('button');
    fab.className = 'cmdk-fab';
    fab.innerHTML = `<span class="kbd">${isMac ? '⌘' : 'Ctrl'} K</span> Quick actions`;
    fab.addEventListener('click', openPalette);
    document.body.appendChild(fab);
  }
  function fuzzy(q, s) {
    q = q.toLowerCase(); s = s.toLowerCase();
    if (!q) return true;
    let i = 0; for (const c of s) { if (c === q[i]) i++; if (i === q.length) return true; } return false;
  }
  function renderPalette() {
    const q = palInput.value.trim();
    const list = commands().filter((c) => fuzzy(q, c.label) || fuzzy(q, c.group));
    palItems = list; palActive = 0;
    if (!list.length) { palList.innerHTML = `<div class="cmdk-empty">No matches for “${q}”.</div>`; return; }
    let html = '', group = '';
    list.forEach((c, i) => {
      if (c.group !== group) { group = c.group; html += `<div class="cmdk-group">${group}</div>`; }
      html += `<div class="cmdk-item${i === 0 ? ' active' : ''}" data-i="${i}">
        <span class="cmdk-ico">${c.ico}</span><span class="cmdk-label">${c.label}</span></div>`;
    });
    palList.innerHTML = html;
    $$('.cmdk-item', palList).forEach((el) => {
      el.addEventListener('mousemove', () => setActive(+el.dataset.i));
      el.addEventListener('click', () => runActive(+el.dataset.i));
    });
  }
  function setActive(i) {
    palActive = i;
    $$('.cmdk-item', palList).forEach((el) => el.classList.toggle('active', +el.dataset.i === i));
  }
  function runActive(i) {
    const c = palItems[i != null ? i : palActive];
    closePalette();
    if (c) setTimeout(c.run, 60);
  }
  function onPaletteKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(palActive + 1, palItems.length - 1)); scrollActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(palActive - 1, 0)); scrollActive(); }
    else if (e.key === 'Enter') { e.preventDefault(); runActive(); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  }
  function scrollActive() { const el = $('.cmdk-item.active', palList); if (el) el.scrollIntoView({ block: 'nearest' }); }
  function openPalette() {
    if (!pal) buildPalette();
    palOpen = true; palInput.value = ''; renderPalette();
    pal.classList.add('open');
    setTimeout(() => palInput.focus(), 30);
  }
  function closePalette() { if (pal) pal.classList.remove('open'); palOpen = false; }

  /* ---------------------------------------------------------- global keys */
  const NAV_KEYS = { '1': 'dashboard', '2': 'trades', '3': 'analytics', '4': 'journal', '5': 'playbooks', '6': 'ai', '7': 'new-trade', '8': 'settings' };
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palOpen ? closePalette() : openPalette(); return; }
    if (palOpen) return;
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '?' ) { e.preventDefault(); openPalette(); }
    else if (NAV_KEYS[e.key]) { e.preventDefault(); clickNav(NAV_KEYS[e.key]); }
    else if (e.key.toLowerCase() === 't') { const th = $('#theme-toggle'); if (th) th.click(); }
  });

  /* ---------------------------------------------------------- boot */
  function init() {
    watch('dashboard-stats', animateStats);
    watch('dashboard-insights', animateStats);
    watch('trades-tbody', indexRows);
    fillAllRanges();
    buildPalette();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
