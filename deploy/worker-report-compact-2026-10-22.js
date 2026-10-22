// ─── Linalysis Worker patch 2026-10-22 — compact daily audit email (Gmail clipping fix) ───
// The daily "[Linalysis] … accounts collected" email was ~180KB for 13 accounts, so Gmail clipped it
// at 102KB and hid the per-account detail. This patch swaps ONLY the email-rendering functions
// (deltaCell … renderExtWarning, and renderAccountBlock … renderAuditEmail) for the compact,
// class-based versions in worker/src/index.mjs (~39KB for the same 13 accounts).
// Subject, sender and recipients are untouched. Independent of the pending 0.3.6 patch (either order).
//
// How it works: the new functions are read from worker/src/index.mjs on SRC_REF (the reviewed code,
// not a copy), cut between the same two pairs of anchors, and spliced into the LIVE Worker script.
// Same safety rules as earlier patches: every anchor must match exactly once in both scripts,
// parse-check, every binding re-sent, any mismatch = ABORT with nothing deployed.
// Set window.__DRY_RUN = true first to test without deploying.
(async () => {
  const ACC = '0b8434adba9af8231df90a1f3d2e6e12';
  const A = `/api/v4/accounts/${ACC}/workers/scripts/linalysis-api`;
  const STAMP = '2026-10-22.0400-report-compact';
  const SRC_REF = 'nightly/2026-10-22-linalysis-report-size';   // or 'main' once the PR is merged
  const SRC = `https://raw.githubusercontent.com/gershonconsulting/linalysis/${SRC_REF}/worker/src/index.mjs`;
  const DRY = typeof window.__DRY_RUN !== 'undefined' ? !!window.__DRY_RUN : false;
  const ANCHORS = [
    ['// A delta cell, coloured only when the metric has a meaningful direction.',   // live (old) start
     '// ── Daily audit email, compact markup (2026-10-22)',                          // src (new) start
     'async function runDailyDataAudit('],
    ['function renderAccountBlock(',
     '// Status pill for the compact email',
     'async function adminAuditLatest('],
  ];
  const once = (s, x, where) => {
    const n = s.split(x).length - 1;
    if (n !== 1) throw new Error('ABORT (nothing deployed): ' + where + ' anchor found ' + n + 'x: ' + x.slice(0, 60));
    return s.indexOf(x);
  };

  const fd = await (await fetch(A + '/content/v2', { credentials: 'include' })).formData();
  const f = fd.get('index.mjs');
  let s = typeof f === 'string' ? f : await f.text();
  if (s.includes('const AUDIT_EMAIL_CSS')) throw new Error('ABORT: patch already applied');

  const src = await (await fetch(SRC, { cache: 'no-store' })).text();
  if (!src.includes('const AUDIT_EMAIL_CSS')) throw new Error('ABORT (nothing deployed): source on ' + SRC_REF + ' does not hold the compact email');

  for (const [liveStart, srcStart, end] of ANCHORS) {
    const body = src.slice(once(src, srcStart, 'source'), once(src, end, 'source'));
    const i = once(s, liveStart, 'live'), j = once(s, end, 'live');
    if (i > j) throw new Error('ABORT (nothing deployed): live anchors out of order: ' + liveStart.slice(0, 40));
    s = s.slice(0, i) + body + s.slice(j);
  }

  const mod = await import(URL.createObjectURL(new Blob([s], { type: 'text/javascript' })));
  if (typeof mod.default.fetch !== 'function' || typeof mod.default.scheduled !== 'function')
    throw new Error('ABORT (nothing deployed): patched script does not export fetch + scheduled');
  if (DRY) { window.__PATCHED = s; console.log('DRY RUN OK — length', s.length); return 'DRY RUN OK ' + s.length; }

  const S = (await (await fetch(A + '/settings', { credentials: 'include' })).json()).result;
  const bindings = S.bindings.map(b => {
    if (b.type === 'plain_text')   return { type: 'plain_text', name: b.name, text: b.name === 'BUILD' ? STAMP : b.text };
    if (b.type === 'kv_namespace') return { type: 'kv_namespace', name: b.name, namespace_id: b.namespace_id };
    if (b.type === 'secret_text')  return { type: 'inherit', name: b.name };
    throw new Error('ABORT (nothing deployed): unknown binding type ' + b.type);
  });
  const meta = { main_module: 'index.mjs', bindings, compatibility_date: S.compatibility_date,
                 compatibility_flags: S.compatibility_flags || [], usage_model: S.usage_model };
  const up = new FormData();
  up.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  up.append('index.mjs', new Blob([s], { type: 'application/javascript+module' }), 'index.mjs');
  const r = await fetch(A, { method: 'PUT', body: up, credentials: 'include', headers: { 'x-cross-site-security': 'dash' } });
  const j = await r.json();
  console.log('DEPLOY', r.status, j.success, JSON.stringify(j.errors || []));
  return 'DEPLOY ' + r.status + ' ' + j.success;
})();
