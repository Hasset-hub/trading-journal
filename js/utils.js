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

  // === Derived trade calculations ===
  function calcPnL(trade) {
    if (!trade.exitPrice || !trade.entryPrice || !trade.quantity) return 0;
    const dir = trade.direction === 'short' ? -1 : 1;
    const gross = (trade.exitPrice - trade.entryPrice) * trade.quantity * dir;
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
    const riskPerShare = Math.abs(trade.entryPrice - trade.stopLoss);
    const totalRisk = riskPerShare * trade.quantity;
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
    return trade.entryPrice * trade.quantity;
  }

  function calcRiskDollars(trade) {
    if (!trade.stopLoss || !trade.entryPrice || !trade.quantity) return 0;
    return Math.abs(trade.entryPrice - trade.stopLoss) * trade.quantity;
  }

  function calcHoldMinutes(trade) {
    if (!trade.entryDate || !trade.exitDate) return null;
    const e = new Date(trade.entryDate).getTime();
    const x = new Date(trade.exitDate).getTime();
    if (isNaN(e) || isNaN(x)) return null;
    return (x - e) / 60000;
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
    tradeOutcome, enrich,
    escapeHtml, pnlClass, downloadFile, toast,
    filterByPeriod, localDatetimeNow, isoToLocalDatetime,
  };
})();
