// === Charts ===
// Theme-aware Chart.js wrappers. Colors are read live from CSS variables so the
// charts recolor instantly when the light/dark theme is toggled.

const CHARTS = (() => {

  if (typeof Chart !== 'undefined') {
    Chart.defaults.animation = false;
    Chart.defaults.font.family = "'Inter', system-ui, -apple-system, sans-serif";
  }

  const COLORS = {
    text: '#6b7280', grid: 'rgba(20,22,40,0.07)',
    profit: '#16b57f', loss: '#f04e63',
    accent: '#7c5cfc', purple: '#7c5cfc', amber: '#f5a623',
    tipBg: '#ffffff', tipText: '#1a1b23', tipBorder: '#e0e0e9',
  };

  function refreshColors() {
    if (typeof document === 'undefined') return;
    const cs = getComputedStyle(document.documentElement);
    const g = (n, fb) => { const v = cs.getPropertyValue(n).trim(); return v || fb; };
    COLORS.text   = g('--text-2', COLORS.text);
    COLORS.grid   = g('--line', COLORS.grid);
    COLORS.profit = g('--profit', COLORS.profit);
    COLORS.loss   = g('--loss', COLORS.loss);
    COLORS.accent = g('--primary', COLORS.accent);
    COLORS.purple = g('--primary', COLORS.purple);
    COLORS.amber  = g('--warn', COLORS.amber);
    COLORS.tipBg     = g('--surface', COLORS.tipBg);
    COLORS.tipText   = g('--text', COLORS.tipText);
    COLORS.tipBorder = g('--line-2', COLORS.tipBorder);
    if (typeof Chart !== 'undefined') Chart.defaults.color = COLORS.text;
  }

  const instances = {};
  function destroy(id) { if (instances[id]) { instances[id].destroy(); delete instances[id]; } }

  function tooltip(extra = {}) {
    return {
      backgroundColor: COLORS.tipBg,
      titleColor: COLORS.tipText,
      bodyColor: COLORS.text,
      borderColor: COLORS.tipBorder,
      borderWidth: 1,
      padding: 11,
      cornerRadius: 9,
      displayColors: false,
      ...extra,
    };
  }

  function baseOpts(extra = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: tooltip() },
      scales: {
        x: { ticks: { color: COLORS.text, font: { size: 10 } }, grid: { color: COLORS.grid, drawBorder: false } },
        y: { ticks: { color: COLORS.text, font: { size: 10 } }, grid: { color: COLORS.grid, drawBorder: false } },
      },
      ...extra,
    };
  }

  // ---------- Equity / cumulative P&L ----------
  function renderEquityCurve(canvasId, equityCurve, initialBalance) {
    refreshColors(); destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const labels = ['Start', ...equityCurve.map(p => UTIL.fmtDateShort(p.date))];
    const data   = [initialBalance, ...equityCurve.map(p => p.equity)];
    const isUp   = data[data.length - 1] >= data[0];
    const color  = isUp ? COLORS.profit : COLORS.loss;
    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{
        data, borderColor: color, borderWidth: 2.5, fill: true,
        backgroundColor: c => { const g = c.chart.ctx.createLinearGradient(0,0,0,270); g.addColorStop(0, color+'33'); g.addColorStop(1, color+'00'); return g; },
        tension: 0.28, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: color,
      }] },
      options: baseOpts({
        plugins: { legend: { display: false }, tooltip: tooltip({ callbacks: { label: c => 'Equity: ' + UTIL.fmtMoney(c.parsed.y) } }) },
        scales: {
          x: { ticks: { color: COLORS.text, maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: COLORS.text, font: { size: 10 }, callback: v => UTIL.fmtMoneyCompact(v) }, grid: { color: COLORS.grid } },
        },
      }),
    });
  }

  function renderDailyPnL(canvasId, dailyData) {
    refreshColors(); destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels: dailyData.map(d => UTIL.fmtDateShort(d.key)), datasets: [{ data: dailyData.map(d => d.netPnl), backgroundColor: dailyData.map(d => d.netPnl >= 0 ? COLORS.profit : COLORS.loss), borderRadius: 4 }] },
      options: baseOpts({
        plugins: { legend: { display: false }, tooltip: tooltip({ callbacks: { label: c => 'P&L: ' + UTIL.fmtMoney(c.parsed.y) } }) },
        scales: {
          x: { ticks: { color: COLORS.text, maxTicksLimit: 10, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: COLORS.text, callback: v => UTIL.fmtMoneyCompact(v) }, grid: { color: COLORS.grid } },
        },
      }),
    });
  }

  function renderDrawdown(canvasId, equityCurve) {
    refreshColors(); destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    instances[canvasId] = new Chart(ctx, {
      type: 'line',
      data: { labels: equityCurve.map(p => UTIL.fmtDateShort(p.date)), datasets: [{
        data: equityCurve.map(p => p.drawdownPct), borderColor: COLORS.loss, borderWidth: 1.5, fill: true,
        backgroundColor: COLORS.loss + '22', pointRadius: 0, tension: 0.2,
      }] },
      options: baseOpts({
        plugins: { legend: { display: false }, tooltip: tooltip({ callbacks: { label: c => 'DD: ' + c.parsed.y.toFixed(2) + '%' } }) },
        scales: {
          x: { ticks: { color: COLORS.text, maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: COLORS.text, callback: v => v.toFixed(0) + '%' }, grid: { color: COLORS.grid } },
        },
      }),
    });
  }

  function renderBarsByKey(canvasId, items, valueKey, opts = {}) {
    refreshColors(); destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const data = items.map(i => i[valueKey]);
    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels: items.map(i => i.key), datasets: [{ data, backgroundColor: data.map(v => v >= 0 ? COLORS.profit : COLORS.loss), borderRadius: 4 }] },
      options: baseOpts({
        indexAxis: opts.horizontal ? 'y' : 'x',
        plugins: { legend: { display: false }, tooltip: tooltip({ callbacks: { label: c => (opts.formatter || (v => v))(c.parsed[opts.horizontal ? 'x' : 'y']) } }) },
        scales: {
          x: { ticks: { color: COLORS.text, font: { size: 10 }, callback: opts.horizontal ? (v => opts.tickFormatter ? opts.tickFormatter(v) : v) : undefined }, grid: { color: COLORS.grid, display: !!opts.horizontal } },
          y: { ticks: { color: COLORS.text, font: { size: 10 }, callback: opts.horizontal ? undefined : (v => opts.tickFormatter ? opts.tickFormatter(v) : v) }, grid: { color: COLORS.grid, display: !opts.horizontal } },
        },
      }),
    });
  }

  function renderWinRateBars(canvasId, items) {
    refreshColors(); destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const data = items.map(i => i.winRate);
    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels: items.map(i => i.key), datasets: [{ data, backgroundColor: data.map(v => v >= 50 ? COLORS.profit : COLORS.amber), borderRadius: 4 }] },
      options: baseOpts({
        plugins: { legend: { display: false }, tooltip: tooltip({ callbacks: { label: c => 'Win Rate: ' + c.parsed.y.toFixed(1) + '% (' + items[c.dataIndex].trades + ' trades)' } }) },
        scales: {
          x: { ticks: { color: COLORS.text, font: { size: 10 } }, grid: { display: false } },
          y: { min: 0, max: 100, ticks: { color: COLORS.text, callback: v => v + '%' }, grid: { color: COLORS.grid } },
        },
      }),
    });
  }

  function renderRDist(canvasId, buckets) {
    refreshColors(); destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const labels = Object.keys(buckets);
    instances[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data: Object.values(buckets), backgroundColor: labels.map(l => l.startsWith('-') || l.startsWith('<-') ? COLORS.loss : COLORS.profit), borderRadius: 4 }] },
      options: baseOpts({
        plugins: { legend: { display: false }, tooltip: tooltip({ callbacks: { label: c => c.parsed.y + ' trades' } }) },
        scales: { x: { ticks: { color: COLORS.text, font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: COLORS.text, precision: 0 }, grid: { color: COLORS.grid } } },
      }),
    });
  }

  function renderHoldVsPnL(canvasId, trades) {
    refreshColors(); destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const points = trades.filter(t => t.status === 'closed').map(UTIL.enrich).filter(t => t.holdMinutes !== null).map(t => ({ x: t.holdMinutes, y: t.pnl, sym: t.symbol }));
    instances[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: { datasets: [{ data: points, backgroundColor: points.map(p => p.y >= 0 ? COLORS.profit : COLORS.loss), pointRadius: 5, pointHoverRadius: 7 }] },
      options: baseOpts({
        plugins: { legend: { display: false }, tooltip: tooltip({ callbacks: { label: c => { const p = c.raw; return `${p.sym}: ${UTIL.fmtMoney(p.y)} (${UTIL.fmtHoldTime(p.x)})`; } } }) },
        scales: {
          x: { title: { display: true, text: 'Hold Time', color: COLORS.text, font: { size: 11 } }, ticks: { color: COLORS.text, callback: v => UTIL.fmtHoldTime(v) }, grid: { color: COLORS.grid } },
          y: { title: { display: true, text: 'P&L', color: COLORS.text, font: { size: 11 } }, ticks: { color: COLORS.text, callback: v => UTIL.fmtMoneyCompact(v) }, grid: { color: COLORS.grid } },
        },
      }),
    });
  }

  function renderMfeMae(canvasId, trades) {
    refreshColors(); destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const points = trades.filter(t => t.status === 'closed' && t.mae && t.mfe && t.entryPrice && t.quantity).map(t => {
      const dir = t.direction === 'short' ? -1 : 1;
      return { x: Math.abs((t.mae - t.entryPrice) * t.quantity * dir), y: Math.abs((t.mfe - t.entryPrice) * t.quantity * dir), sym: t.symbol, pnl: UTIL.calcPnL(t) };
    });
    instances[canvasId] = new Chart(ctx, {
      type: 'scatter',
      data: { datasets: [{ data: points, backgroundColor: points.map(p => p.pnl >= 0 ? COLORS.profit : COLORS.loss), pointRadius: 5, pointHoverRadius: 7 }] },
      options: baseOpts({
        plugins: { legend: { display: false }, tooltip: tooltip({ callbacks: { label: c => { const p = c.raw; return `${p.sym}: MFE ${UTIL.fmtMoney(p.y)} / MAE ${UTIL.fmtMoney(p.x)}`; } } }) },
        scales: {
          x: { title: { display: true, text: 'MAE (Adverse $)', color: COLORS.text, font: { size: 11 } }, ticks: { color: COLORS.text, callback: v => UTIL.fmtMoneyCompact(v) }, grid: { color: COLORS.grid } },
          y: { title: { display: true, text: 'MFE (Favorable $)', color: COLORS.text, font: { size: 11 } }, ticks: { color: COLORS.text, callback: v => UTIL.fmtMoneyCompact(v) }, grid: { color: COLORS.grid } },
        },
      }),
    });
  }

  // ---------- Zella Score radar ----------
  function renderZellaRadar(canvasId, metrics) {
    refreshColors(); destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const labels = ['Win %', 'Profit Factor', 'Avg W/L', 'Max DD', 'Recovery', 'Consistency'];
    const data = [metrics.winRate, metrics.profitFactor, metrics.avgWinLoss, metrics.maxDrawdown, metrics.recoveryFactor, metrics.consistency];
    instances[canvasId] = new Chart(ctx, {
      type: 'radar',
      data: { labels, datasets: [{
        data, fill: true,
        backgroundColor: COLORS.accent + '2e',
        borderColor: COLORS.accent,
        borderWidth: 2,
        pointBackgroundColor: COLORS.accent,
        pointBorderColor: COLORS.tipBg,
        pointRadius: 3, pointHoverRadius: 5,
      }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: tooltip({ callbacks: { label: c => c.label + ': ' + Math.round(c.parsed.r) + '/100' } }) },
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { display: false, stepSize: 25 },
            grid: { color: COLORS.grid },
            angleLines: { color: COLORS.grid },
            pointLabels: { color: COLORS.text, font: { size: 10.5, weight: '500' } },
          },
        },
      },
    });
  }

  return {
    refreshColors,
    renderEquityCurve, renderDailyPnL, renderDrawdown,
    renderBarsByKey, renderWinRateBars, renderRDist,
    renderHoldVsPnL, renderMfeMae, renderZellaRadar,
    destroy,
  };
})();
