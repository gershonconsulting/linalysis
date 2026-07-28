// Linalysis API client — one tiny wrapper the whole site uses.
// Exposes window.LinalysisAPI.{get,post,me,login,signup,logout,createToken,subscription,usage}
// If the API is unreachable, calls reject with {error:'network'} so callers can show demo mode.

(function () {
  const BASE = (function () {
    // Local dev
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return 'http://127.0.0.1:8787';
    }
    // When served from *.pages.dev (e.g. the user's ISP is hijacking api.linalysis.net),
    // use the workers.dev fallback which can't be ISP-blacklisted.
    if (location.hostname.endsWith('.pages.dev')) {
      return 'https://linalysis-api.oattia.workers.dev';
    }
    // Production custom domain
    return 'https://api.linalysis.net';
  })();

  async function request(path, opts = {}) {
    const init = {
      method: opts.method || 'GET',
      credentials: 'include',  // send session cookie
      headers: { 'Accept': 'application/json', ...(opts.headers || {}) },
    };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    if (opts.token) {
      init.headers['Authorization'] = 'Bearer ' + opts.token;
    }
    let res;
    try {
      res = await fetch(BASE + path, init);
    } catch (e) {
      throw { error: 'network', message: e.message };
    }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok) {
      throw Object.assign(new Error(data.message || res.statusText), { status: res.status, body: data });
    }
    return data;
  }

  window.LinalysisAPI = {
    BASE,
    get:   (p, opts)      => request(p, { ...opts, method: 'GET' }),
    post:  (p, body, opts)=> request(p, { ...opts, method: 'POST', body }),
    health:      ()             => request('/api/health'),
    me:          ()             => request('/api/auth/me'),
    login:       (email, pw)    => request('/api/auth/login',  { method: 'POST', body: { email, password: pw } }),
    signup:      (email, pw, n) => request('/api/auth/signup', { method: 'POST', body: { email, password: pw, full_name: n } }),
    logout:      ()             => request('/api/auth/logout', { method: 'POST' }),
    account:     ()             => request('/api/account'),
    subscription:()             => request('/api/account/subscription'),
    usage:       ()             => request('/api/account/usage'),
    createToken: (name)         => request('/api/account/token', { method: 'POST', body: { name } }),
    summary:     ()             => request('/api/data/summary'),
    connections: (range)        => request('/api/data/connections?range=' + (range || 30)),
    ssi:         (range)        => request('/api/data/ssi?range=' + (range || 90)),
    company:     (range)        => request('/api/data/company?range=' + (range || 30)),
    reportsList: ()             => request('/api/reports/list'),
    reportsNext: ()             => request('/api/reports/next'),
  };

  // ── Sync current-user identity into localStorage.
  // data.js gates its dataset on localStorage.linalysis_user_email — if a fresh
  // visitor's cached identity is stale (or empty), we reload the page once so
  // data.js re-reads with the correct email. This prevents new users from ever
  // seeing another user's baked-in dataset.
  (function syncIdentity() {
    // Skip on auth pages so the OAuth flow isn't interrupted
    var path = location.pathname.replace(/\.html$/, '');
    if (['/login', '/signup', '/forgot-password', '/'].indexOf(path) >= 0) return;

    request('/api/auth/me').then(function(resp) {
      // API returns { user: { email, full_name, ... } }
      var user = (resp && resp.user) ? resp.user : resp;
      var email = (user && user.email) ? user.email.toLowerCase() : '';
      var cached = '';
      try { cached = (localStorage.getItem('linalysis_user_email') || '').toLowerCase(); } catch(e) {}
      if (email) {
        try { localStorage.setItem('linalysis_user_email', email); } catch(e) {}
        try { localStorage.setItem('linalysis_user_name', user.full_name || ''); } catch(e) {}
        // If cache was wrong, reload so data.js re-evaluates against the correct owner
        if (cached !== email && !location.search.includes('_synced=1')) {
          var sep = location.search ? '&' : '?';
          location.replace(location.pathname + location.search + sep + '_synced=1' + location.hash);
        }
      } else {
        // Not signed in — clear cache
        try { localStorage.removeItem('linalysis_user_email'); } catch(e) {}
        try { localStorage.removeItem('linalysis_user_name'); } catch(e) {}
        if (cached && !location.search.includes('_synced=1')) {
          var sep2 = location.search ? '&' : '?';
          location.replace(location.pathname + location.search + sep2 + '_synced=1' + location.hash);
        }
      }
    }).catch(function() {
      // If /auth/me errors out (401 etc.), clear the cached identity so
      // pages don't leak the owner's dataset to a signed-out visitor.
      try {
        if (localStorage.getItem('linalysis_user_email')) {
          localStorage.removeItem('linalysis_user_email');
          if (!location.search.includes('_synced=1')) {
            var sep3 = location.search ? '&' : '?';
            location.replace(location.pathname + location.search + sep3 + '_synced=1' + location.hash);
          }
        }
      } catch(e) {}
    });
  })();
})();
