// Linalysis Intelligence engine — Cloudflare Workers AI (v2.0, 2026-10-05).
// Replaces the old rule-based "AI" engine. Every narrative, recommendation and tip
// is now written by Cloudflare Workers AI through /api/intelligence. No Anthropic,
// no OpenAI, no canned text.
//
// Same public API as before so the dashboard and reports keep working:
//   AI.recap()            -> { headline, paragraphs[3], generated_at, streak, engine }
//   AI.recommendations(n) -> [{ title, body, priority, tags }]
//   AI.dailyTip()         -> { title, body }
//   AI.anomalyAlerts(n)   -> statistical outliers (z-score maths on your data, not AI)
// New:
//   AI.ask(mode, messages) -> markdown text ('analyze' | 'suggest' | 'chat')
//   AI.refresh()           -> re-runs the Workers AI insights
//   AI.ready               -> promise resolved when insights are available
// Results are cached per user + data date, so each day's data is analysed once.

(function () {
  const S = window.Stats;
  const D = window.LINALYSIS_DATA;
  const ENDPOINT = '/api/intelligence';
  const CACHE = 'linalysis_intel_v2';
  const hasData = !!(S && S.dates && D && D.dates && D.dates.length);

  const fmt = (n) => typeof n === 'number' ? n.toLocaleString('en-US') : n;
  const dateStr = (ymd) => new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const r1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n);

  // ─── What the model sees: a compact summary of the user's own numbers ───
  function context() {
    if (!hasData) return { note: 'No data captured yet.' };
    const metrics = {};
    for (const key of Object.keys(S.METRICS || {})) {
      const latest = S.latest(key);
      if (latest == null) continue;
      const d = (n) => { const x = S.delta(key, n); return x ? { change: r1(x.change), pct: r1(x.pct) } : null; };
      metrics[key] = { label: S.METRICS[key].label, latest, d7: d(7), d30: d(30), d90: d(90),
        perDay30: r1(S.growthVelocity(key, 30)), higherIsBetter: S.METRICS[key].higher_is_better };
    }
    const ds = S.dates();
    const weekly = {};
    for (const key of ['connections', 'ssi', 'views', 'co_followers']) {
      const s = S.series(key); if (!s || !s.length) continue;
      const pts = [];
      for (let i = s.length - 1; i >= 0 && pts.length < 12; i -= 7) pts.unshift([ds[i], s[i]]);
      weekly[key] = pts;
    }
    return {
      user: (D.meta && D.meta.full_name) || null,
      dataFrom: ds[0], dataTo: ds[ds.length - 1], daysTracked: ds.length,
      connectionStreak: S.currentStreak('connections'),
      metrics, weekly,
      outliers: anomalyAlerts(60).map((a) => ({ date: a.date, metric: a.label, delta: a.delta, direction: a.direction })),
    };
  }

  function key() {
    const email = (D && D.meta && D.meta.owner_email) || localStorage.getItem('linalysis_user_email') || '';
    return email + '|' + (hasData ? S.dates()[S.dates().length - 1] : 'none');
  }
  function readCache() {
    try { const c = JSON.parse(localStorage.getItem(CACHE) || 'null'); return c && c.key === key() ? c : null; } catch (e) { return null; }
  }
  let cached = readCache();

  async function post(body) {
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: 'HTTP ' + r.status }));
    if (!r.ok || j.error) throw new Error(j.error || ('HTTP ' + r.status));
    return j;
  }

  async function ask(mode, messages) {
    const j = await post({ mode, app: 'Linalysis', data: context(), messages });
    return j.text;
  }

  let inflight = null;
  function refresh() {
    if (!hasData) return Promise.resolve(null);
    if (inflight) return inflight;
    inflight = post({ mode: 'insights', app: 'Linalysis', data: context() })
      .then((j) => {
        cached = { key: key(), at: new Date().toISOString(), model: j.model, data: j.insights };
        try { localStorage.setItem(CACHE, JSON.stringify(cached)); } catch (e) {}
        window.dispatchEvent(new CustomEvent('linalysis:intel', { detail: cached }));
        paintDashboard();
        return cached;
      })
      .catch((e) => { window.__intelError = e.message; paintDashboard(); window.dispatchEvent(new CustomEvent('linalysis:intel-error', { detail: e.message })); return null; })
      .finally(() => { inflight = null; });
    return inflight;
  }

  function recap() {
    const streak = hasData ? S.currentStreak('connections') : { days: 0, from: new Date().toISOString().slice(0, 10) };
    const c = cached && cached.data;
    const p = (c && Array.isArray(c.paragraphs)) ? c.paragraphs : [];
    return {
      headline: c ? c.headline : (window.__intelError ? 'Cloudflare AI is unavailable right now.' : '✦ Cloudflare AI is reading your data…'),
      paragraphs: [p[0] || '', p[1] || '', p[2] || ''],
      generated_at: cached ? cached.at : new Date().toISOString(),
      streak, engine: 'cloudflare-workers-ai', ready: !!c,
    };
  }

  function recommendations(n = 8) {
    const recs = (cached && cached.data && Array.isArray(cached.data.recommendations)) ? cached.data.recommendations : [];
    return recs.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0)).slice(0, n).map((r) => ({
      title: String(r.title || ''), body: String(r.body || ''),
      priority: Math.max(1, Math.min(9, Number(r.priority) || 5)), tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    }));
  }

  function dailyTip() {
    const t = cached && cached.data && cached.data.tip;
    if (t && t.title) return { title: String(t.title), body: String(t.body || '') };
    const r = recommendations(1)[0];
    return r ? { title: r.title, body: r.body } : { title: '✦ Cloudflare AI is reading your data…', body: '' };
  }

  // Statistical outliers (z-score on daily changes). Maths, not AI.
  function anomalyAlerts(lookbackDays = 60) {
    if (!hasData) return [];
    const out = [];
    for (const k of ['connections', 'ssi', 'views', 'co_followers', 'co_impressions']) {
      const a = S.anomalies(k, 2.8, lookbackDays);
      for (const x of a) {
        const label = (S.METRICS[k] && S.METRICS[k].label) || k;
        out.push({ metric: k, label, date: x.date, delta: x.delta, direction: x.direction,
          message: `${label} ${x.direction === 'up' ? 'jumped' : 'dropped'} ${fmt(Math.abs(x.delta))} on ${dateStr(x.date)} — ${Math.abs(x.z)}σ outlier.` });
      }
    }
    return out.sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 8);
  }

  // Dashboard "AI quick take" card: fill it once Workers AI answers.
  function paintDashboard() {
    const h = document.getElementById('qt-headline'), b = document.getElementById('qt-body');
    if (!h || !b) return;
    const r = recap();
    h.textContent = r.headline;
    b.textContent = r.paragraphs[0];
  }

  window.AI = { recap, recommendations, anomalyAlerts, dailyTip, context, ask, refresh,
    ready: cached ? Promise.resolve(cached) : refresh() };
  if (cached) document.addEventListener('DOMContentLoaded', paintDashboard);
})();
