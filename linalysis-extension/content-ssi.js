// Content script that runs on linkedin.com/sales/ssi.
// v0.1.6 — longer wait + retry loop + diagnostic capture so we can see WHY a scrape returned null.
//
// Scrapes the SSI values and sends them to the background worker to POST to Linalysis.

(function () {
  // Fire an initial scrape after page settles. Also respond to explicit "scrape now" requests
  // from the background service worker.
  const READY_DELAY_MS = 5000;

  // ── Language ─────────────────────────────────────────────────────
  // LinkedIn fully localizes this page, labels and number format both. The keyword lists come from
  // a pack served by Linalysis and keyed by the language THIS page rendered in, so adding a locale
  // is a data change rather than a new extension build that nobody installs. The built-in lists
  // below stay as a floor: a failed fetch degrades to today's behaviour, never to no collection.
  // Pack values are literal strings and are escaped before they reach a RegExp.
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

  function reportLang() {
    try {
      const l = pageLang();
      if (l) chrome.runtime.sendMessage({ type: 'linalysis-lang', lang: l });
    } catch (e) {}
  }

  // This page's language first, then cross-language additions, then the built-ins. Deduped.
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

  setTimeout(scrapeAndSend, READY_DELAY_MS);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'linalysis-scrape-ssi') {
      scrapeAndSend().then(sendResponse);
      return true; // async
    }
    return false;
  });

  async function scrapeAndSend() {
    try {
      await ensurePack();
      reportLang();
      // Up to 3 attempts, 5 seconds apart. Break as soon as we have all 4 sub-scores.
      let data = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        data = scrapeSSIFromDOM(attempt);
        // A sign-out does not resolve itself in five seconds. Retrying it only delays the rest of
        // the sync and produces the same answer three times.
        if (data && data['_blocked'] && data['_blocked'] !== 'not_rendered') break;
        const gotAllSubs = data['ssi_brand'] != null
                        && data['ssi_prospecting'] != null
                        && data['ssi_insights'] != null
                        && data['ssi_relationships'] != null;
        if (gotAllSubs) break;
        if (attempt < 3) await sleep(5000);
      }
      const r = await chrome.runtime.sendMessage({ type: 'linalysis-ssi-result', data });
      return { ok: true, sent: true, response: r };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  // Extract SSI values. LinkedIn's markup evolves; we try structured DOM selectors first, then
  // fall back to regex over the full innerText, then try any embedded JSON blobs.
  // Always attaches a `_diag` object so the server can see the page state even when scrape fails.
  function scrapeSSIFromDOM(attempt) {
    const out = {};
    const text = document.body ? document.body.innerText : '';

    // ── Is this even the SSI page? ──────────────────────────────────
    // /sales/ssi bounces to /sales/login when the Sales Navigator seat is signed out, expired or
    // never provisioned, and to /checkpoint|/authwall when LinkedIn wants a re-auth. What comes
    // back is a ~200-character app shell with no dashboard in it. Reporting that as "0 of 4
    // sub-scores captured" told the daily report a selector had moved, for weeks, on an account
    // whose only problem was a signed-out Sales Navigator — a failure no code change could fix.
    // Classify it here, once, and say which of the two it is.
    const blocked = blockedReason(text);
    if (blocked) {
      out['_blocked']        = blocked.code;
      out['_blocked_reason'] = blocked.message;
      out['_diag'] = {
        attempt: attempt || 1,
        url: location.href,
        title: (document.title || '').slice(0, 120),
        text_len: text.length,
        blocked: blocked.code,
        reason: blocked.message,
        lang: (document.documentElement.getAttribute('lang') || '').slice(0, 5) || null,
        first_400: text.slice(0, 400),
        sample: ssiSample(),
      };
      return out;
    }

    // 1) SSI overall — DO NOT trust the regex; we'll compute from the 4 sub-scores below.
    //    LinkedIn's DOM has too many "1"s and small numbers floating around (rank badges, tier
    //    indicators) that trip a naïve regex.
    out['SSI']              = null;
    // Industry / Network percentile. Layout differs by language: German shows "Top 14 %\n<label>"
    // (number BEFORE label); English shows "<label>\nTop 14%" (number AFTER label). Handle each.
    out['SSI Industry']     = pctForLabel(text, labels('SSI Industry', ['Branche', 'Branchenrang', 'Ihrer Branche', 'secteur', 'sector', 'settore', 'setor']), ['industry', 'industry rank', 'in your industry']);
    out['SSI Network']      = pctForLabel(text, labels('SSI Network', ['Netzwerk', 'réseau', 'rete', 'rede', 'netwerk']), ['network', 'red']);
    // Detected LinkedIn UI language (helps debugging locale-specific scrapes).
    out['_lang'] = (document.documentElement.getAttribute('lang') || navigator.language || '').slice(0, 5).toLowerCase() || null;

    // 2) Component scores 0..25 each. LinkedIn fully localizes these labels AND the number format
    //    (German/French use a comma decimal, e.g. "9,14"). We match the four components across
    //    English, German, French, Spanish, Italian, Portuguese and Dutch, plus the language-agnostic
    //    JSON keys, accepting the number before OR after the label. Add new locales here as needed.
    const brand = componentScore(text, labels('SSI Brand', [
      // EN                DE                    FR                      ES                  IT/PT/NL                     JSON
      'professional brand', 'professionelle Marke', 'marque professionnelle', 'marca profesional', 'marchio professionale', 'marca profissional', 'professionele merk', 'establishBrand'
    ]));
    const prospecting = componentScore(text, labels('SSI Prospecting', [
      'right people', 'richtigen Personen', 'bonnes personnes', 'personas adecuadas', 'persone giuste', 'pessoas certas', 'juiste mensen', 'findRightPeople'
    ]));
    const insights = componentScore(text, labels('SSI Insights', [
      // FR: "Interagir en offrant des informations" / "…en partageant des informations"
      'with insights', 'Einblicke', 'Interagir', 'informations', 'insights', 'perspectivas', 'approfondimenti', 'percepções', 'inzichten', 'engageWithInsights'
    ]));
    const relationships = componentScore(text, labels('SSI Relationships', [
      'Build relationships', 'Beziehungen aufbauen', 'Beziehungen', 'des relations', 'relationships', 'relations', 'relaciones', 'relazioni', 'relacionamentos', 'relaties', 'buildRelationships'
    ]));
    out['ssi_brand']         = brand;
    out['ssi_prospecting']   = prospecting;
    out['ssi_insights']      = insights;
    out['ssi_relationships'] = relationships;

    // 3) SSI overall = sum of the 4 sub-scores. LinkedIn defines it exactly that way.
    //    Only compute if we captured all 4 sub-scores; otherwise leave null so the UI shows "—"
    //    instead of a misleading partial value.
    if ([brand, prospecting, insights, relationships].every(v => v != null)) {
      out['SSI'] = Math.round((brand + prospecting + insights + relationships) * 100) / 100;
    }

    // 4) Also look inside embedded __NEXT_DATA__ / bpr-guid JSON if present
    try {
      const scripts = document.querySelectorAll('script,code[id^="bpr-guid"]');
      for (const s of scripts) {
        const t = s.textContent || '';
        if (t.length < 30) continue;
        const b = t.match(/"establishBrand"\s*:\s*(\d+(?:\.\d+)?)/);
        if (b && out['ssi_brand'] == null) out['ssi_brand'] = Number(b[1]);
        const p = t.match(/"findRightPeople"\s*:\s*(\d+(?:\.\d+)?)/);
        if (p && out['ssi_prospecting'] == null) out['ssi_prospecting'] = Number(p[1]);
        const g = t.match(/"engageWithInsights"\s*:\s*(\d+(?:\.\d+)?)/);
        if (g && out['ssi_insights'] == null) out['ssi_insights'] = Number(g[1]);
        const r = t.match(/"buildRelationships"\s*:\s*(\d+(?:\.\d+)?)/);
        if (r && out['ssi_relationships'] == null) out['ssi_relationships'] = Number(r[1]);
        const i = t.match(/"(?:industryPercentile|industryRank|percentileIndustry)"\s*:\s*(\d+(?:\.\d+)?)/);
        if (i && out['SSI Industry'] == null) out['SSI Industry'] = Math.round(Number(i[1]));
        const n = t.match(/"(?:networkPercentile|networkRank|percentileNetwork)"\s*:\s*(\d+(?:\.\d+)?)/);
        if (n && out['SSI Network'] == null) out['SSI Network'] = Math.round(Number(n[1]));
      }
    } catch (e) {}

    // Final pass: after we may have picked up sub-scores from JSON blobs, derive the total.
    if (out['SSI'] == null
        && out['ssi_brand'] != null && out['ssi_prospecting'] != null
        && out['ssi_insights'] != null && out['ssi_relationships'] != null) {
      out['SSI'] = Math.round((out['ssi_brand'] + out['ssi_prospecting'] + out['ssi_insights'] + out['ssi_relationships']) * 100) / 100;
    }

    // 5) Diagnostic capture — ALWAYS attached, so the server sees the page state even when scrape
    //    returned null. This is the fastest way to debug "the extension synced but got nothing."
    out['_diag'] = {
      attempt: attempt || 1,
      url: location.href,
      title: (document.title || '').slice(0, 120),
      text_len: text.length,
      has_establish: text.includes('Establish'),
      has_find_people: text.includes('Find the right people'),
      has_engage: text.includes('Engage'),
      has_build: text.includes('Build'),
      // Multilingual "did the page show the SSI breakdown?" — true if any localized component label present.
      has_ssi_sections: /professional brand|professionelle Marke|marque professionnelle|marca profesional|richtigen Personen|Beziehungen aufbauen|Build relationships/i.test(text),
      lang: (document.documentElement.getAttribute('lang') || '').slice(0, 5) || null,
      has_social_selling: /social selling/i.test(text),
      has_signin: /sign in|log in|log-in|anmelden/i.test(text.slice(0, 500)),
      has_sales_nav_upsell: /try\s+sales\s+navigator|upgrade\s+to\s+sales|kostenlos testen/i.test(text),
      first_400: text.slice(0, 400),
      // FAILURE SAMPLE — attached only when a rank or a sub-score is missing, so the German /
      // French SSI layout can be read straight off the daily report instead of needing a live
      // browser on the affected user's machine.
      sample: (out['SSI Industry'] == null || out['SSI Network'] == null || out['SSI'] == null)
        ? ssiSample() : null,
    };

    return out;
  }

  function firstNumberNear(text, regex, min, max) {
    const m = text.match(regex);
    if (!m) return null;
    const n = Number(m[1]);
    if (Number.isNaN(n)) return null;
    if (min != null && n < min) return null;
    if (max != null && n > max) return null;
    return n;
  }

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Parse a European/US number string: "9,14" -> 9.14, "17.775" -> 17.775, "1.234,5" -> 1234.5.
  function parseNum(s) {
    if (s == null) return NaN;
    s = String(s).trim();
    // If both separators present, the last one is the decimal separator.
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.indexOf(',') > -1) {
      s = s.replace(',', '.');
    }
    return parseFloat(s);
  }

  // Find a component sub-score (0..25) next to any of the localized labels. The number may appear
  // BEFORE the label (German "9,14 | Ihre professionelle Marke aufbauen") or AFTER it (English
  // "Establish your professional brand\t17.77"). The gap between number and label must NOT cross a
  // newline or contain another digit — this keeps each score bound to its own label and prevents
  // grabbing the neighbouring line's number.
  function componentScore(text, keywords) {
    var num = '(\\d{1,2}(?:[.,]\\d{1,3})?)';
    for (var i = 0; i < keywords.length; i++) {
      var kw = escapeRe(keywords[i]);
      // A: number → separator (same line, no other digit) → label. The gap tolerates long localized
      //    labels (e.g. FR "7,5 | Interagir en offrant des informations") but the [^\n0-9] class
      //    still prevents crossing a line break or skipping past another number.
      var m = text.match(new RegExp(num + '[^\\n0-9]{0,40}?' + kw, 'i'));
      // B: label → separator (same line, no other digit) → number
      if (!m) m = text.match(new RegExp(kw + '[^\\n0-9]{0,40}?' + num, 'i'));
      if (m) {
        var n = parseNum(m[1]);
        if (!isNaN(n) && n >= 0 && n <= 25) return Math.round(n * 100) / 100;
      }
    }
    return null;
  }

  // Find a "Top XX %" percentile (0..100) for a ranking label. deKeywords use the German layout
  // ("Top 14 %\n<label>", number before) and enKeywords use the English layout ("<label>\nTop 14%",
  // number after). The [^%] gap stops the match from jumping past a neighbouring percentile.
  function pctForLabel(text, deKeywords, enKeywords) {
    for (var i = 0; i < deKeywords.length; i++) {
      var m = text.match(new RegExp('(\\d{1,3})\\s*%\\s*\\n?\\s*[^%]{0,60}?' + wordRe(deKeywords[i]), 'i'));
      if (m) { var n = parseInt(m[1], 10); if (n >= 0 && n <= 100) return n; }
    }
    for (var j = 0; j < enKeywords.length; j++) {
      var m2 = text.match(new RegExp(wordRe(enKeywords[j]) + '[^%]{0,70}?(\\d{1,3})\\s*%', 'i'));
      if (m2) { var n2 = parseInt(m2[1], 10); if (n2 >= 0 && n2 <= 100) return n2; }
    }
    return null;
  }

  // Rank keywords must match as WORDS. Without this, the Spanish keyword "red" (= network) matched
  // inside unrelated words on non-Spanish pages and could return a percentile belonging to something
  // else entirely — a wrong number is worse than a missing one.
  function wordRe(kw) {
    // Long keywords stay substring matches on purpose: German compounds them ("Netzwerkrang",
    // "Branchenrang") and a word boundary would break the ranks that currently work.
    return String(kw).length <= 4
      ? '(?<![A-Za-zÀ-ÿ])' + escapeRe(kw) + '(?![a-zà-ÿ])'
      : escapeRe(kw);
  }

  // A bounded slice of the SSI dashboard region, attached only when something did not resolve.
  function ssiSample() {
    try {
      var root = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
      var t = (root && root.innerText) || '';
      t = t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean).join('\n');
      return t.slice(0, 2500);
    } catch (e) { return null; }
  }

  // Why the SSI page is not the SSI page. Separates a sign-out (only the user can fix it) from a
  // page that loaded but never painted (we can). The daily report could tell neither apart before
  // and called both "LinkedIn likely moved this metric in the DOM", which sent every investigation
  // to the wrong layer.
  function blockedReason(text) {
    const p = location.pathname || '';
    const t = text || '';
    if (/^\/sales\/(login|register|signup|ssi-login)/i.test(p)) {
      return { code: 'sales_nav_signed_out',
               message: 'Sales Navigator is signed out in this Chrome profile — LinkedIn redirected /sales/ssi to ' + p + '. No SSI can be collected until someone signs in to Sales Navigator in the profile that runs the extension.' };
    }
    if (/^\/(?:uas\/)?login|^\/checkpoint|^\/authwall|^\/signup/i.test(p)) {
      return { code: 'signed_out',
               message: 'LinkedIn signed this browser out — /sales/ssi redirected to ' + p + '. Sign in again in the Chrome profile that runs the extension.' };
    }
    if (/\/sales\//.test(p) &&
        /no longer have access|subscription has ended|reactivate|kein Zugriff mehr|abgelaufen|acc[èe]s a expir|abonnement a pris fin/i.test(t)) {
      return { code: 'sales_nav_expired',
               message: 'The Sales Navigator subscription on this account is not active — LinkedIn does not serve an SSI score without a seat.' };
    }
    // A rendered SSI dashboard is thousands of characters. Below this LinkedIn served the empty
    // app shell: a render failure on this machine, never a changed selector.
    if (t.length < 400 &&
        !/social selling|professional brand|professionelle Marke|marque professionnelle/i.test(t)) {
      return { code: 'not_rendered',
               message: 'The SSI page returned only ' + t.length + ' characters — LinkedIn served the empty app shell and never painted the dashboard. Sales Navigator will not render in a hidden or background tab.' };
    }
    return null;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
})();
