// === Main Application ===

const APP = (() => {
  let state = {
    view: 'dashboard',
    period: 'all',
    sortKey: 'entryDate',
    sortDir: 'desc',
    filters: { search: '', status: '', direction: '', outcome: '', setup: '' },
    calMonth: null,
  };

  // ---- Navigation ----
  const PAGE_META = {
    'dashboard': ['Dashboard', 'Performance overview'],
    'new-trade': ['Add Trade', 'Log a new trade'],
    'trades':    ['Trades', 'Your complete trade history'],
    'analytics': ['Reports', 'Deep performance breakdown'],
    'playbooks': ['Playbooks', 'Your trading strategies & rules'],
    'ai':        ['AI Coach', 'AI-powered performance review'],
    'journal':   ['Daily Journal', 'Reflect on your trading day'],
    'settings':  ['Settings', 'Account & data management'],
  };

  function navigate(view) {
    state.view = view;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + view).classList.add('active');
    const [title, sub] = PAGE_META[view] || ['', ''];
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-subtitle').textContent = sub;
    document.querySelector('.content').scrollTo(0, 0);
    window.scrollTo(0, 0);

    if (view === 'dashboard') renderDashboard();
    if (view === 'trades')    renderTradesTable();
    if (view === 'analytics') renderAnalytics();
    if (view === 'playbooks') renderPlaybooks();
    if (view === 'ai')        renderAI();
    if (view === 'journal')   renderJournal();
    if (view === 'new-trade') { refreshSetupDatalist(); refreshPlaybookSelect(); }
  }

  // ---- Period-filtered trades ----
  function periodTrades() {
    return UTIL.filterByPeriod(STORAGE.getTrades(), state.period);
  }

  // ============ DASHBOARD ============
  function statCard(label, value, sub, cls = '') {
    return `<div class="stat-card ${cls}">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>`;
  }

  function renderDashboard() {
    const settings = STORAGE.getSettings();
    const trades = periodTrades();
    const s = STATS.summarize(trades, settings);

    updateSidebarBalance(s);

    const days = STATS.byDay(trades);
    const winDays = days.filter(d => d.netPnl > 0).length;
    const dayWinRate = days.length ? (winDays / days.length) * 100 : 0;
    const streakCls = s.currentStreak > 0 ? 'profit' : (s.currentStreak < 0 ? 'loss' : '');

    const netCls = s.netPnl > 0 ? 'profit' : (s.netPnl < 0 ? 'loss' : '');
    const grid = document.getElementById('dashboard-stats');
    grid.innerHTML = [
      statCard('Net P&amp;L', `<span class="${UTIL.pnlClass(s.netPnl)}">${UTIL.fmtMoney(s.netPnl, {alwaysSign:true})}</span>`,
        `${UTIL.fmtPct(s.totalReturnPct, 2, {alwaysSign:true})} return`, netCls),
      ringTile('Trade Win %', UTIL.fmtPct(s.winRate, 1), s.winRate, `${s.wins}W / ${s.losses}L`),
      statCard('Profit Factor', s.profitFactor === Infinity ? '∞' : UTIL.fmtNum(s.profitFactor, 2),
        `Gross ${UTIL.fmtMoneyCompact(s.grossProfit)} / ${UTIL.fmtMoneyCompact(-s.grossLoss)}`),
      ringTile('Day Win %', UTIL.fmtPct(dayWinRate, 1), dayWinRate, `${winDays} of ${days.length} days`),
      statCard('Avg Win/Loss', s.winLossRatio === Infinity ? '∞' : UTIL.fmtNum(s.winLossRatio, 2),
        `${UTIL.fmtMoneyCompact(s.avgWin)} / ${UTIL.fmtMoneyCompact(-s.avgLoss)}`),
      statCard('Trade Expectancy', `<span class="${UTIL.pnlClass(s.expectancy)}">${UTIL.fmtMoney(s.expectancy, {alwaysSign:true})}</span>`,
        `per trade · ${s.totalTrades} trades`),
      statCard('Current Streak', `${s.currentStreak > 0 ? '+' : ''}${s.currentStreak}`,
        `Best +${s.bestWinStreak} / Worst -${s.worstLossStreak}`, streakCls),
      statCard('Max Drawdown', `<span class="loss">${UTIL.fmtMoney(-s.maxDrawdown)}</span>`,
        `${UTIL.fmtPct(s.maxDrawdownPct, 1)} peak-to-trough`),
    ].join('');

    document.getElementById('equity-meta').textContent =
      `Balance ${UTIL.fmtMoney(s.currentBalance)}`;

    // Zella Score
    const zella = STATS.zellaScore(s, trades);
    renderZella(zella);
    renderInsights(trades);

    CHARTS.renderEquityCurve('chart-equity', s.equityCurve, s.initialBalance);
    CHARTS.renderDailyPnL('chart-daily', days);
    CHARTS.renderDrawdown('chart-drawdown', s.equityCurve);

    renderRecentTrades(trades);
    renderMonthlyCalendar();
  }

  function ringTile(label, value, pct, sub) {
    const p = Math.max(0, Math.min(100, pct || 0));
    return `<div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="tile-row">
        <div>
          <div class="stat-value">${value}</div>
          <div class="stat-sub">${sub}</div>
        </div>
        <div class="tile-ring" style="--pct:${p};--col:var(--profit)"></div>
      </div>
    </div>`;
  }

  function renderZella(zella) {
    const ring = document.getElementById('zella-ring');
    const num = document.getElementById('zella-score');
    const meta = document.getElementById('zella-meta');
    if (ring) ring.style.setProperty('--score', zella.overall);
    if (num) num.textContent = zella.overall;
    if (meta) {
      const g = zella.overall;
      meta.textContent = g >= 80 ? 'Excellent' : g >= 65 ? 'Strong' : g >= 50 ? 'Average' : g >= 35 ? 'Developing' : 'Needs work';
    }
    CHARTS.renderZellaRadar('chart-zella', zella.metrics);
  }

  const MISTAKE_LABELS = {
    'moved-stop':'Moved stop loss', 'no-plan':'No clear plan', 'oversized':'Oversized position',
    'undersized':'Undersized position', 'fomo':'FOMO entry', 'revenge':'Revenge trade',
    'early-exit':'Exited too early', 'late-exit':'Held too long', 'overtraded':'Overtraded',
    'chased':'Chased entry', 'ignored-plan':'Ignored trade plan', 'counter-trend':'Fought the trend',
  };

  function insightCard(icon, label, value, sub, cls = '') {
    return `<div class="insight-card">
      <div class="insight-icon ${cls}">${icon}</div>
      <div class="insight-body">
        <div class="insight-label">${label}</div>
        <div class="insight-value ${cls}">${value}</div>
        <div class="insight-sub">${sub}</div>
      </div>
    </div>`;
  }

  function renderInsights(trades) {
    const el = document.getElementById('dashboard-insights');
    if (!el) return;
    const ins = STATS.insights(trades);
    if (!ins) { el.innerHTML = ''; return; }
    const cards = [];
    if (ins.best) cards.push(insightCard(ICON('trend-up'), 'Best Trade',
      `<span class="profit">${UTIL.fmtMoney(ins.best.pnl, {alwaysSign:true})}</span>`,
      `${UTIL.escapeHtml(ins.best.symbol)} · ${ins.best.rMultiple !== null ? UTIL.fmtR(ins.best.rMultiple) : '—'}`, 'profit'));
    if (ins.worst) cards.push(insightCard(ICON('trend-down'), 'Worst Trade',
      `<span class="loss">${UTIL.fmtMoney(ins.worst.pnl, {alwaysSign:true})}</span>`,
      `${UTIL.escapeHtml(ins.worst.symbol)} · ${ins.worst.rMultiple !== null ? UTIL.fmtR(ins.worst.rMultiple) : '—'}`, 'loss'));
    if (ins.bestSetup) cards.push(insightCard(ICON('star'), 'Top Setup',
      UTIL.escapeHtml(ins.bestSetup.key),
      `${UTIL.fmtMoney(ins.bestSetup.netPnl, {alwaysSign:true})} · ${UTIL.fmtPct(ins.bestSetup.winRate, 0)} win`, 'accent'));
    if (ins.worstMistake) cards.push(insightCard(ICON('alert'), 'Biggest Leak',
      MISTAKE_LABELS[ins.worstMistake.key] || ins.worstMistake.key,
      `${UTIL.fmtMoney(ins.worstMistake.netPnl)} over ${ins.worstMistake.count}×`, 'loss'));
    else if (ins.bestDay) cards.push(insightCard(ICON('calendar'), 'Best Day',
      `<span class="profit">${UTIL.fmtMoney(ins.bestDay.netPnl, {alwaysSign:true})}</span>`,
      UTIL.fmtDate(ins.bestDay.key), 'profit'));
    el.innerHTML = cards.join('');
  }

  // ============ PLAYBOOKS ============
  function refreshPlaybookSelect() {
    const sel = document.getElementById('trade-playbook');
    if (!sel) return;
    const cur = sel.value;
    const pbs = STORAGE.getPlaybooks();
    sel.innerHTML = '<option value="">-- None --</option>' +
      pbs.map(p => `<option value="${p.id}">${UTIL.escapeHtml(p.name)}</option>`).join('');
    sel.value = cur;
    renderPlaybookRules();
  }

  function renderPlaybookRules() {
    const sel = document.getElementById('trade-playbook');
    const field = document.getElementById('playbook-rules-field');
    const box = document.getElementById('playbook-rules');
    if (!sel || !field || !box) return;
    const pb = STORAGE.getPlaybooks().find(p => p.id === sel.value);
    if (!pb || !(pb.rules || []).length) { field.classList.add('hidden'); box.innerHTML = ''; updateAdherence(); return; }
    field.classList.remove('hidden');
    box.innerHTML = pb.rules.map((r, i) =>
      `<label class="chip rule-chip"><input type="checkbox" name="rulesFollowed" value="${i}" /><span>${UTIL.escapeHtml(r)}</span></label>`
    ).join('');
    box.querySelectorAll('input').forEach(c => c.addEventListener('change', updateAdherence));
    updateAdherence();
  }

  function updateAdherence() {
    const badge = document.getElementById('adherence-badge');
    const box = document.getElementById('playbook-rules');
    if (!badge || !box) return;
    const total = box.querySelectorAll('input').length;
    const checked = box.querySelectorAll('input:checked').length;
    const pct = total ? Math.round((checked / total) * 100) : 0;
    badge.textContent = pct + '%';
    badge.style.color = pct >= 80 ? 'var(--profit)' : pct >= 50 ? 'var(--warn)' : 'var(--loss)';
  }

  function renderPlaybooks() {
    const pbs = STORAGE.getPlaybooks();
    const trades = STORAGE.getTrades();
    const el = document.getElementById('playbooks-list');
    if (!pbs.length) {
      el.innerHTML = `<div class="card pb-empty"><div class="empty-state">
        <div class="empty-title">No playbooks yet</div>
        <div class="empty-sub">A playbook is a documented setup with a rules checklist. Hit <strong>New Playbook</strong> to create your first, then tag your trades to it to see which strategies actually make money.</div>
      </div></div>`;
      return;
    }
    el.innerHTML = pbs.map(pb => {
      const perf = STATS.playbookPerf(trades, pb);
      const pnlCls = UTIL.pnlClass(perf.netPnl);
      const adh = perf.avgAdherence;
      return `<div class="card playbook-card">
        <div class="playbook-head">
          <div>
            <div class="playbook-name">${UTIL.escapeHtml(pb.name)}</div>
            <div class="playbook-market">${UTIL.escapeHtml(pb.market || '—')}</div>
          </div>
          <div class="playbook-actions">
            <button class="btn-icon" data-pb-edit="${pb.id}" title="Edit">${ICON('edit')}</button>
            <button class="btn-icon" data-pb-del="${pb.id}" title="Delete">${ICON('trash')}</button>
          </div>
        </div>
        ${pb.description ? `<p class="playbook-desc">${UTIL.escapeHtml(pb.description)}</p>` : ''}
        <div class="playbook-stats">
          <div><span class="pb-stat-label">Net P&amp;L</span><span class="pb-stat-val ${pnlCls}">${UTIL.fmtMoney(perf.netPnl, {alwaysSign:true})}</span></div>
          <div><span class="pb-stat-label">Trades</span><span class="pb-stat-val">${perf.trades}</span></div>
          <div><span class="pb-stat-label">Win Rate</span><span class="pb-stat-val">${UTIL.fmtPct(perf.winRate, 0)}</span></div>
          <div><span class="pb-stat-label">Profit Factor</span><span class="pb-stat-val">${perf.profitFactor === Infinity ? '∞' : UTIL.fmtNum(perf.profitFactor, 2)}</span></div>
          <div><span class="pb-stat-label">Avg Adherence</span><span class="pb-stat-val">${adh === null ? '—' : UTIL.fmtPct(adh, 0)}</span></div>
        </div>
        ${(pb.rules || []).length ? `<div class="playbook-rules-list">${pb.rules.map(r => `<span class="rule-tag">${UTIL.escapeHtml(r)}</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('');

    el.querySelectorAll('[data-pb-edit]').forEach(b => b.addEventListener('click', () => editPlaybook(b.dataset.pbEdit)));
    el.querySelectorAll('[data-pb-del]').forEach(b => b.addEventListener('click', () => deletePlaybook(b.dataset.pbDel)));
  }

  function savePlaybook(e) {
    e.preventDefault();
    const f = document.getElementById('playbook-form');
    const fd = new FormData(f);
    const name = (fd.get('name') || '').trim();
    if (!name) { UTIL.toast('Playbook needs a name.', 'error'); return; }
    const rules = (fd.get('rules') || '').split('\n').map(s => s.trim()).filter(Boolean);
    const pbs = STORAGE.getPlaybooks();
    const id = fd.get('id');
    const data = { name, market: (fd.get('market') || '').trim(), description: (fd.get('description') || '').trim(), rules };
    if (id) {
      const idx = pbs.findIndex(p => p.id === id);
      if (idx >= 0) pbs[idx] = { ...pbs[idx], ...data };
      UTIL.toast('Playbook updated.', 'success');
    } else {
      data.id = UTIL.uuid().replace('tr_', 'pb_');
      data.createdAt = new Date().toISOString();
      pbs.push(data);
      UTIL.toast('Playbook created.', 'success');
    }
    STORAGE.savePlaybooks(pbs);
    resetPlaybookForm();
    renderPlaybooks();
  }

  function editPlaybook(id) {
    const pb = STORAGE.getPlaybooks().find(p => p.id === id);
    if (!pb) return;
    const f = document.getElementById('playbook-form');
    f.querySelector('[name="id"]').value = pb.id;
    f.querySelector('[name="name"]').value = pb.name;
    f.querySelector('[name="market"]').value = pb.market || '';
    f.querySelector('[name="description"]').value = pb.description || '';
    f.querySelector('[name="rules"]').value = (pb.rules || []).join('\n');
    document.getElementById('playbook-form-title').textContent = 'Edit Playbook';
    document.getElementById('playbook-cancel').classList.remove('hidden');
    f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function deletePlaybook(id) {
    if (!confirm('Delete this playbook? Trades tagged to it will keep their data but lose the link.')) return;
    STORAGE.savePlaybooks(STORAGE.getPlaybooks().filter(p => p.id !== id));
    UTIL.toast('Playbook deleted.', 'success');
    renderPlaybooks();
  }

  function resetPlaybookForm() {
    const f = document.getElementById('playbook-form');
    f.reset();
    f.querySelector('[name="id"]').value = '';
    document.getElementById('playbook-form-title').textContent = 'Create Playbook';
    document.getElementById('playbook-cancel').classList.add('hidden');
  }

  function renderRecentTrades(trades) {
    const closed = trades.filter(t => t.status === 'closed')
      .sort((a, b) => new Date(b.exitDate || b.entryDate) - new Date(a.exitDate || a.entryDate))
      .slice(0, 8);
    const el = document.getElementById('recent-trades-list');
    if (!closed.length) {
      el.innerHTML = `<div class="muted" style="padding:20px 4px;text-align:center;">No closed trades in this period.</div>`;
      return;
    }
    el.innerHTML = closed.map(t => {
      const e = UTIL.enrich(t);
      return `<div class="recent-row" data-trade-id="${t.id}">
        <span class="dir-pill ${t.direction}">${t.direction === 'long' ? 'L' : 'S'}</span>
        <div>
          <div class="recent-sym">${UTIL.escapeHtml(t.symbol)}</div>
          <div class="recent-meta">${UTIL.escapeHtml(t.setup || '—')} · ${UTIL.fmtDateShort(t.exitDate || t.entryDate)}</div>
        </div>
        <div class="recent-meta">${e.rMultiple !== null ? UTIL.fmtR(e.rMultiple) : '—'}</div>
        <div class="recent-pnl ${UTIL.pnlClass(e.pnl)}">${UTIL.fmtMoney(e.pnl, {alwaysSign:true})}</div>
      </div>`;
    }).join('');
    el.querySelectorAll('.recent-row').forEach(r =>
      r.addEventListener('click', () => openTradeDetail(r.dataset.tradeId)));
  }

  function renderMonthlyCalendar() {
    const trades = STORAGE.getTrades();
    const byDay = new Map(STATS.byDay(trades).map(d => [d.key, d]));
    if (!state.calMonth) { const n = new Date(); state.calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
    const view = state.calMonth;
    const year = view.getFullYear(), month = view.getMonth();

    document.getElementById('cal-month-name').textContent =
      view.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const startDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const dowHead = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let html = '<div class="cal-grid">';
    for (const d of dowHead) html += `<div class="cal-dow">${d}</div>`;
    html += `<div class="cal-dow week-head">Week</div>`;

    let monthPnl = 0, tradingDays = 0;
    let dayNum = 1 - startDow;
    for (let w = 0; w < 6; w++) {
      let weekPnl = 0, weekDays = 0, rowHtml = '', anyInMonth = false;
      for (let d = 0; d < 7; d++) {
        if (dayNum < 1 || dayNum > daysInMonth) {
          rowHtml += `<div class="cal-cell empty"></div>`;
        } else {
          anyInMonth = true;
          const cur = new Date(year, month, dayNum);
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const rec = byDay.get(key);
          const isToday = cur.getTime() === today.getTime();
          if (rec) {
            monthPnl += rec.netPnl; tradingDays++;
            weekPnl += rec.netPnl; weekDays++;
            const cls = rec.netPnl > 0 ? 'win' : (rec.netPnl < 0 ? 'loss' : 'be');
            rowHtml += `<div class="cal-cell has-data ${cls}${isToday ? ' today' : ''}" data-cal-day="${key}" title="${UTIL.fmtDate(cur)}">
              <div class="cal-date">${dayNum}</div>
              <div class="cal-pnl">${UTIL.fmtMoneyCompact(rec.netPnl)}</div>
              <div class="cal-trades">${rec.trades} trade${rec.trades > 1 ? 's' : ''}</div>
            </div>`;
          } else {
            rowHtml += `<div class="cal-cell${isToday ? ' today' : ''}"><div class="cal-date">${dayNum}</div></div>`;
          }
        }
        dayNum++;
      }
      if (anyInMonth) {
        const wcls = weekPnl > 0 ? 'profit' : (weekPnl < 0 ? 'loss' : '');
        rowHtml += `<div class="cal-week">
          <div class="cal-week-label">Week ${w + 1}</div>
          <div class="cal-week-pnl ${wcls}">${weekDays ? UTIL.fmtMoneyCompact(weekPnl) : '—'}</div>
          <div class="cal-week-days">${weekDays} day${weekDays !== 1 ? 's' : ''}</div>
        </div>`;
        html += rowHtml;
      }
      if (dayNum > daysInMonth) break;
    }
    html += '</div>';
    document.getElementById('calendar-monthly').innerHTML = html;

    const pnlEl = document.getElementById('cal-month-pnl');
    pnlEl.textContent = `${UTIL.fmtMoney(monthPnl, { alwaysSign: true })} · ${tradingDays} days`;
    pnlEl.style.background = monthPnl > 0 ? 'var(--profit-soft)' : (monthPnl < 0 ? 'var(--loss-soft)' : 'var(--surface-3)');
    pnlEl.style.color = monthPnl > 0 ? 'var(--profit)' : (monthPnl < 0 ? 'var(--loss)' : 'var(--text-2)');
  }

  function shiftCalMonth(delta) {
    if (!state.calMonth) { const n = new Date(); state.calMonth = new Date(n.getFullYear(), n.getMonth(), 1); }
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + delta, 1);
    renderMonthlyCalendar();
  }

  // ============ AI COACH ============
  function renderAI() {
    const hasKey = AI.hasKey();
    document.getElementById('ai-no-key').classList.toggle('hidden', hasKey);
    document.getElementById('ai-ready').classList.toggle('hidden', !hasKey);
    if (!hasKey) return;
    const closed = STORAGE.getTrades().filter(t => t.status === 'closed').length;
    document.getElementById('ai-meta').textContent = `Analyzing ${closed} closed trade${closed !== 1 ? 's' : ''} · ${AI.MODEL}`;
    document.getElementById('ai-error').classList.add('hidden');
    const out = document.getElementById('ai-output');
    const last = AI.getLast();
    if (last && last.text) {
      out.classList.remove('hidden');
      out.innerHTML = `<div class="ai-lastrun">Last analysis · ${UTIL.fmtDateTime(last.at)}</div>` + AI.renderMarkdown(last.text);
    } else {
      out.classList.add('hidden');
    }
  }

  function runAIAnalysis() {
    const btn = document.getElementById('ai-analyze-btn');
    const out = document.getElementById('ai-output');
    const err = document.getElementById('ai-error');
    err.classList.add('hidden'); err.textContent = '';
    out.classList.remove('hidden');
    out.innerHTML = '<div class="ai-thinking"><span></span><span></span><span></span> Analyzing your trades…</div>';
    btn.disabled = true;
    const original = ICON('ai') + ' Analyze My Trading';
    btn.textContent = 'Analyzing…';
    let started = false;
    AI.analyze({
      onDelta: (_delta, full) => {
        if (!started) { started = true; }
        out.innerHTML = AI.renderMarkdown(full);
        out.scrollTop = out.scrollHeight;
      },
      onDone: () => { btn.disabled = false; btn.innerHTML = ICON('ai') + ' Re-analyze'; UTIL.toast('Analysis complete.', 'success'); },
      onError: (msg) => {
        btn.disabled = false; btn.innerHTML = original;
        out.classList.add('hidden'); out.innerHTML = '';
        err.classList.remove('hidden'); err.textContent = msg;
      },
    });
  }

  function loadAIKeyField() {
    const input = document.getElementById('ai-key-input');
    const status = document.getElementById('ai-key-status');
    if (!input || !status) return;
    input.value = '';
    if (AI.hasKey()) {
      input.placeholder = '•••••••••••••• (saved)';
      status.textContent = '✓ Key saved in this browser.';
      status.className = 'ai-key-status ok';
    } else {
      input.placeholder = 'AIza...';
      status.textContent = 'No key saved yet.';
      status.className = 'ai-key-status';
    }
  }

  // ============ THEME ============
  function getTheme() { try { return localStorage.getItem('tj.theme') || 'light'; } catch (e) { return 'light'; } }
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('tj.theme', t); } catch (e) {}
  }
  function toggleTheme() {
    applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
    if (state.view === 'dashboard') renderDashboard();
    else if (state.view === 'analytics') renderAnalytics();
  }

  function updateSidebarBalance(s) {
    document.getElementById('sidebar-balance').textContent = UTIL.fmtMoney(s.currentBalance);
    const chEl = document.getElementById('sidebar-change');
    chEl.textContent = UTIL.fmtPct(s.totalReturnPct, 2, {alwaysSign:true});
    chEl.className = 'account-change ' + UTIL.pnlClass(s.totalReturnPct);
  }

  // ============ NEW TRADE FORM ============
  function refreshSetupDatalist() {
    const setups = [...new Set(STORAGE.getTrades().map(t => t.setup).filter(Boolean))];
    const dl = document.getElementById('setups-list');
    if (dl) dl.innerHTML = setups.map(s => `<option value="${UTIL.escapeHtml(s)}">`).join('');
  }

  // ---- Screenshot images (compressed to data URLs, stored in localStorage) ----
  let formScreenshots = [];

  function compressImage(file, maxDim = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type || !file.type.startsWith('image/')) { reject(new Error('not an image')); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (Math.max(width, height) > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          canvas.getContext('2d').drawImage(img, 0, 0, width, height);
          try { resolve(canvas.toDataURL('image/jpeg', quality)); }
          catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error('decode failed'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  async function addImageFiles(files) {
    const imgs = [...files].filter(f => f.type && f.type.startsWith('image/'));
    if (!imgs.length) return;
    let failed = 0;
    for (const f of imgs) {
      try { formScreenshots.push(await compressImage(f)); }
      catch (e) { failed++; }
    }
    renderThumbs();
    if (imgs.length - failed > 0) UTIL.toast(`Added ${imgs.length - failed} image${imgs.length - failed !== 1 ? 's' : ''}.`, 'success');
    if (failed) UTIL.toast(`${failed} file(s) couldn't be read.`, 'error');
  }

  function renderThumbs() {
    const el = document.getElementById('image-thumbs');
    if (!el) return;
    el.innerHTML = formScreenshots.map((src, i) => `
      <div class="image-thumb">
        <img src="${src}" data-shot-index="${i}" alt="screenshot ${i + 1}" />
        <button type="button" class="image-thumb-remove" data-remove-shot="${i}" title="Remove" aria-label="Remove image">×</button>
      </div>`).join('');
    el.querySelectorAll('[data-shot-index]').forEach(img => img.addEventListener('click', () => openLightbox(img.src)));
    el.querySelectorAll('[data-remove-shot]').forEach(btn => btn.addEventListener('click', () => {
      formScreenshots.splice(Number(btn.dataset.removeShot), 1);
      renderThumbs();
    }));
  }

  function openLightbox(src) {
    let lb = document.getElementById('lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'lightbox';
      lb.className = 'lightbox hidden';
      lb.innerHTML = '<button class="lightbox-close" aria-label="Close">×</button><img alt="screenshot" />';
      document.body.appendChild(lb);
      lb.addEventListener('click', (e) => { if (e.target !== lb.querySelector('img')) lb.classList.add('hidden'); });
    }
    lb.querySelector('img').src = src;
    lb.classList.remove('hidden');
  }
  function closeLightbox() { const lb = document.getElementById('lightbox'); if (lb) lb.classList.add('hidden'); }

  function readTradeForm() {
    const f = document.getElementById('trade-form');
    const fd = new FormData(f);
    const get = k => { const v = fd.get(k); return v === null || v === '' ? null : v; };
    const num = k => { const v = get(k); return v === null ? null : Number(v); };

    const mistakes = [...f.querySelectorAll('input[name="mistakes"]:checked')].map(c => c.value);
    const rulesFollowed = [...f.querySelectorAll('input[name="rulesFollowed"]:checked')].map(c => Number(c.value));
    const tags = (get('tags') || '').split(',').map(s => s.trim()).filter(Boolean);
    const screenshots = [...formScreenshots];

    return {
      id: get('id') || UTIL.uuid(),
      symbol: (get('symbol') || '').toUpperCase().trim(),
      assetClass: get('assetClass'),
      direction: get('direction') || 'long',
      status: get('status') || 'closed',
      entryDate: get('entryDate'),
      entryPrice: num('entryPrice'),
      quantity: num('quantity'),
      multiplier: num('multiplier'),
      stopLoss: num('stopLoss'),
      takeProfit: num('takeProfit'),
      exitDate: get('exitDate'),
      exitPrice: num('exitPrice'),
      commission: num('commission') || 0,
      fees: num('fees') || 0,
      playbookId: get('playbookId'),
      rulesFollowed,
      setup: get('setup'),
      marketCondition: get('marketCondition'),
      timeframe: get('timeframe'),
      tags,
      mae: num('mae'),
      mfe: num('mfe'),
      mistakes,
      emotionBefore: get('emotionBefore'),
      emotionDuring: get('emotionDuring'),
      confidence: num('confidence'),
      planFollowed: get('planFollowed'),
      thesis: get('thesis'),
      notes: get('notes'),
      lessons: get('lessons'),
      screenshots,
      createdAt: get('id') ? undefined : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Auto-detect a futures contract from the symbol and prefill its point value.
  function applyFuturesAutofill() {
    const f = document.getElementById('trade-form');
    const symEl = f.querySelector('[name="symbol"]');
    const multEl = f.querySelector('[name="multiplier"]');
    const acEl = f.querySelector('[name="assetClass"]');
    const hint = document.getElementById('mult-hint');
    const fm = UTIL.futuresMultiplier(symEl.value);
    if (fm) {
      if (!multEl.value || multEl.dataset.auto === '1') {
        multEl.value = fm.mult;
        multEl.dataset.auto = '1';
        if (!acEl.value || acEl.value === 'stock') acEl.value = 'futures';
      }
      hint.textContent = `${fm.name} · $${fm.mult}/pt`;
      hint.classList.add('on');
    } else {
      hint.textContent = '';
      hint.classList.remove('on');
      if (multEl.dataset.auto === '1') { multEl.value = ''; delete multEl.dataset.auto; }
    }
    updateLiveStats();
  }

  function updateLiveStats() {
    const t = readTradeForm();
    const settings = STORAGE.getSettings();
    const pnl = UTIL.calcPnL(t);
    const r   = UTIL.calcRMultiple(t);
    const rr  = UTIL.calcRiskReward(t);
    const pos = UTIL.calcPositionValue(t);
    const risk = UTIL.calcRiskDollars(t);
    const pnlPct = settings.initialBalance ? (pnl / (settings.initialBalance + 0)) * 100 : 0;

    const set = (id, val, cls) => {
      const el = document.getElementById(id);
      el.textContent = val;
      if (cls !== undefined) el.className = cls;
    };
    set('live-pnl', UTIL.fmtMoney(pnl, {alwaysSign:true}), UTIL.pnlClass(pnl));
    set('live-pnl-pct', UTIL.fmtPct(pnlPct, 2, {alwaysSign:true}), UTIL.pnlClass(pnl));
    set('live-r', r !== null ? UTIL.fmtR(r) : '—', r !== null ? UTIL.pnlClass(r) : '');
    set('live-rr', rr !== null ? `1 : ${rr.toFixed(2)}` : '1 : —');
    set('live-position', UTIL.fmtMoney(pos));
    set('live-risk', UTIL.fmtMoney(risk));
  }

  function saveTrade(e) {
    e.preventDefault();
    const t = readTradeForm();

    if (!t.symbol || !t.entryPrice || !t.quantity || !t.entryDate) {
      UTIL.toast('Please fill in all required fields.', 'error');
      return;
    }
    if (t.status === 'closed' && (!t.exitPrice || !t.exitDate)) {
      UTIL.toast('Closed trades need an exit price and date.', 'error');
      return;
    }

    const trades = STORAGE.getTrades();
    const idx = trades.findIndex(x => x.id === t.id);
    const isUpdate = idx >= 0;
    if (isUpdate) { t.createdAt = trades[idx].createdAt; trades[idx] = t; }
    else trades.push(t);

    try {
      STORAGE.saveTrades(trades);
    } catch (err) {
      const quota = err && (err.name === 'QuotaExceededError' || /quota|exceeded/i.test(err.message || ''));
      UTIL.toast(quota
        ? 'Storage full — your images are too large to save. Remove a screenshot or two, or export a JSON backup and clear old trades.'
        : 'Could not save: ' + (err.message || err), 'error');
      return;
    }
    UTIL.toast(isUpdate ? 'Trade updated.' : 'Trade saved.', 'success');
    resetTradeForm();
    navigate('trades');
  }

  function resetTradeForm() {
    const f = document.getElementById('trade-form');
    f.reset();
    f.querySelector('[name="id"]').value = '';
    f.querySelector('[name="entryDate"]').value = UTIL.localDatetimeNow();
    document.getElementById('conf-val').value = 5;
    const multEl = f.querySelector('[name="multiplier"]'); if (multEl) delete multEl.dataset.auto;
    const mh = document.getElementById('mult-hint'); if (mh) { mh.textContent = ''; mh.classList.remove('on'); }
    formScreenshots = [];
    renderThumbs();
    renderPlaybookRules();
    document.querySelector('.trade-form .section-title').scrollIntoView({ block: 'nearest' });
    updateLiveStats();
    toggleExitSection();
  }

  function toggleExitSection() {
    const status = document.getElementById('trade-status').value;
    document.getElementById('exit-section').style.opacity = status === 'open' ? '0.5' : '1';
  }

  function loadTradeIntoForm(id) {
    const t = STORAGE.getTrades().find(x => x.id === id);
    if (!t) return;
    navigate('new-trade');
    const f = document.getElementById('trade-form');
    f.reset();

    const setVal = (name, val) => { const el = f.querySelector(`[name="${name}"]`); if (el) el.value = val ?? ''; };
    setVal('id', t.id);
    setVal('symbol', t.symbol);
    setVal('assetClass', t.assetClass);
    setVal('status', t.status);
    setVal('entryDate', UTIL.isoToLocalDatetime(t.entryDate));
    setVal('entryPrice', t.entryPrice);
    setVal('quantity', t.quantity);
    setVal('multiplier', t.multiplier);
    setVal('stopLoss', t.stopLoss);
    setVal('takeProfit', t.takeProfit);
    setVal('exitDate', UTIL.isoToLocalDatetime(t.exitDate));
    setVal('exitPrice', t.exitPrice);
    setVal('commission', t.commission);
    setVal('fees', t.fees);
    setVal('setup', t.setup);
    setVal('marketCondition', t.marketCondition);
    setVal('timeframe', t.timeframe);
    setVal('tags', (t.tags || []).join(', '));
    setVal('mae', t.mae);
    setVal('mfe', t.mfe);
    setVal('emotionBefore', t.emotionBefore);
    setVal('emotionDuring', t.emotionDuring);
    setVal('confidence', t.confidence || 5);
    setVal('planFollowed', t.planFollowed);
    setVal('thesis', t.thesis);
    setVal('notes', t.notes);
    setVal('lessons', t.lessons);
    formScreenshots = (t.screenshots || []).slice();
    renderThumbs();

    f.querySelector(`[name="direction"][value="${t.direction}"]`).checked = true;
    document.getElementById('conf-val').value = t.confidence || 5;
    f.querySelectorAll('input[name="mistakes"]').forEach(c => c.checked = (t.mistakes || []).includes(c.value));

    // Playbook + rule adherence
    refreshPlaybookSelect();
    setVal('playbookId', t.playbookId);
    renderPlaybookRules();
    (t.rulesFollowed || []).forEach(i => {
      const cb = f.querySelector(`input[name="rulesFollowed"][value="${i}"]`);
      if (cb) cb.checked = true;
    });
    updateAdherence();

    applyFuturesAutofill();
    updateLiveStats();
    toggleExitSection();
    UTIL.toast('Editing trade — make changes and save.', 'info');
  }

  // ============ ALL TRADES TABLE ============
  function getFilteredTrades() {
    let trades = STORAGE.getTrades().map(UTIL.enrich);
    const f = state.filters;

    if (f.search) {
      const q = f.search.toLowerCase();
      trades = trades.filter(t =>
        (t.symbol || '').toLowerCase().includes(q) ||
        (t.setup || '').toLowerCase().includes(q) ||
        (t.tags || []).some(tag => tag.toLowerCase().includes(q))
      );
    }
    if (f.status)    trades = trades.filter(t => t.status === f.status);
    if (f.direction) trades = trades.filter(t => t.direction === f.direction);
    if (f.outcome)   trades = trades.filter(t => t.outcome === f.outcome);
    if (f.setup)     trades = trades.filter(t => (t.setup || 'Untagged') === f.setup);

    const dir = state.sortDir === 'asc' ? 1 : -1;
    trades.sort((a, b) => {
      let av = a[state.sortKey], bv = b[state.sortKey];
      if (state.sortKey === 'entryDate' || state.sortKey === 'exitDate') {
        av = new Date(av || 0).getTime(); bv = new Date(bv || 0).getTime();
      }
      if (av === null || av === undefined || isNaN(av)) av = -Infinity;
      if (bv === null || bv === undefined || isNaN(bv)) bv = -Infinity;
      if (typeof av === 'string') return av.localeCompare(bv) * dir;
      return (av - bv) * dir;
    });
    return trades;
  }

  function renderTradesTable() {
    refreshSetupFilter();
    const trades = getFilteredTrades();
    const tbody = document.getElementById('trades-tbody');
    const empty = document.getElementById('trades-empty');
    const table = document.getElementById('trades-table');

    if (!STORAGE.getTrades().length) {
      table.style.display = 'none';
      empty.classList.remove('hidden');
      return;
    }
    table.style.display = '';
    empty.classList.add('hidden');

    tbody.innerHTML = trades.map(t => `
      <tr data-trade-id="${t.id}">
        <td class="mono">${UTIL.fmtDateShort(t.entryDate)}</td>
        <td><strong>${UTIL.escapeHtml(t.symbol)}</strong></td>
        <td><span class="dir-pill ${t.direction}">${t.direction === 'long' ? 'LONG' : 'SHORT'}</span></td>
        <td>${UTIL.escapeHtml(t.setup || '—')}</td>
        <td class="mono">${t.entryPrice ?? '—'}</td>
        <td class="mono">${t.exitPrice ?? '—'}</td>
        <td class="mono">${UTIL.fmtNum(t.quantity, 0)}</td>
        <td class="mono ${UTIL.pnlClass(t.pnl)}">${t.status === 'closed' ? UTIL.fmtMoney(t.pnl, {alwaysSign:true}) : '—'}</td>
        <td class="mono ${t.rMultiple !== null ? UTIL.pnlClass(t.rMultiple) : ''}">${t.rMultiple !== null ? UTIL.fmtR(t.rMultiple) : '—'}</td>
        <td class="mono">${t.holdMinutes !== null ? UTIL.fmtHoldTime(t.holdMinutes) : '—'}</td>
        <td><span class="status-pill ${t.status}">${t.status}</span></td>
        <td><button class="btn-icon" data-edit="${t.id}" title="Edit">${ICON('edit')}</button></td>
      </tr>
    `).join('');

    // update sort indicators
    table.querySelectorAll('th[data-sort]').forEach(th => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.sort === state.sortKey) {
        th.classList.add(state.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });

    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', (e) => {
        if (e.target.closest('[data-edit]')) return;
        openTradeDetail(tr.dataset.tradeId);
      });
    });
    tbody.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); loadTradeIntoForm(btn.dataset.edit); });
    });
  }

  function refreshSetupFilter() {
    const setups = [...new Set(STORAGE.getTrades().map(t => t.setup || 'Untagged'))];
    const sel = document.getElementById('filter-setup');
    const cur = sel.value;
    sel.innerHTML = '<option value="">All Setups</option>' +
      setups.map(s => `<option value="${UTIL.escapeHtml(s)}">${UTIL.escapeHtml(s)}</option>`).join('');
    sel.value = cur;
  }

  // ============ TRADE DETAIL MODAL ============
  function openTradeDetail(id) {
    const t = STORAGE.getTrades().find(x => x.id === id);
    if (!t) return;
    const e = UTIL.enrich(t);

    const EMOTION_LABELS = {
      calm:'Calm & Focused', confident:'Confident', neutral:'Neutral', anxious:'Anxious',
      excited:'Excited', fearful:'Fearful', greedy:'Greedy', frustrated:'Frustrated',
      bored:'Bored', tired:'Tired', hopeful:'Hopeful', panicked:'Panicked',
    };
    const MISTAKE_LABELS = {
      'moved-stop':'Moved stop loss', 'no-plan':'No clear plan', 'oversized':'Oversized position',
      'undersized':'Undersized position', 'fomo':'FOMO entry', 'revenge':'Revenge trade',
      'early-exit':'Exited too early', 'late-exit':'Held too long', 'overtraded':'Overtraded',
      'chased':'Chased entry', 'ignored-plan':'Ignored trade plan', 'counter-trend':'Fought the trend',
    };

    const detail = (label, value, cls = '') =>
      `<div><div class="detail-label">${label}</div><div class="detail-value ${cls}">${value}</div></div>`;

    let html = `<div class="trade-detail-grid">
      ${detail('Symbol', UTIL.escapeHtml(t.symbol) + ` <span class="dir-pill ${t.direction}">${t.direction.toUpperCase()}</span>`, 'text')}
      ${detail('Status', `<span class="status-pill ${t.status}">${t.status}</span>`, 'text')}
      ${detail('Net P&L', UTIL.fmtMoney(e.pnl, {alwaysSign:true}), UTIL.pnlClass(e.pnl))}
      ${detail('R-Multiple', e.rMultiple !== null ? UTIL.fmtR(e.rMultiple) : '—', e.rMultiple !== null ? UTIL.pnlClass(e.rMultiple) : '')}
      ${detail('Entry', `${t.entryPrice} × ${UTIL.fmtNum(t.quantity,0)}` + (UTIL.getMultiplier(t) > 1 ? ` × $${UTIL.getMultiplier(t)}/pt` : ''))}
      ${detail('Exit', t.exitPrice ? `${t.exitPrice}` : '—')}
      ${detail('Entry Date', UTIL.fmtDateTime(t.entryDate))}
      ${detail('Exit Date', t.exitDate ? UTIL.fmtDateTime(t.exitDate) : '—')}
      ${detail('Stop Loss', t.stopLoss ?? '—')}
      ${detail('Take Profit', t.takeProfit ?? '—')}
      ${detail('Risk:Reward', e.riskReward !== null ? `1 : ${e.riskReward.toFixed(2)}` : '—')}
      ${detail('Hold Time', e.holdMinutes !== null ? UTIL.fmtHoldTime(e.holdMinutes) : '—')}
      ${detail('Position Value', UTIL.fmtMoney(e.positionValue))}
      ${detail('Risk $', UTIL.fmtMoney(e.riskDollars))}
      ${detail('Setup', UTIL.escapeHtml(t.setup || '—'), 'text')}
      ${detail('Timeframe', t.timeframe || '—')}
      ${detail('Commission+Fees', UTIL.fmtMoney((t.commission||0)+(t.fees||0)))}
      ${detail('Confidence', t.confidence ? `${t.confidence}/10` : '—')}
    </div>`;

    if (t.tags && t.tags.length) {
      html += `<div class="trade-detail-section"><h3>Tags</h3>
        <div class="chip-group">${t.tags.map(tag => `<span class="chip" style="cursor:default">${UTIL.escapeHtml(tag)}</span>`).join('')}</div></div>`;
    }

    if (t.mistakes && t.mistakes.length) {
      html += `<div class="trade-detail-section"><h3>Mistakes</h3>
        <div class="chip-group">${t.mistakes.map(m => `<span class="chip" style="cursor:default;background:var(--warn-soft);border-color:var(--warn);color:var(--warn)">${MISTAKE_LABELS[m] || m}</span>`).join('')}</div></div>`;
    }

    const psych = [];
    if (t.emotionBefore) psych.push(`Before: <strong>${EMOTION_LABELS[t.emotionBefore] || t.emotionBefore}</strong>`);
    if (t.emotionDuring) psych.push(`During: <strong>${EMOTION_LABELS[t.emotionDuring] || t.emotionDuring}</strong>`);
    if (t.planFollowed)  psych.push(`Plan followed: <strong>${t.planFollowed}</strong>`);
    if (psych.length) {
      html += `<div class="trade-detail-section"><h3>Psychology</h3><p>${psych.join(' &nbsp;·&nbsp; ')}</p></div>`;
    }

    if (t.thesis)  html += `<div class="trade-detail-section"><h3>Pre-Trade Thesis</h3><p>${UTIL.escapeHtml(t.thesis)}</p></div>`;
    if (t.notes)   html += `<div class="trade-detail-section"><h3>Post-Trade Analysis</h3><p>${UTIL.escapeHtml(t.notes)}</p></div>`;
    if (t.lessons) html += `<div class="trade-detail-section"><h3>Lessons Learned</h3><p>${UTIL.escapeHtml(t.lessons)}</p></div>`;

    if (t.screenshots && t.screenshots.length) {
      html += `<div class="trade-detail-section"><h3>Screenshots (${t.screenshots.length})</h3>
        <div class="detail-shots">${t.screenshots.map((u, i) =>
          `<img src="${u}" data-detail-shot="${i}" alt="screenshot ${i + 1}" />`).join('')}</div></div>`;
    }

    html += `<div class="modal-actions">
      <button class="btn btn-danger" data-delete-trade="${t.id}">Delete</button>
      <button class="btn btn-ghost" data-edit-trade="${t.id}">Edit</button>
      <button class="btn btn-primary" data-close-modal>Close</button>
    </div>`;

    openModal(t.symbol + ' · ' + UTIL.fmtDate(t.entryDate), html);

    document.querySelectorAll('#modal-content .detail-shots img').forEach(img =>
      img.addEventListener('click', () => openLightbox(img.src)));
    document.querySelector('[data-edit-trade]').addEventListener('click', () => { closeModal(); loadTradeIntoForm(id); });
    document.querySelector('[data-delete-trade]').addEventListener('click', () => {
      if (confirm('Delete this trade permanently?')) {
        STORAGE.saveTrades(STORAGE.getTrades().filter(x => x.id !== id));
        closeModal();
        UTIL.toast('Trade deleted.', 'success');
        renderTradesTable();
      }
    });
  }

  // ============ ANALYTICS ============
  function renderAnalytics() {
    const settings = STORAGE.getSettings();
    const trades = periodTrades();
    const s = STATS.summarize(trades, settings);

    const grid = document.getElementById('analytics-stats');
    grid.innerHTML = [
      statCard('Sharpe Ratio', UTIL.fmtNum(s.sharpe, 2), 'Risk-adjusted return', 'accent'),
      statCard('Sortino Ratio', UTIL.fmtNum(s.sortino, 2), 'Downside risk-adjusted'),
      statCard('Recovery Factor', s.recoveryFactor === Infinity ? '∞' : UTIL.fmtNum(s.recoveryFactor, 2), 'Net P&L / Max DD'),
      statCard('Kelly %', UTIL.fmtPct(s.kelly, 1), 'Optimal position size'),
      statCard('Avg Win', `<span class="profit">${UTIL.fmtMoney(s.avgWin)}</span>`, `Largest ${UTIL.fmtMoney(s.largestWin)}`),
      statCard('Avg Loss', `<span class="loss">${UTIL.fmtMoney(-s.avgLoss)}</span>`, `Largest ${UTIL.fmtMoney(s.largestLoss)}`),
      statCard('Win/Loss Ratio', s.winLossRatio === Infinity ? '∞' : UTIL.fmtNum(s.winLossRatio, 2), 'Avg win ÷ avg loss'),
      statCard('Best R / Worst R', `${UTIL.fmtR(s.bestR)} / ${UTIL.fmtR(s.worstR)}`, 'Single-trade extremes'),
      statCard('Current Streak', `${s.currentStreak > 0 ? '+' : ''}${s.currentStreak}`, `Best +${s.bestWinStreak} / Worst -${s.worstLossStreak}`, s.currentStreak > 0 ? 'profit' : (s.currentStreak < 0 ? 'loss' : '')),
      statCard('Avg Hold (Win)', UTIL.fmtHoldTime(s.avgHoldWinMinutes), 'Time in winning trades'),
      statCard('Avg Hold (Loss)', UTIL.fmtHoldTime(s.avgHoldLossMinutes), 'Time in losing trades'),
      statCard('Total Costs', `<span class="loss">${UTIL.fmtMoney(-s.totalCommissions)}</span>`, 'Commissions + fees'),
    ].join('');

    CHARTS.renderRDist('chart-r-dist', STATS.rDistribution(trades));

    const setups = STATS.bySetup(trades).filter(x => x.trades > 0);
    CHARTS.renderWinRateBars('chart-setup-winrate', setups);
    CHARTS.renderBarsByKey('chart-pnl-setup', setups, 'netPnl', { tickFormatter: UTIL.fmtMoneyCompact });

    const symbols = STATS.bySymbol(trades).filter(x => x.trades > 0).slice(0, 12);
    CHARTS.renderBarsByKey('chart-pnl-symbol', symbols, 'netPnl', { tickFormatter: UTIL.fmtMoneyCompact });

    CHARTS.renderBarsByKey('chart-pnl-dow', STATS.byDayOfWeek(trades), 'netPnl', { tickFormatter: UTIL.fmtMoneyCompact });
    CHARTS.renderBarsByKey('chart-pnl-hour', STATS.byHour(trades).filter(h => h.trades > 0), 'netPnl', { tickFormatter: UTIL.fmtMoneyCompact });

    CHARTS.renderHoldVsPnL('chart-hold-pnl', trades);
    CHARTS.renderMfeMae('chart-mfe-mae', trades);

    renderMistakesTable(trades);
  }

  function renderMistakesTable(trades) {
    const MISTAKE_LABELS = {
      'moved-stop':'Moved stop loss', 'no-plan':'No clear plan', 'oversized':'Oversized position',
      'undersized':'Undersized position', 'fomo':'FOMO entry', 'revenge':'Revenge trade',
      'early-exit':'Exited too early', 'late-exit':'Held too long', 'overtraded':'Overtraded',
      'chased':'Chased entry', 'ignored-plan':'Ignored trade plan', 'counter-trend':'Fought the trend',
    };
    const stats = STATS.mistakeStats(trades);
    const el = document.getElementById('mistakes-table');
    if (!stats.length) {
      el.innerHTML = `<div class="muted" style="padding:20px 0;text-align:center;">No mistakes logged — clean trading! Or start tagging mistakes on your trades.</div>`;
      return;
    }
    el.innerHTML = `<table class="mistakes-table-el">
      <thead><tr><th>Mistake</th><th>Frequency</th><th>Total P&L Impact</th><th>Avg per Occurrence</th></tr></thead>
      <tbody>${stats.map(m => `<tr>
        <td>${MISTAKE_LABELS[m.key] || m.key}</td>
        <td class="mono">${m.count}×</td>
        <td class="mono ${UTIL.pnlClass(m.netPnl)}">${UTIL.fmtMoney(m.netPnl, {alwaysSign:true})}</td>
        <td class="mono ${UTIL.pnlClass(m.avgImpact)}">${UTIL.fmtMoney(m.avgImpact, {alwaysSign:true})}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  // ============ JOURNAL ============
  function renderJournal() {
    const dateEl = document.getElementById('journal-date');
    if (!dateEl.value) {
      const d = new Date();
      dateEl.value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    loadJournalEntry(dateEl.value);
    renderJournalList();
  }

  function loadJournalEntry(date) {
    const journal = STORAGE.getJournal();
    const entry = journal[date] || {};
    const f = document.getElementById('journal-form');
    f.querySelector('[name="prep"]').value = entry.prep || '';
    f.querySelector('[name="mood"]').value = entry.mood || 5;
    f.querySelector('[name="sleep"]').value = entry.sleep || '';
    f.querySelector('[name="energy"]').value = entry.energy || 5;
    f.querySelector('[name="routine"]').value = entry.routine || '';
    f.querySelector('[name="wins"]').value = entry.wins || '';
    f.querySelector('[name="losses"]').value = entry.losses || '';
    f.querySelector('[name="adjustments"]').value = entry.adjustments || '';
    document.getElementById('mood-val').value = entry.mood || 5;
    document.getElementById('energy-val').value = entry.energy || 5;
  }

  function saveJournalEntry(e) {
    e.preventDefault();
    const date = document.getElementById('journal-date').value;
    if (!date) { UTIL.toast('Pick a date first.', 'error'); return; }
    const f = document.getElementById('journal-form');
    const fd = new FormData(f);
    const journal = STORAGE.getJournal();
    journal[date] = {
      prep: fd.get('prep'),
      mood: Number(fd.get('mood')),
      sleep: fd.get('sleep') ? Number(fd.get('sleep')) : null,
      energy: Number(fd.get('energy')),
      routine: fd.get('routine'),
      wins: fd.get('wins'),
      losses: fd.get('losses'),
      adjustments: fd.get('adjustments'),
      updatedAt: new Date().toISOString(),
    };
    STORAGE.saveJournal(journal);
    UTIL.toast('Journal entry saved.', 'success');
    renderJournalList();
  }

  function renderJournalList() {
    const journal = STORAGE.getJournal();
    const dates = Object.keys(journal).sort((a, b) => b.localeCompare(a));
    const el = document.getElementById('journal-entries-list');
    if (!dates.length) {
      el.innerHTML = `<div class="muted" style="padding:20px 0;text-align:center;">No journal entries yet.</div>`;
      return;
    }
    el.innerHTML = dates.map(d => {
      const e = journal[d];
      const preview = [e.prep, e.wins, e.losses, e.adjustments].filter(Boolean).join(' · ') || 'No notes';
      return `<div class="journal-entry" data-journal-date="${d}">
        <div class="journal-entry-date">${UTIL.fmtDate(d)} &nbsp;<span class="muted" style="font-weight:400">Mood ${e.mood||'—'}/10 · Energy ${e.energy||'—'}/10${e.sleep?` · ${e.sleep}h sleep`:''}</span></div>
        <div class="journal-entry-preview">${UTIL.escapeHtml(preview)}</div>
      </div>`;
    }).join('');
    el.querySelectorAll('.journal-entry').forEach(row =>
      row.addEventListener('click', () => {
        document.getElementById('journal-date').value = row.dataset.journalDate;
        loadJournalEntry(row.dataset.journalDate);
        document.getElementById('journal-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
  }

  // ============ SETTINGS ============
  function loadSettings() {
    const s = STORAGE.getSettings();
    const f = document.getElementById('settings-form');
    f.querySelector('[name="initialBalance"]').value = s.initialBalance ?? '';
    f.querySelector('[name="currency"]').value = s.currency ?? '$';
    f.querySelector('[name="defaultRiskPct"]').value = s.defaultRiskPct ?? '';
    f.querySelector('[name="commissionPerContract"]').value = s.commissionPerContract || '';
    f.querySelector('[name="tradingStyle"]').value = s.tradingStyle ?? '';
    loadAIKeyField();
  }

  function saveSettings(e) {
    e.preventDefault();
    const f = document.getElementById('settings-form');
    const fd = new FormData(f);
    STORAGE.saveSettings({
      initialBalance: Number(fd.get('initialBalance')) || 0,
      currency: (fd.get('currency') || '$').slice(0, 3),
      defaultRiskPct: Number(fd.get('defaultRiskPct')) || 0,
      commissionPerContract: Number(fd.get('commissionPerContract')) || 0,
      tradingStyle: fd.get('tradingStyle') || '',
    });
    UTIL.toast('Settings saved.', 'success');
    renderDashboard();
  }

  // ============ EXPORT / IMPORT ============
  function exportCSV() {
    const trades = STORAGE.getTrades().map(UTIL.enrich);
    if (!trades.length) { UTIL.toast('No trades to export.', 'error'); return; }
    const cols = ['symbol','direction','status','assetClass','entryDate','entryPrice','quantity','stopLoss','takeProfit','exitDate','exitPrice','commission','fees','pnl','rMultiple','riskReward','holdMinutes','setup','marketCondition','timeframe','tags','mae','mfe','mistakes','emotionBefore','emotionDuring','confidence','planFollowed','thesis','notes','lessons'];
    const esc = v => {
      if (v === null || v === undefined) return '';
      if (Array.isArray(v)) v = v.join('; ');
      v = String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const rows = [cols.join(',')];
    for (const t of trades) rows.push(cols.map(c => esc(t[c])).join(','));
    UTIL.downloadFile(`trades_${new Date().toISOString().slice(0,10)}.csv`, rows.join('\n'), 'text/csv');
    UTIL.toast('CSV exported.', 'success');
  }

  function exportJSON() {
    UTIL.downloadFile(`trading_journal_${new Date().toISOString().slice(0,10)}.json`,
      JSON.stringify(STORAGE.exportAll(), null, 2), 'application/json');
    UTIL.toast('Backup exported.', 'success');
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        STORAGE.importAll(data);
        UTIL.toast('Data imported successfully.', 'success');
        loadSettings();
        navigate('dashboard');
      } catch (err) {
        UTIL.toast('Import failed: invalid file.', 'error');
      }
    };
    reader.readAsText(file);
  }

  // ---- CSV trade import (robust: auto delimiter, header detection, fuzzy columns) ----
  const CSV_FIELD_ALIASES = {
    symbol:     ['symbol','ticker','instrument','contract','stock','pair','market','security','sym','asset','underlying','name'],
    quantity:   ['quantity','qty','size','shares','contracts','volume','units','filledqty','filled qty','position size','possize','lots','quantityfilled','qtyfilled','execqty','executedqty','filled'],
    entryPrice: ['entryprice','entry price','avgentry','average entry price','avg entry','buy price','open price','pricein','price in','avg fill price','avgfillprice','fill price','fillprice','executionprice','exec price','avg price','average price','openprice','entry','cost','price','open'],
    exitPrice:  ['exitprice','exit price','sell price','close price','priceout','price out','avg exit','average exit price','closeprice','exit','close'],
    entryDate:  ['entrydate','entry date','entrytime','entry time','opendate','open date','opentime','open time','datetime','date/time','trade date','tradedate','executed','execution time','exectime','filledtime','filled time','opened','placed','timestamp','date','time'],
    exitDate:   ['exitdate','exit date','exittime','exit time','closedate','close date','closetime','close time','closed'],
    direction:  ['direction','side','action','b/s','buy/sell','buysell','position','long/short','longshort','l/s','ordertype','order type'],
    stopLoss:   ['stoploss','stop loss','stop','sl','stop price'],
    takeProfit: ['takeprofit','take profit','target','tp','limit','limit price'],
    commission: ['commission','commissions','comm'],
    fees:       ['fees','fee','slippage'],
    assetClass: ['assetclass','asset class','asset type','assettype','securitytype','producttype','type','class'],
    multiplier: ['multiplier','contractmultiplier','contract multiplier','pointvalue','point value','bigpointvalue','contractsize','contract size','pv'],
    setup:      ['setup','strategy','playbook'],
    tags:       ['tags','tag','labels','label'],
    duration:   ['duration','holdtime','hold time','time in trade','timeintrade','holdingperiod','holding period','elapsed','timeheld'],
    notes:      ['notes','note','comment','comments','memo'],
    pnl:        ['pnl','p/l','p&l','pl','profit','profit/loss','profitloss','net p/l','netpl','realized p/l','realizedpnl','realized','gross p/l','gain'],
  };

  function detectDelimiter(text) {
    const firstLine = (text.split(/\r?\n/).find(l => l.trim() !== '') || '');
    const cands = [',', ';', '\t', '|'];
    let best = ',', bestN = 0;
    for (const d of cands) {
      const n = firstLine.split(d).length - 1;
      if (n > bestN) { bestN = n; best = d; }
    }
    return best;
  }

  function parseCSV(text, delim) {
    text = text.replace(/^﻿/, '');
    const D = delim || ',';
    const rows = []; let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i + 1];
      if (inQ) {
        if (ch === '"' && next === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === D) { row.push(cur); cur = ''; }
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else cur += ch;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  function resolveColumns(cells) {
    const norm = s => String(s == null ? '' : s).trim().toLowerCase();
    const comp = s => norm(s).replace(/[^a-z0-9]/g, '');
    const heads = cells.map((c, i) => ({ i, n: norm(c), c: comp(c) }));
    const used = new Set(), map = {};
    // Most specific / required fields first so they claim their columns.
    const order = ['symbol', 'quantity', 'entryDate', 'exitDate', 'entryPrice', 'exitPrice', 'direction', 'stopLoss', 'takeProfit', 'commission', 'fees', 'assetClass', 'multiplier', 'setup', 'tags', 'duration', 'notes', 'pnl'];
    for (const field of order) {
      let best = null, bestScore = 0;
      for (const h of heads) {
        if (used.has(h.i) || !h.c) continue;
        let score = 0;
        for (const a of CSV_FIELD_ALIASES[field]) {
          const an = a.toLowerCase(), ac = an.replace(/[^a-z0-9]/g, '');
          if (h.n === an || h.c === ac) score = Math.max(score, 4);
          else if (h.c.includes(ac) && ac.length >= 3) score = Math.max(score, 2);
          else if (ac.includes(h.c) && h.c.length >= 3) score = Math.max(score, 1);
        }
        if (score > bestScore) { bestScore = score; best = h; }
      }
      if (best) { map[field] = best.i; used.add(best.i); }
    }
    return map;
  }

  function findHeaderRow(rows) {
    const limit = Math.min(rows.length, 25);
    for (let i = 0; i < limit; i++) {
      const m = resolveColumns(rows[i]);
      if (m.symbol != null && m.entryPrice != null && m.quantity != null) return i;
    }
    let bestI = 0, bestC = -1;
    for (let i = 0; i < limit; i++) {
      const c = Object.keys(resolveColumns(rows[i])).length;
      if (c > bestC) { bestC = c; bestI = i; }
    }
    return bestI;
  }

  // Find a single column index in a header row by a list of aliases (exact/compact/contains).
  function findHeaderCol(cells, aliases) {
    const heads = cells.map((c, i) => { const n = String(c == null ? '' : c).trim().toLowerCase(); return { i, n, c: n.replace(/[^a-z0-9]/g, '') }; });
    let best = null, bestScore = 0;
    for (const h of heads) {
      if (!h.c) continue;
      let score = 0;
      for (const a of aliases) {
        const an = a.toLowerCase(), ac = an.replace(/[^a-z0-9]/g, '');
        if (h.n === an || h.c === ac) score = Math.max(score, 4);
        else if (h.c.includes(ac) && ac.length >= 3) score = Math.max(score, 2);
      }
      if (score > bestScore) { bestScore = score; best = h; }
    }
    return best ? best.i : null;
  }

  function makeNum(decimalComma) {
    return (v) => {
      if (v == null) return null;
      let str = String(v).trim();
      if (!str) return null;
      str = str.replace(/^[^\d(.\-]+/, ''); // strip a leading currency symbol, so "$(96.00)" and "$5" both parse
      let neg = false;
      if (/^\(.*\)$/.test(str)) { neg = true; str = str.slice(1, -1); }
      if (decimalComma) str = str.replace(/\./g, '').replace(/,/g, '.');
      str = str.replace(/[^0-9.\-]/g, '');
      if (!str || str === '-' || str === '.') return null;
      const n = Number(str);
      if (isNaN(n)) return null;
      return neg ? -Math.abs(n) : n;
    };
  }

  function csvDiagnostic(headerCells, delim, map) {
    const delimName = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' }[delim] || delim;
    const need = [['symbol', 'Symbol'], ['entryPrice', 'Entry price'], ['quantity', 'Quantity']];
    const missing = need.filter(([f]) => map[f] == null).map(([, l]) => l);
    const found = headerCells.map(h => String(h).trim()).filter(Boolean);
    let html = `<p>I couldn't match the required columns in your file, so no trades were imported.</p>`;
    html += `<div class="trade-detail-section"><h3>What I detected</h3>`;
    html += `<p><strong>Delimiter:</strong> ${delimName}<br><strong>Column headers:</strong></p>`;
    html += `<div class="chip-group">${found.length ? found.map(h => `<span class="chip" style="cursor:default">${UTIL.escapeHtml(h)}</span>`).join('') : '<em>none found</em>'}</div></div>`;
    html += `<div class="trade-detail-section"><h3>Couldn't find</h3><p>A column for: <strong>${missing.join(', ') || '—'}</strong>.</p>
      <p class="muted" style="font-size:12.5px">The importer needs at least a <strong>symbol</strong>, an <strong>entry price</strong>, and a <strong>quantity</strong> column. Rename those headers in your CSV to match (e.g. <code>symbol</code>, <code>entryPrice</code>, <code>quantity</code>) and re-import, or download the CSV Template for the exact format.</p></div>`;
    html += `<div class="modal-actions"><button class="btn btn-primary" data-close-modal>Got it</button></div>`;
    openModal('CSV import — no trades detected', html);
    document.querySelectorAll('#modal-content [data-close-modal]').forEach(b => b.addEventListener('click', closeModal));
  }

  // Fingerprint a trade so re-importing an updated export only adds genuinely new rows.
  function tradeFingerprint(t) {
    return [
      String(t.symbol || '').toUpperCase(), t.direction || '',
      t.entryDate || '', t.exitDate || '',
      t.entryPrice, t.exitPrice, t.quantity,
    ].join('|');
  }

  // Build a full trade record from a core set of fields (defaults for everything else).
  function newTrade(f) {
    return {
      id: UTIL.uuid(),
      symbol: String(f.symbol || '').toUpperCase(),
      assetClass: f.assetClass, multiplier: f.multiplier != null ? f.multiplier : null, direction: f.direction,
      status: f.status || (f.exitPrice != null ? 'closed' : 'open'),
      entryDate: f.entryDate, entryPrice: f.entryPrice, quantity: f.quantity,
      stopLoss: f.stopLoss != null ? f.stopLoss : null, takeProfit: f.takeProfit != null ? f.takeProfit : null,
      exitDate: f.exitDate != null ? f.exitDate : null, exitPrice: f.exitPrice != null ? f.exitPrice : null,
      holdMinutes: f.holdMinutes != null ? f.holdMinutes : null,
      commission: f.commission || 0,
      fees: f.fees || 0,
      setup: f.setup != null ? f.setup : null,
      marketCondition: null, timeframe: null,
      tags: f.tags || [],
      mae: null, mfe: null, mistakes: [],
      emotionBefore: null, emotionDuring: null, confidence: null, planFollowed: null,
      thesis: null, notes: f.notes != null ? f.notes : null, lessons: null, screenshots: [],
      playbookId: null, rulesFollowed: [],
      account: f.account != null ? f.account : null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
  }

  // Raw-execution (fill) format, e.g. the NinjaTrader add-on: one row per fill, paired into
  // round-trip trades by UTIL.pairFills. opts.allowedAccounts (array) restricts which accounts
  // are imported; empty/absent = all. Returns { incoming, skipped, accounts } (accounts = every
  // account name seen, so the UI can offer a picker).
  function parseExecutionRows(rows, hIdx, num, parseDate, opts) {
    opts = opts || {};
    const allow = Array.isArray(opts.allowedAccounts) && opts.allowedAccounts.length
      ? new Set(opts.allowedAccounts.map(a => String(a).toLowerCase())) : null;
    const H = rows[hIdx];
    const at = (row, i) => (i != null && row[i] != null) ? (String(row[i]).trim() || null) : null;
    const idIdx    = findHeaderCol(H, ['executionid', 'execid', 'exec id', 'fillid', 'fill id']);
    const timeIdx  = findHeaderCol(H, ['time', 'datetime', 'date/time', 'timestamp', 'executed', 'exectime', 'fill time', 'date']);
    const symIdx   = findHeaderCol(H, ['symbol', 'instrument', 'masterinstrument', 'master instrument', 'ticker', 'contract']);
    const actIdx   = findHeaderCol(H, ['action', 'side', 'buy/sell', 'b/s', 'orderaction', 'order action']);
    const qtyIdx   = findHeaderCol(H, ['quantity', 'qty', 'size', 'contracts', 'filled', 'filledqty', 'filled qty']);
    const priceIdx = findHeaderCol(H, ['price', 'fillprice', 'fill price', 'avgprice', 'avg price', 'executionprice']);
    const commIdx  = findHeaderCol(H, ['commission', 'commissions', 'comm']);
    const acctIdx  = findHeaderCol(H, ['account', 'account name', 'accountname', 'acct']);
    const fills = [];
    const seenIds = new Set();
    const accounts = new Set();
    let skipped = 0;
    for (let r = hIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row.some(c => String(c).trim() !== '')) continue;
      const execId = at(row, idIdx);
      if (execId && seenIds.has(execId)) continue;   // duplicate fill line -> ignore (protects position math)
      const rawAct = (at(row, actIdx) || '').toLowerCase();
      const side = /buy|bought|cover|long/.test(rawAct) ? 'buy'
                 : /sell|sold|short/.test(rawAct) ? 'sell'
                 : (rawAct === 'b' ? 'buy' : rawAct === 's' ? 'sell' : null);
      const qty = Math.abs(num(at(row, qtyIdx)) || 0);
      const price = num(at(row, priceIdx));
      const time = parseDate(at(row, timeIdx));
      const symbol = (at(row, symIdx) || '').toUpperCase();
      const account = at(row, acctIdx);
      if (account) accounts.add(account);
      if (!symbol || !side || !qty || price == null || !time) { skipped++; continue; }
      if (allow && !allow.has(String(account || '').toLowerCase())) { continue; }  // not a selected account
      if (execId) seenIds.add(execId);
      fills.push({ time, symbol, action: side, quantity: qty, price, commission: num(at(row, commIdx)) || 0, account });
    }
    const incoming = UTIL.pairFills(fills).map(p => {
      const fm = UTIL.futuresMultiplier(p.symbol);
      // Broker reported no commission (common for prop accounts) -> apply the configured rate.
      let commission = p.commission;
      if (fm && (!commission || commission === 0) && p.status === 'closed') {
        const rate = commissionRateFor(fm.root);
        if (rate > 0) commission = Math.round(rate * p.quantity * 100) / 100;
      }
      return newTrade({
        symbol: p.symbol,
        assetClass: fm ? 'futures' : 'stock',
        multiplier: fm ? fm.mult : null,
        direction: p.direction, status: p.status,
        entryDate: p.entryDate, entryPrice: p.entryPrice, quantity: p.quantity,
        exitDate: p.exitDate, exitPrice: p.exitPrice,
        commission, account: p.account,
      });
    });
    return { incoming, skipped, accounts: [...accounts] };
  }

  function importCSV(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const res = ingestCSV(reader.result, { source: 'file' });
      if (res && (res.added || res.dupes)) navigate('trades');
    };
    reader.readAsText(file);
  }

  // Round-turn commission per contract for a futures root (e.g. 'MNQ').
  // Per-instrument rates (settings.commissionRates) win; commissionPerContract is the flat fallback.
  function commissionRateFor(root) {
    const s = STORAGE.getSettings();
    const rates = s.commissionRates || {};
    if (root && rates[root] != null && !isNaN(rates[root])) return Number(rates[root]);
    return Number(s.commissionPerContract) || 0;
  }

  // Typical Tradovate-style micro round-turn rates, used only to prefill the
  // commissions tool the first time — the user's saved rates always win.
  const COMMISSION_HINTS = { MNQ: 1.24, MES: 1.24, MYM: 1.24, M2K: 1.24, MGC: 1.40, SIL: 1.40, MCL: 1.40, MBT: 1.24 };

  // Parse CSV text into trades and merge them (de-duplicated) into storage.
  // opts.source: 'file' (toast + diagnostic modal) or 'silent' (return summary only, no UI).
  // Returns { added, dupes, skipped, errored } or null when nothing could be parsed.
  function ingestCSV(text, opts) {
    opts = opts || {};
    const loud = opts.source !== 'silent';
    try {
      const delim = detectDelimiter(text);
      const decimalComma = delim === ';';
      const rows = parseCSV(text, delim).filter(r => r.length && r.some(c => String(c).trim() !== ''));
      if (rows.length < 2) { if (loud) UTIL.toast('That file has no data rows.', 'error'); return null; }

      const hIdx = findHeaderRow(rows);
      const map = resolveColumns(rows[hIdx]);
      const num = makeNum(decimalComma);
      const parseDate = d => { if (!d) return null; const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt.toISOString(); };
      const cell = (row, field) => { const i = map[field]; if (i == null || row[i] == null) return null; const v = String(row[i]).trim(); return v === '' ? null : v; };

      // Buy/Sell-fill format (e.g. Tradovate): buyPrice + sellPrice + timestamps, no explicit entry/exit/direction.
      const buyIdx    = findHeaderCol(rows[hIdx], ['buyprice', 'buy price', 'boughtprice', 'bought price']);
      const sellIdx   = findHeaderCol(rows[hIdx], ['sellprice', 'sell price', 'soldprice', 'sold price']);
      const boughtIdx = findHeaderCol(rows[hIdx], ['boughttimestamp', 'bought timestamp', 'bought', 'buytime', 'buy time', 'buydate', 'bought date']);
      const soldIdx   = findHeaderCol(rows[hIdx], ['soldtimestamp', 'sold timestamp', 'sold', 'selltime', 'sell time', 'solddate', 'sold date']);
      const pnlIdx    = map.pnl != null ? map.pnl : findHeaderCol(rows[hIdx], ['pnl', 'p/l', 'p&l', 'realizedpnl', 'realized p/l', 'netpnl']);
      const fillFormat = buyIdx != null && sellIdx != null && (map.entryPrice == null || map.entryPrice === buyIdx);
      // Raw-execution format (NinjaTrader add-on): one row per fill, keyed by an executionId column.
      const execIdIdx = findHeaderCol(rows[hIdx], ['executionid', 'execid', 'exec id', 'fillid', 'fill id']);
      const actionColIdx = findHeaderCol(rows[hIdx], ['action', 'side', 'buy/sell', 'b/s', 'orderaction', 'order action']);
      const execFormat = !fillFormat && execIdIdx != null && actionColIdx != null;
      const rawAt = (row, i) => (i != null && row[i] != null) ? String(row[i]).trim() : null;

      const incoming = [];
      let skipped = 0, errored = 0, accounts = [];

      if (execFormat) {
        const r = parseExecutionRows(rows, hIdx, num, parseDate, { allowedAccounts: opts.allowedAccounts });
        incoming.push(...r.incoming);
        skipped = r.skipped;
        accounts = r.accounts;
      } else {
        for (let r = hIdx + 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row.some(c => String(c).trim() !== '')) continue; // blank line

          // Isolate each row: one malformed row must never abort the whole import.
          try {
            const symbol = cell(row, 'symbol');
            let quantity = num(cell(row, 'quantity'));
            const fm = UTIL.futuresMultiplier(symbol);
            let direction, entryPrice, exitPrice, entryDate, exitDate, stopLoss = null, takeProfit = null;
            let multiplier = num(cell(row, 'multiplier'));
            let assetClass = (cell(row, 'assetClass') || '').toLowerCase();

            if (fillFormat) {
              const buy = num(rawAt(row, buyIdx));
              const sell = num(rawAt(row, sellIdx));
              if (!symbol || buy == null || sell == null || quantity == null) { skipped++; continue; }
              quantity = Math.abs(quantity);
              const bt = parseDate(rawAt(row, boughtIdx));
              const st = parseDate(rawAt(row, soldIdx));
              // Direction is implicit in the timestamps: sold before bought = short.
              direction = (bt && st && new Date(bt) > new Date(st)) ? 'short' : 'long';
              entryPrice = direction === 'long' ? buy : sell;   // long: bought first; short: sold first
              exitPrice  = direction === 'long' ? sell : buy;
              entryDate  = direction === 'long' ? bt : st;
              exitDate   = direction === 'long' ? st : bt;
              // Derive the exact point value from the platform-computed P&L when available.
              if (multiplier == null) {
                const pnlVal = num(rawAt(row, pnlIdx));
                const denom = (sell - buy) * quantity;
                if (pnlVal != null && denom !== 0) {
                  const d = pnlVal / denom;
                  if (isFinite(d) && d > 0) multiplier = (fm && Math.abs(d - fm.mult) <= fm.mult * 0.02) ? fm.mult : Math.round(d * 1000) / 1000;
                }
                if (multiplier == null && fm) multiplier = fm.mult;
              }
              if (!assetClass) assetClass = fm ? 'futures' : 'stock';
            } else {
              entryPrice = num(cell(row, 'entryPrice'));
              if (!symbol || entryPrice == null || quantity == null) { skipped++; continue; }
              const dirRaw = (cell(row, 'direction') || '').toLowerCase();
              direction = 'long';
              if (/^s|sell|short|-/.test(dirRaw)) direction = 'short';
              else if (/^b|buy|long/.test(dirRaw)) direction = 'long';
              if (quantity < 0) direction = 'short';
              quantity = Math.abs(quantity);
              exitPrice = num(cell(row, 'exitPrice'));
              entryDate = parseDate(cell(row, 'entryDate'));
              exitDate = parseDate(cell(row, 'exitDate'));
              stopLoss = num(cell(row, 'stopLoss'));
              takeProfit = num(cell(row, 'takeProfit'));
              if (multiplier == null && fm && !['stock', 'forex', 'crypto', 'options'].includes(assetClass)) {
                multiplier = fm.mult;
                if (!assetClass) assetClass = 'futures';
              }
              if (!assetClass) assetClass = 'stock';
            }

            const tags = (cell(row, 'tags') || '').split(/[;|]/).map(s => s.trim()).filter(Boolean);
            // Hold time from a broker "duration" column when present (e.g. "2h 50min 40sec")
            const holdMinutes = UTIL.parseDuration(cell(row, 'duration'));
            // Commission: from the CSV if present, else apply the per-contract rate to futures
            const csvCommission = num(cell(row, 'commission'));
            const rtRate = commissionRateFor(fm ? fm.root : null);
            const commission = (csvCommission != null && csvCommission !== 0) ? csvCommission
              : (assetClass === 'futures' && rtRate > 0 ? Math.round(rtRate * quantity * 100) / 100 : 0);

            incoming.push(newTrade({
              symbol, assetClass, multiplier, direction,
              status: exitPrice != null ? 'closed' : 'open',
              entryDate, entryPrice, quantity, stopLoss, takeProfit,
              exitDate, exitPrice, holdMinutes, commission,
              fees: num(cell(row, 'fees')) || 0,
              setup: cell(row, 'setup'), tags, notes: cell(row, 'notes'),
            }));
          } catch (rowErr) {
            console.warn('Skipping unparseable CSV row', r + 1, rowErr);
            errored++;
          }
        }
      }

      // Discovery pass: report which accounts are present without importing anything.
      if (opts.discoverOnly) return { added: 0, dupes: 0, skipped, errored, accounts, discoverOnly: true };

      // Merge into storage, de-duplicated against what's already there.
      const trades = STORAGE.getTrades();
      const seen = new Set(trades.map(tradeFingerprint));
      let added = 0, dupes = 0;
      for (const t of incoming) {
        const fp = tradeFingerprint(t);
        if (seen.has(fp)) { dupes++; continue; }
        seen.add(fp);
        trades.push(t);
        added++;
      }

      // Nothing usable at all (and no duplicates). For the fill/exec format this is normal
      // (e.g. every account filtered out) -> still report discovered accounts to the caller.
      if (added === 0 && dupes === 0) {
        if (execFormat) return { added: 0, dupes: 0, skipped, errored, accounts };
        if (loud) csvDiagnostic(rows[hIdx], delim, map);
        return null;
      }
      STORAGE.saveTrades(trades);
      if (loud) {
        const parts = [`Imported ${added} trade${added !== 1 ? 's' : ''}`];
        if (dupes)   parts.push(`${dupes} already logged`);
        if (skipped) parts.push(`${skipped} incomplete row${skipped !== 1 ? 's' : ''} skipped`);
        if (errored) parts.push(`${errored} bad row${errored !== 1 ? 's' : ''} skipped`);
        UTIL.toast(parts.join(' · ') + '.', 'success');
      }
      return { added, dupes, skipped, errored, accounts };
    } catch (err) {
      console.error(err);
      if (loud) UTIL.toast('CSV import failed: ' + (err.message || err), 'error');
      return null;
    }
  }

  // Remove already-imported trades that belong to an account not in `allowed` (case-insensitive).
  // Only touches trades that carry an `account` tag (i.e. from execution sync) — manual and
  // plain-CSV trades are never removed. Returns the number removed.
  function pruneAccounts(allowed) {
    const keep = new Set((allowed || []).map(a => String(a).toLowerCase()));
    if (!keep.size) return 0;
    const trades = STORAGE.getTrades();
    const kept = trades.filter(t => !t.account || keep.has(String(t.account).toLowerCase()));
    const removed = trades.length - kept.length;
    if (removed) STORAGE.saveTrades(kept);
    return removed;
  }

  function downloadCSVTemplate() {
    const header = 'symbol,direction,entryDate,entryPrice,quantity,stopLoss,takeProfit,exitDate,exitPrice,commission,fees,setup,tags';
    const example = 'AAPL,long,2026-06-01 09:35,185.20,100,183.00,190.00,2026-06-01 11:10,189.10,1.00,0,Breakout,gap-up;high-volume';
    UTIL.downloadFile('trades_template.csv', header + '\n' + example, 'text/csv');
    UTIL.toast('Template downloaded.', 'success');
  }

  // ---- Apply commissions (per-instrument round-turn rates) + stamp hold times ----
  function applyCommissionsTool() {
    const trades = STORAGE.getTrades();
    const settings = STORAGE.getSettings();
    const saved = settings.commissionRates || {};
    const roots = {};   // futures root -> { name, count, contracts }
    let holdFix = 0;
    for (const t of trades) {
      const fm = UTIL.futuresMultiplier(t.symbol);
      if (fm && t.status === 'closed' && (!t.commission || Number(t.commission) === 0)) {
        const r = roots[fm.root] || (roots[fm.root] = { name: fm.name, count: 0, contracts: 0 });
        r.count++; r.contracts += Number(t.quantity) || 0;
      }
      if (t.holdMinutes == null && t.entryDate && t.exitDate) holdFix++;
    }
    const rootKeys = Object.keys(roots);
    if (!rootKeys.length && !holdFix) { UTIL.toast('All trades already have commissions and hold times. ✅', 'success'); return; }

    const rateRows = rootKeys.map(root => {
      const pre = saved[root] != null ? saved[root] : (COMMISSION_HINTS[root] != null ? COMMISSION_HINTS[root] : (Number(settings.commissionPerContract) || 1.24));
      const r = roots[root];
      return `<div class="field" style="margin-bottom:10px">
        <label>${UTIL.escapeHtml(root)} — ${UTIL.escapeHtml(r.name)} <span class="mult-hint">$ / contract round-turn · ${r.count} trade${r.count !== 1 ? 's' : ''}, ${r.contracts} contracts</span></label>
        <input type="number" step="0.01" min="0" class="comm-rate" data-root="${UTIL.escapeHtml(root)}" value="${pre}" />
      </div>`;
    }).join('');

    let html = `<div class="trade-detail-section">
      <p>${rootKeys.length ? `Found <strong>${rootKeys.reduce((s, k) => s + roots[k].count, 0)}</strong> closed futures trade${rootKeys.reduce((s, k) => s + roots[k].count, 0) !== 1 ? 's' : ''} without commissions. Rates below are typical Tradovate micro round-turns — adjust to match your statement, then Apply. They're saved and used automatically for every future import/sync.` : ''}</p>
      ${rateRows}
      ${holdFix ? `<p class="muted" style="font-size:12.5px">Also stamps hold time on <strong>${holdFix}</strong> trade${holdFix !== 1 ? 's' : ''} from entry/exit timestamps.</p>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" data-close-modal>Cancel</button>
      <button class="btn btn-primary" id="comm-apply">Apply</button>
    </div>`;
    openModal('Commissions & Hold Times', html);
    document.querySelectorAll('#modal-content [data-close-modal]').forEach(b => b.addEventListener('click', closeModal));
    document.getElementById('comm-apply').addEventListener('click', () => {
      const rates = { ...saved };
      let bad = false;
      document.querySelectorAll('#modal-content .comm-rate').forEach(inp => {
        const v = Number(inp.value);
        if (isNaN(v) || v < 0) { bad = true; return; }
        rates[inp.dataset.root] = v;
      });
      if (bad) { UTIL.toast('Rates must be 0 or positive numbers.', 'error'); return; }
      const all = STORAGE.getTrades();
      let commFixed = 0, commTotal = 0, holdStamped = 0;
      for (const t of all) {
        const fm = UTIL.futuresMultiplier(t.symbol);
        if (fm && t.status === 'closed' && (!t.commission || Number(t.commission) === 0) && rates[fm.root] > 0) {
          t.commission = Math.round(rates[fm.root] * (Number(t.quantity) || 0) * 100) / 100;
          commTotal += t.commission;
          t.updatedAt = new Date().toISOString();
          commFixed++;
        }
        if (t.holdMinutes == null && t.entryDate && t.exitDate) {
          const e = new Date(t.entryDate).getTime(), x = new Date(t.exitDate).getTime();
          if (!isNaN(e) && !isNaN(x) && x >= e) { t.holdMinutes = (x - e) / 60000; holdStamped++; }
        }
      }
      STORAGE.saveTrades(all);
      STORAGE.saveSettings({ ...STORAGE.getSettings(), commissionRates: rates });
      closeModal();
      const parts = [];
      if (commFixed) parts.push(`Commissions added to ${commFixed} trade${commFixed !== 1 ? 's' : ''} (${UTIL.fmtMoney(commTotal)} total)`);
      if (holdStamped) parts.push(`hold time stamped on ${holdStamped}`);
      UTIL.toast(parts.length ? parts.join(' · ') + '.' : 'Nothing needed changing.', 'success');
      navigate(state.view);
    });
  }

  // ---- Bulk-fix futures trades logged without a contract multiplier ----
  function fixFuturesTrades() {
    const trades = STORAGE.getTrades();
    const candMult = new Map();   // trade id -> multiplier to apply
    const groups = {};
    for (const t of trades) {
      const fm = UTIL.futuresMultiplier(t.symbol);
      if (!fm) continue;
      if (Number(t.multiplier) > 0) continue;    // respect an explicit multiplier
      if (t.assetClass === 'futures') continue;  // already resolves correctly
      candMult.set(t.id, fm.mult);
      if (!groups[fm.root]) groups[fm.root] = { name: fm.name, mult: fm.mult, count: 0 };
      groups[fm.root].count++;
    }

    if (!candMult.size) {
      UTIL.toast('No trades need fixing — your futures contracts are already set. ✅', 'success');
      return;
    }

    const closed = trades.filter(t => t.status === 'closed');
    const before = closed.reduce((s, t) => s + UTIL.calcPnL(t), 0);
    const after = closed.reduce((s, t) =>
      s + (candMult.has(t.id) ? UTIL.calcPnL({ ...t, assetClass: 'futures', multiplier: candMult.get(t.id) }) : UTIL.calcPnL(t)), 0);

    const rows = Object.entries(groups).sort((a, b) => b[1].count - a[1].count).map(([root, g]) =>
      `<div class="fix-row"><span>${UTIL.escapeHtml(g.name)} <span class="muted">(${root})</span></span><span class="mono">×$${g.mult}/pt · ${g.count} trade${g.count !== 1 ? 's' : ''}</span></div>`).join('');

    const html = `
      <p>Found <strong>${candMult.size}</strong> trade${candMult.size !== 1 ? 's' : ''} with recognized futures symbols that aren't using a contract multiplier. Applying will mark ${candMult.size !== 1 ? 'them' : 'it'} as <strong>Futures</strong> with the correct point value:</p>
      <div class="fix-list">${rows}</div>
      <div class="trade-detail-section"><h3>Net P&amp;L impact (closed trades)</h3>
        <p style="font-size:15px"><span class="${UTIL.pnlClass(before)}">${UTIL.fmtMoney(before, {alwaysSign:true})}</span> &nbsp;→&nbsp; <span class="${UTIL.pnlClass(after)}"><strong>${UTIL.fmtMoney(after, {alwaysSign:true})}</strong></span></p>
        <p class="muted" style="font-size:12px">Only trades whose symbol matches a known contract are touched; anything you set manually is left alone. Tip: export a JSON backup first (Settings → Export) if you want a safety net.</p></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="fix-futures-apply">Apply to ${candMult.size} trade${candMult.size !== 1 ? 's' : ''}</button>
      </div>`;
    openModal('Fix futures contracts', html);
    document.querySelectorAll('#modal-content [data-close-modal]').forEach(b => b.addEventListener('click', closeModal));
    document.getElementById('fix-futures-apply').addEventListener('click', () => {
      const all = STORAGE.getTrades();
      let fixed = 0;
      for (const t of all) {
        if (!candMult.has(t.id)) continue;
        t.assetClass = 'futures';
        t.multiplier = candMult.get(t.id);
        t.updatedAt = new Date().toISOString();
        fixed++;
      }
      STORAGE.saveTrades(all);
      closeModal();
      UTIL.toast(`Fixed ${fixed} futures trade${fixed !== 1 ? 's' : ''}.`, 'success');
      navigate('dashboard');
    });
  }

  // ---- Keyboard shortcuts help ----
  function showShortcutsHelp() {
    const rows = [
      ['N', 'Add trade'], ['G then D', 'Go to Dashboard'], ['G then T', 'Go to Trades'],
      ['G then R', 'Go to Reports'], ['G then P', 'Go to Playbooks'], ['G then J', 'Daily Journal'],
      ['/', 'Focus search (on Trades)'], ['L', 'Toggle light / dark'], ['?', 'This help'], ['Esc', 'Close dialog'],
    ];
    openModal('Keyboard Shortcuts', `<div class="shortcut-list">${rows.map(([k, d]) =>
      `<div class="shortcut-row"><kbd>${k}</kbd><span>${d}</span></div>`).join('')}</div>`);
  }

  // ============ SAMPLE DATA ============
  function loadSampleData() {
    if (STORAGE.getTrades().length && !confirm('This will add sample trades to your existing data. Continue?')) return;
    const samples = SAMPLE.generate();
    const existing = STORAGE.getTrades();
    STORAGE.saveTrades([...existing, ...samples]);
    STORAGE.saveSettings({ ...STORAGE.getSettings(), initialBalance: STORAGE.getSettings().initialBalance || 25000 });
    UTIL.toast(`Loaded ${samples.length} sample trades.`, 'success');
    loadSettings();
    navigate('dashboard');
  }

  function clearData() {
    if (!confirm('Permanently delete ALL trades, journal entries, and settings? This cannot be undone.')) return;
    STORAGE.clearAll();
    UTIL.toast('All data cleared.', 'success');
    loadSettings();
    navigate('dashboard');
  }

  // ============ MODAL ============
  function openModal(title, content) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-content').innerHTML = content;
    document.getElementById('modal').classList.remove('hidden');
  }
  function closeModal() {
    document.getElementById('modal').classList.add('hidden');
  }

  // ============ INIT ============
  function init() {
    // Guard: if the charting library failed to load, tell the user instead of
    // silently showing empty chart areas.
    if (typeof Chart === 'undefined') {
      const banner = document.createElement('div');
      banner.style.cssText = 'background:#7f1d1d;color:#fff;padding:12px 18px;font-size:13px;text-align:center;';
      banner.textContent = 'Charts could not load (js/chart.umd.js is missing). The journal still works — stats and tables will display, but charts will be blank.';
      document.body.prepend(banner);
    }

    // Nav
    document.querySelectorAll('.nav-item').forEach(b =>
      b.addEventListener('click', () => navigate(b.dataset.view)));
    document.querySelectorAll('[data-action="goto-new-trade"]').forEach(b =>
      b.addEventListener('click', () => navigate('new-trade')));
    document.querySelectorAll('[data-action="goto-trades"]').forEach(b =>
      b.addEventListener('click', () => navigate('trades')));

    // Period filter
    document.getElementById('period-filter').addEventListener('change', e => {
      state.period = e.target.value;
      if (state.view === 'dashboard') renderDashboard();
      if (state.view === 'analytics') renderAnalytics();
    });

    // Trade form
    const form = document.getElementById('trade-form');
    form.addEventListener('submit', saveTrade);
    form.addEventListener('input', updateLiveStats);
    form.querySelector('[name="symbol"]').addEventListener('input', applyFuturesAutofill);
    form.querySelector('[name="assetClass"]').addEventListener('change', applyFuturesAutofill);
    form.querySelector('[name="multiplier"]').addEventListener('input', e => { if (e.target.value) delete e.target.dataset.auto; });
    document.getElementById('form-reset').addEventListener('click', resetTradeForm);
    document.getElementById('trade-status').addEventListener('change', toggleExitSection);

    // Screenshot uploader: click, drag & drop, paste
    const drop = document.getElementById('image-drop');
    const fileInput = document.getElementById('screenshot-input');
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    fileInput.addEventListener('change', e => { addImageFiles(e.target.files); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragover'); }));
    drop.addEventListener('dragleave', e => { if (!drop.contains(e.relatedTarget)) drop.classList.remove('dragover'); });
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('dragover'); if (e.dataTransfer && e.dataTransfer.files) addImageFiles(e.dataTransfer.files); });
    form.addEventListener('paste', e => {
      const imgs = [...(e.clipboardData && e.clipboardData.items || [])].filter(i => i.type && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
      if (imgs.length) { e.preventDefault(); addImageFiles(imgs); }
    });

    // Trades filters
    document.getElementById('filter-search').addEventListener('input', e => { state.filters.search = e.target.value; renderTradesTable(); });
    document.getElementById('filter-status').addEventListener('change', e => { state.filters.status = e.target.value; renderTradesTable(); });
    document.getElementById('filter-direction').addEventListener('change', e => { state.filters.direction = e.target.value; renderTradesTable(); });
    document.getElementById('filter-outcome').addEventListener('change', e => { state.filters.outcome = e.target.value; renderTradesTable(); });
    document.getElementById('filter-setup').addEventListener('change', e => { state.filters.setup = e.target.value; renderTradesTable(); });
    document.getElementById('filter-clear').addEventListener('click', () => {
      state.filters = { search: '', status: '', direction: '', outcome: '', setup: '' };
      document.getElementById('filter-search').value = '';
      document.getElementById('filter-status').value = '';
      document.getElementById('filter-direction').value = '';
      document.getElementById('filter-outcome').value = '';
      document.getElementById('filter-setup').value = '';
      renderTradesTable();
    });
    document.getElementById('export-csv').addEventListener('click', exportCSV);

    // Sorting
    document.querySelectorAll('#trades-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = 'desc'; }
        renderTradesTable();
      });
    });

    // Journal
    document.getElementById('journal-form').addEventListener('submit', saveJournalEntry);
    document.getElementById('journal-date').addEventListener('change', e => loadJournalEntry(e.target.value));

    // Settings
    document.getElementById('settings-form').addEventListener('submit', saveSettings);
    document.getElementById('export-json').addEventListener('click', exportJSON);
    document.getElementById('import-json').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', e => { if (e.target.files[0]) importJSON(e.target.files[0]); });
    document.getElementById('load-sample').addEventListener('click', loadSampleData);
    document.getElementById('clear-data').addEventListener('click', clearData);
    document.getElementById('fix-futures').addEventListener('click', fixFuturesTrades);
    document.getElementById('apply-commissions').addEventListener('click', applyCommissionsTool);
    document.getElementById('import-csv').addEventListener('click', () => document.getElementById('import-csv-file').click());
    document.getElementById('import-csv-file').addEventListener('change', e => { if (e.target.files[0]) importCSV(e.target.files[0]); e.target.value = ''; });
    document.getElementById('download-template').addEventListener('click', downloadCSVTemplate);

    // Playbooks
    document.getElementById('playbook-form').addEventListener('submit', savePlaybook);
    document.getElementById('playbook-cancel').addEventListener('click', resetPlaybookForm);
    document.getElementById('trade-playbook').addEventListener('change', renderPlaybookRules);

    // AI Coach
    document.querySelectorAll('[data-action="goto-settings"]').forEach(b => b.addEventListener('click', () => navigate('settings')));
    document.getElementById('ai-analyze-btn').addEventListener('click', runAIAnalysis);
    document.getElementById('ai-key-save').addEventListener('click', () => {
      const input = document.getElementById('ai-key-input');
      const val = input.value.trim();
      if (!val) { UTIL.toast('Paste your API key first.', 'error'); return; }
      if (!/^AIza/.test(val) && !confirm('That doesn\'t look like a Google Gemini key (they usually start with "AIza"). Save it anyway?')) return;
      AI.saveKey(val);
      loadAIKeyField();
      UTIL.toast('API key saved.', 'success');
    });
    document.getElementById('ai-key-clear').addEventListener('click', () => {
      if (!AI.hasKey()) return;
      AI.saveKey('');
      loadAIKeyField();
      UTIL.toast('API key cleared.', 'success');
    });

    // Theme toggle
    applyTheme(getTheme());
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Calendar month navigation
    document.getElementById('cal-prev').addEventListener('click', () => shiftCalMonth(-1));
    document.getElementById('cal-next').addEventListener('click', () => shiftCalMonth(1));

    // Modal
    document.querySelectorAll('[data-close-modal]').forEach(el => el.addEventListener('click', closeModal));

    // Keyboard shortcuts
    let gPending = false;
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeLightbox(); closeModal(); return; }
      // Ignore when typing in a field
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (gPending) {
        gPending = false;
        const map = { d: 'dashboard', t: 'trades', r: 'analytics', p: 'playbooks', j: 'journal', s: 'settings' };
        if (map[k]) { e.preventDefault(); navigate(map[k]); }
        return;
      }
      if (k === 'g') { gPending = true; setTimeout(() => { gPending = false; }, 900); }
      else if (k === 'n') { e.preventDefault(); navigate('new-trade'); }
      else if (k === 'l') { e.preventDefault(); toggleTheme(); }
      else if (k === '?') { e.preventDefault(); showShortcutsHelp(); }
      else if (k === '/' && state.view === 'trades') { e.preventDefault(); document.getElementById('filter-search').focus(); }
    });

    // Initial form date
    document.querySelector('[name="entryDate"]').value = UTIL.localDatetimeNow();

    loadSettings();
    // Deep link: #settings, #trades, ... opens that view directly
    const hashView = (location.hash || '').replace('#', '');
    navigate(PAGE_META[hashView] ? hashView : 'dashboard');
    window.addEventListener('hashchange', () => {
      const v = (location.hash || '').replace('#', '');
      if (PAGE_META[v]) navigate(v);
    });
  }

  return { init, navigate, ingestCSV, pruneAccounts, openModal, closeModal, refresh: () => navigate(state.view) };
})();

document.addEventListener('DOMContentLoaded', APP.init);
