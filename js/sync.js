// === NinjaTrader Folder Auto-Sync ===
// Connects the journal to a local folder that the NinjaScript add-on writes trade
// executions into, using the File System Access API. New fills are read and imported
// (paired into round-trip trades, de-duplicated) automatically when the app opens,
// or on demand. Everything stays on the user's machine — no server involved.

const SYNC = (() => {
  const IDB_NAME = 'tj-sync', STORE = 'handles', HKEY = 'ninjatrader-dir';
  const META_KEY = 'tj.sync.meta.v1';
  const state = { handle: null, busy: false };

  const byId = id => document.getElementById(id);
  const supported = () => typeof window.showDirectoryPicker === 'function';

  // ---- persisted meta (last synced timestamp) ----
  function getMeta() { try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { return {}; } }
  function setMeta(patch) { localStorage.setItem(META_KEY, JSON.stringify({ ...getMeta(), ...patch })); }

  // ---- IndexedDB (directory handles can't live in localStorage) ----
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(IDB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbSet(k, v) {
    const db = await idb();
    return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  }
  async function idbGet(k) {
    const db = await idb();
    return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const rq = tx.objectStore(STORE).get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  }
  async function idbDel(k) {
    const db = await idb();
    return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  }

  async function verifyPermission(handle, withPrompt) {
    const opts = { mode: 'read' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if (withPrompt && (await handle.requestPermission(opts)) === 'granted') return true;
    return false;
  }

  // Read every CSV in the folder, passing import options straight to APP.ingestCSV.
  // Returns { added, dupes, files, accounts } (accounts = every account name seen).
  async function readFolder(handle, importOpts) {
    let added = 0, dupes = 0, files = 0;
    const accounts = new Set();
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file' || !/\.csv$/i.test(entry.name)) continue;
      files++;
      try {
        const file = await entry.getFile();
        const text = await file.text();
        const res = APP.ingestCSV(text, { source: 'silent', ...importOpts });
        if (res) { added += res.added || 0; dupes += res.dupes || 0; (res.accounts || []).forEach(a => accounts.add(a)); }
      } catch (e) { console.warn('Sync: could not read', entry.name, e); }
    }
    return { added, dupes, files, accounts: [...accounts] };
  }

  async function doSync(handle, { silent }) {
    if (state.busy) return { added: 0, dupes: 0, files: 0 };
    state.busy = true;
    try {
      // First discover which accounts are in the folder (imports nothing).
      const disc = await readFolder(handle, { discoverOnly: true });
      setMeta({ knownAccounts: disc.accounts });
      const allowed = getMeta().allowedAccounts;   // array once chosen; undefined until then

      // More than one account and no choice yet -> ask before importing anyone's trades.
      if (disc.accounts.length >= 2 && !Array.isArray(allowed)) {
        renderAccounts();
        updateUI();
        if (!silent) UTIL.toast(`Found ${disc.accounts.length} accounts — choose which to import below.`, 'info');
        return { added: 0, needsChoice: true };
      }

      const res = await readFolder(handle, { allowedAccounts: Array.isArray(allowed) ? allowed : null });
      if (Array.isArray(allowed)) APP.pruneAccounts(allowed);
      setMeta({ lastSynced: Date.now() });
      if (res.added > 0 && APP.refresh) APP.refresh();
      if (!silent) {
        if (res.files === 0) UTIL.toast('No CSV files in that folder yet. Make a trade in NinjaTrader, then Sync.', 'info');
        else UTIL.toast(res.added ? `Synced ${res.added} new trade${res.added !== 1 ? 's' : ''}.` : 'Already up to date — no new trades.', 'success');
      } else if (res.added > 0) {
        UTIL.toast(`NinjaTrader: ${res.added} new trade${res.added !== 1 ? 's' : ''} synced.`, 'success');
      }
      renderAccounts();
      updateUI();
      return res;
    } finally { state.busy = false; }
  }

  // Render the account picker (only when 2+ accounts have been seen in the folder).
  function renderAccounts() {
    const wrap = byId('nt-accounts');
    if (!wrap) return;
    const meta = getMeta();
    const known = meta.knownAccounts || [];
    if (known.length < 2) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
    // null = no choice made yet. With several accounts (e.g. someone else's is paired too),
    // start UNCHECKED so nothing imports until the user consciously picks their own.
    const allowed = Array.isArray(meta.allowedAccounts) ? meta.allowedAccounts.map(a => a.toLowerCase()) : null;
    wrap.style.display = '';
    wrap.innerHTML =
      `<div style="font-size:12.5px;color:var(--text-2);margin:2px 0 6px">Import trades from these accounts only — <strong>tick yours</strong>, then Apply:</div>` +
      known.map(a => {
        const checked = allowed !== null && allowed.includes(a.toLowerCase());
        return `<label style="display:inline-flex;align-items:center;gap:6px;margin:0 14px 6px 0;font-size:13px">
          <input type="checkbox" class="nt-acct" value="${UTIL.escapeHtml(a)}" ${checked ? 'checked' : ''}> ${UTIL.escapeHtml(a)}</label>`;
      }).join('') +
      `<div style="margin-top:4px"><button class="btn btn-primary" id="nt-acct-apply">Apply account selection</button></div>`;
    const apply = byId('nt-acct-apply');
    if (apply) apply.addEventListener('click', applyAccounts);
  }

  async function applyAccounts() {
    const boxes = [...document.querySelectorAll('.nt-acct')];
    const allowed = boxes.filter(b => b.checked).map(b => b.value);
    if (!allowed.length) { UTIL.toast('Pick at least one account to import.', 'error'); return; }
    setMeta({ allowedAccounts: allowed });
    const removed = APP.pruneAccounts(allowed);
    if (state.handle) await doSync(state.handle, { silent: false });
    if (removed) UTIL.toast(`Removed ${removed} trade${removed !== 1 ? 's' : ''} from unselected accounts.`, 'success');
    if (APP.refresh) APP.refresh();
    renderAccounts();
  }

  async function connect() {
    if (!supported()) { UTIL.toast('Folder access needs Chrome or Edge on desktop.', 'error'); return; }
    let handle;
    try { handle = await window.showDirectoryPicker({ id: 'nt-journal', mode: 'read' }); }
    catch (e) { return; } // user cancelled the picker
    try {
      await idbSet(HKEY, handle);
      state.handle = handle;
      updateUI();
      await doSync(handle, { silent: false });
    } catch (e) { console.error('Sync connect failed', e); UTIL.toast('Could not connect that folder.', 'error'); }
  }

  async function syncNow() {
    if (!state.handle) { connect(); return; }
    if (!(await verifyPermission(state.handle, true))) { UTIL.toast('Permission to read the folder was denied.', 'error'); return; }
    await doSync(state.handle, { silent: false });
  }

  async function disconnect() {
    try { await idbDel(HKEY); } catch (e) {}
    state.handle = null;
    localStorage.removeItem(META_KEY);   // forget last-synced, known/allowed accounts
    updateUI();
    renderAccounts();
    UTIL.toast('NinjaTrader folder disconnected.', 'success');
  }

  function updateUI() {
    const statusEl = byId('nt-sync-status');
    if (!statusEl) return;
    const connectBtn = byId('nt-connect'), syncBtn = byId('nt-sync'), discBtn = byId('nt-disconnect'), unsup = byId('nt-sync-unsupported');
    if (unsup) unsup.style.display = supported() ? 'none' : '';
    if (!supported()) {
      statusEl.textContent = 'Folder auto-sync isn’t available in this browser.';
      if (connectBtn) connectBtn.disabled = true;
      if (syncBtn) syncBtn.style.display = 'none';
      if (discBtn) discBtn.style.display = 'none';
      return;
    }
    if (state.handle) {
      const meta = getMeta();
      const last = meta.lastSynced ? new Date(meta.lastSynced).toLocaleString() : 'never';
      statusEl.innerHTML = `Connected to <strong>${UTIL.escapeHtml(state.handle.name)}</strong> · last synced: ${last}.`;
      if (connectBtn) connectBtn.textContent = 'Reconnect Folder';
      if (syncBtn) syncBtn.style.display = '';
      if (discBtn) discBtn.style.display = '';
    } else {
      statusEl.textContent = 'Not connected.';
      if (connectBtn) { connectBtn.textContent = 'Connect NinjaTrader Folder'; connectBtn.disabled = false; }
      if (syncBtn) syncBtn.style.display = 'none';
      if (discBtn) discBtn.style.display = 'none';
    }
  }

  function showSetupGuide() {
    const html = `
      <div class="trade-detail-section">
        <p>This connects NinjaTrader to your journal so trades import automatically. One-time setup:</p>
        <ol style="line-height:1.7;padding-left:18px">
          <li>Download the add-on file <code>TradingJournalExporter.cs</code> (button below).</li>
          <li>In NinjaTrader: <strong>Tools → Import → NinjaScript Add-On…</strong> and select the file.
              (Or copy it into <code>Documents\\NinjaTrader 8\\bin\\Custom\\AddOns\\</code> and press <strong>F5</strong> in the NinjaScript Editor to compile.)</li>
          <li><strong>Restart NinjaTrader.</strong> The add-on then writes every fill to
              <code>Documents\\TradingJournalSync\\executions.csv</code> as you trade.</li>
          <li>Back here, click <strong>Connect NinjaTrader Folder</strong> and pick the
              <code>TradingJournalSync</code> folder (inside your Documents). Allow read access when asked.</li>
        </ol>
        <p class="muted" style="font-size:12.5px">
          After that, new trades appear whenever you open the journal (or click <strong>Sync Now</strong>).
          Keep NinjaTrader running while you trade. Everything stays on your computer — nothing is uploaded.
          Works in Chrome or Edge on desktop.
        </p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="nt-download-addon">Download Add-On File</button>
        <button class="btn btn-ghost" data-close-modal>Close</button>
      </div>`;
    APP.openModal('NinjaTrader Auto-Sync — Setup', html);
    const dl = byId('nt-download-addon');
    if (dl) dl.addEventListener('click', downloadAddon);
    document.querySelectorAll('#modal-content [data-close-modal]').forEach(b => b.addEventListener('click', APP.closeModal));
  }

  function downloadAddon() {
    // Fetch the versioned add-on source shipped with the app and save it locally.
    fetch('ninjatrader/TradingJournalExporter.cs')
      .then(r => { if (!r.ok) throw new Error('not found'); return r.text(); })
      .then(src => UTIL.downloadFile('TradingJournalExporter.cs', src, 'text/plain'))
      .catch(() => UTIL.toast('Could not load the add-on file.', 'error'));
  }

  function wire() {
    const connectBtn = byId('nt-connect'), syncBtn = byId('nt-sync'), discBtn = byId('nt-disconnect'), guideBtn = byId('nt-setup-guide');
    if (connectBtn) connectBtn.addEventListener('click', connect);
    if (syncBtn) syncBtn.addEventListener('click', syncNow);
    if (discBtn) discBtn.addEventListener('click', disconnect);
    if (guideBtn) guideBtn.addEventListener('click', showSetupGuide);
  }

  async function init() {
    wire();
    updateUI();
    renderAccounts();
    if (!supported()) return;
    try {
      const handle = await idbGet(HKEY);
      if (!handle) return;
      state.handle = handle;
      updateUI();
      renderAccounts();
      // Auto-sync only if permission is still granted (a prompt needs a user gesture).
      if (await verifyPermission(handle, false)) {
        await doSync(handle, { silent: true });
      } else {
        const s = byId('nt-sync-status');
        if (s) s.innerHTML += ' <em>— click Sync Now to re-grant access.</em>';
      }
    } catch (e) { console.warn('Sync init failed', e); }
  }

  return { init, connect, syncNow, disconnect };
})();

document.addEventListener('DOMContentLoaded', SYNC.init);
