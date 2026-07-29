// Linalysis — analytics utilities. Reads window.LINALYSIS_DATA. Pure functions.
// All of this runs in the browser on the baked-in CSV (no backend required).

(function () {
  const D = window.LINALYSIS_DATA;
  if (!D) { window.Stats = {}; return; }

  // ─── Metric map — friendly names + accessor keys ────────────────────
  const METRICS = {
    connections:       { label: 'Connections',          key: 'connections',       higher_is_better: true  },
    views:             { label: 'Profile views',        key: 'views',             higher_is_better: true  },
    search_appearance: { label: 'Search appearances',   key: 'search_appearance', higher_is_better: true  },
    invitations:       { label: 'Pending invitations',  key: 'invitations',       higher_is_better: false },
    ssi:               { label: 'SSI overall',          key: 'ssi',               higher_is_better: true  },
    ssi_industry:      { label: 'SSI Industry rank',    key: 'ssi_industry',      higher_is_better: false },
    ssi_network:       { label: 'SSI Network rank',     key: 'ssi_network',       higher_is_better: false },
    co_followers:      { label: 'Company followers',    key: 'co_followers',      higher_is_better: true  },
    co_visitors:       { label: 'Company visitors',     key: 'co_visitors',       higher_is_better: true  },
    co_search:         { label: 'Company search app.',  key: 'co_search',         higher_is_better: true  },
    co_new_followers:  { label: 'New company followers',key: 'co_new_followers',  higher_is_better: true  },
    co_impressions:    { label: 'Company impressions',  key: 'co_impressions',    higher_is_better: true  },
    co_clicks:         { label: 'Company clicks',       key: 'co_clicks',         higher_is_better: true  },
  };

  // Data shape is { dates, metrics: { connections, views, ... }, meta, insights }
  // (older drafts had keys at the top level — try both).
  function series(key) { return (D.metrics && D.metrics[key]) || D[key] || []; }
  function dates() { return D.dates || []; }
  function lastIndex() { return dates().length - 1; }
  function latest(key) { const s = series(key); return s.length ? s[s.length-1] : null; }
  function firstDate() { return dates()[0]; }
  function lastDate() { return dates()[dates().length - 1]; }

  // Find closest index at/before a given YYYY-MM-DD
  function indexAtOrBefore(yyyy_mm_dd) {
    const ds = dates();
    let lo = 0, hi = ds.length - 1, res = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ds[mid] <= yyyy_mm_dd) { res = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return res;
  }

  function dateOffset(ymd, days) {
    const d = new Date(ymd + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ─── Range slicers ──────────────────────────────────────────────────
  function rangeIndices(days) {
    const ds = dates();
    if (days === 'all' || days == null) return [0, ds.length - 1];
    const end = ds.length - 1;
    const cutoff = dateOffset(ds[end], -days);
    const start = Math.max(0, indexAtOrBefore(cutoff));
    return [start, end];
  }

  function sliceSeries(key, days) {
    const [a, b] = rangeIndices(days);
    return { dates: dates().slice(a, b+1), values: series(key).slice(a, b+1) };
  }

  // ─── Core analytics ─────────────────────────────────────────────────
  function delta(key, days) {
    const s = series(key);
    if (!s.length) return null;
    const [a, b] = rangeIndices(days);
    return { start: s[a], end: s[b], change: s[b] - s[a], pct: s[a] ? ((s[b] - s[a]) / s[a]) * 100 : 0 };
  }

  function growthVelocity(key, windowDays = 30) {
    const s = series(key);
    if (s.length < 2) return 0;
    // Use the last non-null value and the earliest non-null value within the window.
    // Treating a null baseline as 0 (the old behaviour) produced absurd rates on sparse data.
    let b = -1;
    for (let i = s.length - 1; i >= 0; i--) { if (s[i] != null) { b = i; break; } }
    if (b <= 0) return 0;
    const lo = Math.max(0, b - windowDays);
    let a = -1;
    for (let i = lo; i < b; i++) { if (s[i] != null) { a = i; break; } }
    if (a < 0 || a === b) return 0;
    return (s[b] - s[a]) / (b - a);  // units per real day span
  }

  function rollingAverage(values, window = 7) {
    const out = new Array(values.length).fill(null);
    let sum = 0; let count = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i]; count++;
      if (i >= window) { sum -= values[i - window]; count = window; }
      out[i] = sum / count;
    }
    return out;
  }

  /** Best-ever records */
  function bestEver(key) {
    const s = series(key);
    const ds = dates();
    let maxV = -Infinity, maxI = -1, minV = Infinity, minI = -1;
    for (let i = 0; i < s.length; i++) {
      if (s[i] > maxV) { maxV = s[i]; maxI = i; }
      if (s[i] < minV && s[i] !== 0) { minV = s[i]; minI = i; }
    }
    return { max: { value: maxV, date: ds[maxI] }, min: { value: minV, date: ds[minI] } };
  }

  /** Biggest single-day jump (up) in a metric — great for "best day ever". */
  function biggestJump(key) {
    const s = series(key);
    const ds = dates();
    let best = 0, bestI = 0;
    for (let i = 1; i < s.length; i++) {
      const d = s[i] - s[i-1];
      if (d > best) { best = d; bestI = i; }
    }
    return { date: ds[bestI], delta: best, prev: s[bestI-1], now: s[bestI] };
  }

  /** Longest uninterrupted streak of non-decreasing values. */
  function longestStreak(key) {
    const s = series(key);
    const ds = dates();
    let current = 1, currentStart = 0, longest = 1, longestStart = 0, longestEnd = 0;
    for (let i = 1; i < s.length; i++) {
      if (s[i] >= s[i-1]) {
        current++;
        if (current > longest) { longest = current; longestStart = currentStart; longestEnd = i; }
      } else {
        current = 1; currentStart = i;
      }
    }
    return { days: longest, from: ds[longestStart], to: ds[longestEnd] };
  }

  /** Current streak ending today. */
  function currentStreak(key) {
    const s = series(key);
    const ds = dates();
    let days = 1;
    for (let i = s.length - 1; i > 0; i--) {
      if (s[i] >= s[i-1]) days++;
      else break;
    }
    return { days, from: ds[Math.max(0, s.length - days)], to: ds[ds.length - 1] };
  }

  /** Milestones crossed for a metric (e.g. every 1K connections). */
  function milestonesCrossed(key, step) {
    const s = series(key);
    const ds = dates();
    const out = [];
    let nextTarget = Math.ceil(s[0] / step) * step;
    for (let i = 1; i < s.length; i++) {
      while (s[i] >= nextTarget) {
        out.push({ date: ds[i], value: nextTarget });
        nextTarget += step;
      }
    }
    return out;
  }

  /** Year-over-year comparison: value today vs value 365 days ago, plus the deltas. */
  function yoy(key) {
    const s = series(key);
    const ds = dates();
    if (s.length < 366) return null;
    const todayIdx = s.length - 1;
    const yearAgoDate = dateOffset(ds[todayIdx], -365);
    const yearAgoIdx = indexAtOrBefore(yearAgoDate);
    if (yearAgoIdx < 0) return null;
    const twoYearAgoIdx = indexAtOrBefore(dateOffset(ds[todayIdx], -730));
    return {
      today:   { date: ds[todayIdx], value: s[todayIdx] },
      year_ago: { date: ds[yearAgoIdx], value: s[yearAgoIdx] },
      delta:    s[todayIdx] - s[yearAgoIdx],
      pct:      s[yearAgoIdx] ? ((s[todayIdx] - s[yearAgoIdx]) / s[yearAgoIdx]) * 100 : 0,
      two_years_ago: twoYearAgoIdx >= 0 ? { date: ds[twoYearAgoIdx], value: s[twoYearAgoIdx] } : null,
    };
  }

  /** Day-of-week breakdown — average daily delta by weekday. */
  function dayOfWeekBreakdown(key) {
    const s = series(key);
    const ds = dates();
    const sums = [0,0,0,0,0,0,0];
    const counts = [0,0,0,0,0,0,0];
    for (let i = 1; i < s.length; i++) {
      const dow = new Date(ds[i] + 'T00:00:00Z').getUTCDay();
      const diff = s[i] - s[i-1];
      sums[dow] += diff;
      counts[dow] += 1;
    }
    const avg = sums.map((s, i) => counts[i] ? s / counts[i] : 0);
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return avg.map((v, i) => ({ day: names[i], avg_delta: v }));
  }

  /** Linear projection: where will this metric be in N days at the current 30-day pace? */
  function projection(key, targetDays = [30, 90, 180, 365]) {
    const s = series(key);
    const current = s[s.length - 1];
    const v = growthVelocity(key, 30);
    return targetDays.map(d => ({ in_days: d, value: Math.round(current + v * d) }));
  }

  /** ETA to hit a target value at current velocity. Returns days (int) or null if never. */
  function etaTo(key, target) {
    const s = series(key);
    const cur = s[s.length - 1];
    const v = growthVelocity(key, 30);
    if (v <= 0 && target > cur) return null;
    if (cur >= target) return 0;
    return Math.ceil((target - cur) / v);
  }

  /** Anomaly detection: z-score > threshold on daily deltas. */
  function anomalies(key, threshold = 2.5, lookbackDays = 180) {
    const s = series(key);
    const ds = dates();
    const [a, b] = rangeIndices(lookbackDays);
    const deltas = [];
    for (let i = Math.max(1, a); i <= b; i++) deltas.push(s[i] - s[i-1]);
    if (deltas.length === 0) return [];
    const mean = deltas.reduce((x,y)=>x+y, 0) / deltas.length;
    const variance = deltas.reduce((x,y) => x + (y - mean) ** 2, 0) / deltas.length;
    const sd = Math.sqrt(variance);
    if (sd === 0) return [];
    const flagged = [];
    for (let i = Math.max(1, a); i <= b; i++) {
      const d = s[i] - s[i-1];
      const z = (d - mean) / sd;
      if (Math.abs(z) >= threshold) {
        flagged.push({ date: ds[i], delta: d, z: Math.round(z*10)/10, direction: d > 0 ? 'up' : 'down' });
      }
    }
    return flagged;
  }

  /** "Best week" — 7-day rolling delta peak. */
  function bestWeek(key) {
    const s = series(key);
    const ds = dates();
    if (s.length < 8) return null;
    let best = 0, bestEnd = 7;
    for (let i = 7; i < s.length; i++) {
      const d = s[i] - s[i-7];
      if (d > best) { best = d; bestEnd = i; }
    }
    return { from: ds[bestEnd - 7], to: ds[bestEnd], delta: best };
  }

  /** Monthly totals (useful for stacked bars). */
  function monthlyAggregates(key, aggregator = 'latest') {
    const s = series(key);
    const ds = dates();
    const buckets = {};
    for (let i = 0; i < s.length; i++) {
      const ym = ds[i].slice(0, 7);
      if (!buckets[ym]) buckets[ym] = { first: s[i], last: s[i], sum: 0, count: 0 };
      buckets[ym].last = s[i];
      buckets[ym].sum += s[i];
      buckets[ym].count += 1;
    }
    return Object.entries(buckets).map(([ym, b]) => ({
      month: ym,
      value: aggregator === 'delta' ? (b.last - b.first) : aggregator === 'avg' ? (b.sum/b.count) : b.last,
    }));
  }

  // Public API
  window.Stats = {
    METRICS,
    series, dates, latest, firstDate, lastDate,
    indexAtOrBefore, rangeIndices, sliceSeries,
    delta, growthVelocity, rollingAverage,
    bestEver, biggestJump, longestStreak, currentStreak,
    milestonesCrossed, yoy, dayOfWeekBreakdown,
    projection, etaTo, anomalies, bestWeek, monthlyAggregates,
  };
})();
