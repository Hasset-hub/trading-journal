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
    if (ins.best) cards.push(insightCard('▲', 'Best Trade',
      `<span class="profit">${UTIL.fmtMoney(ins.best.pnl, {alwaysSign:true})}</span>`,
      `${UTIL.escapeHtml(ins.best.symbol)} · ${ins.best.rMultiple !== null ? UTIL.fmtR(ins.best.rMultiple) : '—'}`, 'profit'));
    if (ins.worst) cards.push(insightCard('▼', 'Worst Trade',
      `<span class="loss">${UTIL.fmtMoney(ins.worst.pnl, {alwaysSign:true})}</span>`,
      `${UTIL.escapeHtml(ins.worst.symbol)} · ${ins.worst.rMultiple !== null ? UTIL.fmtR(ins.worst.rMultiple) : '—'}`, 'loss'));
    if (ins.bestSetup) cards.push(insightCard('★', 'Top Setup',
      UTIL.escapeHtml(ins.bestSetup.key),
      `${UTIL.fmtMoney(ins.bestSetup.netPnl, {alwaysSign:true})} · ${UTIL.fmtPct(ins.bestSetup.winRate, 0)} win`, 'accent'));
    if (ins.worstMistake) cards.push(insightCard('!', 'Biggest Leak',
      MISTAKE_LABELS[ins.worstMistake.key] || ins.worstMistake.key,
      `${UTIL.fmtMoney(ins.worstMistake.netPnl)} over ${ins.worstMistake.count}×`, 'loss'));
    else if (ins.bestDay) cards.push(insightCard('◆', 'Best Day',
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
      el.innerHTML = `<div class="card"><div class="empty-state">
        <div class="empty-title">No playbooks yet</div>
        <div class="empty-sub">A playbook is a documented setup with a rules checklist. Create one above, then tag your trades to it to see which strategies actually make money.</div>
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
            <button class="btn-icon" data-pb-edit="${pb.id}" title="Edit">✎</button>
            <button class="btn-icon" data-pb-del="${pb.id}" title="Delete">🗑</button>
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

  function readTradeForm() {
    const f = document.getElementById('trade-form');
    const fd = new FormData(f);
    const get = k => { const v = fd.get(k); return v === null || v === '' ? null : v; };
    const num = k => { const v = get(k); return v === null ? null : Number(v); };

    const mistakes = [...f.querySelectorAll('input[name="mistakes"]:checked')].map(c => c.value);
    const rulesFollowed = [...f.querySelectorAll('input[name="rulesFollowed"]:checked')].map(c => Number(c.value));
    const tags = (get('tags') || '').split(',').map(s => s.trim()).filter(Boolean);
    const screenshots = (get('screenshots') || '').split('\n').map(s => s.trim()).filter(Boolean);

    return {
      id: get('id') || UTIL.uuid(),
      symbol: (get('symbol') || '').toUpperCase().trim(),
      assetClass: get('assetClass'),
      direction: get('direction') || 'long',
      status: get('status') || 'closed',
      entryDate: get('entryDate'),
      entryPrice: num('entryPrice'),
      quantity: num('quantity'),
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
    if (idx >= 0) {
      t.createdAt = trades[idx].createdAt;
      trades[idx] = t;
      UTIL.toast('Trade updated.', 'success');
    } else {
      trades.push(t);
      UTIL.toast('Trade saved.', 'success');
    }
    STORAGE.saveTrades(trades);
    resetTradeForm();
    navigate('trades');
  }

  function resetTradeForm() {
    const f = document.getElementById('trade-form');
    f.reset();
    f.querySelector('[name="id"]').value = '';
    f.querySelector('[name="entryDate"]').value = UTIL.localDatetimeNow();
    document.getElementById('conf-val').value = 5;
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
    setVal('screenshots', (t.screenshots || []).join('\n'));

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
        <td><button class="btn-icon" data-edit="${t.id}" title="Edit">✎</button></td>
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
      ${detail('Entry', `${t.entryPrice} × ${UTIL.fmtNum(t.quantity,0)}`)}
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
      html += `<div class="trade-detail-section"><h3>Screenshots</h3>${t.screenshots.map(u =>
        `<a href="${UTIL.escapeHtml(u)}" target="_blank" rel="noopener" style="display:block;margin-bottom:4px;word-break:break-all;">${UTIL.escapeHtml(u)}</a>`).join('')}</div>`;
    }

    html += `<div class="modal-actions">
      <button class="btn btn-danger" data-delete-trade="${t.id}">Delete</button>
      <button class="btn btn-ghost" data-edit-trade="${t.id}">Edit</button>
      <button class="btn btn-primary" data-close-modal>Close</button>
    </div>`;

    openModal(t.symbol + ' · ' + UTIL.fmtDate(t.entryDate), html);

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
    f.querySelector('[name="tradingStyle"]').value = s.tradingStyle ?? '';
  }

  function saveSettings(e) {
    e.preventDefault();
    const f = document.getElementById('settings-form');
    const fd = new FormData(f);
    STORAGE.saveSettings({
      initialBalance: Number(fd.get('initialBalance')) || 0,
      currency: (fd.get('currency') || '$').slice(0, 3),
      defaultRiskPct: Number(fd.get('defaultRiskPct')) || 0,
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

  // ---- CSV trade import ----
  function parseCSV(text) {
    const rows = []; let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i], next = text[i + 1];
      if (inQ) {
        if (ch === '"' && next === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\r') { /* skip */ }
        else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else cur += ch;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  function importCSV(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCSV(reader.result).filter(r => r.length && r.some(c => c.trim() !== ''));
        if (rows.length < 2) { UTIL.toast('CSV has no data rows.', 'error'); return; }
        const header = rows[0].map(h => h.trim().toLowerCase());
        const idx = n => header.indexOf(n);
        const col = (row, ...names) => { for (const n of names) { const i = idx(n); if (i >= 0 && row[i] !== undefined && row[i].trim() !== '') return row[i].trim(); } return null; };
        const num = v => { if (v == null) return null; const n = Number(String(v).replace(/[$,]/g, '')); return isNaN(n) ? null : n; };
        const parseDate = d => { if (!d) return null; const dt = new Date(d); return isNaN(dt.getTime()) ? null : dt.toISOString(); };

        const trades = STORAGE.getTrades();
        let added = 0, skipped = 0;
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          const symbol = col(row, 'symbol', 'ticker');
          const entryPrice = num(col(row, 'entryprice', 'entry price', 'entry'));
          const quantity = num(col(row, 'quantity', 'qty', 'size', 'shares'));
          const entryDate = parseDate(col(row, 'entrydate', 'entry date', 'date', 'opened'));
          if (!symbol || entryPrice == null || quantity == null) { skipped++; continue; }
          const dir = (col(row, 'direction', 'side', 'type') || 'long').toLowerCase();
          const direction = (dir.startsWith('s') || dir === 'sell') ? 'short' : 'long';
          const exitPrice = num(col(row, 'exitprice', 'exit price', 'exit'));
          const exitDate = parseDate(col(row, 'exitdate', 'exit date', 'closed'));
          const tags = (col(row, 'tags') || '').split(/[;|]/).map(s => s.trim()).filter(Boolean);
          trades.push({
            id: UTIL.uuid(),
            symbol: symbol.toUpperCase(),
            assetClass: (col(row, 'assetclass', 'asset') || 'stock').toLowerCase(),
            direction,
            status: (exitPrice != null && exitDate) ? 'closed' : 'open',
            entryDate, entryPrice, quantity,
            stopLoss: num(col(row, 'stoploss', 'stop loss', 'stop')),
            takeProfit: num(col(row, 'takeprofit', 'take profit', 'target')),
            exitDate, exitPrice,
            commission: num(col(row, 'commission', 'commissions')) || 0,
            fees: num(col(row, 'fees', 'fee')) || 0,
            setup: col(row, 'setup', 'strategy'),
            marketCondition: null,
            timeframe: col(row, 'timeframe', 'tf'),
            tags,
            mae: num(col(row, 'mae')), mfe: num(col(row, 'mfe')), mistakes: [],
            emotionBefore: null, emotionDuring: null, confidence: null, planFollowed: null,
            thesis: null, notes: col(row, 'notes'), lessons: null, screenshots: [],
            playbookId: null, rulesFollowed: [],
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          });
          added++;
        }
        STORAGE.saveTrades(trades);
        UTIL.toast(`Imported ${added} trade${added !== 1 ? 's' : ''}${skipped ? `, skipped ${skipped}` : ''}.`, 'success');
        navigate('trades');
      } catch (err) {
        console.error(err);
        UTIL.toast('CSV import failed — check the column format.', 'error');
      }
    };
    reader.readAsText(file);
  }

  function downloadCSVTemplate() {
    const header = 'symbol,direction,entryDate,entryPrice,quantity,stopLoss,takeProfit,exitDate,exitPrice,commission,fees,setup,tags';
    const example = 'AAPL,long,2026-06-01 09:35,185.20,100,183.00,190.00,2026-06-01 11:10,189.10,1.00,0,Breakout,gap-up;high-volume';
    UTIL.downloadFile('trades_template.csv', header + '\n' + example, 'text/csv');
    UTIL.toast('Template downloaded.', 'success');
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
    document.getElementById('form-reset').addEventListener('click', resetTradeForm);
    document.getElementById('trade-status').addEventListener('change', toggleExitSection);

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
    document.getElementById('import-csv').addEventListener('click', () => document.getElementById('import-csv-file').click());
    document.getElementById('import-csv-file').addEventListener('change', e => { if (e.target.files[0]) importCSV(e.target.files[0]); e.target.value = ''; });
    document.getElementById('download-template').addEventListener('click', downloadCSVTemplate);

    // Playbooks
    document.getElementById('playbook-form').addEventListener('submit', savePlaybook);
    document.getElementById('playbook-cancel').addEventListener('click', resetPlaybookForm);
    document.getElementById('trade-playbook').addEventListener('change', renderPlaybookRules);

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
      if (e.key === 'Escape') { closeModal(); return; }
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
    navigate('dashboard');
  }

  return { init, navigate };
})();

document.addEventListener('DOMContentLoaded', APP.init);
