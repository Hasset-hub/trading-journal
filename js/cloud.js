// === Cloud Sync & Auth (Supabase) ===
// Local-first: localStorage stays the working copy so the app is instant and works
// offline. This layer adds identity + sync so each account has its own private data
// (enforced by Postgres Row Level Security, not by this file).
//
// Deliberately dependency-free — talks to Supabase's Auth and PostgREST endpoints
// with fetch, so there's no CDN script to load and the app still works offline.

const CLOUD = (() => {
  const CFG = window.SUPABASE_CONFIG || {};
  const SESSION_KEY = 'tj.auth.v1';
  const UID_KEY = 'tj.cloud.uid';
  const DIRTY_KEY = 'tj.cloud.dirty';

  let session = null;
  let syncing = false;
  let pushTimer = 0;
  const listeners = [];

  const configured = () => !!(CFG.url && CFG.anonKey);
  const onChange = (fn) => { listeners.push(fn); };
  const emit = () => listeners.forEach((f) => { try { f(getUser()); } catch (e) {} });

  /* ---------------------------------------------------------- session */
  function loadSession() {
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch (e) { session = null; }
    return session;
  }
  function saveSession(s) {
    session = s;
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
    emit();
  }
  function getUser() { return session && session.user ? session.user : null; }

  function shapeSession(json) {
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + ((json.expires_in || 3600) * 1000),
      user: json.user ? { id: json.user.id, email: json.user.email } : null,
    };
  }

  /* ---------------------------------------------------------- auth API */
  async function authFetch(path, body, qs) {
    const res = await fetch(`${CFG.url}/auth/v1/${path}${qs || ''}`, {
      method: 'POST',
      headers: { apikey: CFG.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json.error_description || json.msg || json.message || json.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return json;
  }

  async function signUp(email, password) {
    const json = await authFetch('signup', { email, password });
    // When email confirmation is ON, Supabase returns a user but no session.
    if (!json.access_token) return { needsConfirmation: true, email };
    saveSession(shapeSession(json));
    await afterLogin();
    return { needsConfirmation: false };
  }

  async function signIn(email, password) {
    const json = await authFetch('token', { email, password }, '?grant_type=password');
    saveSession(shapeSession(json));
    await afterLogin();
    return { ok: true };
  }

  async function signOut() {
    const uid = getUser() && getUser().id;
    try {
      if (session) {
        await fetch(`${CFG.url}/auth/v1/logout`, {
          method: 'POST',
          headers: { apikey: CFG.anonKey, Authorization: `Bearer ${session.access_token}` },
        });
      }
    } catch (e) { /* offline sign-out is still a sign-out */ }
    saveSession(null);
    // Clear the local working copy so the next person on this browser starts clean.
    if (uid) clearLocalData();
    localStorage.removeItem(UID_KEY);
  }

  async function refresh() {
    if (!session || !session.refresh_token) throw new Error('No session');
    const json = await authFetch('token', { refresh_token: session.refresh_token }, '?grant_type=refresh_token');
    const next = shapeSession(json);
    if (!next.user && session.user) next.user = session.user;  // refresh responses may omit user
    saveSession(next);
    return next;
  }

  async function validSession() {
    if (!session) return null;
    if (Date.now() > session.expires_at - 60000) {
      try { await refresh(); } catch (e) { saveSession(null); return null; }
    }
    return session;
  }

  /* ---------------------------------------------------------- data API */
  async function rest(table, { method = 'GET', body, query = '', prefer } = {}) {
    const s = await validSession();
    if (!s) throw new Error('Not signed in');
    const headers = {
      apikey: CFG.anonKey,
      Authorization: `Bearer ${s.access_token}`,
      'Content-Type': 'application/json',
    };
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(`${CFG.url}/rest/v1/${table}${query}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${table}: ${await res.text()}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const upsert = (table, rows) =>
    rows.length ? rest(table, { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=minimal' }) : null;

  /* ---------------------------------------------------------- local helpers */
  function clearLocalData() {
    ['tj.trades.v1', 'tj.settings.v1', 'tj.journal.v1', 'tj.playbooks.v1'].forEach((k) => localStorage.removeItem(k));
  }
  const stamp = (r) => Date.parse((r && (r.updatedAt || r.createdAt)) || 0) || 0;

  // Union two record lists by id, keeping whichever copy was edited most recently.
  function mergeById(local, remote) {
    const out = new Map();
    remote.forEach((r) => out.set(r.id, r));
    local.forEach((l) => {
      const r = out.get(l.id);
      if (!r || stamp(l) >= stamp(r)) out.set(l.id, l);
    });
    return [...out.values()];
  }

  /* ---------------------------------------------------------- sync */
  function markDirty() {
    localStorage.setItem(DIRTY_KEY, '1');
    if (!getUser()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { sync().catch(() => {}); }, 1500);   // debounce bursts of writes
  }

  async function sync() {
    if (!configured() || !getUser() || syncing) return null;
    if (!navigator.onLine) return null;
    syncing = true;
    try {
      const uid = getUser().id;

      // ---- pull
      const [rTrades, rPlaybooks, rJournal, rSettings] = await Promise.all([
        rest('trades', { query: '?select=id,data' }),
        rest('playbooks', { query: '?select=id,data' }),
        rest('journal_entries', { query: '?select=day,data' }),
        rest('settings', { query: '?select=data' }),
      ]);

      // ---- merge into the local working copy
      const localTrades = STORAGE.getTrades();
      const mergedTrades = mergeById(localTrades, (rTrades || []).map((r) => r.data));
      STORAGE.saveTrades(mergedTrades);

      const localPbs = STORAGE.getPlaybooks();
      const mergedPbs = mergeById(localPbs, (rPlaybooks || []).map((r) => r.data));
      STORAGE.savePlaybooks(mergedPbs);

      const localJ = STORAGE.getJournal();
      const mergedJ = { ...localJ };
      (rJournal || []).forEach(({ day, data }) => {
        const l = mergedJ[day];
        if (!l || stamp(data) > stamp(l)) mergedJ[day] = data;
      });
      STORAGE.saveJournal(mergedJ);

      const localS = STORAGE.getSettings();
      const remoteS = rSettings && rSettings[0] ? rSettings[0].data : null;
      const mergedS = (remoteS && stamp(remoteS) > stamp(localS)) ? remoteS : localS;
      STORAGE.saveSettings(mergedS);

      // ---- push the reconciled state back
      await upsert('trades', mergedTrades.map((t) => ({ user_id: uid, id: t.id, data: t, updated_at: new Date().toISOString() })));
      await upsert('playbooks', mergedPbs.map((p) => ({ user_id: uid, id: p.id, data: p, updated_at: new Date().toISOString() })));
      await upsert('journal_entries', Object.keys(mergedJ).map((day) => ({ user_id: uid, day, data: mergedJ[day], updated_at: new Date().toISOString() })));
      await upsert('settings', [{ user_id: uid, data: mergedS, updated_at: new Date().toISOString() }]);

      // ---- propagate deletions (local is authoritative after the merge above)
      await deleteMissing('trades', 'id', (rTrades || []).map((r) => r.id), mergedTrades.map((t) => t.id));
      await deleteMissing('playbooks', 'id', (rPlaybooks || []).map((r) => r.id), mergedPbs.map((p) => p.id));

      localStorage.removeItem(DIRTY_KEY);
      localStorage.setItem(UID_KEY, uid);
      if (window.APP && APP.refresh) APP.refresh();
      return { trades: mergedTrades.length };
    } finally {
      syncing = false;
    }
  }

  async function deleteMissing(table, key, remoteIds, localIds) {
    const keep = new Set(localIds);
    const gone = remoteIds.filter((id) => !keep.has(id));
    if (!gone.length) return;
    const list = gone.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
    await rest(table, { method: 'DELETE', query: `?${key}=in.(${list})` });
  }

  /* ---------------------------------------------------------- login bootstrap */
  // Called right after a successful sign-in: guarantees one person's data can never
  // bleed into another's on a shared browser.
  async function afterLogin() {
    const uid = getUser().id;
    const prev = localStorage.getItem(UID_KEY);
    const hasLocal = (STORAGE.getTrades() || []).length > 0;

    if (prev && prev !== uid) {
      clearLocalData();                       // different account on this browser -> start clean
    } else if (!prev && hasLocal) {
      // First sign-in on a browser that already has local trades: ask before claiming them.
      const keep = await askAdopt(STORAGE.getTrades().length);
      if (!keep) clearLocalData();
    }
    localStorage.setItem(UID_KEY, uid);
    await sync();
  }

  function askAdopt(count) {
    return new Promise((resolve) => {
      if (!window.APP || !APP.openModal) { resolve(true); return; }
      APP.openModal('Existing data found', `
        <div class="trade-detail-section">
          <p>This browser already has <strong>${count}</strong> trade${count !== 1 ? 's' : ''} stored locally.</p>
          <p class="muted" style="font-size:12.5px">Upload them into this account, or discard them and start fresh with whatever is already in the cloud?</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="adopt-no">Discard local</button>
          <button class="btn btn-primary" id="adopt-yes">Upload to my account</button>
        </div>`);
      const done = (v) => { APP.closeModal(); resolve(v); };
      document.getElementById('adopt-yes').addEventListener('click', () => done(true));
      document.getElementById('adopt-no').addEventListener('click', () => done(false));
    });
  }

  async function init() {
    if (!configured()) return;
    loadSession();
    if (session) {
      const ok = await validSession();
      if (ok) { emit(); sync().catch(() => {}); return; }
    }
    emit();
  }

  window.addEventListener('online', () => { if (localStorage.getItem(DIRTY_KEY)) sync().catch(() => {}); });

  return { init, configured, getUser, signUp, signIn, signOut, sync, markDirty, onChange };
})();
