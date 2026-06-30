// === Sample Data Generator ===
// Produces a realistic set of trades so every chart and stat is populated.

const SAMPLE = (() => {

  const SYMBOLS = [
    { sym: 'AAPL', price: 185, asset: 'stock' },
    { sym: 'TSLA', price: 240, asset: 'stock' },
    { sym: 'NVDA', price: 880, asset: 'stock' },
    { sym: 'SPY',  price: 510, asset: 'stock' },
    { sym: 'AMD',  price: 165, asset: 'stock' },
    { sym: 'MSFT', price: 420, asset: 'stock' },
    { sym: 'EURUSD', price: 1.085, asset: 'forex' },
    { sym: 'BTCUSD', price: 64000, asset: 'crypto' },
    { sym: 'ETHUSD', price: 3400, asset: 'crypto' },
    { sym: 'ES',   price: 5200, asset: 'futures' },
  ];

  const SETUPS = ['Breakout', 'Pullback', 'Trend Continuation', 'Reversal', 'VWAP Bounce', 'Gap Fill', 'Range Fade'];
  const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1D'];
  const CONDITIONS = ['trending-up', 'trending-down', 'ranging', 'volatile', 'low-vol'];
  const EMOTIONS_GOOD = ['calm', 'confident', 'neutral'];
  const EMOTIONS_BAD  = ['anxious', 'fearful', 'greedy', 'frustrated', 'excited'];
  const MISTAKES_POOL = ['moved-stop', 'fomo', 'early-exit', 'late-exit', 'chased', 'oversized', 'revenge', 'no-plan', 'ignored-plan', 'counter-trend'];
  const TAGS_POOL = ['high-volume', 'earnings', 'gap-up', 'gap-down', 'news', 'momentum', 'oversold', 'overbought', 'support', 'resistance'];

  const THESES = [
    'Price broke above the prior day high on rising volume. Buying the retest of the breakout level with stop below the consolidation.',
    'Stock pulling back to the rising 20 EMA in a clean uptrend. Looking for a bounce off support to continue the trend.',
    'Failed breakdown at key support — taking the reversal long as trapped sellers cover.',
    'Bearish rejection at resistance after an extended run. Shorting the lower-high with a tight stop above the swing.',
    'VWAP reclaim after morning flush. Momentum shifting back up, entering on the reclaim.',
    'Range-bound all session. Fading the top of the range back toward the mean.',
  ];

  const NOTES = [
    'Played out cleanly — hit target without much heat. Textbook execution.',
    'Took some adverse movement first but thesis held. Stayed patient and let it work.',
    'Got shaken out near my stop then it ran without me. Stop was slightly too tight.',
    'Exited early out of fear before the target. Left money on the table.',
    'Held past my target hoping for more, gave back gains. Should have honored the plan.',
    'Market turned against the position. Cut it at the stop as planned — good discipline.',
  ];

  const LESSONS = [
    'Trust the setup and let winners run to target.',
    'Give the trade room — stop placement should respect structure, not fear.',
    'Honor the exit plan. Hope is not a strategy.',
    'Position size was right; risk felt controlled the whole way.',
    'Wait for confirmation instead of anticipating the move.',
    '',
  ];

  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function randF(min, max) { return min + Math.random() * (max - min); }
  function randI(min, max) { return Math.floor(randF(min, max + 1)); }
  function chance(p) { return Math.random() < p; }

  function uuid() {
    return 'tr_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36).slice(-4) + randI(0,999);
  }

  function generate() {
    const trades = [];
    const N = 64;
    const now = Date.now();

    // Skew toward a slightly profitable, realistic system: ~52% win rate, avg winner > avg loser.
    for (let i = 0; i < N; i++) {
      const inst = rand(SYMBOLS);
      const direction = chance(0.6) ? 'long' : 'short';
      const dirMult = direction === 'long' ? 1 : -1;

      // Entry timing: spread across the last ~120 days, weekdays, market hours
      const daysAgo = Math.floor((1 - Math.pow(Math.random(), 0.7)) * 120);
      const entry = new Date(now - daysAgo * 86400000);
      // nudge onto a weekday
      if (entry.getDay() === 0) entry.setDate(entry.getDate() + 1);
      if (entry.getDay() === 6) entry.setDate(entry.getDate() - 1);
      entry.setHours(randI(9, 15), randI(0, 59), 0, 0);

      const entryPrice = +(inst.price * randF(0.97, 1.03)).toFixed(inst.price < 10 ? 5 : 2);

      // Risk: stop ~0.8-2% away
      const riskPct = randF(0.008, 0.02);
      const stopLoss = +(entryPrice * (1 - dirMult * riskPct)).toFixed(inst.price < 10 ? 5 : 2);
      const rrTarget = randF(1.5, 3.2);
      const takeProfit = +(entryPrice * (1 + dirMult * riskPct * rrTarget)).toFixed(inst.price < 10 ? 5 : 2);

      // Position size: risk ~1% of 25k = $250 risk
      const riskPerShare = Math.abs(entryPrice - stopLoss);
      const quantity = Math.max(1, Math.round(250 / riskPerShare / (inst.asset === 'crypto' ? 1000 : 1)) * (inst.asset === 'crypto' ? 0.01 : 1));

      const isWin = chance(0.52);

      // Outcome in R terms
      let rResult;
      if (isWin) rResult = randF(0.6, rrTarget * randF(0.85, 1.05));   // winners reach toward target
      else        rResult = -randF(0.6, 1.1);                           // losers around -1R (some slippage)

      const exitPrice = +(entryPrice + dirMult * riskPerShare * rResult).toFixed(inst.price < 10 ? 5 : 2);

      // Hold time depends on timeframe
      const tf = rand(TIMEFRAMES);
      const holdMin = { '5m': randI(5, 90), '15m': randI(20, 240), '1h': randI(60, 600), '4h': randI(240, 2880), '1D': randI(1440, 14400) }[tf];
      const exit = new Date(entry.getTime() + holdMin * 60000);

      // MFE/MAE
      const mfeR = isWin ? rResult * randF(1.0, 1.4) : randF(0.2, 0.9);
      const maeR = isWin ? -randF(0.1, 0.7) : rResult * randF(1.0, 1.3);
      const mfe = +(entryPrice + dirMult * riskPerShare * mfeR).toFixed(inst.price < 10 ? 5 : 2);
      const mae = +(entryPrice + dirMult * riskPerShare * maeR).toFixed(inst.price < 10 ? 5 : 2);

      const commission = inst.asset === 'stock' ? +(quantity * 0.005).toFixed(2) : +(randF(0.5, 4)).toFixed(2);

      // Psychology — losers more likely to carry mistakes/negative emotion
      const hasMistake = isWin ? chance(0.18) : chance(0.5);
      const mistakes = hasMistake ? [rand(MISTAKES_POOL), ...(chance(0.3) ? [rand(MISTAKES_POOL)] : [])] : [];
      const emotionBefore = isWin ? (chance(0.7) ? rand(EMOTIONS_GOOD) : rand(EMOTIONS_BAD)) : (chance(0.55) ? rand(EMOTIONS_BAD) : rand(EMOTIONS_GOOD));

      const tags = [];
      const nTags = randI(0, 2);
      for (let k = 0; k < nTags; k++) { const tg = rand(TAGS_POOL); if (!tags.includes(tg)) tags.push(tg); }

      trades.push({
        id: uuid(),
        symbol: inst.sym,
        assetClass: inst.asset,
        direction,
        status: 'closed',
        entryDate: entry.toISOString(),
        entryPrice,
        quantity,
        stopLoss,
        takeProfit,
        exitDate: exit.toISOString(),
        exitPrice,
        commission,
        fees: 0,
        setup: rand(SETUPS),
        marketCondition: rand(CONDITIONS),
        timeframe: tf,
        tags,
        mae,
        mfe,
        mistakes,
        emotionBefore,
        emotionDuring: chance(0.5) ? rand([...EMOTIONS_GOOD, ...EMOTIONS_BAD]) : '',
        confidence: isWin ? randI(5, 9) : randI(3, 7),
        planFollowed: mistakes.length ? (chance(0.5) ? 'mostly' : 'no') : (chance(0.8) ? 'yes' : 'mostly'),
        thesis: rand(THESES),
        notes: rand(NOTES),
        lessons: rand(LESSONS),
        screenshots: [],
        createdAt: entry.toISOString(),
        updatedAt: exit.toISOString(),
      });
    }

    // A couple of open trades for realism
    for (let i = 0; i < 2; i++) {
      const inst = rand(SYMBOLS);
      const direction = chance(0.5) ? 'long' : 'short';
      const dirMult = direction === 'long' ? 1 : -1;
      const entry = new Date(now - randI(0, 3) * 86400000);
      entry.setHours(randI(9, 15), randI(0, 59), 0, 0);
      const entryPrice = +(inst.price * randF(0.99, 1.01)).toFixed(inst.price < 10 ? 5 : 2);
      const riskPct = randF(0.01, 0.02);
      const stopLoss = +(entryPrice * (1 - dirMult * riskPct)).toFixed(inst.price < 10 ? 5 : 2);
      const takeProfit = +(entryPrice * (1 + dirMult * riskPct * 2.5)).toFixed(inst.price < 10 ? 5 : 2);
      const riskPerShare = Math.abs(entryPrice - stopLoss);
      const quantity = Math.max(1, Math.round(250 / riskPerShare));
      trades.push({
        id: uuid(),
        symbol: inst.sym, assetClass: inst.asset, direction, status: 'open',
        entryDate: entry.toISOString(), entryPrice, quantity, stopLoss, takeProfit,
        exitDate: null, exitPrice: null, commission: 0, fees: 0,
        setup: rand(SETUPS), marketCondition: rand(CONDITIONS), timeframe: rand(TIMEFRAMES),
        tags: [], mae: null, mfe: null, mistakes: [],
        emotionBefore: rand(EMOTIONS_GOOD), emotionDuring: '', confidence: randI(5, 8),
        planFollowed: '', thesis: rand(THESES), notes: '', lessons: '', screenshots: [],
        createdAt: entry.toISOString(), updatedAt: entry.toISOString(),
      });
    }

    return trades;
  }

  return { generate };
})();
