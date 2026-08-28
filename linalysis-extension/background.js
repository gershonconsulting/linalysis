// Linalysis background service worker — v0.2.7
//
// v0.2.7 — "why did this field go missing?" is now answerable from the daily report alone:
//   A. NOTHING FAILS SILENTLY. Every page files a receipt even when the content script never reports
//      back (which is what happened whenever LinkedIn bounced the tab to /login — the page simply
//      vanished from the report with no reason attached).
//   B. FAILURE SAMPLES. Any page that renders but does not yield its primary metric ships a bounded
//      slice of its own text with the receipt, so a moved/localised label can be fixed from the
//      report instead of needing a live browser session on the affected user's machine.
//   C. SIGNED-OUT IS NAMED AS SUCH. A redirect to /login /checkpoint /authwall is reported as "sign
//      in", never as "LinkedIn moved this metric".
//
// v0.2.6 background:
//   • multilingual SSI scraper (DE/EN/FR/ES + comma decimals), AND
//   • daily growth-metrics collection: Connections, Sent invitations (+ weekly-credit usage),
//     Profile views, Search/Profile appearances, InMail credits, Company admin analytics.
//
// v0.2.6 — three fixes for "the extension stopped collecting and nobody knew":
//   1. VISIBILITY. LinkedIn's Sales Navigator SPA does not render in a hidden tab: the shell loads,
//      React never hydrates, and the scraper sees an empty page (title "Sales Navigator", 0 chars of
//      text, URL bounced to /sales/login). Every scrape now runs in a dedicated collection WINDOW
//      whose tab is the active tab (visibilityState === "visible"), and if a page still comes back
//      empty the window is focused for a moment and the page reloaded before giving up.
//   2. RECEIPTS. Every page reports its outcome to /api/user/collect-report — success, empty, or
//      error, with the URL it actually landed on. Silent failures are now visible server-side and
//      land in the daily collection email.
//   3. CATCH-UP. If more than ~20h have passed with no captured data, the next heartbeat runs a sync
//      instead of waiting for tomorrow's 09:00 alarm. A closed laptop no longer costs a whole day.

const API_BASE = 'https://api.linalysis.net';
const ALARM_NAME = 'linalysisDailySync';
const SYNC_POLL_ALARM = 'linalysisSyncPoll';
const CHECKIN_ALARM = 'linalysisCheckin';
const SSI_URL = 'https://www.linkedin.com/sales/ssi';
const MAX_LOG = 60;

// A rendered LinkedIn page has thousands of characters. Below this the page did not hydrate.
const MIN_RENDERED_TEXT = 400;
// Run a catch-up sync when real data hasn't landed in this long.
const CATCHUP_AFTER_HOURS = 20;

const METRIC_PAGES = [
  { key: 'connections',   url: 'https://www.linkedin.com/mynetwork/' },
  { key: 'invitations',   url: 'https://www.linkedin.com/mynetwork/invitation-manager/sent/' },
  { key: 'profile_views', url: 'https://www.linkedin.com/analytics/profile-views/' },
  { key: 'appearances',   url: 'https://www.linkedin.com/analytics/search-appearances/' },
  { key: 'premium',       url: 'https://www.linkedin.com/premium/sb/explore/' },
];

// ─── Storage helpers ────────────────────────────────────────────────
async function getPairing() {
  const s = await chrome.storage.local.get(['email', 'token', 'pairedAt', 'lastSyncAt', 'lastSyncStatus', 'lastSyncMessage', 'lastDataAt']);
  return s;
}
// The Page ID cached by content-metrics.js when the admin visits /company/{id}/admin/*.
// Shipped with every metrics ingest so linalysis.net can deep-link each company card to the exact
// analytics tab it came from instead of a dead /company/ URL (v0.2.9).
async function cachedCompanyId() {
  try {
    const s = await chrome.storage.local.get('linalysis_company_id');
    const id = s && s.linalysis_company_id;
    return /^\d{1,20}$/.test(String(id || '')) ? String(id) : null;
  } catch (e) { return null; }
}
async function setPairing(email, token) {
  await chrome.storage.local.set({ email, token, pairedAt: Date.now() });
}
async function recordSync(status, message) {
  await chrome.storage.local.set({
    lastSyncAt: Date.now(),
    lastSyncStatus: status,
    lastSyncMessage: String(message || '').slice(0, 300),
  });
}
async function log(level, msg, data) {
  const s = await chrome.storage.local.get('syncLog');
  const arr = s.syncLog || [];
  arr.push({ ts: new Date().toISOString(), level, msg, data: data || null });
  while (arr.length > MAX_LOG) arr.shift();
  await chrome.storage.local.set({ syncLog: arr });
}

function extVersion() {
  try { return (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || ''; } catch (e) { return ''; }
}

// ─── Server reporting ───────────────────────────────────────────────
async function reportCheckin(event) {
  try {
    const p = await getPairing();
    if (!p.token) return;
    await fetch(API_BASE + '/api/user/extension-checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.token },
      body: JSON.stringify({ version: extVersion(), paired: true, event: event || 'heartbeat', last_sync_status: p.lastSyncStatus || null }),
    });
  } catch (e) { /* best-effort */ }
}

async function reportStatus(state, message, extra) {
  try {
    const p = await getPairing();
    if (!p.token) return;
    await fetch(API_BASE + '/api/user/sync-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.token },
      body: JSON.stringify(Object.assign({ state, message: message || '', ext_version: extVersion() }, extra || {})),
    });
  } catch (e) { /* offline — best-effort */ }
}

// One receipt per page, every day, whether it worked or not. This is what makes a silent failure
// show up in the daily collection email instead of vanishing into a local log nobody reads.
async function reportCollect(payload) {
  try {
    if (payload && payload.page) _reported[payload.page] = true;
    const p = await getPairing();
    if (!p.token) return;
    await fetch(API_BASE + '/api/user/collect-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.token },
      body: JSON.stringify(Object.assign({
        date: new Date().toISOString().slice(0, 10),
        ext_version: extVersion(),
      }, payload)),
    });
  } catch (e) { /* best-effort */ }
}

// What the orchestrator observed about each page (URL it landed on, how much text rendered, whether
// the tab was actually visible). post*() reads this when writing the receipt.
const _probes = {};

// Which pages have already filed a receipt in THIS run. v0.2.7: if the content script never reports
// back (it does that whenever it cannot recognise the page — e.g. LinkedIn bounced the tab to
// /login), the page used to vanish from the daily report entirely: no receipt, no reason, no clue.
// collectMetrics() now files a fallback receipt for anything still unreported.
let _reported = {};

// LinkedIn's "you are not signed in" destinations. Landing on one of these is not a selector bug and
// must not be reported as one — the user needs to sign in, nothing else will fix it.
const SIGNED_OUT_RE = /\/(?:login|uas\/login|checkpoint|authwall|signup)(?:[\/?#]|$)/i;

function signedOutReason(url, isSalesNav) {
  if (!url || !SIGNED_OUT_RE.test(url)) return null;
  return isSalesNav
    ? 'LinkedIn sent this page to the Sales Navigator sign-in screen — the Sales Navigator session has expired. Sign in to Sales Navigator once in this Chrome profile.'
    : 'LinkedIn signed this browser out — the page redirected to the sign-in screen. Sign in to LinkedIn in this Chrome profile, then run Sync now.';
}

// Pull a bounded slice of the page's own text so a selector failure can be diagnosed from the daily
// report rather than needing a live browser session on the affected user's machine.
async function samplePage(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const root = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
        const t = ((root && root.innerText) || '').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
        return t.slice(0, 2500);
      },
    });
    return (res && res.result) || null;
  } catch (e) { return null; }
}

// ─── Lifecycle ──────────────────────────────────────────────────────
async function ensureAlarms() {
  const a = await chrome.alarms.get(ALARM_NAME);
  if (!a) await chrome.alarms.create(ALARM_NAME, { when: nextNineAM(), periodInMinutes: 24 * 60 });
  const p = await chrome.alarms.get(SYNC_POLL_ALARM);
  if (!p) await chrome.alarms.create(SYNC_POLL_ALARM, { delayInMinutes: 1, periodInMinutes: 5 });
  const c = await chrome.alarms.get(CHECKIN_ALARM);
  if (!c) await chrome.alarms.create(CHECKIN_ALARM, { delayInMinutes: 1, periodInMinutes: 180 });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureAlarms();
  await log('info', 'installed', { version: extVersion() });
  reportCheckin('installed');
});
chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarms();
  reportCheckin('startup');
  // Chrome was closed when the daily alarm was due — collect now rather than skipping the day.
  await maybeCatchUp('startup');
});

function nextNineAM() {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
  if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
  return t.getTime();
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) await runSync('cron');
  if (alarm.name === SYNC_POLL_ALARM) await checkSyncRequest();
  if (alarm.name === CHECKIN_ALARM) {
    await ensureAlarms();          // self-heal a lost alarm
    await reportCheckin('heartbeat');
    await maybeCatchUp('heartbeat');
  }
});

// If real data hasn't landed in over CATCHUP_AFTER_HOURS, run a sync now.
async function maybeCatchUp(trigger) {
  try {
    const p = await getPairing();
    if (!p.token) return;
    const ageH = p.lastDataAt ? (Date.now() - p.lastDataAt) / 3600000 : Infinity;
    if (ageH < CATCHUP_AFTER_HOURS) return;
    await log('warn', 'catchup:triggered', { trigger, hours_since_data: Math.round(ageH) });
    await runSync('catch-up');
  } catch (e) { /* best-effort */ }
}

async function checkSyncRequest() {
  const p = await getPairing();
  if (!p.token) return;
  try {
    const resp = await fetch(API_BASE + '/api/user/sync-request', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + p.token, 'Accept': 'application/json' },
    });
    if (!resp.ok) return;
    const j = await resp.json();
    if (j && j.pending) {
      await log('info', 'sync_request:received', { triggered_by: j.triggered_by, requested_at: j.requested_at });
      await runSync('admin-request');
    }
  } catch (e) { /* offline — skip this cycle */ }
}

// ─── Messages ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === 'linalysis-pair') {
        await setPairing(msg.email, msg.token);
        await log('info', 'paired', { email: msg.email });
        reportCheckin('paired');
        sendResponse({ ok: true, paired: true, email: msg.email });
        return;
      }
      if (msg && msg.type === 'linalysis-ssi-result') {
        sendResponse(await postSSI(msg.data));
        return;
      }
      if (msg && msg.type === 'linalysis-metrics-result') {
        sendResponse(await postMetrics(msg.page, msg.data));
        return;
      }
      if (msg && msg.type === 'get-status') {
        const p = await getPairing();
        const s = await chrome.storage.local.get('syncLog');
        sendResponse(Object.assign({}, p, { version: extVersion(), log: s.syncLog || [] }));
        return;
      }
      if (msg && msg.type === 'sync-now') {
        sendResponse(await runSync('manual'));
        return;
      }
      sendResponse({ ok: false, error: 'unknown_message' });
    } catch (e) {
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();
  return true;
});

// ─── Auto-pair from any open linalysis.net tab ──────────────────────
async function autoPairFromLinalysisTab() {
  const tabs = await chrome.tabs.query({ url: ['https://linalysis.net/*', 'https://www.linalysis.net/*'] });
  if (!tabs || tabs.length === 0) {
    await log('warn', 'auto_pair:no_tab');
    return { ok: false, step: 'no_linalysis_tab' };
  }
  let lastErr = null;
  for (const tab of tabs) {
    try {
      const r = await sendMessageAwait(tab.id, { type: 'linalysis-trigger-pair' });
      if (r && r.ok) {
        await setPairing(r.email, r.token);
        await log('info', 'auto_pair:ok', { email: r.email, via: 'content_script' });
        return r;
      }
      lastErr = r || { ok: false, step: 'no_response' };
    } catch (e) {
      lastErr = { ok: false, step: 'sendMessage', error: String(e.message || e) };
    }
  }
  await log('error', 'auto_pair:fail', lastErr || { error: 'no_response' });
  return lastErr || { ok: false, step: 'no_response' };
}

function sendMessageAwait(tabId, msg) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, (resp) => {
        const le = chrome.runtime.lastError;
        if (le) { reject(new Error(le.message)); return; }
        resolve(resp);
      });
    } catch (e) { reject(e); }
  });
}

// ─── Keep-alive ─────────────────────────────────────────────────────
let _keepAliveTimer = null;
function startKeepAlive() {
  if (_keepAliveTimer) return;
  const ping = () => { try { chrome.runtime.getPlatformInfo(() => {}); } catch (e) {} };
  ping();
  _keepAliveTimer = setInterval(ping, 20000);
}
function stopKeepAlive() { if (_keepAliveTimer) { clearInterval(_keepAliveTimer); _keepAliveTimer = null; } }

async function noteDataCaptured() { try { await chrome.storage.local.set({ lastDataAt: Date.now() }); } catch (e) {} }

// ─── Collection window ──────────────────────────────────────────────
// The whole reason v0.2.5 collected nothing: pages were opened as INACTIVE tabs, so
// document.visibilityState was "hidden" and LinkedIn's Sales Navigator SPA never rendered. A page
// that is the active tab of a separate (unfocused) window is "visible" to the Page Visibility API,
// so the app hydrates normally — without stealing the user's focus.
const scrapeWin = { winId: null, tabId: null, prevWinId: null };

async function openCollectionWindow() {
  try { const w = await chrome.windows.getLastFocused(); scrapeWin.prevWinId = w && w.id; } catch (e) { scrapeWin.prevWinId = null; }
  const win = await chrome.windows.create({
    url: 'about:blank', focused: false, type: 'normal',
    width: 1280, height: 900, top: 0, left: 0,
  });
  scrapeWin.winId = win.id;
  scrapeWin.tabId = win.tabs && win.tabs[0] ? win.tabs[0].id : null;
  await restoreUserFocus();
  await log('info', 'window:opened', { winId: scrapeWin.winId, tabId: scrapeWin.tabId });
  return scrapeWin.tabId;
}

async function restoreUserFocus() {
  if (!scrapeWin.prevWinId) return;
  try { await chrome.windows.update(scrapeWin.prevWinId, { focused: true }); } catch (e) {}
}

async function focusCollectionWindow() {
  if (!scrapeWin.winId) return;
  try { await chrome.windows.update(scrapeWin.winId, { focused: true, state: 'normal' }); } catch (e) {}
}

async function closeCollectionWindow() {
  if (scrapeWin.winId == null) return;
  try { await chrome.windows.remove(scrapeWin.winId); } catch (e) {}
  scrapeWin.winId = null; scrapeWin.tabId = null;
  await restoreUserFocus();
}

// Ask the page what state it's actually in. Cheaper and more honest than assuming a fixed wait was
// long enough — this is how we know whether to escalate to a focused reload.
async function probeTab(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        vis: document.visibilityState,
        len: ((document.body && document.body.innerText) || '').length,
        url: location.href,
        title: (document.title || '').slice(0, 120),
      }),
    });
    return (res && res.result) || null;
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

function navigateAndWait(tabId, url, ms) {
  return chrome.tabs.update(tabId, { url }).then(() => sleep(ms));
}

// Load `url` in the collection tab and make sure it actually rendered. Returns the probe.
async function loadRendered(tabId, url, key, expectUrlRe) {
  await navigateAndWait(tabId, url, 9000);
  let probe = await probeTab(tabId);
  const bad = (p) => !p || p.error || p.len < MIN_RENDERED_TEXT || (expectUrlRe && !expectUrlRe.test(p.url || ''));

  if (bad(probe)) {
    // Escalate: bring the collection window forward so the page is unambiguously visible, reload,
    // let it hydrate, then hand focus straight back to the user.
    await log('warn', 'page:empty_retry_focused', { key, probe });
    await focusCollectionWindow();
    try { await chrome.tabs.reload(tabId); } catch (e) {}
    await sleep(12000);
    probe = await probeTab(tabId);
    await restoreUserFocus();
  }
  return probe;
}

// ─── Sync ───────────────────────────────────────────────────────────
async function runSync(trigger) {
  if (runSync._running) {
    await log('warn', 'sync:already_running', { trigger });
    return { ok: false, error: 'already_running' };
  }
  runSync._running = true;
  startKeepAlive();
  try {
    await log('info', 'sync:start', { trigger, version: extVersion() });
    let p = await getPairing();
    if (!p.token) {
      const pair = await autoPairFromLinalysisTab();
      if (!pair.ok) {
        const msg = pair.step === 'no_linalysis_tab'
          ? 'Open linalysis.net and sign in — pairing needs a linalysis.net tab open.'
          : (pair.step + ': ' + (pair.error || 'unknown'));
        await recordSync('not_paired', msg);
        return { ok: false, error: 'not_paired', pair_detail: pair };
      }
      p = await getPairing();
    }

    _reported = {};
    await reportCollect({ event: 'start', trigger });
    await reportStatus('running', 'Collecting LinkedIn metrics (' + trigger + ')');

    const tabId = await openCollectionWindow();
    if (!tabId) {
      await recordSync('error', 'Could not open the collection window.');
      await reportStatus('error', 'Could not open the collection window.');
      await reportCollect({ page: 'ssi', ok: false, error: 'could not open collection window' });
      return { ok: false, error: 'no_window' };
    }

    try {
      await collectSSI(tabId);
      await collectMetrics(tabId, trigger);
    } finally {
      await closeCollectionWindow();
    }

    await reportCollect({ event: 'finish', trigger });
    await log('info', 'sync:done', { trigger });
    return { ok: true, triggered: trigger };
  } finally {
    stopKeepAlive();
    runSync._running = false;
  }
}

// SSI is best-effort: a failure here never aborts the growth + company collection below.
async function collectSSI(tabId) {
  try {
    const probe = await loadRendered(tabId, SSI_URL, 'ssi', /\/sales\/ssi/);
    _probes.ssi = probe;

    if (!probe || probe.error || !/\/sales\/ssi/.test(probe.url || '')) {
      const landed = (probe && probe.url) || 'unknown';
      const why = /\/sales\/login/.test(landed)
        ? 'LinkedIn sent the SSI page to the Sales Navigator sign-in screen — the Sales Navigator session has expired. Sign in to Sales Navigator once in this Chrome profile.'
        : 'The SSI page did not load (landed on ' + landed.slice(0, 90) + ').';
      await recordSync('ssi_unavailable', why);
      await log('warn', 'ssi:not_available', { probe });
      await reportCollect({ page: 'ssi', ok: false, error: why, url: landed, text_len: probe ? probe.len : null, visible: probe ? probe.vis === 'visible' : null });
      await reportStatus('running', 'SSI unavailable — continuing with growth + company metrics.');
      return;
    }
    if (probe.len < MIN_RENDERED_TEXT) {
      const why = 'The SSI page loaded but never rendered (' + probe.len + ' characters of text). Sales Navigator does not render in a hidden tab.';
      await recordSync('ssi_empty', why);
      await reportCollect({ page: 'ssi', ok: false, error: why, url: probe.url, text_len: probe.len, visible: probe.vis === 'visible', sample: await samplePage(tabId) });
      await reportStatus('running', 'SSI page did not render — continuing with growth + company metrics.');
      return;
    }

    try {
      await chrome.tabs.sendMessage(tabId, { type: 'linalysis-scrape-ssi' });
    } catch (e) {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content-ssi.js'] });
        await sleep(2500);
        await chrome.tabs.sendMessage(tabId, { type: 'linalysis-scrape-ssi' });
      } catch (e2) {
        const why = 'SSI scraper could not run: ' + String(e2.message || e2);
        await recordSync('ssi_skipped', why);
        await log('warn', 'sync:ssi_skipped', { error: String(e2.message || e2) });
        await reportCollect({ page: 'ssi', ok: false, error: why, url: probe.url, text_len: probe.len, visible: probe.vis === 'visible' });
      }
    }
    // Let the content script's 3-attempt loop finish and post before we navigate away.
    await sleep(22000);
    if (!_reported.ssi) {
      const after = await probeTab(tabId);
      const landedNow = (after && after.url) || probe.url;
      await log('warn', 'ssi:no_report', { probe: after });
      await reportCollect({
        page: 'ssi', ok: false,
        error: signedOutReason(landedNow, true)
          || 'The SSI scraper never reported. The tab ended up on ' + String(landedNow).slice(0, 120) + '.',
        url: landedNow, text_len: after ? after.len : null,
        visible: after ? after.vis === 'visible' : null,
        sample: await samplePage(tabId),
      });
    }
  } catch (e) {
    await log('error', 'ssi:unexpected', { error: String(e.message || e) });
    await reportCollect({ page: 'ssi', ok: false, error: String(e.message || e) });
  }
}

async function collectMetrics(tabId, trigger) {
  const pages = METRIC_PAGES.slice();
  try {
    const cs = await chrome.storage.local.get('linalysis_company_id');
    const cid = cs && cs.linalysis_company_id;
    if (cid) {
      pages.push(
        { key: 'co_followers', url: 'https://www.linkedin.com/company/' + cid + '/admin/analytics/followers/' },
        { key: 'co_visitors',  url: 'https://www.linkedin.com/company/' + cid + '/admin/analytics/visitors/' },
        { key: 'co_updates',   url: 'https://www.linkedin.com/company/' + cid + '/admin/analytics/updates/' },
        { key: 'co_search',    url: 'https://www.linkedin.com/company/' + cid + '/admin/analytics/search-appearances/' }
      );
    } else {
      await log('info', 'company:skipped_no_id');
    }
  } catch (e) {}

  await log('info', 'metrics:start', { trigger, pages: pages.length });
  for (const page of pages) {
    try {
      const probe = await loadRendered(tabId, page.url, page.key);
      _probes[page.key] = probe;

      const landed = (probe && probe.url) || page.url;
      const outReason = signedOutReason(landed, false);
      if (outReason) {
        // Not a scraper problem — say so plainly instead of blaming a moved selector.
        await log('warn', 'metrics:signed_out', { key: page.key, probe });
        await reportCollect({ page: page.key, ok: false, error: outReason, url: landed, text_len: probe ? probe.len : null, visible: probe ? probe.vis === 'visible' : null });
        continue;
      }

      if (!probe || probe.error || probe.len < MIN_RENDERED_TEXT) {
        const why = probe && probe.error
          ? 'Could not read the page: ' + probe.error
          : 'Page did not render (' + ((probe && probe.len) || 0) + ' characters of text) — LinkedIn may have signed this browser out.';
        await log('error', 'metrics:not_rendered', { key: page.key, probe });
        await reportCollect({ page: page.key, ok: false, error: why, url: landed, text_len: probe ? probe.len : null, visible: probe ? probe.vis === 'visible' : null, sample: await samplePage(tabId) });
        continue;
      }

      try {
        await chrome.tabs.sendMessage(tabId, { type: 'linalysis-scrape-metrics' });
      } catch (e) {
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: ['content-metrics.js'] });
          await sleep(2500);
          await chrome.tabs.sendMessage(tabId, { type: 'linalysis-scrape-metrics' });
        } catch (e2) {
          const why = 'Scraper could not run on this page: ' + String(e2.message || e2);
          await log('error', 'metrics:scrape_failed', { key: page.key, error: String(e2.message || e2) });
          await reportCollect({ page: page.key, ok: false, error: why, url: probe.url, text_len: probe.len, visible: probe.vis === 'visible' });
          continue;
        }
      }
      // The invitations page self-scrolls its list to load a full day of sends — give it longer.
      await sleep(page.key === 'invitations' ? 30000 : 11000);

      // NOTHING MAY FAIL SILENTLY. If the content script never reported for this page — which is what
      // happens whenever it cannot recognise the URL it ended up on — file the receipt ourselves, with
      // the page text attached so the cause is readable in tomorrow's report.
      if (!_reported[page.key]) {
        const after = await probeTab(tabId);
        const landedNow = (after && after.url) || landed;
        const why = signedOutReason(landedNow, false)
          || 'The scraper never reported for this page. It ended up on ' + String(landedNow).slice(0, 120)
             + ' — if that is not the expected URL, LinkedIn redirected the tab.';
        await log('warn', 'metrics:no_report', { key: page.key, probe: after });
        await reportCollect({
          page: page.key, ok: false, error: why, url: landedNow,
          text_len: after ? after.len : null, visible: after ? after.vis === 'visible' : null,
          sample: await samplePage(tabId),
        });
      }
    } catch (e) {
      await log('error', 'metrics:page_failed', { key: page.key, error: String(e.message || e) });
      await reportCollect({ page: page.key, ok: false, error: String(e.message || e), url: page.url });
    }
  }
  await log('info', 'metrics:done', { trigger });
}

// ─── Posting ────────────────────────────────────────────────────────
async function postMetrics(page, data) {
  const probe = _probes[page] || null;
  const p = await getPairing();
  if (!p.token || !p.email) return { ok: false, error: 'not_paired' };
  if (!data || typeof data !== 'object') {
    await reportCollect({ page, ok: false, error: 'Scraper returned nothing.' });
    return { ok: false, error: 'no_data' };
  }
  const today = new Date().toISOString().slice(0, 10);
  const row = Object.assign({ 'Date': today }, data);
  const valueKeys = Object.keys(data).filter(k => k[0] !== '_');
  if (valueKeys.length === 0) {
    await log('warn', 'metrics:empty', { page, diag: data._diag || null });
    await reportCollect({
      page, ok: false,
      error: 'Page rendered but no values matched — LinkedIn likely moved this metric in the DOM.',
      url: (probe && probe.url) || (data._diag && data._diag.url) || null,
      text_len: probe ? probe.len : (data._diag ? data._diag.text_len : null),
      visible: probe ? probe.vis === 'visible' : null,
      sample: (data._diag && data._diag.sample) || null,
    });
    return { ok: false, error: 'no_values', page };
  }
  try {
    const cid = await cachedCompanyId();
    const payload = cid ? { rows: [row], company_id: cid } : { rows: [row] };
    const resp = await fetch(API_BASE + '/api/ingest/linkedin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.token },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const body = await resp.text();
      await log('error', 'metrics:http', { page, status: resp.status, body: body.slice(0, 160) });
      await reportCollect({ page, ok: false, error: 'Linalysis rejected the data (HTTP ' + resp.status + ').', url: probe && probe.url });
      return { ok: false, error: 'api_error', http_status: resp.status };
    }
    const json = await resp.json();
    await log('info', 'metrics:ok', { page, keys: valueKeys, inserted: json.inserted, updated: json.updated });
    await noteDataCaptured();
    await reportCollect({
      page, ok: true, values: valueKeys,
      url: probe && probe.url, text_len: probe && probe.len,
      visible: probe ? probe.vis === 'visible' : null,
      // Present only when the page's PRIMARY field did not resolve — a partial capture is still a
      // bug to fix, and without the sample it needs a live browser to diagnose.
      sample: (data._diag && data._diag.sample) || null,
    });
    return { ok: true, page, captured: valueKeys, response: json };
  } catch (e) {
    await log('error', 'metrics:network', { page, error: String(e.message || e) });
    await reportCollect({ page, ok: false, error: 'Network error posting to Linalysis: ' + String(e.message || e) });
    return { ok: false, error: 'network', message: String(e.message || e) };
  }
}

async function postSSI(data) {
  const probe = _probes.ssi || null;
  const p = await getPairing();
  if (!p.token || !p.email) return { ok: false, error: 'not_paired' };
  const today = new Date().toISOString().slice(0, 10);
  const row = Object.assign({ 'Date': today }, data);

  const subKeys = ['ssi_brand', 'ssi_prospecting', 'ssi_insights', 'ssi_relationships'];
  const captured = subKeys.filter(k => data && data[k] != null);
  const capturedCount = captured.length;
  const diag = (data && data._diag) || null;

  try {
    const resp = await fetch(API_BASE + '/api/ingest/linkedin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.token },
      body: JSON.stringify({ rows: [row] }),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      await recordSync('api_error', 'HTTP ' + resp.status + ': ' + errBody.slice(0, 200));
      await log('error', 'ingest:http', { status: resp.status, body: errBody.slice(0, 200) });
      await reportStatus('error', 'Server rejected the data (HTTP ' + resp.status + ')', { captured_count: capturedCount, diag });
      await reportCollect({ page: 'ssi', ok: false, error: 'Linalysis rejected the SSI data (HTTP ' + resp.status + ').' });
      return { ok: false, error: 'api_error', http_status: resp.status };
    }
    const json = await resp.json();
    if (capturedCount === 4) {
      await noteDataCaptured();
      await recordSync('ok', 'Captured all 4 SSI sub-scores');
      await log('info', 'ingest:ok', { inserted: json.inserted, updated: json.updated, captured: capturedCount });
      await reportStatus('done', 'Captured all 4 SSI sub-scores', { captured_count: capturedCount, diag });
      await reportCollect({
        page: 'ssi', ok: true, values: ['SSI'].concat(captured),
        url: probe && probe.url, text_len: probe && probe.len,
        visible: probe ? probe.vis === 'visible' : null,
        // All 4 sub-scores but a missing Industry/Network rank is exactly David's case — keep the
        // sample so the locale-specific rank layout can be fixed from the report.
        sample: (diag && diag.sample) || null,
      });
    } else {
      const why = diag && diag.has_signin ? 'the browser is not signed in to LinkedIn'
                : diag && !diag.has_establish ? 'the SSI page did not show the four sub-scores (layout change, or the page never rendered)'
                : 'LinkedIn returned only ' + capturedCount + ' of 4 sub-scores';
      await recordSync('partial', 'Only ' + capturedCount + '/4 sub-scores — ' + why);
      await log('warn', 'ingest:partial', { captured: capturedCount, diag });
      await reportStatus('error', 'Only ' + capturedCount + '/4 SSI sub-scores captured — ' + why, { captured_count: capturedCount, diag });
      await reportCollect({
        page: 'ssi', ok: false, values: captured,
        error: 'Only ' + capturedCount + ' of 4 SSI sub-scores captured — ' + why + '.',
        url: (probe && probe.url) || (diag && diag.url), text_len: probe ? probe.len : (diag && diag.text_len),
        visible: probe ? probe.vis === 'visible' : null,
        sample: (diag && diag.sample) || null,
      });
    }
    return { ok: true, response: json, captured_count: capturedCount };
  } catch (e) {
    await recordSync('network', String(e.message || e));
    await log('error', 'ingest:network', { error: String(e.message || e) });
    await reportStatus('error', 'Network error posting to Linalysis: ' + String(e.message || e), { captured_count: capturedCount, diag });
    await reportCollect({ page: 'ssi', ok: false, error: 'Network error posting to Linalysis: ' + String(e.message || e) });
    return { ok: false, error: 'network', message: String(e.message || e) };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
