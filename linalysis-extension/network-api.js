// Linalysis — network & credits reader (v0.3.6, 2026-10-13)
//
// WHY THIS EXISTS. The Credits page was built on numbers read off rendered pages, and three of them
// were wrong in ways no selector fix could cure:
//   • "Invitations sent" came from the "Sent … ago" stamps on the sent-invitations list. That list
//     lazy-loads 10 rows and never loads more in a background window — on 2026-10-13 it reported 10
//     for a day on which 52 invitations went out.
//   • New connections did not exist at all. The total only moves by the NET change, and at the
//     30,000 cap every new connection is paired with a removal — the net change hides both.
//   • InMail was read off /premium, which Sales Navigator accounts never fill (always "—").
//
// LinkedIn's own web app reads all three from JSON endpoints on www.linkedin.com, with the user's
// own session. We read the same endpoints, from the user's own browser — no rendering, no scrolling,
// no window focus. Verified live against Olivier's account on 2026-10-13:
//   /voyager/api/relationships/connectionsSummary        → data.numConnections (29,796)
//   /voyager/api/relationships/dash/connections …         → createdAt per connection, newest first
//   /voyager/api/relationships/sentInvitationViewsV2 …    → sentTime per PENDING invitation
//   /sales-api/salesApiCredits?q=findCreditGrant&creditGrantType=LSS_INMAIL → InMail balance
//
// TWO TRAPS, handled below:
//   1. The sent list only holds invitations still PENDING. An accepted invitation disappears from
//      it. So we remember every invitation we have ever seen (its urn → sentTime) and count from
//      that memory: an invite accepted after we first saw it still counts as sent that day.
//   2. The connection list loses people you remove. Same remedy: remembered urn → createdAt.

// ─── 1. Runs INSIDE a linkedin.com tab (chrome.scripting func) — must be fully self-contained ───
export async function linkedinNetworkProbe(opts) {
  const days = (opts && opts.days) || 8;
  const since = Date.now() - days * 86400000;
  const out = { ok: true, errors: [], at: Date.now() };
  const m = document.cookie.match(/JSESSIONID="?([^";]+)/);
  if (!m) return { ok: false, error: 'no_session', at: Date.now() };
  const csrf = m[1];
  const init = (normalized) => ({
    credentials: 'include',
    headers: Object.assign(
      { 'csrf-token': csrf, 'x-restli-protocol-version': '2.0.0' },
      normalized ? { accept: 'application/vnd.linkedin.normalized+json+2.1' } : {}
    ),
  });
  async function getJson(path, normalized) {
    const r = await fetch(path, init(normalized));
    if (!r.ok) { const e = new Error(path.split('?')[0] + ' HTTP ' + r.status); e.status = r.status; throw e; }
    return r.json();
  }
  // Pages through a newest-first list until a whole page is older than the window.
  async function recent(build, field, maxPages) {
    const seen = {}; let complete = false;
    for (let page = 0; page < maxPages; page++) {
      const j = await getJson(build(page * 100), true);
      const items = (j.included || []).filter(x => x && x.entityUrn && typeof x[field] === 'number');
      if (!items.length) { complete = true; break; }
      let newest = 0;
      for (const x of items) {
        newest = Math.max(newest, x[field]);
        if (x[field] >= since) seen[x.entityUrn] = x[field];
      }
      if (newest < since) { complete = true; break; }
    }
    return { seen, complete };
  }

  try {
    const j = await getJson('/voyager/api/relationships/connectionsSummary', true);
    const n = j && j.data && j.data.numConnections;
    if (typeof n === 'number' && n >= 0) out.connections_total = n;
  } catch (e) { out.errors.push('connections total: ' + e.message); }

  try {
    const r = await recent(s => '/voyager/api/relationships/dash/connections?decorationId=' +
      'com.linkedin.voyager.dash.deco.web.mynetwork.ConnectionListWithProfile-16' +
      '&count=100&q=search&sortType=RECENTLY_ADDED&start=' + s, 'createdAt', 10);
    out.connections = r.seen; out.connections_complete = r.complete;
  } catch (e) { out.errors.push('connections list: ' + e.message); }

  try {
    const r = await recent(s => '/voyager/api/relationships/sentInvitationViewsV2?count=100' +
      '&invitationType=CONNECTION&q=invitationType&start=' + s, 'sentTime', 20);
    out.invitations = r.seen; out.invitations_complete = r.complete;
  } catch (e) { out.errors.push('sent invitations: ' + e.message); }

  // Sales Navigator InMail balance. A 401/403/404 means "not a Sales Navigator seat" — not an error;
  // Premium (non-SN) balances are still read off /premium by content-metrics.js.
  try {
    const r = await fetch('/sales-api/salesApiCredits?q=findCreditGrant&creditGrantType=LSS_INMAIL', init(false));
    if (r.ok) {
      const j = await r.json();
      const g = (j.elements || []).find(x => x && x.type === 'LSS_INMAIL' && typeof x.value === 'number');
      if (g) { out.inmail_credits = g.value; out.inmail_source = 'sales_navigator'; }
    } else if (![401, 403, 404].includes(r.status)) {
      out.errors.push('inmail: HTTP ' + r.status);
    }
  } catch (e) { out.errors.push('inmail: ' + e.message); }

  return out;
}

// ─── 2. Pure bookkeeping (runs in the service worker; unit-tested in test/network-api.test.js) ───
export const KEEP_DAYS = 35;
// Monthly InMail allowance by seat. LinkedIn does not publish the allowance through any endpoint —
// only the balance. Every Sales Navigator tier (Core, Advanced, Advanced Plus) grants 50 a month.
export const INMAIL_ALLOWANCE = { sales_navigator: 50 };

// Calendar day in the USER'S timezone — "how many did I send on Tuesday" is a local question.
export function localDay(t, tz) {
  try { return new Date(t).toLocaleDateString('en-CA', tz ? { timeZone: tz } : undefined); }
  catch (e) { return new Date(t).toISOString().slice(0, 10); }
}

// Folds one probe result into the persistent memory and returns the rows to ingest.
//   st  = { conn: {urn: createdAt}, inv: {urn: sentTime}, last: {at, total} | null }
//   res = linkedinNetworkProbe() output
export function foldNetwork(st, res, opts) {
  const now = (opts && opts.now) || res.at || Date.now();
  const tz = opts && opts.tz;
  const utcToday = new Date(now).toISOString().slice(0, 10);
  const next = {
    conn: Object.assign({}, (st && st.conn) || {}),
    inv: Object.assign({}, (st && st.inv) || {}),
    last: (st && st.last) || null,
  };
  if (res.connections) Object.assign(next.conn, res.connections);
  if (res.invitations) Object.assign(next.inv, res.invitations);
  const floor = now - KEEP_DAYS * 86400000;
  for (const k of Object.keys(next.conn)) if (next.conn[k] < floor) delete next.conn[k];
  for (const k of Object.keys(next.inv)) if (next.inv[k] < floor) delete next.inv[k];

  const count = (map) => {
    const by = {};
    for (const t of Object.values(map)) { const d = localDay(t, tz); by[d] = (by[d] || 0) + 1; }
    return by;
  };
  const connBy = count(next.conn), invBy = count(next.inv);

  // Per-day rows for the last 8 local days. A day's count only ever grows (we remember everything
  // we saw), so re-sending it is always safe.
  const rows = [];
  for (let i = 0; i < 8; i++) {
    const d = localDay(now - i * 86400000, tz);
    const row = { Date: d };
    if (res.connections) row['Connections New'] = connBy[d] || 0;
    if (res.invitations) row['Invitations Sent Day'] = invBy[d] || 0;
    if (Object.keys(row).length > 1) rows.push(row);
  }

  const today = { Date: utcToday };
  if (typeof res.connections_total === 'number') today['Connections'] = res.connections_total;
  if (res.invitations) {
    const inv = Object.values(next.inv);
    today['Invitations Sent 24h'] = inv.filter(t => t > now - 86400000).length;
    today['Invitations Sent 7d']  = inv.filter(t => t > now - 7 * 86400000).length;
  }
  // Connections gained vs removed since the previous capture. Removed is not published anywhere:
  // it is the gap between what was added and how far the total actually moved.
  //   removed = added_since_last − (total_now − total_last)
  if (res.connections && typeof res.connections_total === 'number' && next.last &&
      typeof next.last.total === 'number' && now - next.last.at <= 4 * 86400000 && now > next.last.at) {
    const added = Object.values(next.conn).filter(t => t > next.last.at && t <= now).length;
    const net = res.connections_total - next.last.total;
    today['Connections Added Window'] = added;
    today['Connections Removed'] = Math.max(0, added - net);
    today['Connections Window Hours'] = Math.round((now - next.last.at) / 360000) / 10;
  }
  if (typeof res.inmail_credits === 'number') {
    today['InMail Credits'] = res.inmail_credits;
    today['InMail Source'] = res.inmail_source || 'unknown';
    const a = INMAIL_ALLOWANCE[res.inmail_source];
    if (a) today['InMail Allowance'] = a;
  }
  if (Object.keys(today).length > 1) rows.push(today);
  if (typeof res.connections_total === 'number' && res.connections) next.last = { at: now, total: res.connections_total };
  return { st: next, rows };
}
