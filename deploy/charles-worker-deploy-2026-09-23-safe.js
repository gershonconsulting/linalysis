// Linalysis Worker deploy (SAFE SUBSET) — 2026-09-23. 6 edits whose anchors were checked against the
// LIVE script: 30,000-connection warning (4, checked 2026-09-23), premium fields saved at ingest and
// page samples kept (2, checked 2026-09-11; production unchanged since build 2026-09-03).
// Paste into the DevTools console of a dash.cloudflare.com tab
// (signed in). It patches the LIVE script in place; it aborts without changing anything if any edit
// does not match exactly once, or if the patched code does not load.
(async () => {
  const A = '0b8434adba9af8231df90a1f3d2e6e12', S = 'linalysis-api', BUILD = '2026-09-23.1600-conncap-premium';
  const EDITS = [
{"p":"0911",
   "old":[
    "        visible: body.visible === true || body.visible === false ? body.visible : null,",
    "        at: new Date().toISOString(),"],
   "new":[
    "        visible: body.visible === true || body.visible === false ? body.visible : null,",
    "        sample: body.sample ? String(body.sample).slice(0, 3000) : null,",
    "        at: new Date().toISOString(),"]},
  {"p":"0911",
   "old":[
    "const CSV_TO_COL = {"],
   "new":[
    "const CSV_TO_COL = {",
    "  'InMail Credits':  'inmail_credits',",
    "  'Inmail Credits':  'inmail_credits',",
    "  'Premium Plan':    'premium_plan',",
    "  'Premium Renews':  'premium_renews',"]},
  {"p":"0923",
   "old":[
    "// The alarm the whole report exists for: a day went by and nothing was collected.",
    "function renderBigWarning("],
   "new":[
    "// LinkedIn hard limit: an account cannot hold more than 30,000 1st-degree connections. At the cap",
    "// every new invitation it sends is wasted and people can no longer connect to it, so the report must",
    "// say so loudly — and say it BEFORE the cap, while there is still room to prune. (Olivier, 2026-09-23)",
    "const CONNECTION_CAP = 30000;",
    "const CONNECTION_CAP_WARN = 29000;",
    "",
    "function connectionCapState(n) {",
    "  n = Number(n);",
    "  if (!isFinite(n) || n <= 0) return null;",
    "  if (n >= CONNECTION_CAP) return 'reached';",
    "  if (n >= CONNECTION_CAP_WARN) return 'near';",
    "  return null;",
    "}",
    "",
    "function renderConnectionCapWarning(accounts) {",
    "  const hit  = accounts.filter(a => a.conn_cap === 'reached');",
    "  const near = accounts.filter(a => a.conn_cap === 'near');",
    "  if (!hit.length && !near.length) return '';",
    "  const n = v => Number(v).toLocaleString('en-US');",
    "  const line = a => `• <strong>${esc(a.email)}</strong> — ${n(a.connections)} connections` +",
    "    (a.conn_cap === 'reached' ? ' (LIMIT REACHED)' : ` (${n(CONNECTION_CAP - a.connections)} left before the limit)`);",
    "  const block = (bg, fg, tag, head, sub, list) => `<div style=\"background:${bg};color:${fg};padding:22px 24px;border-radius:12px;margin-bottom:18px\">",
    "    <div style=\"font-size:13px;font-weight:700;letter-spacing:.14em;opacity:.85\">${tag}</div>",
    "    <div style=\"font-size:22px;font-weight:800;line-height:1.25;margin:6px 0 8px\">${head}</div>",
    "    <div style=\"font-size:13px;opacity:.95\">${sub}</div>",
    "    <div style=\"margin-top:10px;font-size:13px;line-height:1.7\">${list.map(line).join('<br>')}</div>",
    "  </div>`;",
    "  let out = '';",
    "  if (hit.length) out += block('#cc1016', '#fff', '🚨 CONNECTION LIMIT',",
    "    `${hit.length === 1 ? '1 ACCOUNT HAS' : hit.length + ' ACCOUNTS HAVE'} REACHED 30,000 CONNECTIONS`,",
    "    'LinkedIn allows a maximum of 30,000 connections. New invitations from these accounts cannot be accepted until connections are removed — outreach is blocked.',",
    "    hit);",
    "  if (near.length) out += block('#fff8e6', '#5c4a12', '⚠ CONNECTION LIMIT APPROACHING',",
    "    `${near.length === 1 ? '1 ACCOUNT IS' : near.length + ' ACCOUNTS ARE'} CLOSE TO THE 30,000 MAXIMUM`,",
    "    'LinkedIn allows a maximum of 30,000 connections. Plan a clean-up of inactive connections before the limit is hit.',",
    "    near);",
    "  return out;",
    "}",
    "",
    "// The alarm the whole report exists for: a day went by and nothing was collected.",
    "function renderBigWarning("]},
  {"p":"0923",
   "old":[
    "      acct.progress     = buildProgress(row, prevRow, weekRow);",
    ""],
   "new":[
    "      acct.progress     = buildProgress(row, prevRow, weekRow);",
    "      if (fallbackRow.connections != null && fallbackRow.connections !== '') {",
    "        acct.connections = Number(fallbackRow.connections);",
    "        acct.conn_cap = connectionCapState(acct.connections);",
    "      }",
    ""]},
  {"p":"0923",
   "old":[
    "  const problems = counts.partial + counts.failed + counts.no_data;",
    "  const extTag = staleExt.length ? ` · ⚠ ${staleExt.length} on old extension` : '';"],
   "new":[
    "  const problems = counts.partial + counts.failed + counts.no_data;",
    "  const capHit  = accounts.filter(a => a.conn_cap === 'reached').length;",
    "  const capNear = accounts.filter(a => a.conn_cap === 'near').length;",
    "  const extTag = (staleExt.length ? ` · ⚠ ${staleExt.length} on old extension` : '')",
    "    + (capHit ? ` · 🚨 ${capHit} at 30,000-connection limit` : capNear ? ` · ⚠ ${capNear} near 30,000-connection limit` : '');"]},
  {"p":"0923",
   "old":[
    "    ${renderBigWarning(ctx.didNotRun || [], accounts, reportDate)}",
    ""],
   "new":[
    "    ${renderBigWarning(ctx.didNotRun || [], accounts, reportDate)}",
    "    ${renderConnectionCapWarning(accounts)}",
    ""]}
  ].map(e => ({ p: e.p, old: e.old.join('\n'), new: e.new.join('\n') }));
  const base = `/api/v4/accounts/${A}/workers/scripts/${S}`;
  const fd0 = await (await fetch(base + '/content/v2', { credentials: 'include' })).formData();
  let src = null; for (const [k, v] of fd0.entries()) if (k === 'index.mjs') src = typeof v === 'string' ? v : await v.text();
  if (!src) throw new Error('could not read live script');
  const report = [];
  for (const [i, e] of EDITS.entries()) {
    if (src.includes(e.new) && !src.includes(e.old)) { report.push(i + ' already applied'); continue; }
    const n = src.split(e.old).length - 1;
    if (n !== 1) { console.table(report); throw new Error(`ABORTED, nothing deployed: edit ${i} (${e.p}) matches ${n} times`); }
    src = src.replace(e.old, () => e.new); report.push(i + ' ok');
  }
  const mod = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  if (typeof mod.default.fetch !== 'function' || typeof mod.default.scheduled !== 'function') throw new Error('ABORTED: patched script does not load');
  const st = (await (await fetch(base + '/settings', { credentials: 'include' })).json()).result;
  const bindings = st.bindings.map(b => b.type === 'plain_text' ? { type: 'plain_text', name: b.name, text: b.name === 'BUILD' ? BUILD : b.text }
    : b.type === 'kv_namespace' ? { type: 'kv_namespace', name: b.name, namespace_id: b.namespace_id }
    : b.type === 'secret_text' ? { type: 'inherit', name: b.name } : b);
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify({ main_module: 'index.mjs', compatibility_date: st.compatibility_date, bindings })], { type: 'application/json' }));
  fd.append('index.mjs', new Blob([src], { type: 'application/javascript+module' }), 'index.mjs');
  const r = await fetch(base, { method: 'PUT', body: fd, credentials: 'include' });
  const j = await r.json();
  console.table(report);
  console.log(j.success ? 'DEPLOYED ' + BUILD : 'FAILED', j.errors || '');
  if (j.success) console.log(await (await fetch('https://api.linalysis.net/api/health')).text());
})();