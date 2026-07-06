# Trading Journal — a TradeZella-style journal

A personal, professional-grade trading journal modeled on **TradeZella**. Runs entirely in your browser — no install, no account, no cloud. All data is stored locally on your machine.

## How to open it

Double-click **`index.html`** — it opens in any modern browser (Chrome, Edge, Firefox). Everything (including the charting library) is bundled locally, so it works fully offline.

- **Light / dark theme:** toggle with the ☾/☀ button in the top bar (or press `L`). Your choice is remembered.
- **First run is empty by design** (all zeros). Go to **Settings → Load Sample Data** to explore a fully-populated journal, or start logging via **Add Trade**.
- **Back up regularly:** Settings → *Export All Data (JSON)*. Re-import anytime.

## Features

### Dashboard
- **8 stat tiles** — Net P&L, Trade Win % (with ring), Profit Factor, Day Win % (ring), Avg Win/Loss, Trade Expectancy, Current Streak, Max Drawdown
- **Instant Insights** — best trade, worst trade, top setup, and your biggest "leak" (most costly mistake) at a glance
- **Zella Score** — a 0–100 performance grade (purple gauge + radar) built from TradeZella's exact 6-metric weighted model: Profit Factor (25%), Avg Win/Loss (20%), Max Drawdown (20%), Win% (15%), Recovery Factor (10%), Consistency (10%)
- **Daily Net Cumulative P&L**, **Net Daily P&L**, and **Drawdown** charts
- **Monthly P&L calendar** — green/red day cells with P&L + trade count, weekly-summary column, and month navigation

### Playbooks
Document each setup as a **playbook** with a rules checklist. Tag trades to a playbook and check off which rules you followed — the journal tracks **per-playbook win rate, net P&L, profit factor, and average rule-adherence**, so you can see which strategies (and how much discipline) actually make money.

### AI Coach
An AI analyst (Google **Gemini** `gemini-2.5-flash`) reads all of your computed stats — win rate, R-multiples, drawdown, Zella Score, per-setup / symbol / day / hour breakdowns, and logged mistakes — and streams back an honest written **performance review** with strengths, leaks, key patterns, and a prioritized action plan. It reviews your *process and discipline*, not market predictions.

- **Free, bring your own key:** create a free Google Gemini key (no credit card) at [aistudio.google.com/apikey](https://aistudio.google.com/apikey), then paste it in **Settings → AI Coach**. It's stored **only in your browser** and sent directly to Google — never shared. Runs on Gemini's free tier at no cost.
- Not financial advice — a coaching/education aid for reviewing your own history.

### Trades & Reports
- Full **trade log** with search, filtering (status / direction / outcome / setup), and column sorting
- **Reports** — Sharpe, Sortino, Recovery Factor, Kelly %, R-multiple distribution, win-rate & P&L by setup / symbol / day-of-week / hour, hold-time vs P&L, MFE-vs-MAE efficiency, and a **mistake-cost table**

### Add Trade
Live-calculating form: as you type, it computes **P&L, R-multiple, risk:reward, position value, and dollar risk**. Captures MAE/MFE, 12 taggable mistakes, emotions, confidence, plan-adherence, thesis, post-trade analysis, lessons, screenshots, and playbook rule-adherence.

- **Futures-aware:** a **Contract Multiplier (point value)** field feeds every calculation. Type a recognized futures symbol (e.g. `ES`, `MES`, `NQ`, `MNQ`, `CL`, `GC`, `6E`, or month-coded `ESZ25` / `/MESM26`) and it auto-fills the point value (ES = $50, MES = $5, NQ = $20, CL = $1,000, …) and sets the asset class. Stocks/forex/crypto stay at ×1. CSV import auto-detects it too.

### Daily Journal
Per-day reflection: market prep & game plan, mental state, sleep, energy, routine adherence, wins/losses, and adjustments for tomorrow.

### Import / Export
- **CSV trade import** (Settings) — bring in trades from your broker or spreadsheet. Download the template for the exact columns: `symbol, direction, entryDate, entryPrice, quantity, stopLoss, takeProfit, exitDate, exitPrice, commission, fees, setup, tags`
- **CSV export** of all trades for Excel
- **JSON export/import** for full backups (and moving between computers/browsers)

### Keyboard shortcuts
`N` add trade · `G` then `D/T/R/P/J/S` jump to a page · `/` focus search (on Trades) · `L` toggle theme · `?` show all shortcuts · `Esc` close dialog

## Your data

Everything lives in your browser's **localStorage** — private, offline, on this machine and browser. Clearing browser data or switching browsers starts fresh, so **back up with the JSON export**.

## Files

```
index.html      — app shell & layout
styles.css      — TradeZella-style light/dark theme
js/storage.js   — localStorage persistence
js/utils.js     — formatting & per-trade calculations
js/stats.js     — statistics engine + Zella Score + insights
js/charts.js    — theme-aware Chart.js renderers
js/sample.js    — realistic sample-data generator
js/chart.umd.js — bundled charting library (offline)
js/app.js       — UI logic & wiring
```
