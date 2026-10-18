// ─── Sent invitations, read on the SERVER from the page text the extension ships ──────────────
// (2026-10-06) WHY THIS EXISTS. Every invitation fix so far lived in the extension, and the
// extension is installed with "Load unpacked", which Chrome never updates. On 2026-10-05 four of
// seven active accounts were still on v0.2.9, so fixes made weeks ago reached nobody — the French
// account has never once delivered its pending count. Its page text arrives every day: the count
// is right there ("Personnes (2 903)", with a NARROW no-break space, U+202F, that v0.2.9's pattern
// does not accept). Reading that text here makes the fix reach every installed version at once,
// with no reinstall. Same rule as the extension: only an unambiguous reading is kept, never a guess,
// and nothing the extension already captured is ever overwritten.
const INV_PEOPLE_TABS = ['People', 'Personen', 'Personnes', 'Personas', 'Persone', 'Pessoas', 'Mensen'];
const INV_PAGES_TABS  = ['Pages', 'Seiten', 'Páginas', 'Paginas', 'Pagine', "Pagina's", 'Pagina’s'];
const INV_NUM = "(\\d[\\d.,'\\s\\u00a0\\u202f\\u2009]{0,12})";

function invEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function invCount(s) {
  const d = String(s).replace(/[^\d]/g, '');
  if (!d || d.length > 6) return null;
  const n = parseInt(d, 10);
  return Number.isFinite(n) && n <= 100000 ? n : null;
}
function invTabCount(lines, labels) {
  for (const l of lines) {
    for (const lab of labels) {
      const m = l.match(new RegExp('^' + invEsc(lab) + '\\s*\\(\\s*' + INV_NUM + '\\s*\\)$', 'i'));
      if (m) { const n = invCount(m[1]); if (n != null) return n; }
    }
  }
  return null;
}
function invAge(n, unit) {
  const u = String(unit).toLowerCase();
  if (/^(second|seconde|sekunde|minute|hour|heure|stunde)/.test(u)) return 0;
  if (/^(day|jour|tag)/.test(u)) return n;
  if (/^(week|semaine|woche)/.test(u)) return n * 7;
  if (/^(month|mois|monat)/.test(u)) return n * 30;
  if (/^(year|an|jahr)/.test(u)) return n * 365;
  return null;
}
// Age in days of one "sent" stamp line, or null when the line is not a stamp. EN / FR / DE.
function invStampAge(line) {
  const l = String(line).trim();
  if (!l || l.length > 60) return null;
  let m;
  if ((m = l.match(/^(?:Sent|Envoy[ée]e?s?|Gesendet:?)\s+(today|yesterday|aujourd[’']hui|hier|heute|gestern)$/i)))
    return /yesterday|hier|gestern/i.test(m[1]) ? 1 : 0;
  if ((m = l.match(/^(heute|gestern)\s+gesendet$/i))) return /gestern/i.test(m[1]) ? 1 : 0;
  if ((m = l.match(/^Sent\s+(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i))) return invAge(+m[1], m[2]);
  if ((m = l.match(/^Envoy[ée]e?s?\s+il\s+y\s+a\s+(\d+)\s+(seconde|minute|heure|jour|semaine|mois|an)s?$/i))) return invAge(+m[1], m[2]);
  if (/gesendet/i.test(l) && (m = l.match(/^(?:Gesendet:?\s+)?vor\s+(\d+)\s+(Sekunde|Minute|Stunde|Tag|Woche|Monat|Jahr)\w*(?:\s+gesendet)?$/i)))
    return invAge(+m[1], m[2]);
  return null;
}
function invitationsFromSample(sample) {
  const lines = String(sample || '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const people = invTabCount(lines, INV_PEOPLE_TABS);
  if (people == null) return null;                 // not recognisably the sent-invitations page: read nothing
  const out = { invitations: people };
  const pages = invTabCount(lines, INV_PAGES_TABS);
  if (pages != null) out.invitations_pages = pages;
  // A Pages tab printed with no "(n)" is LinkedIn's way of saying zero; no tab at all stays unknown.
  else if (lines.some(l => INV_PAGES_TABS.some(t => l.toLowerCase() === t.toLowerCase()))) out.invitations_pages = 0;
  // Rows are newest first. The 24h count is only trusted when the text runs past the 24h window —
  // otherwise the sample may have been cut off inside it and the count would be too low.
  const ages = lines.map(invStampAge).filter(a => a != null);
  if (ages.length && Math.max.apply(null, ages) > 1) out.invitations_sent_24h = ages.filter(a => a <= 1).length;
  return out;
}

// Fill ONLY the invitation fields the stored row is missing. Returns the fields it filled.
async function backfillInvitations(env, email, date, receipt, opts) {
  if (!receipt || !receipt.sample) return null;
  const got = invitationsFromSample(receipt.sample);
  if (!got) return null;
  const key = `stats:${email}:${date}`;
  const row = await env.KV.get(key, 'json');
  if (!row && opts && opts.existingOnly) return null;
  const merged = Object.assign({}, row || {}, { captured_at: (row && row.captured_at) || date });
  const filled = [];
  for (const k of Object.keys(got)) {
    if (merged[k] == null || merged[k] === '') { merged[k] = got[k]; filled.push(k); }
  }
  if (filled.length) await env.KV.put(key, JSON.stringify(merged));
  return { filled, values: got };
}

// One-off and repeatable: run the server-side reader over every stored receipt (60-day TTL).
async function adminBackfillInvitations(req, env) {
  try {
    await requireAdmin(req, env);
    const keys = await listAll(env.KV, 'collect:');
    const done = [];
    let scanned = 0;
    for (const k of keys) {
      const rec = await env.KV.get(k.name, 'json');
      const rc = rec && rec.pages && rec.pages.invitations;
      if (!rc || !rc.sample) continue;
      scanned++;
      const parts = k.name.split(':');
      const date = parts.pop();
      const email = parts.slice(1).join(':');
      const bf = await backfillInvitations(env, email, date, rc, {});
      if (bf && bf.filled.length) done.push({ email, date, filled: bf.filled, values: bf.values });
    }
    return json({ ok: true, receipts_with_sample: scanned, rows_filled: done.length, filled: done });
  } catch (e) { return err(e.code || 'forbidden', e.message, e.status || 403); }
}

