// === AI Coach ===
// Sends the user's PRE-COMPUTED trading stats to Google's Gemini API (free tier)
// and streams back a written performance review. Bring-your-own key (stored locally).
// Model: gemini-2.5-flash. Direct browser call to the Generative Language API.

const AI = (() => {
  const KEY_STORAGE  = 'tj.aikey.v1';
  const LAST_STORAGE = 'tj.ai.last.v1';
  const MODEL = 'gemini-2.5-flash';
  const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;
  const PROVIDER = 'Google Gemini';

  const MISTAKE_LABELS = {
    'moved-stop':'Moved stop loss', 'no-plan':'No clear plan', 'oversized':'Oversized position',
    'undersized':'Undersized position', 'fomo':'FOMO entry', 'revenge':'Revenge trade',
    'early-exit':'Exited too early', 'late-exit':'Held too long', 'overtraded':'Overtraded',
    'chased':'Chased entry', 'ignored-plan':'Ignored trade plan', 'counter-trend':'Fought the trend',
  };

  // ---- API key storage (localStorage; per-browser, private) ----
  function getKey()  { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch (e) { return ''; } }
  function saveKey(k){ try { k ? localStorage.setItem(KEY_STORAGE, k.trim()) : localStorage.removeItem(KEY_STORAGE); } catch (e) {} }
  function hasKey()  { return !!getKey(); }
  function getLast() { try { return JSON.parse(localStorage.getItem(LAST_STORAGE) || 'null'); } catch (e) { return null; } }
  function saveLast(text) { try { localStorage.setItem(LAST_STORAGE, JSON.stringify({ text, at: new Date().toISOString() })); } catch (e) {} }

  const num = (n, d = 2) => (n === null || n === undefined || isNaN(n)) ? null : Number(Number(n).toFixed(d));
  const pf  = (v) => v === Infinity ? 'infinite' : num(v);

  // ---- Build a compact, information-rich summary of the trader's data ----
  function buildDataSummary(trades, settings) {
    const s = STATS.summarize(trades, settings);
    const zella = STATS.zellaScore(s, trades);
    const ins = STATS.insights(trades);

    const setups = STATS.bySetup(trades).filter(x => x.trades > 0).map(x => ({
      setup: x.key, trades: x.trades, winRatePct: num(x.winRate, 1),
      netPnl: num(x.netPnl), profitFactor: pf(x.profitFactor), avgR: num(x.avgR),
    }));
    const symbols = STATS.bySymbol(trades).filter(x => x.trades > 0).slice(0, 10).map(x => ({
      symbol: x.key, trades: x.trades, winRatePct: num(x.winRate, 1), netPnl: num(x.netPnl),
    }));
    const dow = STATS.byDayOfWeek(trades).filter(d => d.trades > 0).map(d => ({
      day: d.key, trades: d.trades, netPnl: num(d.netPnl), winRatePct: num(d.winRate, 1),
    }));
    const hours = STATS.byHour(trades).filter(h => h.trades > 0).map(h => ({
      hourOfDay: h.key, trades: h.trades, netPnl: num(h.netPnl), winRatePct: num(h.winRate, 1),
    }));
    const mistakes = STATS.mistakeStats(trades).map(m => ({
      mistake: MISTAKE_LABELS[m.key] || m.key, occurrences: m.count,
      totalPnlImpact: num(m.netPnl), avgImpactPerOccurrence: num(m.avgImpact),
    }));

    return {
      currency: settings.currency || '$',
      tradingStyle: settings.tradingStyle || 'unspecified',
      account: {
        initialBalance: num(s.initialBalance), currentBalance: num(s.currentBalance),
        totalReturnPct: num(s.totalReturnPct), plannedRiskPerTradePct: num(settings.defaultRiskPct),
      },
      overall: {
        closedTrades: s.totalTrades, openTrades: s.openTrades,
        wins: s.wins, losses: s.losses, breakevens: s.breakevens,
        winRatePct: num(s.winRate, 1),
        netPnl: num(s.netPnl), grossProfit: num(s.grossProfit), grossLoss: num(s.grossLoss),
        profitFactor: pf(s.profitFactor), expectancyPerTrade: num(s.expectancy),
        avgWin: num(s.avgWin), avgLoss: num(s.avgLoss), winLossRatio: pf(s.winLossRatio),
        largestWin: num(s.largestWin), largestLoss: num(s.largestLoss),
        totalCommissionsAndFees: num(s.totalCommissions),
      },
      rMultiples: { avgR: num(s.avgR), totalR: num(s.totalR), bestR: num(s.bestR), worstR: num(s.worstR), tradesWithDefinedRisk: s.rTradeCount },
      riskAdjusted: {
        maxDrawdown: num(s.maxDrawdown), maxDrawdownPct: num(s.maxDrawdownPct, 1),
        sharpeRatio: num(s.sharpe), sortinoRatio: num(s.sortino),
        recoveryFactor: pf(s.recoveryFactor), kellyCriterionPct: num(s.kelly, 1),
      },
      streaks: { currentStreak: s.currentStreak, bestWinStreak: s.bestWinStreak, worstLossStreak: s.worstLossStreak },
      avgHoldTime: { allTrades: UTIL.fmtHoldTime(s.avgHoldMinutes), winners: UTIL.fmtHoldTime(s.avgHoldWinMinutes), losers: UTIL.fmtHoldTime(s.avgHoldLossMinutes) },
      zellaScore: { overall_out_of_100: zella.overall, components_out_of_100: zella.metrics },
      performanceBySetup: setups,
      performanceBySymbol: symbols,
      performanceByDayOfWeek: dow,
      performanceByHourOfDay: hours,
      loggedMistakes: mistakes,
      highlights: ins ? {
        bestTrade: ins.best ? { symbol: ins.best.symbol, pnl: num(ins.best.pnl), rMultiple: num(ins.best.rMultiple) } : null,
        worstTrade: ins.worst ? { symbol: ins.worst.symbol, pnl: num(ins.worst.pnl), rMultiple: num(ins.worst.rMultiple) } : null,
        mostProfitableSetup: ins.bestSetup ? { setup: ins.bestSetup.key, netPnl: num(ins.bestSetup.netPnl) } : null,
        biggestLeak: ins.worstMistake ? { mistake: MISTAKE_LABELS[ins.worstMistake.key] || ins.worstMistake.key, totalCost: num(ins.worstMistake.netPnl), occurrences: ins.worstMistake.count } : null,
      } : null,
    };
  }

  const SYSTEM_PROMPT =
`You are an elite trading-performance coach and quantitative analyst — the kind who reviews the numbers behind a professional prop trader's results. You are reviewing a trader's OWN historical trade log to help them improve their process, discipline, risk management, and consistency.

You will be given performance statistics as JSON, already computed from the trader's trade log. Analyze them rigorously and write a concise, specific, honest performance review.

Rules:
- Ground EVERY observation in the actual numbers provided, and cite the specific figures (e.g. "your profit factor of 1.4", "you lose 2.3x more on Fridays").
- Be direct and candid. Surface weaknesses, leaks, and risks — not just positives. A good coach is honest, not flattering.
- Focus strictly on PROCESS and RISK: position sizing, R-multiples, win rate vs. payoff (expectancy), drawdown, streaks, rule/plan adherence, logged mistakes, best/worst setups, symbols, and timing.
- Do NOT predict markets, and do NOT tell the trader what to buy or sell. This is a review of PAST behavior and process only.
- Give concrete, prioritized, actionable recommendations the trader can apply immediately.
- If the sample size is small, say so and caveat the confidence of your conclusions.

Format the response in GitHub-flavored Markdown with these sections, in order:
- A single **bold one-line verdict** at the top.
- ## Strengths
- ## Weaknesses & Leaks
- ## Key Patterns
- ## Action Plan  (a numbered list of 3-5 prioritized, specific actions)

Be concise and lead with what matters. No filler, no generic platitudes.`;

  function buildUserPrompt(summary) {
    return `Here is my trading performance data, all figures pre-computed from my trade log. Currency is "${summary.currency}". Analyze my trading and give me an honest performance review.\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\``;
  }

  // ---- Streaming call to the Gemini Generative Language API (SSE) ----
  async function analyze({ onDelta, onDone, onError }) {
    const key = getKey();
    if (!key) { onError('No API key set. Add your Google Gemini API key in Settings → AI Coach.'); return; }

    const trades = STORAGE.getTrades();
    const settings = STORAGE.getSettings();
    const closed = trades.filter(t => t.status === 'closed');
    if (closed.length < 3) { onError('Log at least 3 closed trades before running an AI analysis.'); return; }

    const summary = buildDataSummary(trades, settings);
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(summary) }] }],
      generationConfig: { maxOutputTokens: 2560, temperature: 1, thinkingConfig: { thinkingBudget: 0 } },
    };

    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      });
    } catch (err) {
      onError('Could not reach the Gemini API. This is usually a network or CORS block — check your connection. (' + (err.message || err) + ')');
      return;
    }

    if (!res.ok) {
      let msg = 'API error ' + res.status;
      try { const j = await res.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) {}
      if (/api key not valid/i.test(msg) || res.status === 403) msg = 'Your Google Gemini API key is not valid. Double-check it in Settings (it should start with "AIza").';
      else if (res.status === 429) msg += ' — free-tier rate limit reached. Wait a minute and try again.';
      onError(msg);
      return;
    }

    // Parse the SSE stream (Gemini chunks: candidates[0].content.parts[].text)
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', full = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          const l = line.trim();
          if (!l.startsWith('data:')) continue;
          const payload = l.slice(5).trim();
          if (!payload) continue;
          let ev;
          try { ev = JSON.parse(payload); } catch (e) { continue; }
          if (ev.error) { onError(ev.error.message || 'The model returned an error.'); return; }
          const cand = ev.candidates && ev.candidates[0];
          if (cand && cand.content && Array.isArray(cand.content.parts)) {
            const text = cand.content.parts.map(p => p.text || '').join('');
            if (text) { full += text; onDelta(text, full); }
          }
          if (cand && cand.finishReason && cand.finishReason !== 'STOP' && !full) {
            onError('The model stopped early (' + cand.finishReason + '). Try again.');
            return;
          }
        }
      }
    } catch (err) {
      onError('The connection dropped while streaming the analysis. ' + (err.message || err));
      return;
    }

    if (!full.trim()) { onError('The model returned an empty response. Try again.'); return; }
    saveLast(full);
    onDone(full);
  }

  // ---- Minimal, safe Markdown -> HTML renderer ----
  function renderMarkdown(md) {
    const esc = UTIL.escapeHtml(md);
    const inline = (s) => s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

    const lines = esc.split('\n');
    let html = '', listType = null;
    const closeList = () => { if (listType) { html += (listType === 'ol' ? '</ol>' : '</ul>'); listType = null; } };

    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      let m;
      if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
        if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; }
        html += '<li>' + inline(m[1]) + '</li>';
      } else if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
        if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; }
        html += '<li>' + inline(m[1]) + '</li>';
      } else if ((m = line.match(/^###\s+(.*)$/))) { closeList(); html += '<h4>' + inline(m[1]) + '</h4>'; }
      else if ((m = line.match(/^##\s+(.*)$/)))  { closeList(); html += '<h3>' + inline(m[1]) + '</h3>'; }
      else if ((m = line.match(/^#\s+(.*)$/)))   { closeList(); html += '<h2>' + inline(m[1]) + '</h2>'; }
      else if (line.trim() === '') { closeList(); }
      else { closeList(); html += '<p>' + inline(line) + '</p>'; }
    }
    closeList();
    return html;
  }

  return { getKey, saveKey, hasKey, getLast, analyze, renderMarkdown, MODEL, PROVIDER };
})();
