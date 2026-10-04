// Linalysis content script for LinkedIn "growth" metrics — v0.3.2
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

  // ── Language ─────────────────────────────────────────────────────
  //
  // ONE extension, every language. LinkedIn translates the labels this collector reads, so the
  // labels come from a pack served by Linalysis and keyed by the language THIS page rendered in.
  // The arrays below stay in the code as a floor: if the pack cannot be fetched, collection
  // behaves exactly as it does today rather than stopping.
  //
  // The pack carries literal strings only — they are escaped before they go near a RegExp, and
  // nothing from the server is ever compiled as a pattern.
  let PACK = null;

  async function ensurePack() {
    if (PACK) return PACK;
    try {
      const r = await chrome.runtime.sendMessage({ type: 'linalysis-get-labels' });
      if (r && r.ok && r.pack && r.pack.langs) PACK = r.pack;
    } catch (e) {}
    if (!PACK) PACK = { version: 'builtin', common: {}, langs: {} };
    return PACK;
  }

  function pageLang() {
    const v = (document.documentElement.getAttribute('lang') || navigator.language || '').toLowerCase();
    const m = v.match(/^([a-z]{2})/);
    return m ? m[1] : null;
  }

  // Tell the background which language this machine's LinkedIn renders in, so the server can hold
  // it against the user and the daily report can say which dictionary an account needs.
  function reportLang() {
    try {
      const l = pageLang();
      if (l) chrome.runtime.sendMessage({ type: 'linalysis-lang', lang: l });
    } catch (e) {}
  }

  // Effective labels for a field: this page's language first (metric() tries them in order and
  // stops at the first that resolves, so the user's own language must be tried before English),
  // then any cross-language additions, then the built-ins. Deduped, order preserved.
  function labels(field, builtin) {
    const lang = pageLang();
    const pack = PACK || {};
    const fromLang   = (lang && pack.langs && pack.langs[lang] && pack.langs[lang][field]) || [];
    const fromCommon = (pack.common && pack.common[field]) || [];
    const out = [];
    for (const v of fromLang.concat(fromCommon, builtin || [])) {
      if (typeof v === 'string' && v.length >= 2 && out.indexOf(v) === -1) out.push(v);
    }
    return out;
  }


  // Cache the company ID whenever the admin is on any /company/{id}/admin/* page, so the daily
  // sync can build the analytics URLs without hardcoding it (works for any admin user).
  try {
    const cm = location.pathname.match(/\/company\/(\d+)\/admin/);
    if (cm && chrome && chrome.storage) {
      chrome.storage.local.set({ linalysis_company_id: cm[1] });
      // Cache the company's NAME too. The page-admin title carries it
      // ("Enzymicals AG: Administrator der Unternehmensseite"), and a disconnection alert that
      // names the client reads very differently from one that only has an email address. Take the
      // part before the first colon and only when it looks like a name, never a whole title.
      const raw = (document.title || '').split(/\s[–—:|]\s|:/)[0].trim();
      if (raw.length >= 2 && raw.length <= 120 && !/^\(\d+\)$/.test(raw)) {
        chrome.storage.local.set({ linalysis_company_name: raw.replace(/^\(\d+\)\s*/, '') });
      }
    }
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
    await ensurePack();
    reportLang();
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
      // v0.3.0: sample a PARTIAL capture too. A page returning 6 of 7 fields is a live selector
      // bug as much as one returning none, and those shipped no evidence at all — which is exactly
      // why the German account's missing industry rank and search appearances stayed unfixed.
      if (!hasPrimary(page, data) || missingExpected(page, data)) {
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

  // Every field a page is SUPPOSED to return. Used only to decide whether to attach a diagnostic
  // sample — never to fabricate a value.
  const EXPECTED = {
    connections:   ['Connections'],
    invitations:   ['Invitations', 'Invitations Pages', 'Invitations Sent 24h'],
    profile_views: ['Views'],
    appearances:   ['Search Appearances', 'All Appearances'],
    premium:       ['Premium Plan'],
    co_followers:  ['Company Followers', 'Company New Followers'],
    co_visitors:   ['Company Unique Visitors'],
    co_updates:    ['Company Post Impressions'],
    co_search:     ['Company Search Appearances'],
  };
  function missingExpected(page, d) {
    const want = EXPECTED[page];
    if (!want || !d) return false;
    return want.some(function (k) { return d[k] == null; });
  }

  // Did we get the field that makes this page worth posting?
  function hasPrimary(page, d) {
    if (!d) return false;
    if (page === 'connections')   return d['Connections'] != null;
    if (page === 'invitations')   return d['Invitations'] != null;
    if (page === 'profile_views') return d['Views'] != null;
    if (page === 'appearances')   return d['All Appearances'] != null || d['Search Appearances'] != null;
    if (page === 'premium')       return d['InMail Credits'] != null || d['Premium Plan'] != null;
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
    // The tab LABEL is translated; the tab's href is not. Reading the count out of the tab found by
    // href works in every locale — which the French account needs: its sent counts arrive every day
    // while its pending counts have never arrived once, and that asymmetry is a label problem, not
    // a page problem. Label match first (it works today for EN/DE), href second.
    const people = parenCount(txt0, labels('Invitations People Tab', ['People', 'Personen', 'Personnes', 'Personas', 'Persone', 'Pessoas']))
                ?? tabCountByHref(/invitation[-_]?manager\/sent\/(?:CONNECTION|PEOPLE)\b|invitationType=(?:CONNECTION|PEOPLE)/i);
    const pages  = parenCount(txt0, labels('Invitations Pages Tab', ['Pages', 'Seiten', 'Páginas', 'Pagine', "Pagina's"]))
                ?? tabCountByHref(/invitation[-_]?manager\/sent\/(?:ORGANIZATION|PAGE|COMPANY)\b|invitationType=(?:ORGANIZATION|PAGE|COMPANY)/i);
    if (people != null) out['Invitations'] = people;             // pending backlog (people)
    if (pages  != null) out['Invitations Pages'] = pages;        // pending backlog (pages)
    // ZERO IS A VALUE. LinkedIn renders the Pages tab with no "(n)" when no page invitations are
    // pending. Leaving the field null made the daily report call it a broken selector every single
    // day on an account that simply has none.
    else if (people != null && hasPagesTab(txt0)) out['Invitations Pages'] = 0;

    // Load a bit more of the list so a full day's sends are in the DOM, then bucket by age.
    await loadMoreSentList();
    const buckets = countSentByAge();
    // Same rule for sends: LinkedIn's own empty state means zero sent, not a failed scrape. Only an
    // EXPLICIT empty state counts — no rows and no empty state still reports nothing.
    if (!buckets && isEmptySentList(txt0 + '\n' + (document.body ? document.body.innerText : ''))) {
      out['Invitations Sent 24h'] = 0;
      out['Invitations Sent 7d']  = 0;
    }
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
      visibility: document.visibilityState,
    });
    return out;
  }

  // Scroll the invitation list a bounded number of times to pull in more rows. In a real signed-in
  // browser this triggers LinkedIn's lazy-load; we stop early once a row older than 8 days appears
  // (we've covered the whole rolling week) or the row count stops growing.
  // Is the "Pages" tab present at all? Present with no count means zero pending page invitations;
  // absent means we cannot tell, and we leave the field null rather than invent a zero.
  function hasPagesTab(text) {
    const t = text || '';
    if (/(^|\n)\s*(Pages|Seiten|P[áa]ginas|Pagine|Pagina's)\s*(\n|$)/i.test(t)) return true;
    // A tab label the pack knows about, matched as a whole line — escaped here, never taken as a
    // pattern from the server.
    for (const v of labels('Invitations Pages Tab', [])) {
      if (new RegExp('(^|\\n)\\s*' + escapeRe(v) + '\\s*(\\n|$)', 'i').test(t)) return true;
    }
    return false;
  }

  // LinkedIn's own empty state for the sent-invitations list. Built-in wordings first, then any
  // the label pack adds — those are compared as plain substrings, never compiled into a pattern.
  function isEmptySentList(text) {
    const t = text || '';
    if (/(No pending invitations|No sent invitations|You haven[’']?t sent any|Nothing to see here|Keine (?:ausstehenden |gesendeten )?Einladungen|Du hast keine .{0,30}Einladungen|Aucune invitation|Vous n[’']avez envoy[ée]|No hay invitaciones|Nessun invito)/i.test(t)) return true;
    const lower = t.toLowerCase();
    for (const v of labels('Sent Empty State', [])) {
      if (lower.indexOf(v.toLowerCase()) !== -1) return true;
    }
    return false;
  }

  async function loadMoreSentList() {
    const scroller = document.querySelector('main') || document.scrollingElement || document.body;
    let last = -1, stable = 0;
    for (let i = 0; i < 30; i++) {
      try {
        const btn = [...document.querySelectorAll('button')]
          .find(b => /show more|see more|mehr anzeigen|mehr ergebnisse|voir plus|plus de résultats/i.test(b.textContent || ''));
        if (btn) btn.click();
        const rows = document.querySelectorAll('main li, main [role="listitem"]');
        if (rows.length) rows[rows.length - 1].scrollIntoView({ block: 'end' });
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
        window.scrollTo(0, document.body.scrollHeight);
        window.dispatchEvent(new Event('scroll'));
      } catch (e) {}
      await sleep(1200);
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
    // v0.3.3: LinkedIn prints the newest rows as "Sent today" / "Sent yesterday" — no digit, so the
    // numeric pattern above skipped exactly the rows the 24h count exists for. Verified live 2026-09-23.
    const reWord = /(?:Sent|Gesendet|Envoy[ée]e?|Enviada?|Inviat[oa])\s*:?\s*(today|yesterday|heute|gestern|aujourd[’']hui|hier|hoy|ayer|oggi|ieri|hoje|ontem)\b/i;
    const seen = new Map();
    const nodes = document.querySelectorAll('li, div');
    for (const el of nodes) {
      const t = el.innerText || '';
      if (t.length > 320) continue;
      const m = t.match(re);
      const w = m ? null : t.match(reWord);
      if (!m && !w) continue;
      const name = (t.split('\n')[0] || '').slice(0, 60).trim();
      // The stamp's own small element ("Sent 6 days ago" alone) is not a row. Counting it added one
      // phantom invitation per distinct stamp — verified live 2026-09-23 (23 counted for 20 rows).
      if (!name || re.test(name) || reWord.test(name)) continue;
      const key = name + '|' + (m ? m[0] : w[0]);
      if (!seen.has(key)) seen.set(key, m ? ageInDays(Number(m[1]), m[2]) : (/yesterday|gestern|hier|ayer|ieri|ontem/i.test(w[1]) ? 1 : 0));
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
    const viewLabels = labels('Views', ['profile viewers', 'profile views', 'Profilbesucher', 'Profil-Anzeigen', 'Profilaufrufe',
                    'vues du profil', 'visites du profil', 'visualizzazioni del profilo', 'vistas de perfil']);
    put(out, 'Views', metric(viewLabels, text, [/profile[-_]?view(?:er)?/i, /profileViewer|viewerCount/i]));
    const chg = changeNear(text, viewLabels);
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
    put(out, 'All Appearances',    metric(labels('All Appearances', ['all appearances', 'alle Anzeigen', 'alle Erscheinungen', 'Gesamtzahl der Anzeigen', 'Anzeigen insgesamt', 'alle Aufrufe', 'toutes les apparitions', 'apparitions totales', 'todas las apariciones', 'tutte le comparse']), text, [/all[-_]?appearance/i, /allAppearance|totalAppearance/]));
    put(out, 'Search Appearances', metric(labels('Search Appearances', ['search appearances', 'Suchanzeigen', 'Sucherscheinungen', 'Suchanfragen', 'Erscheinen in Suchergebnissen', 'Erscheinungen in der Suche', 'Anzeigen in Suchergebnissen', 'in Suchergebnissen', "apparitions dans les recherches", 'apparitions dans les résultats de recherche', 'apariciones en búsquedas', 'comparse nelle ricerche']), text, [/search[-_]?appearance/i, /searchAppearance/]));

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

    // READ FIRST, CLICK LATER. The old order clicked an "InMail" element up to 6 times BEFORE
    // reading anything. On LinkedIn's redesigned hub that element is the InMail feature card
    // ("Start a message"), so the clicks navigated the tab away and the plan — sitting in plain
    // text on the page the whole time — got scraped off whatever page we had landed on instead.
    const text0 = (document.body ? document.body.innerText : '') + '\n' + (document.body ? document.body.textContent : '');
    const plan = findPlan(text0);
    if (plan) out['Premium Plan'] = plan;
    // RENEWAL DATE. LinkedIn words this differently in every locale and has shipped several
    // wordings per locale. The French hub says "Renouvelé le 1 octobre 2026" — a live capture of
    // zeitount@'s page proved it — and not one of the three prefixes this used to match covered
    // that, so the date was dropped on every French account while sitting in plain text on screen.
    const RENEW_PREFIX = '(?:Renews?\\s+on|Renewed\\s+on|Next\\s+(?:billing|payment)(?:\\s+date)?\\s*:?'
      + '|Verlängert\\s+sich\\s+am|Verlängert\\s+am|Wird\\s+am|Nächste\\s+(?:Zahlung|Abrechnung)\\s*:?\\s*(?:am\\s+)?'
      + '|Se\\s+renouvelle\\s+le|Renouvelée?\\s+le|Prochaine\\s+facturation\\s*:?\\s*(?:le\\s+)?)';
    // Month-first (EN "October 1, 2026") or day-first (FR "1 octobre 2026", DE "1. Oktober 2026").
    const RENEW_DATE = '([A-Za-zÀ-ÿ]+\\.?\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\.?\\s+[A-Za-zÀ-ÿ]+\\.?\\s+\\d{4})';
    // Any additional renewal wording the pack carries, escaped here — a new locale is a data
    // change, not a new extension build.
    const packRenew = labels('Premium Renews', []).map(escapeRe);
    const prefix = packRenew.length
      ? '(?:' + packRenew.join('|') + '|' + RENEW_PREFIX.slice(3)
      : RENEW_PREFIX;
    const ren = text0.match(new RegExp(prefix + '\\s*' + RENEW_DATE, 'i'));
    if (ren) out['Premium Renews'] = ren[1].replace(/\s+/g, ' ').trim();

    let credits = findInMailCredits();
    // Only ever expand a real accordion, and only if the balance is not already on the page.
    if (credits == null && expandInMailCard()) { await sleep(1800); credits = findInMailCredits(); }
    if (credits != null) out['InMail Credits'] = credits;

    // NOT EVERY PLAN PUBLISHES A BALANCE — and since LinkedIn's hub redesign, none of them do.
    // A live French capture of this exact page contains no credit figure anywhere in its text, on
    // a Sales Navigator Core subscription. The field is UNAVAILABLE, not missed, and the
    // difference matters: it has been reported as a failed page for every account every day, which
    // is the loudest false alarm in the daily report. _not_exposed tells the server to say "not
    // published on this plan" instead of "LinkedIn likely moved this metric".
    if (credits == null) out['_not_exposed'] = ['InMail Credits'];

    out['_diag'] = Object.assign(baseDiag('premium', attempt), {
      credits_found: credits, plan: plan || null,
      credits_exposed: credits != null,
      renews: out['Premium Renews'] || null,
      // Always ship the hub's own text when the balance did not resolve. If LinkedIn ever prints it
      // again — or prints it under a wording we do not match — the next daily report shows it,
      // instead of another week of guessing at strings.
      sample: credits == null ? pageSample() : null,
    });
    return out;
  }

  // Search the whole DOM (textContent catches collapsed/hidden accordion content that innerText skips).
  function findInMailCredits() {
    // LinkedIn has shipped several wordings for this balance and localises all of them. Match the
    // number on either side of the label, EN/DE/FR, instead of one exact English phrase. NUM is the
    // source's own digit class (it must keep the non-breaking and narrow-no-break spaces).
    const NUM = "(\\d[\\d.,\\u00a0\\u202f ']*)";
    const PATTERNS = [
      new RegExp("Credits?\\s*available\\s*[:\\-\\u2013]?\\s*" + NUM, 'i'),
      new RegExp(NUM + "\\s*(?:InMail\\s*)?credits?\\s*(?:available|remaining|left)", 'i'),
      new RegExp("InMail\\s*credits?\\s*[:\\-\\u2013]?\\s*" + NUM, 'i'),
      new RegExp("Verf[\\u00fcu]gbare[sn]?\\s*(?:InMail[- ]?)?Guthaben\\s*[:\\-\\u2013]?\\s*" + NUM, 'i'),
      new RegExp(NUM + "\\s*(?:InMail[- ]?)?Guthaben\\s*(?:verf[\\u00fcu]gbar|[\\u00fcu]brig)", 'i'),
      new RegExp("Cr[\\u00e9e]dits?\\s*(?:InMail\\s*)?disponibles?\\s*[:\\-\\u2013]?\\s*" + NUM, 'i'),
    ];
    const scan = function (str) {
      if (!str) return null;
      for (const re of PATTERNS) {
        const m = str.match(re);
        if (m) {
          const n = parseCount(m[1]);
          // A credit balance is a small number. Anything bigger is a follower count or an advert.
          if (n != null && n >= 0 && n <= 10000) return n;
        }
      }
      return null;
    };
    const a = scan(document.body ? document.body.textContent : '');
    if (a != null) return a;
    return scan(document.body ? document.body.innerText : '');
  }

  // Click the InMail card header to expand it (only needed if the balance isn't already in the DOM).
  function expandInMailCard() {
    try {
      // ONLY a collapsed accordion: aria-expanded="false", not a link, and named exactly for the
      // credit balance. Clicking anything looser is what navigated the tab away and lost the plan.
      const els = document.querySelectorAll('[aria-expanded="false"]');
      for (const el of els) {
        if (el.tagName === 'A' || (el.closest && el.closest('a'))) continue;
        const t = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').trim();
        if (/^InMail(\s*(credits?|Guthaben|cr[ée]dits?))?$/i.test(t)) { el.click(); return true; }
      }
    } catch (e) {}
    return false;
  }

  // Plan name from the Plan Details panel — match a known plan, else the line after "Plan Details".
  function findPlan(text) {
    const known = ['Sales Navigator Advanced Plus', 'Sales Navigator Advanced', 'Sales Navigator Core',
                   'Recruiter Lite', 'Recruiter Professional', 'Recruiter',
                   'Premium Career', 'Premium Business', 'Career', 'Business'];
    // SCOPE TO THE PLAN DETAILS PANEL. The hub also ADVERTISES plans the user does not have —
    // "Gift a 2-month free trial of Premium Business" sits a few lines above the real plan — so a
    // whole-page match would happily record Premium Business for someone on Sales Navigator, or
    // for someone with no subscription at all. Reading only the panel is the difference between a
    // measurement and a guess, and a wrong value is worse than a missing one.
    const packPanel = labels('Premium Panel', []).map(escapeRe);
    const panelRe = '(?:Plan Details|Abo[- ]Details|Abodetails|D[ée]tails de l[\'’]abonnement'
      + (packPanel.length ? '|' + packPanel.join('|') : '') + ')';
    const panel = text.match(new RegExp(panelRe + '\\s*\\n?\\s*([\\s\\S]{0,140})', 'i'));
    if (panel) {
      for (const k of known) { if (new RegExp(escapeRe(k), 'i').test(panel[1])) return k; }
      const m = panel[1].match(/^\s*([A-Za-z][A-Za-z .]{3,40})/);
      if (m) return m[1].trim();
    }
    return null;
  }

  // ── 6) COMPANY ADMIN ANALYTICS  (/company/{id}/admin/analytics/*) ───
  // Real numbers pulled from the page-admin analytics tabs (admin-only). All are "number before
  // label" on LinkedIn, so countBeforeLabel handles them. Labels matched EN/DE/FR.
  function scrapeCoFollowers(attempt) {
    const out = {};
    const text = document.body ? document.body.innerText : '';
    put(out, 'Company Followers',     metric(labels('Company Followers', ['Total followers', 'Follower insgesamt', 'Abonnenten insgesamt', 'Gesamtzahl der Follower', 'Follower gesamt', "Nombre total d'abonnés", "Total d'abonnés", 'Abonnés au total']), text, [/total[-_]?follower/i, /follower[-_]?count|followerTotal/i]));
    put(out, 'Company New Followers', metric(labels('Company New Followers', ['New followers', 'New followers in the last 30 days', 'Neue Follower', 'Neue Abonnenten', 'Neue Follower gewonnen', 'Nouveaux abonnés']), text, [/new[-_]?follower/i, /followerGain|newFollower/i]));
    out['_diag'] = baseDiag('co_followers', attempt);
    return out;
  }
  function scrapeCoVisitors(attempt) {
    const out = {};
    const text = document.body ? document.body.innerText : '';
    put(out, 'Company Unique Visitors', metric(labels('Company Unique Visitors', ['Unique visitors', 'Eindeutige Besucher', 'Einzelne Besucher', 'Einzelbesucher', 'Einmalige Besucher', 'Visiteurs uniques', 'Visiteurs distincts']), text, [/unique[-_]?visitor/i, /uniqueVisitor/]));
    put(out, 'Company Custom Clicks',   metric(labels('Company Custom Clicks', ['Custom button clicks', 'Klicks auf', 'Clics sur le bouton']), text));
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
    put(out, 'Company Post Impressions', metric(labels('Company Post Impressions', [
      'Impressions (organic)', 'Total impressions', 'Post impressions', 'Update impressions',
      'Impressionen insgesamt', 'Beitragsimpressionen', "Impressions totales", 'Impressions des posts',
      'Impressions', 'Impressionen',
    ]), text, [/(?:organic|total|post|update)[-_]?impression/i, /impressionCount/i]));
    out['_diag'] = baseDiag('co_updates', attempt);
    return out;
  }
  function scrapeCoSearch(attempt) {
    const out = {};
    const text = document.body ? document.body.innerText : '';
    put(out, 'Company Search Appearances', metric(labels('Company Search Appearances', ['Page searches', 'Seitensuchen', 'Recherches de page', 'Search appearances', 'Sucherscheinungen']), text, [/page[-_]?search/i, /pageSearch|searchAppearance/i]));
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

  // ── Locale-proof attribute read ──────────────────────────────────────────
  //
  // Everything above matches the label LinkedIn PRINTS, and LinkedIn translates what it prints.
  // That single fact is why one German account has been missing search appearances and company
  // followers for over a month while every English account collects them, and why each attempt to
  // fix it has been a guess at a German string nobody had ever seen on the real page.
  //
  // LinkedIn's MARKUP is not translated. The ids, test hooks and class tokens it ships are English
  // in every locale. Reading those gives a route to the number that does not care what language
  // the page is in. It runs LAST on purpose: the label readers already work for the accounts that
  // work, and this must not be able to change a value they get right — it can only fill a gap they
  // leave. Ambiguity still yields nothing; a wrong number is worse than a missing one.
  const ATTR_KEYS = ['id', 'data-test-id', 'data-testid', 'data-view-name', 'data-control-name', 'class'];
  const ATTR_SEL  = '[id],[data-test-id],[data-testid],[data-view-name],[data-control-name]';

  function bareNumbersIn(txt) {
    const out = [];
    for (const line of splitLines(txt)) {
      const n = bareNumber(line);
      if (n != null) out.push(n);
    }
    return out;
  }

  function attrValue(patterns) {
    if (!patterns || !patterns.length) return null;
    let els;
    try { els = document.querySelectorAll(ATTR_SEL); } catch (e) { return null; }
    for (const re of patterns) {
      const hits = [];
      for (const el of els) {
        let matched = false;
        for (const k of ATTR_KEYS) {
          const v = el.getAttribute && el.getAttribute(k);
          if (v && re.test(v)) { matched = true; break; }
        }
        if (!matched) continue;
        if (isExcluded(el) || isPromo(el)) continue;
        const txt = el.innerText || '';
        // A tile, not a whole section. Above this we are reading the page, not the metric.
        if (!txt || txt.length > 240) continue;
        const nums = bareNumbersIn(txt);
        if (nums.length === 1) hits.push(nums[0]);
      }
      const uniq = hits.filter(function (v, i) { return hits.indexOf(v) === i; });
      // Exactly one distinct number under this hook, or we learned nothing.
      if (uniq.length === 1) return uniq[0];
    }
    return null;
  }

  // The reader every scraper calls: DOM first, strict text second.
  function metric(labels, text, attrs) {
    const v = tileValue(labels);
    if (v != null) return v;
    const t = countNearLabel(text == null ? (document.body ? document.body.innerText : '') : text, labels);
    if (t != null) return t;
    // Last resort, and only reachable when both translated-label readers found nothing.
    return attrValue(attrs);
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

  // A tab's count read from the tab itself, located by href rather than by its translated label.
  // Returns only a count that is unambiguous inside that one anchor's own short text.
  function tabCountByHref(re) {
    try {
      for (const a of document.querySelectorAll('a[href]')) {
        const h = a.getAttribute('href') || '';
        if (!re.test(h)) continue;
        const t = ((a.innerText || a.textContent || '') + '').trim();
        if (!t || t.length > 60) continue;
        let m = t.match(/\((\d[\d.,   ']*)\)/);        // "Personnes (12)"
        if (!m) m = t.match(/(\d[\d.,   ']*)\s*$/);      // "Personnes 12"
        if (m) { const n = parseCount(m[1]); if (n != null && n <= 100000) return n; }
      }
    } catch (e) {}
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
