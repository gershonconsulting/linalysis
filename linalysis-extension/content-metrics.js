// Linalysis content script for LinkedIn "growth" metrics — v0.2.8
// Runs on: /mynetwork/*  (Connections + Sent invitations), /analytics/*  and /me/profile-views*
//          (Profile views + Search/Profile appearances).
//
// Mirrors content-ssi.js: waits for the page to settle, scrapes the fields relevant to the current
// URL, and sends { type:'linalysis-metrics-result', page, data } to the background worker, which
// POSTs to /api/ingest/linkedin. Also responds to an explicit { type:'linalysis-scrape-metrics' }
// request so the background worker can pull on demand during the daily sync.
//
// MULTILINGUAL by requirement (users are EN / DE / FR — see linalysis_ssi_multilingual memory):
// every label is matched across EN/DE/FR (+ ES/IT/PT/NL where cheap), and every number is parsed
// with parseCount()/parseNum() so thousands separators (29,629 / 29.629 / 29 629) and comma
// decimals (44,3 %) all normalise correctly.

(function () {
  const READY_DELAY_MS = 5000;

  // Cache the company ID whenever the admin is on any /company/{id}/admin/* page, so the daily
  // sync can build the analytics URLs without hardcoding it (works for any admin user).
  try {
    const cm = location.pathname.match(/\/company\/(\d+)\/admin/);
    if (cm && chrome && chrome.storage) chrome.storage.local.set({ linalysis_company_id: cm[1] });
  } catch (e) {}

  setTimeout(scrapeAndSend, READY_DELAY_MS);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'linalysis-scrape-metrics') {
      scrapeAndSend().then(sendResponse);
      return true; // async
    }
    return false;
  });

  function currentPage() {
    const p = location.pathname;
    if (/^\/company\/\d+\/admin\/analytics\/followers/.test(p))          return 'co_followers';
    if (/^\/company\/\d+\/admin\/analytics\/visitors/.test(p))           return 'co_visitors';
    if (/^\/company\/\d+\/admin\/analytics\/updates/.test(p))            return 'co_updates';
    if (/^\/company\/\d+\/admin\/analytics\/search-appearances/.test(p)) return 'co_search';
    if (p.includes('invitation-manager')) return 'invitations';
    if (p.startsWith('/mynetwork'))        return 'connections';
    if (p.includes('search-appearances'))  return 'appearances';
    if (p.includes('profile-views'))       return 'profile_views';
    if (p.includes('/premium/'))           return 'premium';
    return null;
  }

  async function scrapeAndSend() {
    const page = currentPage();
    if (!page) return { ok: false, error: 'unrecognized_page', path: location.pathname };
    try {
      let data = null;
      // Up to 3 attempts, 5s apart — break as soon as we captured the page's primary number.
      for (let attempt = 1; attempt <= 3; attempt++) {
        data = await scrapeForPage(page, attempt);
        if (hasPrimary(page, data)) break;
        if (attempt < 3) await sleep(5000);
      }
      // FAILURE SAMPLE. When the primary field did not resolve, ship a slice of the page's own main
      // content so the next fix can be made from the daily report instead of needing a live browser
      // session on the affected user's machine. Only on failure, and only the metric region — this
      // is diagnostic text, never stored as data.
      if (!hasPrimary(page, data)) {
        if (!data) data = {};
        data._diag = Object.assign(data._diag || {}, { sample: pageSample() });
      }
      // Fold any bounds rejections into the diagnostic. A value the scraper FOUND and threw away is
      // a different bug from one it never found, and the daily report has to be able to tell them
      // apart — otherwise a wrong selector looks identical to a missing page.
      if (data && data._rejected) {
        data._diag = Object.assign(data._diag || {}, { rejected: data._rejected });
        delete data._rejected;
      }
      const r = await chrome.runtime.sendMessage({ type: 'linalysis-metrics-result', page, data });
      return { ok: true, page, data, response: r };
    } catch (e) {
      return { ok: false, page, error: String(e.message || e) };
    }
  }

  // Did we get the field that makes this page worth posting?
  function hasPrimary(page, d) {
    if (!d) return false;
    if (page === 'connections')   return d['Connections'] != null;
    if (page === 'invitations')   return d['Invitations'] != null;
    if (page === 'profile_views') return d['Views'] != null;
    if (page === 'appearances')   return d['All Appearances'] != null || d['Search Appearances'] != null;
    if (page === 'premium')       return d['InMail Credits'] != null;
    if (page === 'co_followers')  return d['Company Followers'] != null;
    if (page === 'co_visitors')   return d['Company Unique Visitors'] != null;
    if (page === 'co_updates')    return d['Company Post Impressions'] != null;
    if (page === 'co_search')     return d['Company Search Appearances'] != null;
    return false;
  }

  async function scrapeForPage(page, attempt) {
    if (page === 'connections')   return scrapeConnections(attempt);
    if (page === 'invitations')   return await scrapeInvitations(attempt);
    if (page === 'profile_views') return scrapeProfileViews(attempt);
    if (page === 'appearances')   return scrapeAppearances(attempt);
    if (page === 'premium')       return await scrapePremium(attempt);
    if (page === 'co_followers')  return scrapeCoFollowers(attempt);
    if (page === 'co_visitors')   return scrapeCoVisitors(attempt);
    if (page === 'co_updates')    return scrapeCoUpdates(attempt);
    if (page === 'co_search')     return scrapeCoSearch(attempt);
    return {};
  }

  // ── 1) CONNECTIONS  (/mynetwork/ → /mynetwork/grow/) ────────────────
  // Primary: the "Connections" entry in the "Manage my network" rail links to the connections list;
  // its text carries the count. This is language-independent (matches on the href). Fallback: match a
  // localized "Connections" label followed/preceded by a number in the page text.
  function scrapeConnections(attempt) {
    const out = {};
    let n = null;
    try {
      const a = document.querySelector(
        'a[href*="/mynetwork/invite-connect/connections"], a[href^="/mynetwork/invite-connect/connections"]'
      );
      if (a) n = firstCountIn(a.innerText || a.textContent || '');
    } catch (e) {}
    if (n == null) {
      const text = document.body ? document.body.innerText : '';
      n = metric(['Connections', 'Verbindungen', 'Kontakte', 'Relations', 'Contatti', 'Contactos', 'Conexões', 'Connecties'], text);
    }
    put(out, 'Connections', n);
    out['_diag'] = baseDiag('connections', attempt);
    return out;
  }

  // ── 2) SENT INVITATIONS  (/mynetwork/invitation-manager/sent/) ──────
  // Captures: pending backlog (People + Pages pills) AND — the important one for weekly-credit ROI —
  // how many invitations were sent in the last 24h / 7d, read from each row's "Sent X ago" stamp.
  // The pending total is NOT weekly usage; LinkedIn's ~100/week limit is a rolling send count, so the
  // dashboard sums the daily "Invitations Sent 24h" across 7 days to get true credit utilisation.
  async function scrapeInvitations(attempt) {
    const out = {};
    const txt0 = document.body ? document.body.innerText : '';
    const people = parenCount(txt0, ['People', 'Personen', 'Personnes', 'Personas', 'Persone', 'Pessoas', 'Personen']);
    const pages  = parenCount(txt0, ['Pages', 'Seiten', 'Páginas', 'Pagine', "Pagina's"]);
    if (people != null) out['Invitations'] = people;             // pending backlog (people)
    if (pages  != null) out['Invitations Pages'] = pages;        // pending backlog (pages)

    // Load a bit more of the list so a full day's sends are in the DOM, then bucket by age.
    await loadMoreSentList();
    const buckets = countSentByAge();
    if (buckets) {
      out['Invitations Sent 24h'] = buckets.d1;
      out['Invitations Sent 7d']  = buckets.d7;   // best-effort — only accurate if the week fit on screen
      out['_sent_rows_seen']      = buckets.rows;
      out['_sent_oldest_days']    = buckets.maxAge;
    }
    out['_diag'] = Object.assign(baseDiag('invitations', attempt), {
      pending_people: people, pending_pages: pages,
      sent_rows_seen: buckets ? buckets.rows : 0,
      sent_oldest_days: buckets ? buckets.maxAge : null,
      full_week_loaded: buckets ? (buckets.maxAge != null && buckets.maxAge >= 7) : false,
    });
    return out;
  }

  // Scroll the invitation list a bounded number of times to pull in more rows. In a real signed-in
  // browser this triggers LinkedIn's lazy-load; we stop early once a row older than 8 days appears
  // (we've covered the whole rolling week) or the row count stops growing.
  async function loadMoreSentList() {
    const scroller = document.querySelector('main') || document.scrollingElement || document.body;
    let last = -1, stable = 0;
    for (let i = 0; i < 25; i++) {
      try {
        const btn = [...document.querySelectorAll('button')]
          .find(b => /show more|see more|mehr anzeigen|mehr ergebnisse|voir plus|plus de résultats/i.test(b.textContent || ''));
        if (btn) btn.click();
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
        window.scrollTo(0, document.body.scrollHeight);
      } catch (e) {}
      await sleep(800);
      const b = countSentByAge();
      const rows = b ? b.rows : 0;
      if (b && b.maxAge != null && b.maxAge > 8) break; // whole week is loaded
      if (rows === last) { stable++; if (stable >= 4) break; } else stable = 0;
      last = rows;
    }
  }

  // Count sent-invitation rows by age from their "Sent X <unit> ago" stamps (EN/DE/FR). Dedupes by
  // "<name>|<stamp>" so nested DOM nodes don't double-count.
  function countSentByAge() {
    const re = /(?:Sent|Gesendet|Envoy[ée])\s*(?:vor\s*)?(?:il y a\s*)?(\d+)\s*(second|Sekunde|seconde|minute|Minute|hour|Stunde|heure|day|Tag|jour|week|Woche|semaine|month|Monat|mois)s?\s*(?:ago|zuvor)?/i;
    const seen = new Map();
    const nodes = document.querySelectorAll('li, div');
    for (const el of nodes) {
      const t = el.innerText || '';
      if (t.length > 320) continue;
      const m = t.match(re);
      if (!m) continue;
      const name = (t.split('\n')[0] || '').slice(0, 60).trim();
      const key = name + '|' + m[0];
      if (!seen.has(key)) seen.set(key, ageInDays(Number(m[1]), m[2]));
    }
    if (seen.size === 0) return null;
    let d1 = 0, d7 = 0, maxAge = 0;
    for (const d of seen.values()) {
      if (d <= 1) d1++;
      if (d <= 7) d7++;
      if (d > maxAge) maxAge = d;
    }
    return { rows: seen.size, d1, d7, maxAge };
  }

  function ageInDays(n, unit) {
    unit = String(unit).toLowerCase();
    if (/second|sekunde|seconde|minute|hour|stunde|heure/.test(unit)) return 0;
    if (/day|tag|jour/.test(unit))     return n;
    if (/week|woche|semaine/.test(unit)) return n * 7;
    if (/month|monat|mois/.test(unit)) return n * 30;
    return 999;
  }

  // ── 3) PROFILE VIEWS  (/analytics/profile-views/ → /me/profile-views) ─
  // Layout: big number ABOVE the "Profile viewers" label, plus a "▲ 22% vs prior …" delta.
  function scrapeProfileViews(attempt) {
    const out = {};
    const text = document.body ? document.body.innerText : '';
    const labels = ['profile viewers', 'profile views', 'Profilbesucher', 'Profil-Anzeigen', 'Profilaufrufe',
                    'vues du profil', 'visites du profil', 'visualizzazioni del profilo', 'vistas de perfil'];
    put(out, 'Views', metric(labels, text));
    const chg = changeNear(text, labels);
    if (chg != null) out['Profile Views Change'] = chg;   // e.g. "+22%" / "-8%"
    out['_diag'] = baseDiag('profile_views', attempt);
    return out;
  }

  // ── 4) SEARCH / PROFILE APPEARANCES  (/analytics/search-appearances/) ─
  // Two headline numbers ("All appearances" + "Search appearances"), the "Where you appeared"
  // breakdown, and the week range LinkedIn reports for.
  function scrapeAppearances(attempt) {
    const out = {};
    const text = document.body ? document.body.innerText : '';
    put(out, 'All Appearances',    metric(['all appearances', 'alle Anzeigen', 'alle Erscheinungen', 'toutes les apparitions', 'todas las apariciones', 'tutte le comparse'], text));
    put(out, 'Search Appearances', metric(['search appearances', 'Suchanzeigen', 'Sucherscheinungen', "apparitions dans les recherches", 'apariciones en búsquedas', 'comparse nelle ricerche'], text));

    // "Where you appeared" breakdown — capture label/percent pairs (Search 44.3%, Posts 34.5%, …).
    try {
      const sources = [];
      const re = /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .]{2,34}?)\s*[·:\-–]\s*(\d{1,3}(?:[.,]\d)?)\s*%/g;
      let m, guard = 0;
      while ((m = re.exec(text)) && guard++ < 12) {
        const label = m[1].trim();
        const pct = parseNum(m[2]);
        if (!isNaN(pct) && pct >= 0 && pct <= 100 && label.length >= 3) sources.push({ label, pct });
      }
      if (sources.length) out['Appearance Sources'] = sources.slice(0, 6);
    } catch (e) {}

    // Week range LinkedIn reports for (e.g. "July 14 – July 20"). Best-effort, EN/DE/FR month names.
    try {
      const wk = text.match(/([A-Za-zÀ-ÿ]{3,12}\.?\s*\d{1,2})\s*[–—-]\s*((?:[A-Za-zÀ-ÿ]{3,12}\.?\s*)?\d{1,2})/);
      if (wk) out['Appearances Week'] = (wk[1] + ' – ' + wk[2]).replace(/\s+/g, ' ').trim();
    } catch (e) {}

    out['_diag'] = baseDiag('appearances', attempt);
    return out;
  }

  // ── 5) INMAIL / PREMIUM CREDITS  (/premium/sb/explore/) ─────────────
  // LinkedIn only exposes the CURRENT balance: the InMail card shows "Credits available: N".
  // We scrape that real number (plus the plan name + renewal date from the Plan Details panel).
  // The card is collapsed by default, so if the number isn't already in the DOM we expand it first.
  async function scrapePremium(attempt) {
    const out = {};
    let credits = findInMailCredits();
    if (credits == null) { expandInMailCard(); await sleep(1800); credits = findInMailCredits(); }
    if (credits == null) { expandInMailCard(); await sleep(1800); credits = findInMailCredits(); }
    if (credits != null) out['InMail Credits'] = credits;

    const text = (document.body ? document.body.innerText : '') + '\n' + (document.body ? document.body.textContent : '');
    const plan = findPlan(text);
    if (plan) out['Premium Plan'] = plan;
    const ren = text.match(/Renews?\s+on\s+([A-Za-zÀ-ÿ]+\.?\s+\d{1,2},?\s+\d{4})/i);
    if (ren) out['Premium Renews'] = ren[1].replace(/\s+/g, ' ').trim();

    out['_diag'] = Object.assign(baseDiag('premium', attempt), { credits_found: credits, plan: plan || null });
    return out;
  }

  // Search the whole DOM (textContent catches collapsed/hidden accordion content that innerText skips).
  function findInMailCredits() {
    const scan = function (str) {
      if (!str) return null;
      const m = str.match(/Credits?\s*available\s*[:\-–]?\s*(\d[\d.,  ']*)/i);
      return m ? parseCount(m[1]) : null;
    };
    const a = scan(document.body ? document.body.textContent : '');
    if (a != null) return a;
    return scan(document.body ? document.body.innerText : '');
  }

  // Click the InMail card header to expand it (only needed if the balance isn't already in the DOM).
  function expandInMailCard() {
    try {
      const els = document.querySelectorAll('button, [role="button"], [aria-expanded]');
      for (const el of els) {
        const t = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim();
        if (/^InMail\b/i.test(t) && t.length < 60) { el.click(); return true; }
      }
    } catch (e) {}
    return false;
  }

  // Plan name from the Plan Details panel — match a known plan, else the line after "Plan Details".
  function findPlan(text) {
    const known = ['Sales Navigator Advanced Plus', 'Sales Navigator Advanced', 'Sales Navigator Core',
                   'Recruiter Lite', 'Recruiter Professional', 'Recruiter',
                   'Premium Career', 'Premium Business', 'Career', 'Business'];
    for (const k of known) { if (new RegExp(escapeRe(k), 'i').test(text)) return k; }
    const m = text.match(/Plan Details\s*\n?\s*([A-Za-z][A-Za-z .]{3,40})/i);
    return m ? m[1].trim() : null;
  }

  // ── 6) COMPANY ADMIN ANALYTICS  (/company/{id}/admin/analytics/*) ───
  // Real numbers pulled from the page-admin analytics tabs (admin-only). All are "number before
  // label" on LinkedIn, so countBeforeLabel handles them. Labels matched EN/DE/FR.
  function scrapeCoFollowers(attempt) {
    const out = {};
    const text = document.body ? document.body.innerText : '';
    put(out, 'Company Followers',     metric(['Total followers', 'Follower insgesamt', 'Abonnenten insgesamt', "Nombre total d'abonnés", "Total d'abonnés"], text));
    put(out, 'Company New Followers', metric(['New followers', 'Neue Follower', 'Neue Abonnenten', 'Nouveaux abonnés'], text));
    out['_diag'] = baseDiag('co_followers', attempt);
    return out;
  }
  function scrapeCoVisitors(attempt) {
    const out = {};
    const text = document.body ? document.body.innerText : '';
    put(out, 'Company Unique Visitors', metric(['Unique visitors', 'Eindeutige Besucher', 'Einzelne Besucher', 'Visiteurs uniques'], text));
    put(out, 'Company Custom Clicks',   metric(['Custom button clicks', 'Klicks auf', 'Clics sur le bouton'], text));
    out['_diag'] = baseDiag('co_visitors', attempt);
    return out;
  }
  function scrapeCoUpdates(attempt) {
    const out = {};
    const text = document.body ? document.body.innerText : '';
    // "Impressions" is a generic word that also appears in LinkedIn's boost/advertise cards, whose
    // round audience estimate is what the v0.2.7 text-walk kept returning (190,000 for a page doing
    // ~500/day). Prefer the fully-qualified tile label, fall back to the bare word, and let the
    // DOM reader's promo/chart exclusion do the rest.
    put(out, 'Company Post Impressions', metric([
      'Impressions (organic)', 'Total impressions', 'Post impressions', 'Update impressions',
      'Impressionen insgesamt', 'Beitragsimpressionen', "Impressions totales", 'Impressions des posts',
      'Impressions', 'Impressionen',
    ], text));
    out['_diag'] = baseDiag('co_updates', attempt);
    return out;
  }
  function scrapeCoSearch(attempt) {
    const out = {};
    const text = document.body ? document.body.innerText : '';
    put(out, 'Company Search Appearances', metric(['Page searches', 'Seitensuchen', 'Recherches de page', 'Search appearances', 'Sucherscheinungen'], text));
    out['_diag'] = baseDiag('co_search', attempt);
    return out;
  }

  // ── Shared helpers ──────────────────────────────────────────────────
  function baseDiag(page, attempt) {
    const text = document.body ? document.body.innerText : '';
    return {
      page, attempt: attempt || 1, url: location.href,
      title: (document.title || '').slice(0, 120),
      text_len: text.length,
      lang: (document.documentElement.getAttribute('lang') || navigator.language || '').slice(0, 5).toLowerCase() || null,
      has_signin: /sign in|log in|anmelden|se connecter/i.test(text.slice(0, 500)),
      first_300: text.slice(0, 300),
    };
  }

  // A bounded slice of the page's METRIC region (not the nav chrome the old first_300 always caught).
  // Prefers <main>, drops the global nav/footer, collapses blank runs, caps at 2500 chars.
  function pageSample() {
    try {
      const root = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
      let t = (root && root.innerText) || '';
      t = t.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
      // Strip the LinkedIn global bar if it leaked in.
      t = t.replace(/^(?:Skip to (?:main|search).*|Home|My Network|Mein Netzwerk|Jobs|Messaging|Nachrichten|Notifications|Mitteilungen)\n/gim, '');
      return t.slice(0, 2500);
    } catch (e) { return null; }
  }

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }


  // Parse an integer count, stripping thousands separators (',', '.', ' ', nbsp, "'"): "29,629"→29629,
  // "29.629"→29629, "29 629"→29629. For counts every separator is a grouping separator, so we drop them all.
  function parseCount(s) {
    if (s == null) return null;
    const digits = String(s).replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = parseInt(digits, 10);
    return Number.isNaN(n) ? null : n;
  }

  // Parse a decimal that may use a comma decimal separator: "44,3"→44.3, "44.3"→44.3.
  function parseNum(s) {
    if (s == null) return NaN;
    s = String(s).trim();
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.indexOf(',') > -1) {
      s = s.replace(',', '.');
    }
    return parseFloat(s);
  }

  // First count found inside a short string (e.g. an anchor's text).
  function firstCountIn(s) {
    const m = String(s).match(/(\d[\d.,  ']*)/);
    return m ? parseCount(m[1]) : null;
  }

  // ── Metric lookup ───────────────────────────────────────────────────
  // Two readers, tried in order, with a plausibility gate in front of both.
  //
  //   1. tileValue()      — DOM-anchored. LinkedIn renders every analytics metric as a CARD: a
  //                         label element and a number element sharing a small common ancestor.
  //                         Walking up from the label makes "next to" mean STRUCTURALLY next to,
  //                         which is what the layout actually guarantees.
  //   2. countNearLabel() — a STRICT line fallback, for text with no usable element structure.
  //
  // v0.2.8 — why this replaces the v0.2.7 line-walk. That version flattened the page to innerText,
  // let a PAGE-GLOBAL orientation vote decide which side of a label the number sat on, and let the
  // scan step over two intervening lines. On a page carrying a chart, a date axis or an upsell
  // card, "two lines away" is a different metric entirely. It produced silent misses AND — far
  // worse — confident wrong values: 1,687 company followers read as 5,916, and 569 post
  // impressions read as 190,000, both written to history as if measured.

  // Absolute sanity band per field. Outside it, the number is a scraping artefact, not a
  // measurement, and must never be posted. Deliberately wide — the server-side delta guard is what
  // catches the subtler wrong-tile grabs; this only stops the absurd.
  const BOUNDS = {
    'Connections':                [0, 40000],    // LinkedIn hard-caps connections at 30,000
    'Views':                      [0, 500000],
    'All Appearances':            [0, 500000],
    'Search Appearances':         [0, 500000],
    'Invitations':                [0, 100000],
    'Invitations Pages':          [0, 100000],
    'Invitations Sent 24h':       [0, 1000],
    'InMail Credits':             [0, 10000],
    'Company Followers':          [0, 50000000],
    'Company New Followers':      [0, 1000000],
    'Company Unique Visitors':    [0, 10000000],
    'Company Post Impressions':   [0, 100000000],
    'Company Search Appearances': [0, 10000000],
    'Company Custom Clicks':      [0, 10000000],
  };

  function withinBounds(field, n) {
    if (n == null || !Number.isFinite(n)) return false;
    const b = BOUNDS[field];
    if (!b) return true;
    return n >= b[0] && n <= b[1];
  }

  // Assign a value only if it survives the bounds check. Every rejection is recorded on the row's
  // _diag so the daily report shows a REJECTED value rather than a silent gap — a wrong number the
  // scraper caught itself is a different bug from a number it never found.
  function put(out, field, n) {
    if (n == null) return false;
    if (!withinBounds(field, n)) {
      out._rejected = out._rejected || {};
      out._rejected[field] = n;
      return false;
    }
    out[field] = n;
    return true;
  }

  // ── DOM-anchored tile read ──────────────────────────────────────────

  // Containers whose numbers are never a metric: charts and their axes, and anything promotional.
  // The 190,000 that landed in company post impressions is exactly this class — a round audience
  // estimate sitting in an upsell card that the flattened text-walk could not tell apart from the
  // real tile.
  const CHART_SEL = 'svg,canvas,figure,[role="img"],[role="presentation"],[class*="chart" i],[class*="graph" i],[class*="axis" i],[class*="legend" i],[class*="sparkline" i]';
  // Suffix-tolerant on purpose: the string that poisoned company post impressions for three days
  // was "Get up to 190,000 more impressions by boosting this post." — \\bboost\\b does not match
  // "boosting", and the old same-line rule read the 190,000 as the metric.
  const PROMO_RE = /(boost|sponsor|advertis|promot|upgrade|get up to|reach up to|estimated audience|ad account|werb|bewerb|gesponsert|sponsoris|publicit|promouvoir)/i;

  function isExcluded(el) {
    for (let n = el, hops = 0; n && n.nodeType === 1 && hops < 12; n = n.parentElement, hops++) {
      try {
        if (n.matches && n.matches(CHART_SEL)) return true;
        if (n.getAttribute && /^(true)$/i.test(n.getAttribute('aria-hidden') || '')) return true;
      } catch (e) {}
    }
    return false;
  }

  function isPromo(el) {
    for (let n = el, hops = 0; n && n.nodeType === 1 && hops < 6; n = n.parentElement, hops++) {
      const t = (n.innerText || '').slice(0, 400);
      if (t && PROMO_RE.test(t)) return true;
    }
    return false;
  }

  // The element's OWN text — what it shows minus what its element children show. This is how a
  // label element is told apart from the card that contains it.
  function ownText(el) {
    let s = '';
    for (const n of el.childNodes) if (n.nodeType === 3) s += n.nodeValue;
    return s.replace(/\s+/g, ' ').trim();
  }

  // Elements whose OWN text carries `label`, in document order.
  //
  // Callers list labels in priority order and every label is exhausted before the next is tried.
  // That ordering matters: on the company search-appearances page the left-hand nav tab reads
  // "Search appearances" and appears in the document BEFORE the actual metric, whose label is
  // "Page searches". Scanning document-first would hand the nav tab to the reader before the real
  // tile was ever considered.
  function labelNodes(label) {
    const hits = [];
    let all;
    try { all = document.querySelectorAll('main *, [role="main"] *'); } catch (e) { all = []; }
    if (!all.length) { try { all = document.body.querySelectorAll('*'); } catch (e) { all = []; } }
    const needle = label.toLowerCase();
    for (const el of all) {
      const t = ownText(el);
      if (!t || t.length > 80) continue;
      if (t.toLowerCase().indexOf(needle) < 0) continue;
      if (isExcluded(el)) continue;
      hits.push({ el, label, text: t });
    }
    return hits;
  }

  // Every number rendered inside `root`, excluding anything inside `skip`, charts, and promos.
  function numbersIn(root, skip) {
    const out = [];
    const seen = new Set();
    let els;
    try { els = root.querySelectorAll('*'); } catch (e) { return out; }
    const scan = el => {
      if (skip && (el === skip || skip.contains(el))) return;
      const t = ownText(el);
      if (!t) return;
      const n = bareNumber(t);
      if (n == null) return;
      if (isExcluded(el) || isPromo(el)) return;
      if (seen.has(el)) return;
      seen.add(el);
      out.push(n);
    };
    scan(root);
    for (const el of els) scan(el);
    return out;
  }

  // Read a metric by walking UP from its label until exactly one number comes into scope. Stopping
  // at the FIRST ancestor that yields exactly one number is the whole trick: that ancestor is the
  // metric's own card. Widen further and the neighbouring tile joins in, which is precisely how the
  // old reader picked up the wrong number.
  function tileValue(labels) {
    for (const label of labels) {
      for (const c of labelNodes(label)) {
        if (isPromo(c.el)) continue;

        // 1) The number sits in the label element's own text: "Unique visitors: 892", "892 views".
        const inline = adjacentNumber(c.text, c.label);
        if (inline != null) return inline;

        // 2) Walk up. At most 4 hops — beyond that we are in page scaffolding, not a card.
        for (let n = c.el.parentElement, hops = 0; n && hops < 4; n = n.parentElement, hops++) {
          if ((n.innerText || '').length > 600) break;   // too big to still be one tile
          const nums = numbersIn(n, c.el);
          if (nums.length === 1) return nums[0];
          if (nums.length > 1) break;                    // ambiguous — never guess
        }
      }
    }
    return null;
  }

  // ── Strict text fallback ────────────────────────────────────────────

  function splitLines(text) {
    return String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
  }

  // Is this line JUST a number (optionally followed by a delta like "▲ 22%")?
  //
  // v0.2.8: the remainder must be EMPTY. v0.2.7 allowed up to 3 leftover letters, which quietly
  // accepted every chart date-axis tick — "24 Aug" parsed as 24, "1 mo" as 1. Those fake numbers
  // then voted in the orientation heuristic and were themselves returned as metric values. Any
  // residual letter now disqualifies the line.
  function bareNumber(line) {
    const L = String(line).trim();
    const m = /^(\d[\d.,   ']*)/.exec(L);
    if (!m) return null;
    let rest = L.slice(m[0].length);
    // A STANDALONE percentage is a change indicator, never a metric value. LinkedIn renders the
    // profile-views tile as four sibling elements — "1,156", "Profile viewers", "104%", "vs. prior
    // 7 days" — and v0.2.7 read "104%" as the number 104. That gave the label a bare number on
    // BOTH sides, so the tile looked ambiguous and the reader returned null. It is why profile
    // views stopped being collected on 2026-08-24.
    if (/^\s*%/.test(rest)) return null;
    rest = rest
      .replace(/[▲▼↑↓+\-]?\s*\d{1,3}([.,]\d+)?\s*%/g, '')   // a delta that FOLLOWS the value: "1,156 ▲ 4%"
      .replace(/[^A-Za-zÀ-ÿ]/g, '');  // punctuation, arrows, spaces
    if (rest.length > 0) return null;
    return parseCount(m[1]);
  }

  // A number immediately beside the label INSIDE one line: "Unique visitors: 892", "892 views",
  // "Connections (711)". At most 8 non-digit characters may separate them, so prose such as
  // "Search appearances in the last 7 days" cannot yield 7.
  function adjacentNumber(line, label) {
    const at = line.toLowerCase().indexOf(label.toLowerCase());
    if (at < 0) return null;
    const after  = line.slice(at + label.length);
    const before = line.slice(0, at);
    let m = /^[^\d]{0,8}(\d[\d.,   ']*)/.exec(after);
    if (!m) m = /(\d[\d.,   ']*)[^\d]{0,8}$/.exec(before);
    return m ? parseCount(m[1]) : null;
  }

  // Text fallback, used only when the DOM read found nothing. Deliberately strict: same line, or an
  // IMMEDIATELY adjacent bare-number line with nothing in between, and only when exactly one side
  // qualifies. No page-global orientation vote, no stepping over intervening lines — both were
  // v0.2.7 mechanisms for reaching a neighbouring metric's number and reporting it as this one's.
  function countNearLabel(text, labels) {
    const lines = splitLines(text);
    const nums  = lines.map(bareNumber);
    for (const label of labels) {
      const re = new RegExp(escapeRe(label), 'i');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].search(re) < 0) continue;
        const inline = adjacentNumber(lines[i], label);
        if (inline != null) return inline;
        const b = i + 1 < lines.length ? nums[i + 1] : null;
        const a = i > 0 ? nums[i - 1] : null;
        if (b != null && a == null) return b;
        if (a != null && b == null) return a;
        // both or neither → genuinely ambiguous. Leave it null; the receipt reports it missing.
      }
    }
    return null;
  }

  // The reader every scraper calls: DOM first, strict text second.
  function metric(labels, text) {
    const v = tileValue(labels);
    if (v != null) return v;
    return countNearLabel(text == null ? (document.body ? document.body.innerText : '') : text, labels);
  }

  // Kept as named aliases so existing call sites read the same.
  function countBeforeLabel(text, labels) { return metric(labels, text); }

  // A signed percentage change near a label, e.g. "▲ 22% vs prior 7 days" → "+22%", "▼ 8%" → "-8%".
  function changeNear(text, labels) {
    for (const label of labels) {
      const kw = escapeRe(label);
      // Search a window after the label for an up/down marker + percent.
      const m = text.match(new RegExp(kw + "[\\s\\S]{0,80}?([▲▼↑↓+\\-]|up|down|increase|decrease|hausse|baisse|mehr|weniger)?\\s*(\\d{1,3})\\s*%", 'i'));
      if (m) {
        const dir = (m[1] || '').toLowerCase();
        const down = /[▼↓-]|down|decrease|baisse|weniger/.test(dir);
        return (down ? '-' : '+') + m[2] + '%';
      }
    }
    return null;
  }

  // "(711)" next to a People/Pages tab label → 711.
  function parenCount(text, labels) {
    for (const label of labels) {
      const kw = escapeRe(label);
      const m = text.match(new RegExp(kw + "\\s*\\((\\d[\\d.,\\u00a0 ']*)\\)", 'i'));
      if (m) { const n = parseCount(m[1]); if (n != null) return n; }
    }
    return null;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
})();
