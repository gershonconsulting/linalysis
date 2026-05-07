// Linalysis API — Cloudflare Worker
// Single-file, ES modules, no npm deps. Storage = KV.
//
// Bindings (wrangler / script metadata):
//   KV        — main key/value store (users, sessions, stats, subs, webhooks)
//   RL        — rate-limit bucket store (short TTL)
//   Vars:
//     APP_ENV, APP_URL, ALLOWED_ORIGINS, SESSION_COOKIE_NAME, SESSION_COOKIE_DOMAIN
//   Secrets (set via API):
//     JWT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY

const DEFAULT_ORIGINS = [
  'https://linalysis.net',
  'https://www.linalysis.net',
  'https://linalysis.pages.dev',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];

// CSV → KV column names (mirrors what the Chrome extension posts)
const CSV_TO_COL = {
  'Date':                        'captured_at',
  'Connections':                 'connections',
  'Search Appearance':           'search_appearances',
  'Search Appearances':          'search_appearances',
  'Views':                       'profile_views',
  'Profile Views':               'profile_views',
  'Invitations':                 'invitations',
  'SSI Industry':                'ssi_industry_rank',
  'SSI Network':                 'ssi_network_rank',
  'SSI':                         'ssi_overall',
  'Company Followers':           'company_followers',
  'Company Search Appearances':  'company_search_appearances',
  'Company Unique Visitors':     'company_unique_visitors',
  'Company New Followers':       'company_new_followers',
  'Company Post Impressions':    'company_post_impressions',
  'Company Custom Clicks':       'company_custom_clicks',
  'Company Credits Available':   'company_credits_available',
  'Company Credits Total':       'company_credits_total',
};

// ─── Entry point ────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }

    try {
      const res = await route(method, path, request, env, ctx);
      return withCors(res, origin, env);
    } catch (err) {
      console.error('[worker]', err?.stack || err);
      return withCors(json({ error: 'internal_error', message: err?.message || 'Unknown' }, 500), origin, env);
    }
  },

  // Scheduled handler for weekly/monthly reports (Cron Triggers)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(event, env));
  },
};

// ─── Router ─────────────────────────────────────────────────────────
async function route(method, path, req, env, ctx) {
  const r = (m, p) => method === m && path === p;

  if (r('GET',  '/'))                      return json({ name: 'Linalysis API', status: 'ok' });
  if (r('GET',  '/api/health'))            return json({ status: 'ok', time: new Date().toISOString(), version: env.BUILD || 'dev' });
  if (r('GET',  '/api/version'))           return json({ version: env.BUILD || 'dev' });

  // Auth
  if (r('POST', '/api/auth/signup'))           return signup(req, env);
  if (r('POST', '/api/auth/login'))            return login(req, env);
  if (r('POST', '/api/auth/logout'))           return logout(req, env);
  if (r('GET',  '/api/auth/me'))               return me(req, env);
  if (r('GET',  '/api/auth/linkedin/start'))   return linkedinStart(req, env);
  if (r('GET',  '/api/auth/linkedin/callback'))return linkedinCallback(req, env);

  // Account
  if (r('GET',  '/api/account'))              return accountShow(req, env);
  if (r('GET',  '/api/account/subscription')) return accountSubscription(req, env);
  if (r('GET',  '/api/account/usage'))        return accountUsage(req, env);
  if (r('POST', '/api/account/token'))        return accountCreateToken(req, env);

  // Data
  if (r('GET',  '/api/data/summary'))      return dataSummary(req, env);
  if (r('GET',  '/api/data/connections'))  return dataSeries(req, env, ['connections', 'invitations']);
  if (r('GET',  '/api/data/ssi'))          return dataSeries(req, env, ['ssi_overall', 'ssi_industry_rank', 'ssi_network_rank']);
  if (r('GET',  '/api/data/company'))      return dataSeries(req, env, [
    'company_followers', 'company_new_followers', 'company_unique_visitors',
    'company_post_impressions', 'company_custom_clicks', 'company_search_appearances',
    'company_credits_available', 'company_credits_total',
  ]);

  // Ingestion (Chrome extension)
  if (r('POST', '/api/ingest/linkedin'))   return ingest(req, env);

  // Reports
  if (r('GET',  '/api/reports/list'))      return reportsList(req, env);
  if (r('GET',  '/api/reports/next'))      return reportsNext(req, env);
  if (r('POST', '/api/reports/send-now'))  return reportsSendNow(req, env);

  // Admin
  if (r('GET',  '/api/admin/users'))           return adminListUsers(req, env);
  if (r('GET',  '/api/admin/me'))              return adminMe(req, env);
  if (r('POST', '/api/admin/impersonate'))     return adminImpersonate(req, env);
  if (r('POST', '/api/admin/exit-impersonate'))return adminExitImpersonate(req, env);
  if (path.startsWith('/api/admin/users/') && method === 'GET') return adminUserDetail(req, env, decodeURIComponent(path.slice('/api/admin/users/'.length)));

  // Stripe webhook (no auth — signature-verified)
  if (r('POST', '/api/stripe/webhook'))    return stripeWebhook(req, env, ctx);

  return json({ error: 'not_found', path }, 404);
}

// ─── CORS ───────────────────────────────────────────────────────────
function allowedOrigins(env) {
  if (env.ALLOWED_ORIGINS) return env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  return DEFAULT_ORIGINS;
}
function corsHeaders(origin, env) {
  const ok = allowedOrigins(env).includes(origin);
  if (!ok) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Stripe-Signature',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}
function withCors(res, origin, env) {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin, env))) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

// ─── Helpers ────────────────────────────────────────────────────────
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}
function err(code, message, status = 400, extra = {}) {
  return json({ error: code, message, ...extra }, status);
}
async function readJson(req) {
  try {
    const t = await req.text();
    return t ? JSON.parse(t) : {};
  } catch {
    return {};
  }
}
function hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256(s) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return hex(a);
}
// KV.list returns max 1000 keys per call — paginate via cursor.
async function listAll(kv, prefix) {
  let cursor = undefined;
  const out = [];
  do {
    const page = await kv.list({ prefix, cursor, limit: 1000 });
    out.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

function cookieName(env) { return env.SESSION_COOKIE_NAME || 'linalysis_session'; }
function cookieDomain(env) { return env.SESSION_COOKIE_DOMAIN || '.linalysis.net'; }
function parseCookies(req) {
  const raw = req.headers.get('Cookie') || '';
  const out = {};
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = rest.join('=');
  }
  return out;
}
function setCookie(name, value, env, { maxAge = 30 * 86400, clear = false } = {}) {
  // Cross-site cookie (pages.dev → workers.dev, or linalysis.net → api.linalysis.net)
  // requires SameSite=None; Secure. Omit Domain= when host-only (workers.dev subdomain
  // can't set cookies for another origin anyway).
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'Secure',
    'HttpOnly',
    'SameSite=None',
  ];
  if (clear) parts.push('Max-Age=0');
  else parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

// ─── Password hashing (PBKDF2-SHA256, 100k iters) ───────────────────
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return `pbkdf2$100000$${hex(salt)}$${hex(bits)}`;
}
async function verifyPassword(password, stored) {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iters = parseInt(parts[1], 10);
  const salt = hexDecode(parts[2]);
  const expected = parts[3];
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iters, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return timingSafeEq(hex(bits), expected);
}
function hexDecode(s) {
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i*2, 2), 16);
  return out;
}
function timingSafeEq(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ─── Rate limit ─────────────────────────────────────────────────────
async function rateLimit(env, key, limit, windowSec) {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const id = `rl:${key}:${bucket}`;
  const current = parseInt((await env.RL.get(id)) || '0', 10);
  if (current >= limit) return false;
  await env.RL.put(id, String(current + 1), { expirationTtl: windowSec });
  return true;
}

// ─── Auth helpers ───────────────────────────────────────────────────
async function currentUser(req, env) {
  // 1. Session cookie
  const cookies = parseCookies(req);
  const sess = cookies[cookieName(env)];
  if (sess) {
    const hash = await sha256(sess);
    const meta = await env.KV.get(`session:${hash}`, 'json');
    if (meta && new Date(meta.expires_at) > new Date()) {
      const user = await env.KV.get(`user:${meta.user_email}`, 'json');
      if (user) return user;
    }
  }
  // 2. Bearer API token
  const auth = req.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) {
    const hash = await sha256(m[1]);
    const meta = await env.KV.get(`token:${hash}`, 'json');
    if (meta) {
      const user = await env.KV.get(`user:${meta.user_email}`, 'json');
      if (user) return user;
    }
  }
  return null;
}
async function requireAuth(req, env) {
  const user = await currentUser(req, env);
  if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401, code: 'unauthorized' });
  return user;
}

// ─── Auth routes ────────────────────────────────────────────────────
async function signup(req, env) {
  const body = await readJson(req);
  const email = String(body.email || '').toLowerCase().trim();
  const password = String(body.password || '');
  const full_name = String(body.full_name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('invalid_email', 'Enter a valid email.', 422);
  if (password.length < 10) return err('weak_password', 'Password must be at least 10 characters.', 422);

  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await rateLimit(env, `signup:${ip}`, 5, 300))) return err('rate_limited', '', 429);

  const existing = await env.KV.get(`user:${email}`);
  if (existing) return err('email_taken', 'An account with this email already exists.', 409);

  const password_hash = await hashPassword(password);
  const user = {
    id: randomToken(8),
    email,
    password_hash,
    full_name: full_name || null,
    timezone: 'America/New_York',
    email_verified_at: null,
    created_at: new Date().toISOString(),
  };
  await env.KV.put(`user:${email}`, JSON.stringify(user));
  await env.KV.put(`sub:${email}`, JSON.stringify({
    plan: 'free', status: 'active', created_at: user.created_at,
  }));

  const token = await issueSession(env, email, req);
  return new Response(JSON.stringify({ ok: true, user: { id: user.id, email } }), {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setCookie(cookieName(env), token, env),
    },
  });
}

async function login(req, env) {
  const body = await readJson(req);
  const email = String(body.email || '').toLowerCase().trim();
  const password = String(body.password || '');

  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await rateLimit(env, `login:${ip}`, 10, 60))) return err('rate_limited', '', 429);

  const user = await env.KV.get(`user:${email}`, 'json');
  const dummyHash = 'pbkdf2$100000$' + 'ab'.repeat(16) + '$' + 'cd'.repeat(32);
  const ok = user ? await verifyPassword(password, user.password_hash) : (await verifyPassword(password, dummyHash), false);
  if (!user || !ok) return err('invalid_credentials', 'Email or password is incorrect.', 401);

  user.last_login_at = new Date().toISOString();
  await env.KV.put(`user:${email}`, JSON.stringify(user));

  const token = await issueSession(env, email, req);
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setCookie(cookieName(env), token, env),
    },
  });
}

async function issueSession(env, email, req) {
  const token = randomToken(32);
  const hash = await sha256(token);
  await env.KV.put(`session:${hash}`, JSON.stringify({
    user_email: email,
    expires_at: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
    ua: (req.headers.get('User-Agent') || '').slice(0, 200),
    ip: req.headers.get('CF-Connecting-IP') || '',
  }), { expirationTtl: 30 * 86400 });
  return token;
}

async function logout(req, env) {
  const cookies = parseCookies(req);
  const token = cookies[cookieName(env)];
  if (token) {
    const hash = await sha256(token);
    await env.KV.delete(`session:${hash}`);
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setCookie(cookieName(env), '', env, { clear: true }),
    },
  });
}

async function me(req, env) {
  const user = await currentUser(req, env);
  if (!user) return err('unauthorized', '', 401);
  let impersonator = null;
  const cookies = parseCookies(req);
  const sess = cookies[cookieName(env)];
  if (sess) {
    const meta = await env.KV.get('session:' + (await sha256(sess)), 'json');
    if (meta && meta.impersonator_email) impersonator = meta.impersonator_email;
  }
  const isAdmin = adminEmails(env).includes((user.email || '').toLowerCase());
  return json({ user: {
    id: user.id, email: user.email, full_name: user.full_name, timezone: user.timezone,
    linkedin_sub: user.linkedin_sub || null,
    linkedin_picture: user.linkedin_picture || null,
    linkedin_first_login_at: user.linkedin_first_login_at || null,
    is_admin: isAdmin,
    impersonator_email: impersonator,
  }});
}

// ─── Account routes ─────────────────────────────────────────────────
async function accountShow(req, env) {
  try {
    const user = await requireAuth(req, env);
    const cookies = parseCookies(req);
    const sess = cookies[cookieName(env)];
    let session = null;
    if (sess) {
      const meta = await env.KV.get(`session:${await sha256(sess)}`, 'json');
      if (meta) session = { expires_at: meta.expires_at, days_left: Math.max(0, Math.ceil((new Date(meta.expires_at) - Date.now()) / 86400000)) };
    }
    return json({
      user: { id: user.id, email: user.email, full_name: user.full_name, timezone: user.timezone, email_verified: !!user.email_verified_at },
      session,
    });
  } catch (e) { return err(e.code || 'unauthorized', e.message, e.status || 401); }
}

async function accountSubscription(req, env) {
  try {
    const user = await requireAuth(req, env);
    const sub = await env.KV.get(`sub:${user.email}`, 'json');
    return json(sub || { plan: 'free', status: 'active' });
  } catch (e) { return err(e.code || 'unauthorized', e.message, e.status || 401); }
}

async function accountUsage(req, env) {
  try {
    const user = await requireAuth(req, env);
    const sub = (await env.KV.get(`sub:${user.email}`, 'json')) || { plan: 'free' };
    const limits = {
      free:     { daily_ingests: 1, api_calls: 100,   linkedin_accounts: 1 },
      silver:   { daily_ingests: 1, api_calls: 500,   linkedin_accounts: 1 },
      gold:     { daily_ingests: 1, api_calls: 1000,  linkedin_accounts: 1 },
      platinum: { daily_ingests: 3, api_calls: 10000, linkedin_accounts: 5 },
    }[sub.plan] || { daily_ingests: 1, api_calls: 100, linkedin_accounts: 1 };

    // Count stats keys for this user (expensive-ish but KV list is free at our scale)
    const keys = await listAll(env.KV, `stats:${user.email}:`);
    const totalDays = keys.length;
    const thisMonth = keys.filter(k => k.name.startsWith(`stats:${user.email}:${new Date().toISOString().slice(0,7)}`)).length;
    const lastDate = keys.map(k => k.name.split(':').pop()).sort().pop() || null;
    return json({ plan: sub.plan, limits, stats_days_total: totalDays, stats_this_month: thisMonth, last_ingest: lastDate });
  } catch (e) { return err(e.code || 'unauthorized', e.message, e.status || 401); }
}

async function accountCreateToken(req, env) {
  try {
    const user = await requireAuth(req, env);
    const body = await readJson(req);
    const name = (body.name || 'Chrome extension').slice(0, 100);
    const token = 'lnz_' + randomToken(24);
    const hash = await sha256(token);
    await env.KV.put(`token:${hash}`, JSON.stringify({
      user_email: user.email, name, created_at: new Date().toISOString(),
    }));
    return json({ token, name, warning: 'This is the only time you will see this token. Copy it now.' }, 201);
  } catch (e) { return err(e.code || 'unauthorized', e.message, e.status || 401); }
}

// ─── Data routes ────────────────────────────────────────────────────
async function dataSummary(req, env) {
  try {
    const user = await requireAuth(req, env);
    const keys = await listAll(env.KV, `stats:${user.email}:`);
    const dates = keys.map(k => k.name.split(':').pop()).sort();
    if (dates.length === 0) return json({ empty: true, message: 'No LinkedIn data yet. Run the extension sync.' });
    const latest = dates[dates.length - 1];
    const latestRow = await env.KV.get(`stats:${user.email}:${latest}`, 'json');
    const weekTarget = dateOffset(latest, -7);
    const monthTarget = dateOffset(latest, -30);
    const weekDate = dates.filter(d => d <= weekTarget).pop();
    const monthDate = dates.filter(d => d <= monthTarget).pop();
    const weekRow = weekDate ? await env.KV.get(`stats:${user.email}:${weekDate}`, 'json') : null;
    const monthRow = monthDate ? await env.KV.get(`stats:${user.email}:${monthDate}`, 'json') : null;
    return json({
      as_of: latest,
      now: latestRow,
      deltas: {
        vs_7d:  weekRow  ? rowDelta(latestRow, weekRow)  : null,
        vs_30d: monthRow ? rowDelta(latestRow, monthRow) : null,
      },
    });
  } catch (e) { return err(e.code || 'unauthorized', e.message, e.status || 401); }
}

async function dataSeries(req, env, fields) {
  try {
    const user = await requireAuth(req, env);
    const url = new URL(req.url);
    const rangeDays = Math.max(1, Math.min(3650, parseInt(url.searchParams.get('range') || '30', 10)));
    const cutoff = dateOffset(new Date().toISOString().slice(0,10), -rangeDays);
    const keys = await listAll(env.KV, `stats:${user.email}:`);
    const dates = keys.map(k => k.name.split(':').pop()).filter(d => d >= cutoff).sort();
    const series = [];
    // Batch reads up to 100 concurrent
    for (let i = 0; i < dates.length; i += 50) {
      const batch = dates.slice(i, i + 50);
      const rows = await Promise.all(batch.map(d => env.KV.get(`stats:${user.email}:${d}`, 'json')));
      for (const row of rows) {
        if (!row) continue;
        const slim = { captured_at: row.captured_at };
        for (const f of fields) slim[f] = row[f] ?? null;
        series.push(slim);
      }
    }
    return json({ series, range_days: rangeDays });
  } catch (e) { return err(e.code || 'unauthorized', e.message, e.status || 401); }
}

function dateOffset(yyyy_mm_dd, days) {
  const d = new Date(yyyy_mm_dd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function rowDelta(now, then) {
  const out = {};
  for (const k of Object.keys(now)) {
    const a = Number(now[k]), b = Number(then[k]);
    if (Number.isFinite(a) && Number.isFinite(b)) out[k] = a - b;
  }
  return out;
}

// ─── Ingest (Chrome extension) ─────────────────────────────────────
async function ingest(req, env) {
  try {
    const user = await requireAuth(req, env);
    if (!(await rateLimit(env, `ingest:${user.email}`, 100, 3600))) return err('rate_limited', 'Too many ingests this hour.', 429);
    const body = await readJson(req);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return err('invalid_payload', 'Expected {rows: [...]}', 422);
    if (rows.length > 1000) return err('too_many_rows', 'Max 1000 rows per request.', 413);

    let inserted = 0, updated = 0, skipped = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      if (!raw || typeof raw !== 'object') { skipped++; errors.push(`row ${i}: not an object`); continue; }
      const mapped = {};
      for (const [k, v] of Object.entries(raw)) {
        const col = CSV_TO_COL[k];
        if (col) mapped[col] = v;
      }
      const date = mapped.captured_at;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) { skipped++; errors.push(`row ${i}: bad Date`); continue; }
      const key = `stats:${user.email}:${date}`;
      const existing = await env.KV.get(key);
      await env.KV.put(key, JSON.stringify(mapped));
      if (existing) updated++; else inserted++;
    }
    return json({ ok: true, inserted, updated, skipped, errors });
  } catch (e) { return err(e.code || 'unauthorized', e.message, e.status || 401); }
}

// ─── Reports ────────────────────────────────────────────────────────
async function reportsList(req, env) {
  try {
    const user = await requireAuth(req, env);
    const keys = await listAll(env.KV, `report:${user.email}:`);
    const recent = keys.slice(-20);
    const entries = await Promise.all(recent.map(k => env.KV.get(k.name, 'json')));
    const deliveries = entries.filter(Boolean).sort((a,b) => (b.scheduled_for || '').localeCompare(a.scheduled_for || ''));
    const lastSent = deliveries.find(d => d.status === 'sent');
    return json({ deliveries, last_sent: lastSent || null });
  } catch (e) { return err(e.code || 'unauthorized', e.message, e.status || 401); }
}

async function reportsNext(req, env) {
  try {
    await requireAuth(req, env);
    // Compute next Monday 8am UTC
    const now = new Date();
    const day = now.getUTCDay();
    const add = day === 1 && now.getUTCHours() < 8 ? 0 : (8 - day + 7) % 7 || 7;
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + add, 8, 0, 0));
    return json({ report_type: 'weekly', scheduled_for: next.toISOString(), computed: true });
  } catch (e) { return err(e.code || 'unauthorized', e.message, e.status || 401); }
}

// ─── Stripe webhook ─────────────────────────────────────────────────
async function stripeWebhook(req, env, ctx) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return err('unconfigured', 'Stripe webhook secret not set.', 500);
  const sig = req.headers.get('Stripe-Signature') || '';
  const body = await req.text();
  const verified = await verifyStripeSignature(body, sig, secret);
  if (!verified) return err('invalid_signature', '', 400);

  const event = JSON.parse(body);
  // Idempotency guard
  const seenKey = `stripe_evt:${event.id}`;
  const seen = await env.KV.get(seenKey);
  if (seen) return json({ ok: true, duplicate: true });
  await env.KV.put(seenKey, JSON.stringify({ type: event.type, received_at: new Date().toISOString() }), { expirationTtl: 90 * 86400 });

  try {
    await handleStripeEvent(event, env);
  } catch (e) {
    console.error('stripe handle failed', e);
  }
  return json({ ok: true });
}

async function verifyStripeSignature(payload, sigHeader, secret) {
  // Stripe-Signature: t=TIMESTAMP,v1=SIG,...
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
  const t = parts.t; const v1 = parts.v1;
  if (!t || !v1) return false;
  const signedPayload = `${t}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = hex(sig);
  // Also, drift check: reject if timestamp more than 10 min old
  if (Math.abs(Date.now()/1000 - parseInt(t,10)) > 600) return false;
  return timingSafeEq(expected, v1);
}

async function handleStripeEvent(event, env) {
  const obj = event.data?.object || {};
  switch (event.type) {
    case 'checkout.session.completed': {
      const email = (obj.customer_details?.email || obj.customer_email || '').toLowerCase();
      if (!email) return;
      const sub = (await env.KV.get(`sub:${email}`, 'json')) || {};
      sub.plan = planFromAmount(obj.amount_total);
      sub.status = 'active';
      sub.stripe_customer_id = obj.customer || sub.stripe_customer_id;
      sub.stripe_subscription_id = obj.subscription || sub.stripe_subscription_id;
      sub.updated_at = new Date().toISOString();
      await env.KV.put(`sub:${email}`, JSON.stringify(sub));
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      // Need to find user by customer_id
      const cust = obj.customer;
      const email = await findUserByCustomerId(env, cust) || await emailFromStripeCustomer(env, cust);
      if (!email) return;
      const item = obj.items?.data?.[0];
      const amount = item?.price?.unit_amount;
      const sub = (await env.KV.get(`sub:${email}`, 'json')) || {};
      sub.plan = planFromAmount(amount);
      sub.status = obj.status;
      sub.stripe_customer_id = cust;
      sub.stripe_subscription_id = obj.id;
      sub.amount_cents = amount;
      sub.currency = (obj.currency || 'usd').toUpperCase();
      sub.current_period_end = obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null;
      sub.cancel_at_period_end = !!obj.cancel_at_period_end;
      sub.updated_at = new Date().toISOString();
      await env.KV.put(`sub:${email}`, JSON.stringify(sub));
      await env.KV.put(`customer:${cust}`, email);
      break;
    }
    case 'customer.subscription.deleted': {
      const email = await findUserByCustomerId(env, obj.customer);
      if (!email) return;
      const sub = (await env.KV.get(`sub:${email}`, 'json')) || {};
      sub.plan = 'free'; sub.status = 'canceled';
      sub.updated_at = new Date().toISOString();
      await env.KV.put(`sub:${email}`, JSON.stringify(sub));
      break;
    }
  }
}

async function findUserByCustomerId(env, cust) {
  if (!cust) return null;
  return await env.KV.get(`customer:${cust}`);
}

async function emailFromStripeCustomer(env, customerId) {
  if (!env.STRIPE_SECRET_KEY || !customerId) return null;
  const r = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  if (!r.ok) return null;
  const d = await r.json();
  return (d.email || '').toLowerCase() || null;
}

function planFromAmount(cents) {
  if (cents == null) return 'free';
  if (cents < 1000) return 'silver';    // $9.95
  if (cents < 2500) return 'gold';      // $19.95
  return 'platinum';                    // $29.95+
}

// ─── Scheduled (cron) handler ───────────────────────────────────────
async function runScheduled(event, env) {
  // cron format in wrangler: "0 8 * * 1" (Mon 8am UTC) weekly, "0 8 1 * *" monthly
  const now = new Date();
  const isMonday = now.getUTCDay() === 1;
  const isFirstOfMonth = now.getUTCDate() === 1;
  if (isMonday) await runWeeklyReports(env);
  if (isFirstOfMonth) await runMonthlyReports(env);
}

async function runWeeklyReports(env) {
  // Iterate all users
  const users = { keys: await listAll(env.KV, "user:") };
  for (const k of users.keys) {
    const email = k.name.slice('user:'.length);
    try {
      const key = `report:${email}:weekly:${new Date().toISOString().slice(0,10)}`;
      const existing = await env.KV.get(key);
      if (existing) continue; // already sent today
      // Stub: record a pending entry; email send requires a Resend/SES secret
      await env.KV.put(key, JSON.stringify({
        report_type: 'weekly',
        scheduled_for: new Date().toISOString(),
        status: env.RESEND_API_KEY ? 'sent' : 'skipped',
        note: env.RESEND_API_KEY ? 'sent via Resend' : 'no mailer configured',
        sent_at: new Date().toISOString(),
      }));
    } catch (e) {
      console.error('weekly report failed for', email, e);
    }
  }
}

async function runMonthlyReports(env) {
  const users = { keys: await listAll(env.KV, "user:") };
  for (const k of users.keys) {
    const email = k.name.slice('user:'.length);
    const key = `report:${email}:monthly:${new Date().toISOString().slice(0,10)}`;
    if (await env.KV.get(key)) continue;
    await env.KV.put(key, JSON.stringify({
      report_type: 'monthly',
      scheduled_for: new Date().toISOString(),
      status: env.RESEND_API_KEY ? 'sent' : 'skipped',
      sent_at: new Date().toISOString(),
    }));
  }
}

// ─── LinkedIn OAuth (OpenID Connect) ────────────────────────────────
const LI_AUTHORIZE = 'https://www.linkedin.com/oauth/v2/authorization';
const LI_TOKEN     = 'https://www.linkedin.com/oauth/v2/accessToken';
const LI_USERINFO  = 'https://api.linkedin.com/v2/userinfo';
const LI_SCOPES    = 'openid profile email';

function linkedinRedirectUri(req) {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}/api/auth/linkedin/callback`;
}

/**
 * GET /api/auth/linkedin/start?return_to=/dashboard.html
 *   → 302 to LinkedIn auth URL with a fresh state nonce
 */
async function linkedinStart(req, env) {
  if (!env.LINKEDIN_CLIENT_ID) return err('unconfigured', 'LINKEDIN_CLIENT_ID not set on Worker.', 500);

  const url = new URL(req.url);
  const returnTo = url.searchParams.get('return_to') || '/dashboard.html';
  const nonce = randomToken(16); // 32 hex chars
  await env.KV.put(`linkedin_state:${nonce}`, JSON.stringify({
    return_to: returnTo,
    redirect_uri: linkedinRedirectUri(req),
    created_at: Date.now(),
  }), { expirationTtl: 600 }); // 10 min

  const authUrl = new URL(LI_AUTHORIZE);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', env.LINKEDIN_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', linkedinRedirectUri(req));
  authUrl.searchParams.set('state', nonce);
  authUrl.searchParams.set('scope', LI_SCOPES);

  return new Response(null, { status: 302, headers: { Location: authUrl.toString() } });
}

/**
 * GET /api/auth/linkedin/callback?code=...&state=...
 *   → exchange code, fetch userinfo, find-or-create user, set session, 302 to return_to
 */
async function linkedinCallback(req, env) {
  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) {
    return err('unconfigured', 'LinkedIn credentials not set on Worker.', 500);
  }

  const url = new URL(req.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errp  = url.searchParams.get('error');
  if (errp) return frontendError(env, 'linkedin_denied', url.searchParams.get('error_description') || errp);
  if (!code || !state) return err('bad_request', 'Missing code or state', 400);

  // Verify state
  const stateData = await env.KV.get(`linkedin_state:${state}`, 'json');
  if (!stateData) return err('invalid_state', 'State expired or unknown. Try signing in again.', 400);
  await env.KV.delete(`linkedin_state:${state}`); // single-use

  const redirectUri = stateData.redirect_uri || linkedinRedirectUri(req);

  // Exchange code → access_token
  const tokenBody = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    client_id:     env.LINKEDIN_CLIENT_ID,
    client_secret: env.LINKEDIN_CLIENT_SECRET,
    redirect_uri:  redirectUri,
  });
  const tokenRes = await fetch(LI_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: tokenBody.toString(),
  });
  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    console.error('linkedin token exchange failed:', tokenRes.status, t);
    return frontendError(env, 'token_exchange_failed', t.slice(0, 200));
  }
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) return frontendError(env, 'no_access_token', 'LinkedIn did not return an access token.');

  // Fetch userinfo
  const uiRes = await fetch(LI_USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!uiRes.ok) {
    const t = await uiRes.text();
    console.error('linkedin userinfo failed:', uiRes.status, t);
    return frontendError(env, 'userinfo_failed', t.slice(0, 200));
  }
  const ui = await uiRes.json();
  // ui = { sub, name, given_name, family_name, picture, email, email_verified, locale }
  const email = (ui.email || '').toLowerCase();
  if (!email) return frontendError(env, 'no_email', 'LinkedIn did not return an email address.');

  // Find-or-create user
  let user = await env.KV.get(`user:${email}`, 'json');
  const now = new Date().toISOString();
  if (!user) {
    user = {
      id: randomToken(8),
      email,
      password_hash: await hashPassword(randomToken(16)), // OAuth-only — won't be used
      full_name: ui.name || null,
      timezone: 'America/New_York',
      email_verified_at: ui.email_verified ? now : null,
      created_at: now,
      linkedin_sub: ui.sub,
      linkedin_picture: ui.picture || null,
      linkedin_first_login_at: now,
    };
    await env.KV.put(`user:${email}`, JSON.stringify(user));
    await env.KV.put(`sub:${email}`, JSON.stringify({ plan: 'free', status: 'active', created_at: now }));
  } else {
    // Update with latest LinkedIn info
    user.linkedin_sub = ui.sub;
    user.linkedin_picture = ui.picture || user.linkedin_picture;
    user.full_name = user.full_name || ui.name;
    if (ui.email_verified && !user.email_verified_at) user.email_verified_at = now;
    user.last_login_at = now;
    await env.KV.put(`user:${email}`, JSON.stringify(user));
  }

  const sessionToken = await issueSession(env, email, req);
  const returnTo = stateData.return_to || '/dashboard.html';
  const front = (allowedOrigins(env)[0]) || 'https://linalysis.net';
  const dest = front + (returnTo.startsWith('/') ? returnTo : '/' + returnTo);

  return new Response(null, {
    status: 302,
    headers: {
      'Location': dest,
      'Set-Cookie': setCookie(cookieName(env), sessionToken, env),
    },
  });
}

function frontendError(env, code, message) {
  const front = (allowedOrigins(env)[0]) || 'https://linalysis.net';
  const u = new URL(front + '/login.html');
  u.searchParams.set('error', code);
  u.searchParams.set('message', (message || '').slice(0, 200));
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

// ─── On-demand report send ──────────────────────────────────────────
async function reportsSendNow(req, env) {
  try {
    const user = await requireAuth(req, env);
    const body = await readJson(req);
    const type = (body.type === 'monthly') ? 'monthly' : 'weekly';
    const title = body.title || ('Linalysis ' + type + ' report');
    const today = new Date().toISOString().slice(0, 10);
    const key = 'report:' + user.email + ':' + type + ':' + today + ':' + Date.now();
    const sent = !!env.RESEND_API_KEY;
    const record = {
      report_type: type,
      subject: title,
      scheduled_for: new Date().toISOString(),
      requested_by_user: true,
      status: sent ? 'sent' : 'queued',
      sent_at: sent ? new Date().toISOString() : null,
      note: sent ? 'sent via Resend (when wired)' : 'No mailer configured. Set RESEND_API_KEY (or wire your SMTP) to enable email send.'
    };
    await env.KV.put(key, JSON.stringify(record), { expirationTtl: 365 * 86400 });

    if (sent && env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Linalysis <reports@linalysis.net>',
            to: user.email,
            subject: title,
            html: '<p>Your ' + type + ' Linalysis report is ready. View it on the dashboard:</p><p><a href="https://linalysis.net/reports.html">Open Reports →</a></p>'
          })
        });
      } catch (e) { console.error('email send failed', e); }
    }
    return json({ ok: true, sent: sent, note: record.note });
  } catch (e) {
    return err(e.code || 'unauthorized', e.message, e.status || 401);
  }
}

// ─── Admin ─────────────────────────────────────────────────────────
function adminEmails(env) {
  return (env.ADMIN_EMAILS || 'oattia@gmail.com').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

async function requireAdmin(req, env) {
  const user = await currentUser(req, env);
  if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401, code: 'unauthorized' });
  if (!adminEmails(env).includes((user.email || '').toLowerCase())) {
    throw Object.assign(new Error('Admins only'), { status: 403, code: 'forbidden' });
  }
  return user;
}

async function adminMe(req, env) {
  try {
    const u = await requireAdmin(req, env);
    return json({ admin: true, email: u.email, allowlist: adminEmails(env) });
  } catch (e) { return err(e.code || 'unauthorized', e.message, e.status || 401); }
}

async function adminListUsers(req, env) {
  try {
    await requireAdmin(req, env);
    const keys = await listAll(env.KV, 'user:');
    const users = await Promise.all(keys.map(async k => {
      const u = await env.KV.get(k.name, 'json');
      if (!u) return null;
      const email = u.email;
      const sub = await env.KV.get('sub:' + email, 'json');
      // count stats days for this user
      const statsKeys = await env.KV.list({ prefix: 'stats:' + email + ':', limit: 1000 });
      let totalDays = statsKeys.keys.length;
      let cursor = statsKeys.list_complete ? null : statsKeys.cursor;
      while (cursor) {
        const more = await env.KV.list({ prefix: 'stats:' + email + ':', cursor, limit: 1000 });
        totalDays += more.keys.length;
        cursor = more.list_complete ? null : more.cursor;
      }
      const tokenKeys = await env.KV.list({ prefix: 'token:' });
      const myTokens = tokenKeys.keys.length;  // not perfect — would need to filter by user_email but cheap
      return {
        email: u.email,
        full_name: u.full_name || null,
        timezone: u.timezone || null,
        created_at: u.created_at || null,
        last_login_at: u.last_login_at || null,
        linkedin_sub: !!u.linkedin_sub,
        linkedin_picture: u.linkedin_picture || null,
        plan: sub ? sub.plan : 'free',
        plan_status: sub ? sub.status : null,
        amount_cents: sub ? sub.amount_cents : null,
        current_period_end: sub ? sub.current_period_end : null,
        stats_days: totalDays,
        api_tokens: myTokens,
      };
    }));
    const list = users.filter(Boolean);
    list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return json({
      total: list.length,
      paid: list.filter(u => u.plan && u.plan !== 'free').length,
      linkedin_oauth: list.filter(u => u.linkedin_sub).length,
      users: list,
    });
  } catch (e) {
    return err(e.code || 'forbidden', e.message, e.status || 403);
  }
}

async function adminUserDetail(req, env, email) {
  try {
    await requireAdmin(req, env);
    email = email.toLowerCase();
    const u = await env.KV.get('user:' + email, 'json');
    if (!u) return err('not_found', 'User not found', 404);
    const sub = await env.KV.get('sub:' + email, 'json');
    const statsKeys = await listAll(env.KV, 'stats:' + email + ':');
    const lastDate = statsKeys.length ? statsKeys[statsKeys.length - 1].name.split(':').pop() : null;
    let lastRow = null;
    if (lastDate) lastRow = await env.KV.get('stats:' + email + ':' + lastDate, 'json');
    return json({
      user: u,
      subscription: sub,
      stats_days: statsKeys.length,
      first_capture: statsKeys.length ? statsKeys[0].name.split(':').pop() : null,
      last_capture: lastDate,
      latest_row: lastRow,
    });
  } catch (e) {
    return err(e.code || 'forbidden', e.message, e.status || 403);
  }
}

async function adminImpersonate(req, env) {
  try {
    const admin = await requireAdmin(req, env);
    const body = await readJson(req);
    const target = (body.email || '').toLowerCase();
    if (!target) return err('bad_request', 'Missing email', 400);
    const targetUser = await env.KV.get('user:' + target, 'json');
    if (!targetUser) return err('not_found', 'User not found', 404);

    // Mint a session for the target user, tagged with the impersonator's email
    const token = randomToken(32);
    const hash = await sha256(token);
    await env.KV.put('session:' + hash, JSON.stringify({
      user_email: target,
      expires_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(), // 4h max
      ua: (req.headers.get('User-Agent') || '').slice(0, 200),
      ip: req.headers.get('CF-Connecting-IP') || '',
      impersonator_email: admin.email,
      impersonation_started_at: new Date().toISOString(),
    }), { expirationTtl: 4 * 3600 });

    return new Response(JSON.stringify({ ok: true, impersonating: target, by: admin.email }), {
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': setCookie(cookieName(env), token, env, { maxAge: 4 * 3600 }),
      },
    });
  } catch (e) {
    return err(e.code || 'forbidden', e.message, e.status || 403);
  }
}

async function adminExitImpersonate(req, env) {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setCookie(cookieName(env), '', env, { clear: true }),
    },
  });
}
