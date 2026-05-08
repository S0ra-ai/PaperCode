export function readStoredUserInfo(rawUser, storage = localStorage) {
  if (!rawUser) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawUser);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    storage.removeItem('userInfo');
    return null;
  }
}

export function resolveNavigationTarget({ to, isLoggedIn, userInfo }) {
  const meta = to?.meta || {};
  const path = to?.path || '';

  if (meta.public) {
    if (path === '/login' && isLoggedIn) {
      return userInfo?.role === 'admin' ? '/admin' : '/app';
    }
    return true;
  }

  if (!isLoggedIn) {
    return '/login';
  }

  if (meta.requiresAdmin && userInfo?.role !== 'admin') {
    return '/app';
  }

  return true;
}

// ── Setup status cache (fetched once per app load) ──
let _setupChecked = false;
let _needsSetup = false;

// Resolve API base URL for the setup status check (no axios dependency)
function _resolveBackendUrl() {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const env = import.meta.env;
    const configured = typeof env.VITE_API_BASE_URL === 'string' ? env.VITE_API_BASE_URL.trim() : '';
    if (configured) return configured;
    if (env.PROD) return '/backend';
  }
  // Use same hostname as browser to keep httpOnly cookies on the same domain
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `http://${hostname}:9992`;
}

/**
 * Check whether the system requires initial setup (no admin user).
 * Fetches from /setup/status once, then returns cached result.
 */
export async function checkSetupNeeded() {
  if (_setupChecked) return _needsSetup;

  try {
    const base = _resolveBackendUrl();
    const res = await fetch(`${base}/setup/status`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      _needsSetup = Boolean(data.needsSetup);
    }
  } catch {
    // Backend unreachable — don't block navigation
    _needsSetup = false;
  }
  _setupChecked = true;
  return _needsSetup;
}

/** Reset setup cache (called after setup wizard completes). */
export function resetSetupCheck() {
  _setupChecked = false;
  _needsSetup = false;
}

// Allow SetupWizardView to reset via window global
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__setupChecked', {
    set(val) { if (!val) resetSetupCheck(); },
    get() { return _setupChecked; },
    configurable: true,
  });
}
