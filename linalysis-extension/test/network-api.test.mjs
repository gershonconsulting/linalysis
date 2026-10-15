// node test/network-api.test.mjs — bookkeeping for the v0.3.5 network reader
import { foldNetwork } from '../network-api.js';
let pass = 0, fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.log('FAIL', m, 'got', JSON.stringify(a), 'want', JSON.stringify(b)); } };
const tz = 'America/New_York';
const T = (s) => Date.parse(s);
const day1 = T('2026-10-12T13:00:00Z'), day2 = T('2026-10-13T13:00:00Z');

// Day 1: 3 pending sent today, 2 yesterday; 4 new connections; total 29,900; 50 InMail
const r1 = { ok: true, at: day1, errors: [], connections_total: 29900,
  connections: { c1: T('2026-10-12T12:00:00Z'), c2: T('2026-10-12T11:00:00Z'), c3: T('2026-10-11T15:00:00Z'), c4: T('2026-10-12T05:00:00Z') },
  invitations: { i1: T('2026-10-12T12:30:00Z'), i2: T('2026-10-12T12:00:00Z'), i3: T('2026-10-12T05:00:00Z'), i4: T('2026-10-11T14:00:00Z'), i5: T('2026-10-11T13:00:00Z') },
  inmail_credits: 12, inmail_source: 'sales_navigator' };
const f1 = foldNetwork(null, r1, { now: day1, tz });
const today1 = f1.rows.find(r => r.Date === '2026-10-12' && 'Connections' in r);
const d12 = f1.rows.find(r => r.Date === '2026-10-12' && 'Connections New' in r);
eq(d12['Connections New'], 3, 'local day count (05:00Z is 01:00 ET same day)');
eq(d12['Invitations Sent Day'], 3, 'invites 10-12 ET');
eq(f1.rows.find(r => r.Date === '2026-10-11')['Invitations Sent Day'], 2, 'invites 10-11');
eq(today1['Invitations Sent 24h'], 4, '24h window');
eq(today1['Connections Removed'], undefined, 'no removed without a previous snapshot');
eq([today1['InMail Credits'], today1['InMail Allowance'], today1['InMail Source']], [12, 50, 'sales_navigator'], 'inmail');
eq(f1.st.last, { at: day1, total: 29900 }, 'snapshot stored');

// Day 2: i1 + i2 were ACCEPTED (gone from the pending list) and became connections; c2 was REMOVED;
// 6 new connections since day1 (incl. the 2 acceptances); total 29,903 → net +3 → removed 3.
const r2 = { ok: true, at: day2, errors: [], connections_total: 29903,
  connections: { c1: T('2026-10-12T12:00:00Z'), c3: T('2026-10-11T15:00:00Z'), c4: T('2026-10-12T05:00:00Z'),
    n1: T('2026-10-12T14:00:00Z'), n2: T('2026-10-12T20:00:00Z'), n3: T('2026-10-13T01:00:00Z'), n4: T('2026-10-13T09:00:00Z'), n5: T('2026-10-13T10:00:00Z'), n6: T('2026-10-13T12:00:00Z') },
  invitations: { i3: T('2026-10-12T05:00:00Z'), i4: T('2026-10-11T14:00:00Z'), i5: T('2026-10-11T13:00:00Z'), i6: T('2026-10-13T12:00:00Z') } };
const f2 = foldNetwork(f1.st, r2, { now: day2, tz });
const t2 = f2.rows.find(r => r.Date === '2026-10-13' && 'Connections' in r);
eq(f2.rows.find(r => r.Date === '2026-10-12' && 'Invitations Sent Day' in r)['Invitations Sent Day'], 3, 'accepted invites still count for the day they were sent');
eq(t2['Connections Added Window'], 6, 'added since last capture');
eq(t2['Connections Removed'], 3, 'removed = added − net');
eq(t2['Connections Window Hours'], 24, 'window');
eq(f2.rows.find(r => r.Date === '2026-10-12' && 'Connections New' in r)['Connections New'], 6, 'removed connection still counted on its day (c1,c2,c4,n1,n2,n3 ET)');
eq(t2['InMail Credits'], undefined, 'no inmail when not read');
eq(t2['Invitations Sent 7d'], 6, '7d includes accepted ones');

// Failed list read → no per-day rows and no fake zero
const f3 = foldNetwork(f2.st, { ok: true, at: day2 + 3600e3, errors: ['x'], connections_total: 29903 }, { now: day2 + 3600e3, tz });
eq(f3.rows.filter(r => 'Connections New' in r || 'Invitations Sent Day' in r).length, 0, 'no per-day zeros when lists failed');
eq(f3.st.last.at, day2, 'snapshot not advanced without the list');

// Prune
const old = foldNetwork({ conn: { z: day1 - 40 * 864e5 }, inv: {}, last: null }, { ok: true, at: day1, errors: [] }, { now: day1, tz });
eq(Object.keys(old.st.conn), [], 'pruned >35d');
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
