// === Utility Functions ===

const UTIL = (() => {

  function uuid() {
    return 'tr_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36).slice(-4);
  }

  function getCurrency() {
    return (STORAGE.getSettings().currency || '$');
  }

  function fmtMoney(n, opts = {}) {
    if (n === null || n === undefined || isNaN(n)) return '--';
    const sign = n < 0 ? '-' : (opts.alwaysSign && n > 0 ? '+' : '');
    const abs = Math.abs(n);
    const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return sign + getCurrency() + str;
  }

  function fmtMoneyCompact(n) {
    if (n === null || n === undefined || isNaN(n)) return '--';
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1e6) return sign + getCurrency() + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + getCurrency() + (abs / 1e3).toFixed(2) + 'K';
    return sign + getCurrency() + abs.toFixed(2);
  }

  function fmtPct(n, decimals = 2, opts = {}) {
    if (n === null || n === undefined || isNaN(n)) return '--';
    const sign = n < 0 ? '' : (opts.alwaysSign && n > 0 ? '+' : '');
    return sign + n.toFixed(decimals) + '%';
  }

  function fmtNum(n, decimals = 2) {
    if (n === null || n === undefined || isNaN(n)) return '--';
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function fmtDate(d) {
    if (!d) return '--';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '--';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtDateShort(d) {
    if (!d) return '--';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '--';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function fmtDateTime(d) {
    if (!d) return '--';
    const date = new Date(d);
    if (isNaN(date.getTime())) return '--';
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function fmtHoldTime(minutes) {
    if (minutes === null || minutes === undefined || isNaN(minutes)) return '--';
    if (minutes < 1)   return '<1m';
    if (minutes < 60)  return Math.round(minutes) + 'm';
    if (minutes < 1440) {
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      return m ? `${h}h ${m}m` : `${h}h`;
    }
    const d = Math.floor(minutes / 1440);
    const h = Math.round((minutes % 1440) / 60);
    return h ? `${d}d ${h}h` : `${d}d`;
  }

  function fmtR(r) {
    if (r === null || r === undefined || isNaN(r)) return '--';
    const sign = r > 0 ? '+' : '';
    return sign + r.toFixed(2) + 'R';
  }

  // === Futures contract multipliers (point value in USD per 1.00 price move) ===
  const FUTURES_MULTIPLIERS = {
    // Equity index
    MES: 5, ES: 50, MNQ: 2, NQ: 20, MYM: 0.5, YM: 5, M2K: 5, RTY: 50, EMD: 100, NKD: 5,
    // Energy
    MCL: 100, CL: 1000, QM: 500, BZ: 1000, NG: 10000, RB: 42000, HO: 42000,
    // Metals
    MGC: 10, GC: 100, SIL: 1000, SI: 5000, HG: 25000, PL: 50, PA: 100,
    // Rates
    ZT: 2000, ZF: 1000, ZN: 1000, TN: 1000, ZB: 1000, UB: 1000,
    // FX
    M6E: 12500, '6E': 125000, '6B': 62500, '6J': 12500000, '6A': 100000, '6C': 100000, '6S': 125000, '6N': 100000,
    // Agriculture
    ZC: 50, ZS: 50, ZW: 50, KE: 50, ZL: 600, ZM: 100, ZO: 50, ZR: 2000,
    // Softs & livestock
    SB: 1120, KC: 375, CC: 10, CT: 500, LE: 400, GF: 500, HE: 400,
    // Crypto (CME)
    MBT: 0.1, BTC: 5, MET: 0.1, ETH: 50,
  };
  const FUTURES_NAMES = {
    ES: 'E-mini S&P 500', MES: 'Micro E-mini S&P 500', NQ: 'E-mini Nasdaq-100', MNQ: 'Micro E-mini Nasdaq-100',
    YM: 'E-mini Dow', MYM: 'Micro E-mini Dow', RTY: 'E-mini Russell 2000', M2K: 'Micro E-mini Russell 2000',
    CL: 'Crude Oil', MCL: 'Micro Crude Oil', NG: 'Natural Gas', RB: 'RBOB Gasoline', HO: 'Heating Oil', BZ: 'Brent Crude',
    GC: 'Gold', MGC: 'Micro Gold', SI: 'Silver', SIL: 'Micro Silver', HG: 'Copper', PL: 'Platinum', PA: 'Palladium',
    ZB: '30-Year T-Bond', UB: 'Ultra T-Bond', ZN: '10-Year T-Note', ZF: '5-Year T-Note', ZT: '2-Year T-Note',
    '6E': 'Euro FX', '6B': 'British Pound', '6J': 'Japanese Yen', '6A': 'Australian Dollar', '6C': 'Canadian Dollar', '6S': 'Swiss Franc',
    ZC: 'Corn', ZS: 'Soybeans', ZW: 'Wheat', ZL: 'Soybean Oil', ZM: 'Soybean Meal',
    BTC: 'Bitcoin', MBT: 'Micro Bitcoin', ETH: 'Ether', MET: 'Micro Ether',
  };
  const MONTH_CODES = 'FGHJKMNQUVXZ';

  // Detect a known futures contract from a symbol (handles month/year suffixes:
  // ES, ESZ5, /MESM26, ES1!, MNQ.F, etc.). Returns {root, mult, name} or null.
  function futuresMultiplier(symbol) {
    if (!symbol) return null;
    const s = String(symbol).toUpperCase().replace(/^[\/@]/, '').replace(/\s+/g, '');
    const roots = Object.keys(FUTURES_MULTIPLIERS).sort((a, b) => b.length - a.length);
    for (const r of roots) {
      if (!s.startsWith(r)) continue;
      const rest = s.slice(r.length);
      if (rest === '' || MONTH_CODES.includes(rest[0]) || /^[0-9!.]/.test(rest)) {
        return { root: r, mult: FUTURES_MULTIPLIERS[r], name: FUTURES_NAMES[r] || r };
      }
    }
    return null;
  }

  // Effective contract multiplier for a trade: an explicit trade.multiplier wins;
  // otherwise, futures trades auto-resolve from the symbol; everything else is 1.
  function getMultiplier(trade) {
    const m = Number(trade.multiplier);
    if (m && m > 0) return m;
    if (trade.assetClass === 'futures') {
      const fm = futuresMultiplier(trade.symbol);
      if (fm) return fm.mult;
    }
    return 1;
  }

  // === Derived trade calculations ===
  function calcPnL(trade) {
    if (!trade.exitPrice || !trade.entryPrice || !trade.quantity) return 0;
    const dir = trade.direction === 'short' ? -1 : 1;
    const gross = (trade.exitPrice - trade.entryPrice) * trade.quantity * getMultiplier(trade) * dir;
    const costs = (Number(trade.commission) || 0) + (Number(trade.fees) || 0);
    return gross - costs;
  }

  function calcPnLPct(trade, balance) {
    const pnl = calcPnL(trade);
    if (!balance) return null;
    return (pnl / balance) * 100;
  }

  function calcRMultiple(trade) {
    if (!trade.stopLoss || !trade.entryPrice || !trade.quantity) return null;
    const riskPerUnit = Math.abs(trade.entryPrice - trade.stopLoss);
    const totalRisk = riskPerUnit * trade.quantity * getMultiplier(trade);
    if (totalRisk === 0) return null;
    const pnl = calcPnL(trade);
    return pnl / totalRisk;
  }

  function calcRiskReward(trade) {
    if (!trade.stopLoss || !trade.takeProfit || !trade.entryPrice) return null;
    const risk   = Math.abs(trade.entryPrice - trade.stopLoss);
    const reward = Math.abs(trade.takeProfit - trade.entryPrice);
    if (risk === 0) return null;
    return reward / risk;
  }

  function calcPositionValue(trade) {
    if (!trade.entryPrice || !trade.quantity) return 0;
    return trade.entryPrice * trade.quantity * getMultiplier(trade);
  }

  function calcRiskDollars(trade) {
    if (!trade.stopLoss || !trade.entryPrice || !trade.quantity) return 0;
    return Math.abs(trade.entryPrice - trade.stopLoss) * trade.quantity * getMultiplier(trade);
  }

  // Parse a human duration string like "2h 50min 40sec", "16min 12sec", "12sec",
  // "1d 3h", "45m", "1:30:00" -> minutes. Returns null if unparseable.
  function parseDuration(str) {
    if (str == null) return null;
    const s = String(str).trim().toLowerCase();
    if (!s) return null;
    // clock format hh:mm:ss or mm:ss
    const clock = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
    if (clock) {
      return clock[3] !== undefined
        ? (+clock[1]) * 60 + (+clock[2]) + (+clock[3]) / 60
        : (+clock[1]) + (+clock[2]) / 60;
    }
    let total = 0, found = false;
    const grab = (re, factor) => { const m = s.match(re); if (m) { total += parseFloat(m[1]) * factor; found = true; } };
    grab(/(\d+(?:\.\d+)?)\s*d(?:ays?)?\b/, 1440);
    grab(/(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\b/, 60);
    grab(/(\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?\b/, 1);
    grab(/(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?\b/, 1 / 60);
    return found ? total : null;
  }

  function calcHoldMinutes(trade) {
    // Prefer an explicit hold time (e.g. imported from a broker's duration column)
    if (trade.holdMinutes != null && !isNaN(trade.holdMinutes)) return Number(trade.holdMinutes);
    if (!trade.entryDate || !trade.exitDate) return null;
    const e = new Date(trade.entryDate).getTime();
    const x = new Date(trade.exitDate).getTime();
    if (isNaN(e) || isNaN(x)) return null;
    return (x - e) / 60000;
  }

  // Pair a stream of raw executions (fills) into round-trip trades.
  // Each fill: { time (ISO/parseable), symbol, action ('buy'|'sell'), quantity, price, commission, account }.
  // Fills are grouped by account + symbol (never paired across accounts). A trade spans
  // flat -> position -> flat (scale-ins/scale-outs are averaged). A fill that flips through
  // zero is split into a close + a new open. Returns trade descriptors:
  // { symbol, account, direction, quantity, entryPrice, exitPrice, entryDate, exitDate, commission, status }.
  function pairFills(fills) {
    const groups = new Map();  // account symbol -> { symbol, account, fills:[] }
    for (const f of fills) {
      if (!f || !f.symbol || !f.action || !(f.quantity > 0) || f.price == null || !f.time) continue;
      const key = (f.account || '') + ' ' + f.symbol;
      let g = groups.get(key);
      if (!g) { g = { symbol: f.symbol, account: f.account || null, fills: [] }; groups.set(key, g); }
      g.fills.push(f);
    }
    const round2 = n => Math.round(n * 100) / 100;
    const trades = [];
    for (const g of groups.values()) {
      const list = g.fills.slice().sort((a, b) => new Date(a.time) - new Date(b.time));
      let pos = 0, cycle = null;
      const startCycle = (side, time) => ({ side, entryQty: 0, entryCost: 0, entryComm: 0, exitQty: 0, exitCost: 0, exitComm: 0, entryTime: time, exitTime: null });
      const emit = () => {
        if (!cycle || cycle.entryQty <= 0) { cycle = null; return; }
        trades.push({
          symbol: g.symbol,
          account: g.account,
          direction: cycle.side > 0 ? 'long' : 'short',
          quantity: cycle.entryQty,
          entryPrice: cycle.entryCost / cycle.entryQty,
          exitPrice: cycle.exitQty > 0 ? cycle.exitCost / cycle.exitQty : null,
          entryDate: cycle.entryTime,
          exitDate: cycle.exitTime,
          commission: round2(cycle.entryComm + cycle.exitComm),
          status: cycle.exitQty >= cycle.entryQty ? 'closed' : 'open',
        });
        cycle = null;
      };
      for (const f of list) {
        const dir = f.action === 'buy' ? 1 : -1;
        const commUnit = f.quantity ? (f.commission || 0) / f.quantity : 0;
        let rem = f.quantity;
        while (rem > 0) {
          if (pos === 0 && !cycle) cycle = startCycle(dir, f.time);
          if (pos === 0 || (pos > 0 && dir > 0) || (pos < 0 && dir < 0)) {
            // opening or scaling into the position
            cycle.entryQty += rem; cycle.entryCost += rem * f.price; cycle.entryComm += rem * commUnit;
            pos += dir * rem; rem = 0;
          } else {
            // reducing / closing the position
            const take = Math.min(rem, Math.abs(pos));
            cycle.exitQty += take; cycle.exitCost += take * f.price; cycle.exitComm += take * commUnit;
            cycle.exitTime = f.time;
            pos += dir * take; rem -= take;
            if (pos === 0) emit();  // back to flat -> trade complete; any remainder opens a new cycle
          }
        }
      }
      if (cycle) emit();  // still in an open position at the end of the stream
    }
    trades.sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
    return trades;
  }

  function tradeOutcome(trade) {
    if (trade.status !== 'closed') return 'open';
    const pnl = calcPnL(trade);
    if (Math.abs(pnl) < 0.01) return 'breakeven';
    return pnl > 0 ? 'win' : 'loss';
  }

  // Returns a trade with derived fields baked in (non-destructive)
  function enrich(trade) {
    return {
      ...trade,
      pnl: calcPnL(trade),
      rMultiple: calcRMultiple(trade),
      riskReward: calcRiskReward(trade),
      holdMinutes: calcHoldMinutes(trade),
      outcome: tradeOutcome(trade),
      positionValue: calcPositionValue(trade),
      riskDollars: calcRiskDollars(trade),
    };
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));
  }

  function pnlClass(n) {
    if (n === null || n === undefined || isNaN(n) || Math.abs(n) < 0.01) return 'neutral';
    return n > 0 ? 'profit' : 'loss';
  }

  function downloadFile(filename, content, mime = 'text/plain') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function toast(message, type = 'info') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = message;
    c.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  // Filter trades by a named period
  function filterByPeriod(trades, period) {
    if (period === 'all') return trades;
    const now = new Date();
    let start;
    switch (period) {
      case 'ytd':  start = new Date(now.getFullYear(), 0, 1); break;
      case 'mtd':  start = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case 'wtd': {
        const d = new Date(now);
        const day = d.getDay() || 7;
        d.setHours(0,0,0,0);
        d.setDate(d.getDate() - day + 1);
        start = d; break;
      }
      case '30d':  start = new Date(now.getTime() - 30 * 86400000); break;
      case '90d':  start = new Date(now.getTime() - 90 * 86400000); break;
      default:     return trades;
    }
    return trades.filter(t => new Date(t.entryDate) >= start);
  }

  function localDatetimeNow() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function isoToLocalDatetime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  return {
    uuid, getCurrency,
    fmtMoney, fmtMoneyCompact, fmtPct, fmtNum, fmtDate, fmtDateShort, fmtDateTime, fmtHoldTime, fmtR,
    calcPnL, calcPnLPct, calcRMultiple, calcRiskReward, calcPositionValue, calcRiskDollars, calcHoldMinutes,
    parseDuration, pairFills, tradeOutcome, enrich, futuresMultiplier, getMultiplier,
    escapeHtml, pnlClass, downloadFile, toast,
    filterByPeriod, localDatetimeNow, isoToLocalDatetime,
  };
})();
