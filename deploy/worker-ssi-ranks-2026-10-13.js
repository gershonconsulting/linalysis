// ─── Linalysis Worker patch 2026-10-13 — SSI ranks (DE/FR) + company receipts ─────────────────
// HOW TO APPLY (Charles): open https://dash.cloudflare.com signed in as oattia@gmail.com, open the
// browser console (F12) on any dash.cloudflare.com page, paste this whole file, press Enter.
// It patches the LIVE linalysis-api script in place (never replaces it with a local copy), checks
// every anchor appears exactly once, parse-checks the result, keeps every binding, and only then
// uploads. Any mismatch aborts with NOTHING deployed. Then open
// https://api.linalysis.net/api/version — it must show 2026-10-13.2200-ssi-ranks-company-receipts.
//
// WHAT IT FIXES
// 1) German + French SSI ranks. Every language prints "<label>\nTop N %"; the reader expected the
//    number BEFORE non-English labels, so it lost the industry rank AND stored the industry
//    percentile as the network rank (zeitount: network 1, real 6 · David: network 3, real 12).
//    The server re-reads the ranks from the SSI page text the extension already ships every day,
//    so this reaches every installed extension version (David is still on 0.2.9).
//    - runs automatically for yesterday's row inside the daily audit
//    - POST /api/admin/fix-ssi-ranks corrects every stored day that still has its page text
// 2) The daily report showed "Company: not configured" even when the extension tried the Company
//    Page and failed (receipts are filed as co_followers/co_visitors/…, the audit looked under
//    "company"). Anne Bougel's real reason — no admin access to the ALTAVIA Page — now shows.
(async () => {
  const ACC = '0b8434adba9af8231df90a1f3d2e6e12';
  const A = `/api/v4/accounts/${ACC}/workers/scripts/linalysis-api`;
  const STAMP = '2026-10-13.2200-ssi-ranks-company-receipts';
  const DRY = typeof window.__DRY_RUN !== 'undefined' ? !!window.__DRY_RUN : false;

  const fd = await (await fetch(A + '/content/v2', { credentials: 'include' })).formData();
  const f = fd.get('index.mjs');
  let s = typeof f === 'string' ? f : await f.text();
  if (s.includes('function ssiRanksFromText(')) throw new Error('ABORT: patch already applied');

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
