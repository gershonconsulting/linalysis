// Linalysis live-data.js — sync sessionStorage cache + async refresh
// First load: reads from sessionStorage if present (populated by previous visit).
// Every load: kicks off an async refresh in the background.
// This avoids blocking the main thread with slow sync XHR while still delivering data on
// the first page in a session (via sessionStorage) or subsequent pages (via the just-refreshed cache).

(function () {
  var API_BASE = (function () {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return 'http://127.0.0.1:8787';
    if (location.hostname.endsWith('.pages.dev')) return 'https://linalysis-api.oattia.workers.dev';
    return 'https://api.linalysis.net';
  })();
  var CACHE_KEY = 'linalysis_live_data_cache_v1';
  var CACHE_MAX_AGE_MS = 15 * 60 * 1000; // 15 min

  var email = null;
  try { email = (localStorage.getItem('linalysis_user_email') || '').toLowerCase(); } catch (e) {}

  // ── 1. Populate LINALYSIS_DATA synchronously from sessionStorage cache ──
  if (email) {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        var cache = JSON.parse(raw);
        if (cache && cache.email === email && cache.data && cache.data.dates && cache.data.dates.length > 0) {
          window.LINALYSIS_DATA = cache.data;
        }
      }
    } catch (e) {}
  }

  // ── 2. Kick off async refresh (unblocked) ──
  if (!email) return;
  var opts = { credentials: 'include', headers: { 'Accept': 'application/json' } };
  Promise.all([
    fetch(API_BASE + '/api/data/connections?range=1825', opts).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch(API_BASE + '/api/data/ssi?range=1825', opts).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch(API_BASE + '/api/data/company?range=1825', opts).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
  ]).then(function (results) {
    var conn = results[0], ssi = results[1], co = results[2];
    var byDate = {};
    function merge(payload) {
      if (!payload || !Array.isArray(payload.series)) return;
      for (var i = 0; i < payload.series.length; i++) {
        var row = payload.series[i];
        if (!row || !row.captured_at) continue;
        var d = row.captured_at;
        if (!byDate[d]) byDate[d] = { captured_at: d };
        for (var k in row) if (k !== 'captured_at') byDate[d][k] = row[k];
      }
    }
    merge(conn); merge(ssi); merge(co);
    var dates = Object.keys(byDate).sort();
    if (dates.length === 0) return;
    var MAP = {
      connections: 'connections', invitations: 'invitations', profile_views: 'views',
      search_appearances: 'search_appearance',
      ssi_overall: 'ssi', ssi_industry_rank: 'ssi_industry', ssi_network_rank: 'ssi_network',
      ssi_brand: 'ssi_brand', ssi_prospecting: 'ssi_prospecting', ssi_insights: 'ssi_insights', ssi_relationships: 'ssi_relationships',
      company_followers: 'co_followers', company_unique_visitors: 'co_visitors',
      company_search_appearances: 'co_search', company_new_followers: 'co_new_followers',
      company_post_impressions: 'co_impressions', company_custom_clicks: 'co_clicks',
      company_credits_available: 'co_credits_available', company_credits_total: 'co_credits_total',
    };
    var metrics = {};
    for (var apiKey in MAP) {
      var outKey = MAP[apiKey];
      var arr = new Array(dates.length);
      for (var i = 0; i < dates.length; i++) {
        var v = byDate[dates[i]][apiKey];
        arr[i] = v == null ? null : v;
      }
      metrics[outKey] = arr;
    }
    var built = {
      dates: dates, metrics: metrics,
      meta: { first_date: dates[0], last_date: dates[dates.length - 1], total_days: dates.length, owner_email: email, source: 'live-api' },
      insights: [],
    };
    // Cache for next page load
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ email: email, cached_at: Date.now(), data: built }));
    } catch (e) {}
    // If the current page had no data (fresh session, empty cache), reload once so the inline
    // scripts pick up the fresh LINALYSIS_DATA. Guard against infinite loop via URL param.
    if ((!window.LINALYSIS_DATA || !window.LINALYSIS_DATA.dates || window.LINALYSIS_DATA.dates.length === 0)
        && !location.search.includes('_ld=1')) {
      var sep = location.search ? '&' : '?';
      location.replace(location.pathname + location.search + sep + '_ld=1' + location.hash);
    } else {
      window.LINALYSIS_DATA = built;
      try { window.dispatchEvent(new CustomEvent('linalysisDataReady', { detail: { rows: built.dates.length } })); } catch (e) {}
    }
  }).catch(function () {});
})();
