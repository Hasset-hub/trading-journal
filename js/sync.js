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

  // Read every CSV in the folder and merge its trades (de-duplicated) into storage.
  async function readAndIngest(handle) {
    let added = 0, dupes = 0, files = 0;
    for await (const entry of handle.values()) {
      if (entry.kind !== 'file' || !/\.csv$/i.test(entry.name)) continue;
      files++;
      try {
        const file = await entry.getFile();
        const text = await file.text();
        const res = APP.ingestCSV(text, { source: 'silent' });
        if (res) { added += res.added; dupes += res.dupes; }
      } catch (e) { console.warn('Sync: could not read', entry.name, e); }
    }
    return { added, dupes, files };
  }

  async function doSync(handle, { silent }) {
    if (state.busy) return { added: 0, dupes: 0, files: 0 };
    state.busy = true;
    try {
      const res = await readAndIngest(handle);
      setMeta({ lastSynced: Date.now() });
      if (res.added > 0 && APP.refresh) APP.refresh();
      if (!silent) {
        if (res.files === 0) UTIL.toast('No CSV files in that folder yet. Make a trade in NinjaTrader, then Sync.', 'info');
        else UTIL.toast(res.added ? `Synced ${res.added} new trade${res.added !== 1 ? 's' : ''}.` : 'Already up to date — no new trades.', 'success');
      } else if (res.added > 0) {
        UTIL.toast(`NinjaTrader: ${res.added} new trade${res.added !== 1 ? 's' : ''} synced.`, 'success');
      }
      updateUI();
      return res;
    } finally { state.busy = false; }
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
    setMeta({ lastSynced: null });
    updateUI();
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
    if (!supported()) return;
    try {
      const handle = await idbGet(HKEY);
      if (!handle) return;
      state.handle = handle;
      updateUI();
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
