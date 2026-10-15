// ─── Linalysis Worker patch 2026-10-15 — release 0.3.6: SSI ranks (DE/FR) + company receipts + Credits ───
// Combines deploy/worker-ssi-ranks-2026-10-13.js with the Credits edit from worker/src/index.mjs (PR #2):
//  - CSV_TO_COL gains the 7 network-reader columns sent by extension 0.3.6 (network-api.js)
//  - new route GET /api/data/credits (series for credits.html)
// Same safety rules: patches the LIVE script in place, each anchor must match exactly once, parse-check,
// every binding re-sent, any mismatch = ABORT with nothing deployed. Set window.__DRY_RUN = true to test.
(async () => {
  const ACC = '0b8434adba9af8231df90a1f3d2e6e12';
  const A = `/api/v4/accounts/${ACC}/workers/scripts/linalysis-api`;
  const STAMP = '2026-10-15.0600-ssi-ranks-credits';
  const DRY = typeof window.__DRY_RUN !== 'undefined' ? !!window.__DRY_RUN : false;

  const fd = await (await fetch(A + '/content/v2', { credentials: 'include' })).formData();
  const f = fd.get('index.mjs');
  let s = typeof f === 'string' ? f : await f.text();
  if (s.includes('function ssiRanksFromText(') || s.includes("'/api/data/credits'")) throw new Error('ABORT: patch already applied');

  const HELPERS = `
// 2026-10-13 — company receipts are filed per tab (co_*); prefer a failing one so its reason shows.
function coReceipt(pages) {
  const list = Object.keys(pages || {}).filter(k => /^co_/.test(k)).map(k => pages[k]).filter(Boolean);
  return list.find(x => !x.ok) || list[0] || null;
}

// 2026-10-13 — SSI industry/network ranks read STRUCTURALLY from the SSI page text. Every language
// prints "<label>\\nTop N %". Returns null for a rank rather than a neighbour's number.
const SSI_IND_KW = ['Branche', 'Branchenrang', 'secteur', 'sector', 'settore', 'setor', 'industry'];
const SSI_NET_KW = ['Netzwerk', 'réseau', 'rete', 'rede', 'netwerk', 'network'];
function ssiPctLine(l) {
  if (!l || l.length > 24) return null;
  const m = l.match(/(\\d{1,3})\\s*%/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 0 && n <= 100 ? n : null;
}
function ssiRanksFromText(text) {
  const lines = String(text || '').split('\\n').map(l => l.trim()).filter(Boolean);
  const isLabel = (l, kws) => l.length <= 70 && !/\\d\\s*%/.test(l) && kws.some(k => l.toLowerCase().includes(k.toLowerCase()));
  const hits = kws => lines.map((l, i) => isLabel(l, kws) ? i : -1).filter(i => i >= 0);
  const ind = hits(SSI_IND_KW), net = hits(SSI_NET_KW);
  const pick = (h, d) => { for (const i of h) { const v = ssiPctLine(lines[i + d]); if (v != null) return { i: i + d, v }; } return null; };
  for (const d of [1, -1]) {
    const a = pick(ind, d), b = pick(net, d);
    if (a && b && a.i !== b.i) return { industry: a.v, network: b.v };
  }
  return null;
}
// Correct one stored day from that day's SSI page text. Overwrites ONLY the two rank fields, and
// only when the page text gives an unambiguous reading.
async function fixSsiRanks(env, email, date) {
  const d = await env.KV.get(\`diag:\${email}:\${date}:ssi\`, 'json');
  const g = d && (d.diag || d);
  const text = g && (g.sample || '');
  if (!text) return null;
  const r = ssiRanksFromText(text);
  if (!r) return null;
  const key = \`stats:\${email}:\${date}\`;
  const row = await env.KV.get(key, 'json');
  if (!row) return null;
  const changed = {};
  if (String(row.ssi_industry_rank ?? '') !== String(r.industry)) { changed.ssi_industry_rank = [row.ssi_industry_rank ?? null, r.industry]; row.ssi_industry_rank = r.industry; }
  if (String(row.ssi_network_rank ?? '') !== String(r.network))   { changed.ssi_network_rank  = [row.ssi_network_rank ?? null, r.network];  row.ssi_network_rank  = r.network; }
  if (!Object.keys(changed).length) return null;
  await env.KV.put(key, JSON.stringify(row));
  return changed;
}
async function adminFixSsiRanks(req, env) {
  try {
    await requireAdmin(req, env);
    const keys = (await listAll(env.KV, 'diag:')).filter(k => /:ssi$/.test(k.name));
    const fixed = [];
    for (const k of keys) {
      const parts = k.name.split(':');           // diag : email : date : ssi
      parts.pop();
      const date = parts.pop();
      const email = parts.slice(1).join(':');
      const c = await fixSsiRanks(env, email, date);
      if (c) fixed.push({ email, date, changed: c });
    }
    return json({ ok: true, ssi_diags: keys.length, rows_fixed: fixed.length, fixed });
  } catch (e) { return err(e.code || 'forbidden', e.message, e.status || 403); }
}
`;

  const edits = [
    // company receipts
    ["const receipt = collect && collect.pages ? collect.pages[src.page] : null;",
     "const receipt = collect && collect.pages ? (collect.pages[src.page] || (src.page === 'company' ? coReceipt(collect.pages) : null)) : null;"],
    // helpers, placed before computePages (top level)
    ["function computePages(", HELPERS.trimStart() + "function computePages("],
    // admin route
    ["return adminLabelsPut(req, env);",
     "return adminLabelsPut(req, env);\n  if (r('POST', '/api/admin/fix-ssi-ranks')) return adminFixSsiRanks(req, env);"],
    // daily: correct yesterday's ranks before the audit reads the row
    ["const bf = await backfillInvitations(env, email, reportDate,",
     "try { await fixSsiRanks(env, email, reportDate); } catch (e) {}\n      const bf = await backfillInvitations(env, email, reportDate,"],
    // credits (0.3.6): network-reader columns
    ["const CSV_TO_COL = {\n",
     "const CSV_TO_COL = {\n  // 2026-10-13 network reader (extension v0.3.6): LinkedIn's own JSON endpoints, see network-api.js\n  'Connections New':             'connections_new',\n  'Invitations Sent Day':        'invitations_sent_day',\n  'Connections Added Window':    'connections_added_window',\n  'Connections Removed':         'connections_removed',\n  'Connections Window Hours':    'connections_window_hours',\n  'InMail Allowance':            'inmail_allowance',\n  'InMail Source':               'inmail_source',\n"],
    // credits (0.3.6): GET /api/data/credits
    ["\n  if (r('GET',  '/api/data/connections'))",
     "\n  if (r('GET',  '/api/data/credits'))      return dataSeries(req, env, ['connections', 'invitations', 'invitations_pages', 'invitations_sent_24h', 'invitations_sent_7d', 'invitations_sent_day', 'connections_new', 'connections_added_window', 'connections_removed', 'connections_window_hours', 'inmail_credits', 'inmail_allowance', 'inmail_source', 'premium_plan', 'premium_renews', 'company_credits_available', 'company_credits_total']);\n  if (r('GET',  '/api/data/connections'))"],
  ];
  for (const [a] of edits) {
    const n = s.split(a).length - 1;
    if (n !== 1) throw new Error('ABORT (nothing deployed): anchor found ' + n + 'x: ' + a.slice(0, 60));
  }
  for (const [a, b] of edits) s = s.replace(a, () => b);

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
