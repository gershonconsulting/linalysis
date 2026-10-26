// functions/api/matrix-stats.js
// POST /api/matrix-stats — read-only status for the weekly "Client Platform Matrix"
// email (Supabase edge function). Same contract on all 4 Gershon apps:
//   in : {"secret":"...","people":[{"key":"<id>","company":"<name>","emails":["a@b.com"]}]}
//   out: {"ok":true,"platform":"linalysis","results":[{"key":"<id>","ok":bool,"note":"<short>"}]}
// Auth: SHA-256 hex of `secret` must equal SECRET_HASH (plaintext secret is never committed).
//
// Data source: the LINALYSIS_KV namespace (binding KV, declared in wrangler.toml) that the
// API worker (api.linalysis.net) writes: user:<email> = account, stats:<email>:<YYYY-MM-DD> =
// one row per day of collected data. Read-only: this file only calls KV.get / KV.list.

const SECRET_HASH = '7031a38bde30c34db677585e85f696f51d78cc417e40d38572d20ebeb1c77569';
const MAX_PEOPLE = 500;
const MAX_EMAILS = 10;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function countDays(kv, email) {
  let n = 0, cursor;
  do {
    const r = await kv.list({ prefix: 'stats:' + email + ':', cursor, limit: 1000 });
    n += r.keys.length;
    cursor = r.list_complete ? null : r.cursor;
  } while (cursor);
  return n;
}

async function lookup(kv, emails) {
  let hasAccount = false, best = 0;
  for (const email of emails) {
    const user = await kv.get('user:' + email);
    if (!user) continue;
    hasAccount = true;
    const days = await countDays(kv, email);
    if (days > best) best = days;
  }
  if (!hasAccount) return { ok: false, note: 'no account' };
  if (!best) return { ok: false, note: 'no data' };
  return { ok: true, note: best === 1 ? '1 day' : best + ' days' };
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false }, 401); }
  const secret = body && typeof body.secret === 'string' ? body.secret : '';
  if (!secret || (await sha256Hex(secret)) !== SECRET_HASH) return json({ ok: false }, 401);

  if (!env.KV) return json({ ok: false, error: 'storage_unavailable' }, 503);

  const people = Array.isArray(body.people) ? body.people.slice(0, MAX_PEOPLE) : [];
  const results = [];
  for (const p of people) {
    const key = p && p.key != null ? String(p.key) : null;
    const emails = [...new Set((Array.isArray(p && p.emails) ? p.emails : [])
      .map(e => String(e || '').trim().toLowerCase())
      .filter(e => e.includes('@')))].slice(0, MAX_EMAILS);
    if (!emails.length) { results.push({ key, ok: false, note: 'no email' }); continue; }
    try {
      const r = await lookup(env.KV, emails);
      results.push({ key, ok: r.ok, note: r.note });
    } catch (e) {
      results.push({ key, ok: false, note: 'lookup error' });
    }
  }
  return json({ ok: true, platform: 'linalysis', results });
}

export async function onRequest() {
  return json({ ok: false }, 405);
}
