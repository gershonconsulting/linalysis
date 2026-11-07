// ─── Linalysis Worker patch 2026-10-29 — daily collection email (report@gershonconsulting.com) ───
// Edits the LIVE linalysis-api script (build 2026-10-06.1300-invitations-server lineage) in place:
//  1. From name "Linalysis Collection" -> "GC Linalysis Collection" (Gershon-internal report rule).
//     Customer-facing senders are untouched: "Linalysis <reports@linalysis.net>" and
//     "Linalysis Alerts" (disconnection alerts) keep the Linalysis brand.
//  2. Subject uses the body's denominator: "10 accounts collecting · 3 not set up — ..." instead of
//     "x/13 accounts"; the big no-data alarm counts the same 10.
//  3. 30,000-connection banner: action line ("withdraw old pending invitations or remove inactive
//     connections") and "flagged N days in a row (since DATE)". The start date is carried in the
//     existing audit:daily:* record — one extra KV read, no new keys, no migration.
// Header was checked: white card, dark text — already light, so no restyle.
// Same safety rules as earlier patches: each anchor must match exactly once, the patched module must
// import and export fetch + scheduled, every binding is re-sent, any mismatch = ABORT, nothing
// deployed. Set window.__DRY_RUN = true first to test without deploying.
(async () => {
  const ACC = "0b8434adba9af8231df90a1f3d2e6e12";
  const A = `/api/v4/accounts/${ACC}/workers/scripts/linalysis-api`;
  const STAMP = "2026-10-29.1200-collection-email";
  const DRY = typeof window.__DRY_RUN !== "undefined" ? !!window.__DRY_RUN : false;

  const fd = await (await fetch(A + "/content/v2", { credentials: "include" })).formData();
  const f = fd.get("index.mjs");
  let s = typeof f === "string" ? f : await f.text();
  if (s.includes("GC Linalysis Collection")) throw new Error("ABORT: patch already applied");

  const edits = [["const REPORT_FROM_DEFAULT = 'Linalysis Collection <linalysis@gershon.ai>';","// Internal report to report@gershonconsulting.com: Gershon-internal reports carry a \"GC\" from-name.\n// Customer-facing mail (reports@linalysis.net, disconnection alerts to users) keeps the Linalysis brand.\nconst REPORT_FROM_DEFAULT = 'GC Linalysis Collection <linalysis@gershon.ai>';"],["  const auditKey = 'audit:daily:' + new Date().toISOString();","  // How many days in a row has each account been flagged near/at the 30,000 cap? No new keys: the\n  // start date rides along in the audit record already written below, and is read back from the\n  // previous audit (one KV read) and carried forward while the state persists.\n  try {\n    const prevPtr = await env.KV.get('audit:daily:latest');\n    const prev = prevPtr ? await env.KV.get(prevPtr, 'json') : null;\n    const prevBy = {};\n    for (const p of (prev && Array.isArray(prev.accounts) ? prev.accounts : [])) prevBy[p.email] = p;\n    for (const a of accounts) {\n      if (!a.conn_cap) continue;\n      const p = prevBy[a.email];\n      const carried = p && p.conn_cap === a.conn_cap && prev.report_date && prev.report_date <= reportDate;\n      a.conn_cap_since = carried ? (p.conn_cap_since || prev.report_date) : reportDate;\n      a.conn_cap_days = Math.round((Date.parse(reportDate) - Date.parse(a.conn_cap_since)) / 86400000) + 1;\n    }\n  } catch (e) { /* the count is a nicety; the alert itself never depends on it */ }\n\n  const auditKey = 'audit:daily:' + new Date().toISOString();"],["    (a.conn_cap === 'reached' ? ' (LIMIT REACHED)' : ` (${n(CONNECTION_CAP - a.connections)} left before the limit)`);","    (a.conn_cap === 'reached' ? ' (LIMIT REACHED)' : ` (${n(CONNECTION_CAP - a.connections)} left before the limit)`) +\n    (a.conn_cap_days > 1 ? ` · flagged ${a.conn_cap_days} days in a row (since ${esc(a.conn_cap_since)})`\n      : a.conn_cap_days === 1 ? ' · flagged for the first time today' : '');"],["    'LinkedIn allows a maximum of 30,000 connections. Plan a clean-up of inactive connections before the limit is hit.',","    'LinkedIn stops accepting new connections at 30,000 — withdraw old pending invitations or remove inactive connections.',"],["  let subject;\n  if (didNotRun.length && didNotRun.length === accounts.length) {\n    subject = `[Linalysis] 🚨 NOTHING COLLECTED on ${reportDate} — the system did not do its daily job${extTag}`;\n  } else if (didNotRun.length) {\n    subject = `[Linalysis] 🚨 ${didNotRun.length}/${accounts.length} account(s) collected nothing on ${reportDate}${extTag}`;\n  } else if (problems) {\n    subject = `[Linalysis] ⚠ ${problems}/${accounts.length} accounts incomplete on ${reportDate} · ${totals.up} metrics up, ${totals.down} down${extTag}`;\n  } else {\n    subject = `[Linalysis] ✓ All ${accounts.length} accounts collected on ${reportDate} · ${totals.up} metrics up, ${totals.down} down${extTag}`;\n  }","  // Same denominator as the body: accounts that HAVE collection set up; never-set-up ones are named\n  // separately and never counted as failures (the body says \"N configured · M never set up\").\n  const active = counts.active != null ? counts.active : accounts.length;\n  const scope = `${active} account${active === 1 ? '' : 's'} collecting`\n    + (counts.never_configured ? ` · ${counts.never_configured} not set up` : '');\n  let subject;\n  if (didNotRun.length && didNotRun.length === active) {\n    subject = `[Linalysis] 🚨 ${scope} — NOTHING COLLECTED on ${reportDate}, the system did not do its daily job${extTag}`;\n  } else if (didNotRun.length) {\n    subject = `[Linalysis] 🚨 ${scope} — ${didNotRun.length} collected nothing on ${reportDate}${extTag}`;\n  } else if (problems) {\n    subject = `[Linalysis] ⚠ ${scope} — ${problems} incomplete on ${reportDate} · ${totals.up} metrics up, ${totals.down} down${extTag}`;\n  } else {\n    subject = `[Linalysis] ✓ ${scope} — all collected on ${reportDate} · ${totals.up} metrics up, ${totals.down} down${extTag}`;\n  }"],["  if (!didNotRun.length) return '';\n  const total = accounts.length;","  if (!didNotRun.length) return '';\n  const total = accounts.filter(a => a.status !== 'never_configured').length;   // same denominator as the subject"]];
  for (const [a] of edits) {
    const n = s.split(a).length - 1;
    if (n !== 1) throw new Error("ABORT (nothing deployed): anchor found " + n + "x: " + a.slice(0, 60));
  }
  for (const [a, b] of edits) s = s.replace(a, () => b);

  const mod = await import(URL.createObjectURL(new Blob([s], { type: "text/javascript" })));
  if (typeof mod.default.fetch !== "function" || typeof mod.default.scheduled !== "function")
    throw new Error("ABORT (nothing deployed): patched script does not export fetch + scheduled");

  const S = (await (await fetch(A + "/settings", { credentials: "include" })).json()).result;
  // An ALERTS_FROM var would override the new default. A plain-text one gets the GC prefix here;
  // a secret one cannot be read, so the run stops and says so.
  for (const b of S.bindings) {
    if (b.name !== "ALERTS_FROM") continue;
    if (b.type === "secret_text") throw new Error("ABORT (nothing deployed): ALERTS_FROM is a secret and overrides the sender — set it to \"GC Linalysis Collection <linalysis@gershon.ai>\" or delete it, then re-run");
    if (b.type === "plain_text" && !/^\s*GC /.test(b.text)) b.text = "GC " + b.text.trim();
  }
  if (DRY) { window.__PATCHED = s; console.log("DRY RUN OK — length", s.length); return "DRY RUN OK " + s.length; }

  const bindings = S.bindings.map(b => {
    if (b.type === "plain_text")   return { type: "plain_text", name: b.name, text: b.name === "BUILD" ? STAMP : b.text };
    if (b.type === "kv_namespace") return { type: "kv_namespace", name: b.name, namespace_id: b.namespace_id };
    if (b.type === "secret_text")  return { type: "inherit", name: b.name };
    throw new Error("ABORT (nothing deployed): unknown binding type " + b.type);
  });
  const meta = { main_module: "index.mjs", bindings, compatibility_date: S.compatibility_date,
                 compatibility_flags: S.compatibility_flags || [], usage_model: S.usage_model };
  const up = new FormData();
  up.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
  up.append("index.mjs", new Blob([s], { type: "application/javascript+module" }), "index.mjs");
  const r = await fetch(A, { method: "PUT", body: up, credentials: "include", headers: { "x-cross-site-security": "dash" } });
  const j = await r.json();
  console.log("DEPLOY", r.status, j.success, JSON.stringify(j.errors || []));
  return "DEPLOY " + r.status + " " + j.success;
})();
