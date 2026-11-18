// /api/health must report the same app version as version.txt; API build goes in "build".
//   node test/health-version.test.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
(async () => {
  const src = fs.readFileSync(path.join(root, 'functions/api/health.js'), 'utf8');
  const mod = await import('data:text/javascript,' + encodeURIComponent(src));
  const ver = fs.readFileSync(path.join(root, 'version.txt'), 'utf8').trim();
  globalThis.fetch = async (u) => {
    if (String(u).includes('api.linalysis.net')) return new Response(JSON.stringify({ status: 'ok', time: 't', version: 'build-x' }));
    return new Response(ver + '\n');
  };
  const res = await mod.onRequestGet({ request: new Request('https://linalysis.net/api/health'), env: {} });
  const j = await res.json();
  let fail = 0;
  const check = (n, ok) => { console.log((ok ? '  ok   ' : '  FAIL ') + n); if (!ok) fail++; };
  check('health.version === version.txt (' + ver + ')', j.version === ver);
  check('health.build carries API build string', j.build === 'build-x');
  process.exit(fail ? 1 : 0);
})();
