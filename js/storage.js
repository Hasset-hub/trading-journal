// === Storage Layer ===
// Wraps localStorage with namespaced keys and JSON serialization.

const STORAGE = (() => {
  const KEYS = {
    TRADES:    'tj.trades.v1',
    SETTINGS:  'tj.settings.v1',
    JOURNAL:   'tj.journal.v1',
    PLAYBOOKS: 'tj.playbooks.v1',
  };

  const DEFAULT_SETTINGS = {
    initialBalance: 10000,
    currency: '$',
    defaultRiskPct: 1.0,
    tradingStyle: '',
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('Storage read failed', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  return {
    getTrades:    ()  => read(KEYS.TRADES, []),
    saveTrades:   (t) => write(KEYS.TRADES, t),
    getSettings:  ()  => ({ ...DEFAULT_SETTINGS, ...read(KEYS.SETTINGS, {}) }),
    saveSettings: (s) => write(KEYS.SETTINGS, s),
    getJournal:   ()  => read(KEYS.JOURNAL, {}),
    saveJournal:  (j) => write(KEYS.JOURNAL, j),
    getPlaybooks: ()  => read(KEYS.PLAYBOOKS, []),
    savePlaybooks:(p) => write(KEYS.PLAYBOOKS, p),

    exportAll: () => ({
      version: 2,
      exportedAt: new Date().toISOString(),
      trades:    read(KEYS.TRADES, []),
      settings:  read(KEYS.SETTINGS, {}),
      journal:   read(KEYS.JOURNAL, {}),
      playbooks: read(KEYS.PLAYBOOKS, []),
    }),

    importAll: (data) => {
      if (!data || typeof data !== 'object') throw new Error('Invalid data');
      if (Array.isArray(data.trades))      write(KEYS.TRADES, data.trades);
      if (data.settings && typeof data.settings === 'object') write(KEYS.SETTINGS, data.settings);
      if (data.journal  && typeof data.journal  === 'object') write(KEYS.JOURNAL, data.journal);
      if (Array.isArray(data.playbooks))   write(KEYS.PLAYBOOKS, data.playbooks);
    },

    clearAll: () => {
      Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    },
  };
})();
