// functions/api/health.js
// GET /api/health — public status contract for the FlexiDesk Health checker.
//
// linalysis.net is a static Pages site; the work happens in the API worker at
// api.linalysis.net. Without this route every /api/* path falls through to the
// SPA and answers 200 text/html, which any monitor reads as a false green.
// This asks the API the question and reports the answer as real JSON.
//
// No auth, no user data — status and timestamps only.

const API = 'https://api.linalysis.net/api/health';
const TIMEOUT_MS = 5000;

const worst = (a, b) => {
  const rank = { green: 0, orange: 1, red: 2 };
  return rank[a] >= rank[b] ? a : b;
};

export async function onRequestGet() {
  const checks = [{ key: 'site', status: 'green', detail: 'pages deployment serving' }];
  let apiVersion = null;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const r = await fetch(API, { signal: ctrl.signal, cf: { cacheTtl: 0 } });
    clearTimeout(t);

    if (!r.ok) {
      checks.push({ key: 'api', status: 'red', detail: `api.linalysis.net returned ${r.status}` });
    } else {
      const j = await r.json();
      apiVersion = j.version || null;
      checks.push({
        key: 'api',
        status: j.status === 'ok' ? 'green' : 'orange',
        detail: j.status === 'ok' ? 'api.linalysis.net ok' : `api reports ${j.status}`,
        at: j.time || null,
      });
    }
  } catch (e) {
    checks.push({
      key: 'api',
      status: 'red',
      detail: e.name === 'AbortError' ? 'api.linalysis.net timed out' : 'api.linalysis.net unreachable',
    });
  }

  const status = checks.map(c => c.status).reduce(worst, 'green');

  return new Response(JSON.stringify({
    platform: 'linalysis',
    version: apiVersion,
    status,
    checked_at: new Date().toISOString(),
    checks,
  }, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
