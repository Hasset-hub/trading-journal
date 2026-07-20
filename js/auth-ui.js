// === Auth UI ===
// Drives the sign-in gate and the Settings → Account card. When Supabase isn't
// configured the app runs exactly as before (local-only, no gate, no account card).

(() => {
  const $ = (id) => document.getElementById(id);
  let mode = 'signin';   // 'signin' | 'signup'

  function setMode(next) {
    mode = next;
    const signup = mode === 'signup';
    $('auth-submit').textContent = signup ? 'Create account' : 'Sign in';
    $('auth-toggle').textContent = signup ? 'Sign in instead' : 'Create an account';
    $('auth-toggle-text').textContent = signup ? 'Already have an account?' : 'New here?';
    $('auth-password').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    hideMsg();
  }
  function showError(msg) { const e = $('auth-error'); e.textContent = msg; e.classList.remove('hidden'); $('auth-note').classList.add('hidden'); }
  function showNote(msg) { const n = $('auth-note'); n.textContent = msg; n.classList.remove('hidden'); $('auth-error').classList.add('hidden'); }
  function hideMsg() { $('auth-error').classList.add('hidden'); $('auth-note').classList.add('hidden'); }

  function showGate(show) {
    $('auth-gate').classList.toggle('hidden', !show);
    document.querySelector('.app').style.display = show ? 'none' : '';
  }

  function renderAccount(user) {
    const card = $('account-card');
    if (!card) return;
    if (!CLOUD.configured()) { card.style.display = 'none'; return; }
    card.style.display = '';
    $('account-status').innerHTML = user
      ? `Signed in as <strong>${UTIL.escapeHtml(user.email || 'your account')}</strong>.`
      : 'Not signed in.';
  }

  async function onSubmit(e) {
    e.preventDefault();
    const email = $('auth-email').value.trim();
    const password = $('auth-password').value;
    const btn = $('auth-submit');
    btn.disabled = true;
    btn.textContent = mode === 'signup' ? 'Creating…' : 'Signing in…';
    hideMsg();
    try {
      if (mode === 'signup') {
        const r = await CLOUD.signUp(email, password);
        if (r.needsConfirmation) {
          showNote(`Check ${email} for a confirmation link, then sign in.`);
          setMode('signin');
          return;
        }
      } else {
        await CLOUD.signIn(email, password);
      }
      $('auth-password').value = '';
    } catch (err) {
      showError(friendly(err.message || String(err)));
    } finally {
      btn.disabled = false;
      btn.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
    }
  }

  function friendly(msg) {
    const m = msg.toLowerCase();
    if (m.includes('invalid login')) return 'Wrong email or password.';
    if (m.includes('already registered') || m.includes('already been registered')) return 'That email already has an account — sign in instead.';
    if (m.includes('password') && m.includes('6')) return 'Password must be at least 6 characters.';
    if (m.includes('failed to fetch')) return 'Can’t reach the server — check your connection.';
    if (m.includes('email') && m.includes('confirm')) return 'Confirm your email first, then sign in.';
    return msg;
  }

  function wire() {
    $('auth-form').addEventListener('submit', onSubmit);
    $('auth-toggle').addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));
    const so = $('cloud-signout');
    if (so) so.addEventListener('click', async () => {
      await CLOUD.signOut();
      UTIL.toast('Signed out.', 'success');
      if (APP.refresh) APP.refresh();
    });
    const sn = $('cloud-sync-now');
    if (sn) sn.addEventListener('click', async () => {
      try {
        const r = await CLOUD.sync();
        UTIL.toast(r ? 'Synced.' : 'Nothing to sync.', 'success');
      } catch (e) { UTIL.toast('Sync failed: ' + (e.message || e), 'error'); }
    });
  }

  function init() {
    // Not configured -> behave exactly like the old local-only app.
    if (!CLOUD.configured()) { showGate(false); renderAccount(null); return; }
    wire();
    setMode('signin');
    CLOUD.onChange((user) => { showGate(!user); renderAccount(user); });
    showGate(!CLOUD.getUser());
    renderAccount(CLOUD.getUser());
    CLOUD.init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
