// Linalysis API client — one tiny wrapper the whole site uses.
// Exposes window.LinalysisAPI.{get,post,me,login,signup,logout,createToken,subscription,usage}
// If the API is unreachable, calls reject with {error:'network'} so callers can show demo mode.

(function () {
  const BASE = (function () {
    // Prefer same-origin API if the site is served from an API-enabled host
    // (future-proofing). Today it's api.linalysis.net on Hostinger.
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return 'http://127.0.0.1:8787';
    }
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
})();
