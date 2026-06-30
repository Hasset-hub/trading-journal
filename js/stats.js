// === Statistics Engine ===
// Calculates the full suite of professional performance metrics.

const STATS = (() => {

  function summarize(trades, settings) {
    const closed = trades.filter(t => t.status === 'closed').map(UTIL.enrich);
    const open   = trades.filter(t => t.status === 'open');
    const initialBalance = Number(settings.initialBalance) || 0;

    const wins   = closed.filter(t => t.outcome === 'win');
    const losses = closed.filter(t => t.outcome === 'loss');
    const breakevens = closed.filter(t => t.outcome === 'breakeven');

    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss   = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const netPnl      = closed.reduce((s, t) => s + t.pnl, 0);
    const totalCommissions = closed.reduce((s, t) => s + (Number(t.commission) || 0) + (Number(t.fees) || 0), 0);

    const currentBalance = initialBalance + netPnl;
    const totalReturnPct = initialBalance > 0 ? (netPnl / initialBalance) * 100 : 0;

    const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
    const lossRate = closed.length ? (losses.length / closed.length) * 100 : 0;

    const avgWin = wins.length ? grossProfit / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? Infinity : 0);

    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);

    // Expectancy = (Win% * AvgWin) - (Loss% * AvgLoss)
    const expectancy = closed.length
      ? ((wins.length / closed.length) * avgWin) - ((losses.length / closed.length) * avgLoss)
      : 0;

    const largestWin  = wins.length   ? Math.max(...wins.map(t => t.pnl))   : 0;
    const largestLoss = losses.length ? Math.min(...losses.map(t => t.pnl)) : 0;

    // R-Multiples
    const rTrades = closed.filter(t => t.rMultiple !== null && !isNaN(t.rMultiple));
    const avgR = rTrades.length ? rTrades.reduce((s, t) => s + t.rMultiple, 0) / rTrades.length : 0;
    const totalR = rTrades.reduce((s, t) => s + t.rMultiple, 0);
    const bestR  = rTrades.length ? Math.max(...rTrades.map(t => t.rMultiple)) : 0;
    const worstR = rTrades.length ? Math.min(...rTrades.map(t => t.rMultiple)) : 0;

    // Streaks
    const sortedByExit = [...closed].sort((a, b) => new Date(a.exitDate) - new Date(b.exitDate));
    let curStreak = 0, curStreakSign = 0;
    let bestWinStreak = 0, worstLossStreak = 0;
    let winStreak = 0, lossStreak = 0;
    for (const t of sortedByExit) {
      if (t.outcome === 'win') {
        winStreak++; lossStreak = 0;
        if (winStreak > bestWinStreak) bestWinStreak = winStreak;
      } else if (t.outcome === 'loss') {
        lossStreak++; winStreak = 0;
        if (lossStreak > worstLossStreak) worstLossStreak = lossStreak;
      } else {
        winStreak = 0; lossStreak = 0;
      }
    }
    // Current streak from end
    for (let i = sortedByExit.length - 1; i >= 0; i--) {
      const o = sortedByExit[i].outcome;
      if (o === 'breakeven') break;
      const sign = o === 'win' ? 1 : -1;
      if (curStreakSign === 0) { curStreakSign = sign; curStreak = 1; continue; }
      if (sign === curStreakSign) curStreak++; else break;
    }

    // Equity curve & drawdown
    const equityCurve = [];
    let runningEquity = initialBalance;
    let peak = initialBalance;
    let maxDD = 0;
    let maxDDPct = 0;
    for (const t of sortedByExit) {
      runningEquity += t.pnl;
      if (runningEquity > peak) peak = runningEquity;
      const dd = peak - runningEquity;
      const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
      if (ddPct > maxDDPct) maxDDPct = ddPct;
      equityCurve.push({
        date: t.exitDate,
        equity: runningEquity,
        drawdown: -dd,
        drawdownPct: -ddPct,
        trade: t,
      });
    }

    const recoveryFactor = maxDD > 0 ? netPnl / maxDD : (netPnl > 0 ? Infinity : 0);

    // Sharpe Ratio (per-trade returns, annualized assuming ~252 trades/yr)
    const tradeReturns = sortedByExit
      .map(t => initialBalance > 0 ? t.pnl / initialBalance : 0)
      .filter(r => !isNaN(r));
    const meanRet = tradeReturns.length ? tradeReturns.reduce((s, r) => s + r, 0) / tradeReturns.length : 0;
    const variance = tradeReturns.length
      ? tradeReturns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / tradeReturns.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0 ? (meanRet / stdDev) * Math.sqrt(252) : 0;

    // Sortino — downside deviation only
    const downsideRets = tradeReturns.filter(r => r < 0);
    const downsideVar = downsideRets.length
      ? downsideRets.reduce((s, r) => s + r * r, 0) / tradeReturns.length
      : 0;
    const downsideStd = Math.sqrt(downsideVar);
    const sortino = downsideStd > 0 ? (meanRet / downsideStd) * Math.sqrt(252) : 0;

    // Kelly Criterion = W - ((1-W) / R)
    const W = winRate / 100;
    const R = avgLoss > 0 ? avgWin / avgLoss : 0;
    const kelly = R > 0 ? (W - (1 - W) / R) * 100 : 0;

    // Hold time
    const holdTimes = closed.map(t => t.holdMinutes).filter(h => h !== null && !isNaN(h));
    const avgHold   = holdTimes.length ? holdTimes.reduce((s, h) => s + h, 0) / holdTimes.length : 0;
    const avgHoldWin  = wins.map(t => t.holdMinutes).filter(h => h !== null);
    const avgHoldLoss = losses.map(t => t.holdMinutes).filter(h => h !== null);
    const avgHoldWinM  = avgHoldWin.length  ? avgHoldWin.reduce((s, h)  => s + h, 0) / avgHoldWin.length  : 0;
    const avgHoldLossM = avgHoldLoss.length ? avgHoldLoss.reduce((s, h) => s + h, 0) / avgHoldLoss.length : 0;

    return {
      // Counts
      totalTrades: closed.length, openTrades: open.length,
      wins: wins.length, losses: losses.length, breakevens: breakevens.length,

      // P&L
      netPnl, grossProfit, grossLoss, totalCommissions,
      currentBalance, initialBalance, totalReturnPct,

      // Rates
      winRate, lossRate,
      profitFactor, expectancy,

      // Averages
      avgWin, avgLoss, winLossRatio,
      largestWin, largestLoss,

      // R-Multiples
      avgR, totalR, bestR, worstR, rTradeCount: rTrades.length,

      // Streaks
      currentStreak: curStreak * (curStreakSign || 1),
      bestWinStreak, worstLossStreak,

      // Risk-adjusted
      sharpe, sortino, recoveryFactor, kelly,
      maxDrawdown: maxDD, maxDrawdownPct: maxDDPct,
      stdDev: stdDev * 100,

      // Hold times
      avgHoldMinutes: avgHold,
      avgHoldWinMinutes: avgHoldWinM,
      avgHoldLossMinutes: avgHoldLossM,

      // For charts
      equityCurve,
    };
  }

  // === Group Helpers ===
  function groupBy(trades, fn) {
    const groups = new Map();
    for (const t of trades) {
      const key = fn(t);
      if (key === null || key === undefined || key === '') continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    return groups;
  }

  function groupStats(group) {
    const ts = group.map(UTIL.enrich);
    const wins = ts.filter(t => t.outcome === 'win');
    const losses = ts.filter(t => t.outcome === 'loss');
    const netPnl = ts.reduce((s, t) => s + t.pnl, 0);
    const winRate = ts.length ? (wins.length / ts.length) * 100 : 0;
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss   = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
    const avgR = ts.filter(t => t.rMultiple !== null).reduce((s, t, _, a) => s + t.rMultiple / a.length, 0);
    return { trades: ts.length, wins: wins.length, losses: losses.length, netPnl, winRate, profitFactor, avgR };
  }

  function bySetup(trades) {
    const closed = trades.filter(t => t.status === 'closed');
    const groups = groupBy(closed, t => t.setup || 'Untagged');
    return [...groups.entries()].map(([k, v]) => ({ key: k, ...groupStats(v) }))
      .sort((a, b) => b.netPnl - a.netPnl);
  }

  function bySymbol(trades) {
    const closed = trades.filter(t => t.status === 'closed');
    const groups = groupBy(closed, t => t.symbol);
    return [...groups.entries()].map(([k, v]) => ({ key: k, ...groupStats(v) }))
      .sort((a, b) => b.netPnl - a.netPnl);
  }

  function byDayOfWeek(trades) {
    const closed = trades.filter(t => t.status === 'closed');
    const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const groups = groupBy(closed, t => dows[new Date(t.exitDate || t.entryDate).getDay()]);
    return dows.map(d => ({ key: d, ...(groups.has(d) ? groupStats(groups.get(d)) : { trades: 0, wins: 0, losses: 0, netPnl: 0, winRate: 0, profitFactor: 0, avgR: 0 }) }));
  }

  function byHour(trades) {
    const closed = trades.filter(t => t.status === 'closed');
    const groups = groupBy(closed, t => new Date(t.entryDate).getHours());
    const hours = [];
    for (let h = 0; h < 24; h++) {
      hours.push({ key: h, ...(groups.has(h) ? groupStats(groups.get(h)) : { trades: 0, wins: 0, losses: 0, netPnl: 0, winRate: 0, profitFactor: 0, avgR: 0 }) });
    }
    return hours;
  }

  function byDay(trades) {
    const closed = trades.filter(t => t.status === 'closed');
    const groups = groupBy(closed, t => {
      const d = new Date(t.exitDate || t.entryDate);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    });
    return [...groups.entries()].map(([k, v]) => ({ key: k, ...groupStats(v) }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  function mistakeStats(trades) {
    const closed = trades.filter(t => t.status === 'closed');
    const counts = new Map();
    for (const t of closed) {
      const ms = t.mistakes || [];
      for (const m of ms) {
        if (!counts.has(m)) counts.set(m, { count: 0, netPnl: 0, trades: [] });
        const e = counts.get(m);
        e.count++;
        e.netPnl += UTIL.calcPnL(t);
        e.trades.push(t);
      }
    }
    return [...counts.entries()].map(([k, v]) => ({
      key: k,
      count: v.count,
      netPnl: v.netPnl,
      avgImpact: v.count > 0 ? v.netPnl / v.count : 0,
    })).sort((a, b) => a.netPnl - b.netPnl);
  }

  function rDistribution(trades) {
    const closed = trades.filter(t => t.status === 'closed').map(UTIL.enrich);
    const buckets = {
      '<-3R': 0, '-3 to -2R': 0, '-2 to -1R': 0, '-1 to 0R': 0,
      '0 to +1R': 0, '+1 to +2R': 0, '+2 to +3R': 0, '+3 to +5R': 0, '>+5R': 0,
    };
    for (const t of closed) {
      if (t.rMultiple === null || isNaN(t.rMultiple)) continue;
      const r = t.rMultiple;
      if (r < -3) buckets['<-3R']++;
      else if (r < -2) buckets['-3 to -2R']++;
      else if (r < -1) buckets['-2 to -1R']++;
      else if (r < 0)  buckets['-1 to 0R']++;
      else if (r < 1)  buckets['0 to +1R']++;
      else if (r < 2)  buckets['+1 to +2R']++;
      else if (r < 3)  buckets['+2 to +3R']++;
      else if (r < 5)  buckets['+3 to +5R']++;
      else             buckets['>+5R']++;
    }
    return buckets;
  }

  // === Zella Score === (mirrors TradeZella's 6-metric weighted model)
  function zellaScore(summary, trades) {
    const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

    // Profit Factor & Avg Win/Loss share the same band: 1.8 -> 20, 2.6 -> 100
    const bandScore = (v) => {
      if (!isFinite(v)) return 100;
      return clamp(20 + ((v - 1.8) / (2.6 - 1.8)) * 80);
    };

    const sProfitFactor  = bandScore(summary.profitFactor);
    const sAvgWinLoss    = bandScore(summary.winLossRatio);
    const sMaxDrawdown   = clamp(100 - summary.maxDrawdownPct);
    const sWinRate       = clamp((summary.winRate / 60) * 100);
    const sRecovery      = isFinite(summary.recoveryFactor)
      ? clamp(((summary.recoveryFactor - 1.0) / (3.5 - 1.0)) * 100)
      : 100;

    // Consistency: how little the single best day dominates total profit
    const days = byDay(trades).filter(d => d.trades > 0);
    const upDays = days.filter(d => d.netPnl > 0);
    const totalUp = upDays.reduce((s, d) => s + d.netPnl, 0);
    const maxDay = upDays.length ? Math.max(...upDays.map(d => d.netPnl)) : 0;
    const sConsistency = totalUp > 0 ? clamp(100 * (1 - maxDay / totalUp) + (upDays.length > 1 ? 0 : 0)) : 0;

    const metrics = {
      profitFactor:  Math.round(sProfitFactor),
      avgWinLoss:    Math.round(sAvgWinLoss),
      maxDrawdown:   Math.round(sMaxDrawdown),
      winRate:       Math.round(sWinRate),
      recoveryFactor: Math.round(sRecovery),
      consistency:   Math.round(sConsistency),
    };

    const overall =
      0.25 * sProfitFactor +
      0.20 * sAvgWinLoss +
      0.20 * sMaxDrawdown +
      0.15 * sWinRate +
      0.10 * sRecovery +
      0.10 * sConsistency;

    return { overall: Math.round(clamp(overall)), metrics };
  }

  // === Instant Insights ===
  function insights(trades) {
    const closed = trades.filter(t => t.status === 'closed').map(UTIL.enrich);
    if (!closed.length) return null;
    const best  = closed.reduce((a, b) => (b.pnl > a.pnl ? b : a));
    const worst = closed.reduce((a, b) => (b.pnl < a.pnl ? b : a));
    const setups = bySetup(trades).filter(s => s.trades > 0);
    const bestSetup = setups.length ? setups[0] : null;          // sorted netPnl desc
    const mistakes = mistakeStats(trades);
    const worstMistake = mistakes.length && mistakes[0].netPnl < 0 ? mistakes[0] : null; // most negative first
    const days = byDay(trades);
    const bestDay = days.length ? days.reduce((a, b) => (b.netPnl > a.netPnl ? b : a)) : null;
    return { best, worst, bestSetup, worstMistake, bestDay };
  }

  // === Per-playbook performance (incl. rule adherence) ===
  function playbookPerf(trades, playbook) {
    const ts = trades.filter(t => t.status === 'closed' && t.playbookId === playbook.id);
    const gs = groupStats(ts);
    const ruleCount = (playbook.rules || []).length;
    const adh = ruleCount
      ? ts.map(t => ((t.rulesFollowed || []).length / ruleCount) * 100)
      : [];
    const avgAdherence = adh.length ? adh.reduce((a, b) => a + b, 0) / adh.length : null;
    return { ...gs, avgAdherence };
  }

  return { summarize, bySetup, bySymbol, byDayOfWeek, byHour, byDay, mistakeStats, rDistribution, zellaScore, insights, playbookPerf };
})();
