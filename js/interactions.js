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

  /* ---------------------------------------------------------- Add Trade: step rail */
  function buildStepRail() {
    const rail = $('#trade-steps');
    const form = $('#trade-form');
    if (!rail || !form || rail.children.length) return;
    const sections = $$('.form-section[data-step]', form);
    rail.innerHTML = sections.map((s, i) =>
      `<button type="button" class="trade-step" data-target="${i}">
        ${ic(s.dataset.stepIcon || 'file')}<span>${s.dataset.step}</span><span class="step-num">${i + 1}</span>
      </button>`).join('');
    const steps = $$('.trade-step', rail);
    steps.forEach((b) => b.addEventListener('click', () => {
      sections[+b.dataset.target].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }));
    // scroll-spy
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const idx = sections.indexOf(en.target);
        steps.forEach((b, i) => {
          b.classList.toggle('active', i === idx);
          b.classList.toggle('done', i < idx);
        });
      });
    }, { rootMargin: '-30% 0px -55% 0px', threshold: 0 });
    sections.forEach((s) => spy.observe(s));
  }

  /* ---------------------------------------------------------- emoji chips for selects */
  const EMOJI = {
    calm: '😌', confident: '😎', neutral: '😐', anxious: '😰', excited: '🤩',
    fearful: '😨', greedy: '🤑', frustrated: '😤', bored: '🥱', tired: '😴',
    hopeful: '🤞', panicked: '😱',
    yes: '✅', mostly: '🟡', partial: '🟡', no: '❌', 'no-plan': '🤷',
  };
  function buildEmojiChips() {
    $$('select[data-emoji-chips]').forEach((sel) => {
      if (sel.classList.contains('has-chips')) return;
      const wrap = document.createElement('div');
      wrap.className = 'emoji-chips';
      [...sel.options].forEach((opt) => {
        if (!opt.value) return; // skip the "--" placeholder; deselecting a chip = empty
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'emoji-chip';
        chip.dataset.value = opt.value;
        const em = EMOJI[opt.value] || '·';
        chip.innerHTML = `<span class="em">${em}</span><span>${opt.textContent.split('—')[0].trim()}</span>`;
        chip.addEventListener('click', () => {
          const on = sel.value === opt.value;
          sel.value = on ? '' : opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          syncChips(sel);
        });
        wrap.appendChild(chip);
      });
      sel.classList.add('has-chips');
      sel.insertAdjacentElement('afterend', wrap);
      syncChips(sel);
    });
  }
  function syncChips(sel) {
    const wrap = sel.nextElementSibling;
    if (!wrap || !wrap.classList.contains('emoji-chips')) return;
    $$('.emoji-chip', wrap).forEach((c) => c.classList.toggle('selected', c.dataset.value === sel.value));
  }
  function syncAllChips() { $$('select.has-chips').forEach(syncChips); }

  /* ---------------------------------------------------------- journal: date nav, streak, slider emoji */
  const MOOD_EMOJI = ['😫', '😞', '😕', '😐', '🙂', '😊', '😄', '🤩', '🔥', '🚀'];
  function sliderEmoji() {
    [['mood', 'mood'], ['energy', 'energy']].forEach(([name, key]) => {
      const rng = $(`#journal-form input[name="${name}"]`);
      const em = $(`.slider-emoji[data-emoji-for="${key}"]`);
      if (!rng || !em) return;
      const set = () => {
        const v = Math.min(9, Math.max(0, Math.round(+rng.value) - 1));
        if (em.textContent !== MOOD_EMOJI[v]) {
          em.textContent = MOOD_EMOJI[v];
          em.classList.add('pop');
          setTimeout(() => em.classList.remove('pop'), 200);
        }
      };
      rng.addEventListener('input', set);
      set();
    });
  }
  function journalStreak() {
    const badge = $('#journal-streak');
    if (!badge || typeof STORAGE === 'undefined') return;
    let streak = 0;
    try {
      const j = STORAGE.getJournal();
      const day = 86400000;
      const key = (d) => {
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      };
      let cur = new Date();
      // streak may start today or yesterday (haven't journaled yet today)
      if (!j[key(cur)]) cur = new Date(cur.getTime() - day);
      while (j[key(cur)]) { streak++; cur = new Date(cur.getTime() - day); }
    } catch (e) { /* ignore */ }
    badge.textContent = `🔥 ${streak} day streak`;
    badge.classList.toggle('on-fire', streak >= 3);
  }
  function shiftJournalDate(days) {
    const inp = $('#journal-date');
    if (!inp || !inp.value) return;
    const d = new Date(inp.value + 'T12:00:00');
    d.setDate(d.getDate() + days);
    const p = (n) => String(n).padStart(2, '0');
    inp.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => { fillAllRanges(); syncAllChips(); sliderEmojiRefresh(); }, 60);
  }
  function sliderEmojiRefresh() {
    $$('#journal-form input[type="range"]').forEach((r) => r.dispatchEvent(new Event('input', { bubbles: false })));
  }
  function wireJournal() {
    const prev = $('#journal-prev'), next = $('#journal-next'), today = $('#journal-today');
    if (prev) prev.addEventListener('click', () => shiftJournalDate(-1));
    if (next) next.addEventListener('click', () => shiftJournalDate(1));
    if (today) today.addEventListener('click', () => {
      const inp = $('#journal-date');
      const d = new Date();
      const p = (n) => String(n).padStart(2, '0');
      inp.value = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      setTimeout(() => { fillAllRanges(); syncAllChips(); sliderEmojiRefresh(); }, 60);
    });
    const form = $('#journal-form');
    if (form) form.addEventListener('submit', () => setTimeout(journalStreak, 150));
  }

  /* ---------------------------------------------------------- custom dropdowns */
  // Replaces the dated native <select> popup with a styled, animated panel while the real
  // select stays in the DOM (hidden) as the source of truth — every app.js listener and
  // programmatic value set keeps working. Options are rebuilt on every open, so selects
  // whose options app.js repopulates (setup filter, playbook picker) are always current.
  let openDD = null;
  function closeDD() {
    if (!openDD) return;
    openDD.classList.remove('open');
    const t = openDD.querySelector('.dd-trigger');
    if (t) t.setAttribute('aria-expanded', 'false');
    openDD = null;
  }
  function ddLabel(sel) {
    const opt = sel.options[sel.selectedIndex];
    const txt = opt ? opt.textContent.trim() : '';
    return txt || '--';
  }
  function syncDDLabel(sel) {
    const wrap = sel.closest('.dd');
    if (!wrap) return;
    const lab = wrap.querySelector('.dd-label');
    if (lab && lab.textContent !== ddLabel(sel)) lab.textContent = ddLabel(sel);
  }
  function syncAllDD() { $$('select.has-dd').forEach(syncDDLabel); }

  function enhanceSelects() {
    if (window.matchMedia('(pointer: coarse)').matches) return; // phones: native pickers are better
    $$('select').forEach((sel) => {
      if (sel.classList.contains('has-chips') || sel.classList.contains('has-dd')) return;
      sel.classList.add('has-dd');

      const wrap = document.createElement('div');
      wrap.className = 'dd' + (sel.classList.contains('select-sm') ? ' dd-inline' : '');
      sel.parentNode.insertBefore(wrap, sel);
      wrap.appendChild(sel);

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'dd-trigger' + (sel.classList.contains('select-sm') ? ' dd-sm' : '');
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.innerHTML = `<span class="dd-label">${ddLabel(sel)}</span>${ic('chevron-down')}`;
      wrap.appendChild(trigger);

      const panel = document.createElement('div');
      panel.className = 'dd-panel';
      panel.setAttribute('role', 'listbox');
      wrap.appendChild(panel);

      let active = -1;
      const build = () => {
        const opts = [...sel.options];
        panel.innerHTML = opts.map((o, i) =>
          `<div class="dd-opt${o.value === sel.value ? ' selected' : ''}" role="option" data-i="${i}" aria-selected="${o.value === sel.value}">
            <span class="dd-opt-label">${o.textContent.trim() || '--'}</span>${ic('check')}
          </div>`).join('');
        active = opts.findIndex((o) => o.value === sel.value);
        $$('.dd-opt', panel).forEach((el) => {
          el.addEventListener('click', () => pick(+el.dataset.i));
          el.addEventListener('mousemove', () => setActiveOpt(+el.dataset.i));
        });
      };
      const setActiveOpt = (i) => {
        active = i;
        $$('.dd-opt', panel).forEach((el) => el.classList.toggle('active', +el.dataset.i === i));
      };
      const pick = (i) => {
        const o = sel.options[i];
        if (!o) return;
        sel.value = o.value;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        syncDDLabel(sel);
        closeDD();
        trigger.focus();
      };
      const open = () => {
        if (openDD && openDD !== wrap) closeDD();
        build();
        // flip up if there's no room below; right-align if the trigger hugs the right edge
        const r = trigger.getBoundingClientRect();
        const panelH = Math.min(300, sel.options.length * 38 + 12);
        wrap.classList.toggle('dd-up', window.innerHeight - r.bottom < panelH + 16 && r.top > panelH + 16);
        wrap.classList.toggle('dd-right', r.left + Math.max(r.width, 200) > window.innerWidth - 16);
        wrap.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        openDD = wrap;
        if (active >= 0) { const el = panel.querySelector(`.dd-opt[data-i="${active}"]`); if (el) { setActiveOpt(active); el.scrollIntoView({ block: 'nearest' }); } }
      };
      trigger.addEventListener('click', () => (wrap.classList.contains('open') ? closeDD() : open()));
      trigger.addEventListener('keydown', (e) => {
        const isOpen = wrap.classList.contains('open');
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!isOpen) { open(); return; }
          const n = sel.options.length;
          setActiveOpt(e.key === 'ArrowDown' ? Math.min(active + 1, n - 1) : Math.max(active - 1, 0));
          const el = panel.querySelector('.dd-opt.active');
          if (el) el.scrollIntoView({ block: 'nearest' });
        } else if ((e.key === 'Enter' || e.key === ' ') && isOpen) { e.preventDefault(); pick(active); }
        else if (e.key === 'Escape' && isOpen) { e.preventDefault(); closeDD(); }
      });
      sel.addEventListener('change', () => syncDDLabel(sel));
    });
  }
  document.addEventListener('pointerdown', (e) => { if (openDD && !e.target.closest('.dd')) closeDD(); }, true);
  window.addEventListener('resize', closeDD);

  /* ---------------------------------------------------------- playbooks: collapsible creator */
  function wirePlaybooks() {
    const btn = $('#playbook-new-btn'), card = $('#playbook-form-card');
    if (!btn || !card) return;
    const setOpen = (open) => {
      card.classList.toggle('collapsed', !open);
      btn.classList.toggle('open', open);
      if (open) card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    };
    btn.addEventListener('click', () => setOpen(card.classList.contains('collapsed')));
    // editing a playbook must reveal the form before app.js scrolls to it
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-pb-edit]')) setOpen(true);
      if (e.target.closest('#playbook-cancel')) setOpen(false);
    }, true);
    const form = $('#playbook-form');
    if (form) form.addEventListener('submit', () => setTimeout(() => setOpen(false), 120));
  }

  /* ---------------------------------------------------------- boot */
  function init() {
    watch('dashboard-stats', animateStats);
    watch('dashboard-insights', animateStats);
    watch('trades-tbody', indexRows);
    fillAllRanges();
    buildPalette();
    buildStepRail();
    buildEmojiChips();
    enhanceSelects();
    sliderEmoji();
    journalStreak();
    wireJournal();
    wirePlaybooks();
    // re-sync chips + ranges when app.js populates forms (edit trade, load journal day, view switch)
    document.addEventListener('click', (e) => {
      if (e.target.closest('.nav-item, [data-edit], [data-journal-date], #form-reset')) {
        setTimeout(() => { syncAllChips(); fillAllRanges(); sliderEmojiRefresh(); journalStreak(); }, 90);
      }
    });
    // self-healing sync: app.js sets select/range values programmatically (edit trade, load a
    // journal day, load settings) at times we can't predict, so keep the visual layer
    // consistent. Cheap (a handful of class toggles / text compares), so a slow tick is plenty.
    setInterval(() => {
      syncAllDD();
      if (document.querySelector('#view-new-trade.active, #view-journal.active')) {
        syncAllChips(); fillAllRanges();
      }
    }, 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
