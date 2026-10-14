// Linalysis — My Credits page (2026-10-13)
// Reads GET /api/data/credits (one row per day) and renders InMail usage, connections new vs removed,
// and invitations sent per day. RULE: no estimates — a value that was not read shows "—".
(function () {
  var CIRC = 345; // 2·π·55
  var WEEKLY_GUIDE = 100;
  var CONN_CAP = 30000;
  var PLAN_ALLOWANCE = [[/sales\s*nav/i, 50], [/recruiter\s*lite/i, 30], [/business/i, 15], [/career/i, 5]];
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return n == null || !isFinite(n) ? '—' : Number(n).toLocaleString('en-US'); };
  var signed = function (n) { return n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US'); };
  var num = function (v) { var n = (v === '' || v == null) ? NaN : Number(v); return isFinite(n) ? n : null; };
  var set = function (id, t) { var e = $(id); if (e) e.textContent = t; };

  function ring(id, pct, colorByLevel) {
    var el = $(id); if (!el) return;
    var p = Math.max(0, Math.min(100, pct || 0));
    el.setAttribute('stroke-dashoffset', String(CIRC - CIRC * p / 100));
    el.setAttribute('stroke-opacity', p > 0 ? '1' : '0');
    if (colorByLevel) { if (pct >= 90) el.setAttribute('stroke', '#cc1016'); else if (pct >= 70) el.setAttribute('stroke', '#b76b00'); }
  }
  function localDay(offsetDays) {
    var d = new Date(Date.now() - (offsetDays || 0) * 86400000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function shortDate(d) { var p = d.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1] - 1] + ' ' + (+p[2]); }

  function load() {
    var api = window.LinalysisAPI;
    if (!api) return Promise.reject(new Error('no api'));
    return api.get('/api/data/credits?range=120').then(function (j) { return (j && j.series) || []; });
  }

  function render(series) {
    var rows = series.slice().sort(function (a, b) { return a.captured_at < b.captured_at ? -1 : 1; });
    var byDate = {}; rows.forEach(function (r) { byDate[r.captured_at] = r; });
    function latest(f) { for (var i = rows.length - 1; i >= 0; i--) { var v = rows[i][f]; if (v != null && v !== '') return { v: v, d: rows[i].captured_at }; } return null; }
    var anyNew = rows.some(function (r) { return num(r.connections_new) != null || num(r.invitations_sent_day) != null; });
    if (!anyNew) {
      var b = $('cred-banner');
      b.innerHTML = '<strong>Waiting for the first reading.</strong> New connections, removals and invitations sent per day are read by Linalysis extension <strong>0.3.6</strong> or later. They appear here after its next daily sync.';
      b.style.display = 'block';
    }

    // ─── InMail ───────────────────────────────────────────────
    var bal = latest('inmail_credits');
    var allowR = latest('inmail_allowance');
    var plan = latest('premium_plan');
    var allowance = allowR ? num(allowR.v) : null;
    if (allowance == null && plan) PLAN_ALLOWANCE.forEach(function (p) { if (allowance == null && p[0].test(plan.v)) allowance = p[1]; });
    if (bal) {
      var left = num(bal.v);
      set('inmail-left', fmt(left));
      set('inmail-asof', shortDate(bal.d));
      if (allowance) {
        set('inmail-allow', fmt(allowance) + ((latest('inmail_source') || {}).v === 'sales_navigator' ? ' · Sales Navigator' : ''));
        if (left <= allowance) {
          var used = allowance - left, pct = Math.round(used / allowance * 100);
          set('inmail-pct', pct + '%'); set('inmail-used', fmt(used) + ' of ' + fmt(allowance));
          ring('inmail-ring', pct, true);
        } else {
          set('inmail-pct', '0%'); set('inmail-pct-sub', 'used · ' + fmt(left - allowance) + ' banked');
          set('inmail-used', '0 (rolled-over credits in hand)'); ring('inmail-ring', 0);
        }
      } else {
        set('inmail-allow', 'unknown plan'); set('inmail-pct', '—');
      }
      // Sent in the last 30 days = every day-to-day drop in the balance (rises are grants/refunds).
      var cutoff = localDay(30), prev = null, sent = 0, pairs = 0;
      rows.forEach(function (r) {
        var v = num(r.inmail_credits); if (v == null) return;
        if (prev != null && r.captured_at >= cutoff) { pairs++; if (v < prev) sent += prev - v; }
        prev = v;
      });
      set('inmail-30', pairs ? fmt(sent) + (pairs < 20 ? ' (' + (pairs + 1) + ' readings)' : '') : 'needs 2 readings');
    } else {
      set('inmail-left', 'not read yet');
      $('inmail-note').innerHTML = '<strong>Not read yet.</strong> The balance is read from Sales Navigator (or LinkedIn Premium) by extension 0.3.6 at its next daily sync. Nothing is estimated.';
    }

    // ─── Connections ─────────────────────────────────────────
    var totals = rows.filter(function (r) { var n = num(r.connections); return n != null && n > 0; });
    var newOf = function (d) { var r = byDate[d]; return r ? num(r.connections_new) : null; };
    // Removed for reading i: exact when the extension measured the window, else derived from the
    // per-day "new" counts between the two readings (≈ because readings are taken mid-morning).
    function removedAt(i) {
      var cur = totals[i], prv = totals[i - 1]; if (!prv) return null;
      var net = num(cur.connections) - num(prv.connections);
      var exactR = num(cur.connections_removed), exactA = num(cur.connections_added_window);
      if (exactR != null && exactA != null) return { added: exactA, removed: exactR, net: net, exact: true, from: prv.captured_at };
      var added = 0, d = prv.captured_at, ok = true;
      while (true) {
        var dt = new Date(d + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() + 1); d = dt.toISOString().slice(0, 10);
        if (d > cur.captured_at) break;
        var n = newOf(d); if (n == null) { ok = false; break; } added += n;
      }
      if (!ok) return { added: null, removed: null, net: net, exact: false, from: prv.captured_at };
      return { added: added, removed: Math.max(0, added - net), net: net, exact: false, from: prv.captured_at };
    }
    if (totals.length) {
      var last = totals[totals.length - 1], tot = num(last.connections);
      set('conn-total', fmt(tot));
      set('conn-room', fmt(Math.max(0, CONN_CAP - tot)));
      var w = totals.length > 1 ? removedAt(totals.length - 1) : null;
      if (w) {
        $('conn-cmp').innerHTML = '<b>' + fmt(num(totals[totals.length - 2].connections)) + '</b> on ' + shortDate(w.from) +
          ' → <b>' + fmt(tot) + '</b> on ' + shortDate(last.captured_at);
        set('conn-net', signed(w.net));
        set('conn-new', w.added == null ? '—' : (w.exact ? '' : '') + '+' + fmt(w.added));
        set('conn-removed', w.removed == null ? '—' : '−' + fmt(w.removed));
      } else {
        $('conn-cmp').textContent = 'One reading so far (' + shortDate(last.captured_at) + ') — the comparison starts with the next one.';
      }
    } else {
      $('conn-cmp').textContent = 'Not read yet.';
    }
    var new7 = 0, have7 = 0; for (var k = 0; k < 7; k++) { var n7 = newOf(localDay(k)); if (n7 != null) { new7 += n7; have7++; } }
    set('conn-new7', have7 ? fmt(new7) : '—');
    var rem7 = 0, haveR = 0, cut7 = localDay(7);
    for (var i = 1; i < totals.length; i++) { if (totals[i].captured_at <= cut7) continue; var x = removedAt(i); if (x && x.removed != null) { rem7 += x.removed; haveR++; } }
    set('conn-rem7', haveR ? fmt(rem7) : '—');

    // 14-day chart: new up (green), removed down (red)
    var days14 = []; for (var j = 13; j >= 0; j--) days14.push(localDay(j));
    var remByDay = {}; for (var q = 1; q < totals.length; q++) { var y = removedAt(q); if (y && y.removed != null) remByDay[totals[q].captured_at] = y.removed; }
    drawBars('ch-conn', days14, [
      { label: 'New', data: days14.map(newOf), backgroundColor: '#057642' },
      { label: 'Removed', data: days14.map(function (d) { return remByDay[d] != null ? -remByDay[d] : null; }), backgroundColor: '#cc1016' }
    ], true);

    // ─── Invitations ─────────────────────────────────────────
    var sentOf = function (d) { var r = byDate[d]; return r ? num(r.invitations_sent_day) : null; };
    set('invite-today', fmt(sentOf(localDay(0))));
    set('invite-yday', fmt(sentOf(localDay(1))));
    var s7 = 0, h7 = 0; for (var m = 0; m < 7; m++) { var v7 = sentOf(localDay(m)); if (v7 != null) { s7 += v7; h7++; } }
    if (h7) {
      var p7 = Math.round(s7 / WEEKLY_GUIDE * 100);
      set('invite-7', fmt(s7)); set('invite-pct', p7 + '%'); ring('invite-ring', p7, true);
    }
    var pend = latest('invitations'); set('invite-pending', pend ? fmt(num(pend.v)) : '—');
    drawBars('ch-inv', days14, [{ label: 'Sent', data: days14.map(sentOf), backgroundColor: '#FE1B04' }], false);

    // ─── Company invites ─────────────────────────────────────
    var ca = latest('company_credits_available'), ct = latest('company_credits_total');
    if (ca) {
      var avail = num(ca.v), total = ct ? num(ct.v) : null;
      set('co-avail', fmt(avail));
      if (total) {
        var cu = Math.max(0, total - avail), cp = Math.round(cu / total * 100);
        set('co-total', fmt(total)); set('co-used', fmt(cu)); set('co-pct', cp + '%'); ring('co-ring', cp, true);
      } else { set('co-used', 'allotment not read'); }
    }

    // ─── Pending invitations, 90 days ─────────────────────────
    var p90 = rows.filter(function (r) { return r.captured_at >= localDay(90) && num(r.invitations) != null; });
    if (window.Chart && $('ch-pending')) new Chart($('ch-pending'), {
      type: 'line',
      data: { labels: p90.map(function (r) { return shortDate(r.captured_at); }),
              datasets: [{ data: p90.map(function (r) { return num(r.invitations); }), borderColor: '#FE1B04', backgroundColor: 'rgba(254,27,4,0.12)', fill: true, borderWidth: 2, tension: 0.25, pointRadius: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 }, maxTicksLimit: 8 } }, y: { grid: { color: '#f1f1f3' }, ticks: { color: '#9ca3af', font: { size: 10 } } } } }
    });
  }

  function drawBars(id, days, datasets, stacked) {
    if (!window.Chart || !$(id)) return;
    new Chart($(id), {
      type: 'bar',
      data: { labels: days.map(shortDate), datasets: datasets.map(function (d) { return Object.assign({ borderRadius: 3, maxBarThickness: 16 }, d); }) },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: datasets.length > 1, labels: { boxWidth: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + (c.parsed.y == null ? '—' : Math.abs(c.parsed.y)); } } } },
        scales: { x: { stacked: stacked, grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 9 }, maxTicksLimit: 7 } },
                  y: { stacked: stacked, grid: { color: '#f1f1f3' }, ticks: { color: '#9ca3af', font: { size: 10 }, callback: function (v) { return Math.abs(v); } } } } }
    });
  }

  function start() {
    load().then(render).catch(function (e) {
      var b = $('cred-banner');
      if (e && e.status === 401) b.innerHTML = 'Sign in to see your credits.';
      else if (e && e.status === 404) b.innerHTML = '<strong>Server update pending.</strong> The credits data feed is not live yet.';
      else b.innerHTML = 'Could not load your credits right now (' + ((e && (e.status || e.message || e.error)) || 'network') + ').';
      b.style.display = 'block';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
