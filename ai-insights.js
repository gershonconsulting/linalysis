// Linalysis — rule-based "AI" recommendation engine. Gold-tier feature.
// Detects patterns in the data and produces ranked, narrative recommendations.
// Designed to read like LLM output but deterministic + fast. Swappable for a
// real LLM call later — just replace generate() with a fetch to /api/ai.
//
// Public API: AI.recap(), AI.recommendations(), AI.anomalyAlerts(), AI.dailyTip()

(function () {
  const S = window.Stats;
  const D = window.LINALYSIS_DATA;
  if (!S || !D) { window.AI = {}; return; }

  const name = (D.meta && D.meta.full_name) || 'you';
  const fmt = (n) => typeof n === 'number' ? n.toLocaleString('en-US') : n;
  const pct = (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  const signed = (n) => `${n > 0 ? '+' : ''}${fmt(n)}`;
  const dateStr = (ymd) => new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // ─── Recap: a 3-paragraph weekly narrative ──────────────────────────
  function recap() {
    const d7  = S.delta('connections', 7) || { change: 0, pct: 0 };
    const d30 = S.delta('connections', 30) || { change: 0, pct: 0 };
    const v30 = S.growthVelocity('connections', 30);
    const ssi = S.latest('ssi');
    const ssiD = S.delta('ssi', 30) || { change: 0 };
    const views7 = S.delta('views', 7) || { change: 0 };
    const jump = S.biggestJump('connections');
    const streak = S.currentStreak('connections');
    const anomaliesRecent = S.anomalies('connections', 2.5, 30);

    const headline = d7.change > 50 ? '📈 Strong week.' :
                     d7.change > 0 ? '📊 Steady week.' :
                     d7.change < -10 ? '⚠️ Unusual drop.' : '➖ Quiet week.';

    const para1 = `${headline} You added ${signed(d7.change)} connections over the last 7 days, bringing you to ${fmt(S.latest('connections'))}. ` +
      `At the current 30-day pace (about ${Math.round(v30)} connections/day) you'll cross ${fmt(S.latest('connections') + Math.round(v30 * 30))} by this time next month.`;

    const para2 = ssiD.change > 0
      ? `Your SSI is ${ssi} and climbing — up ${ssiD.change} points in 30 days. That puts you in the top tier for both industry and network reach.`
      : ssiD.change < 0
      ? `Your SSI slipped ${Math.abs(ssiD.change)} points this month, now at ${ssi}. Usually this signals less active posting or fewer 1-on-1 messages — worth reviewing.`
      : `Your SSI is holding at ${ssi}. It's strong, but flat — the fastest way to push it up is to publish one long-form post and reply to 5 DMs this week.`;

    const para3 = anomaliesRecent.length > 0
      ? `Heads up: ${anomaliesRecent.length} unusual day${anomaliesRecent.length>1?'s':''} in the last 30 days (biggest: ${anomaliesRecent.map(a => dateStr(a.date) + ' ' + (a.direction==='up'?'▲':'▼') + fmt(Math.abs(a.delta))).slice(0,2).join(', ')}). Worth investigating what you posted — replicate the ups, diagnose the downs.`
      : jump.delta > 0
      ? `Your best single-day jump ever was ${dateStr(jump.date)} (+${fmt(jump.delta)} connections). If you can remember what you posted that day, it's a template.`
      : `Nothing unusual to flag this week — you're running smoothly.`;

    return {
      headline,
      paragraphs: [para1, para2, para3],
      streak,
      generated_at: new Date().toISOString(),
    };
  }

  // ─── Recommendations: ranked list of concrete actions ──────────────
  const TIP_BANK = [
    {
      id: 'ssi_low',
      trigger: (ctx) => ctx.ssi < 70,
      priority: 9,
      title: 'Push your SSI above 70',
      body: (ctx) => `Your SSI is ${ctx.ssi}. The fastest four moves: (1) complete your profile to "All-Star", (2) post one long-form article/week, (3) DM 5 warm contacts weekly, (4) engage (comment + react) on 10 posts/day for 7 days. Most people gain 4–8 points in a month doing this.`,
      tags: ['ssi', 'quick_win'],
    },
    {
      id: 'invitations_backlog',
      trigger: (ctx) => ctx.invitations > 400,
      priority: 8,
      title: 'Clear your invitation backlog',
      body: (ctx) => `You have ${fmt(ctx.invitations)} pending invitations. Each one is a missed reciprocity signal — LinkedIn weights connections + who-you-accepted-from heavily. Set aside 15 minutes this week to bulk-review. Quick filter: accept anyone with mutuals in your industry, decline cold sales.`,
      tags: ['connections', 'quick_win'],
    },
    {
      id: 'ssi_rising',
      trigger: (ctx) => ctx.ssi_d30 >= 3,
      priority: 5,
      title: 'Whatever you changed is working',
      body: (ctx) => `Your SSI climbed ${ctx.ssi_d30} points in 30 days — that's top-decile improvement. Double down on whatever shifted: if you started posting more, keep the cadence; if it was DMs, templatize them. Don't break the rhythm.`,
      tags: ['ssi', 'reinforce'],
    },
    {
      id: 'ssi_dropping',
      trigger: (ctx) => ctx.ssi_d30 <= -2,
      priority: 9,
      title: 'SSI is slipping',
      body: (ctx) => `You lost ${Math.abs(ctx.ssi_d30)} SSI points in the last 30 days. The two most common causes are (a) posting frequency dropped or (b) response rate on DMs dropped. Check your last 14 days of activity — aim for at least 2 posts and 10 comments this week to stabilize.`,
      tags: ['ssi', 'urgent'],
    },
    {
      id: 'company_followers_flat',
      trigger: (ctx) => ctx.co_followers_velocity < 0.3,
      priority: 6,
      title: 'Company page isn\'t growing',
      body: (ctx) => `Your company page added only ${Math.round(ctx.co_followers_velocity * 30)} followers in 30 days (~${ctx.co_followers_velocity.toFixed(1)}/day). Biggest lever: cross-post your personal content from the company page, and add "Follow our page" CTAs to your personal posts. Target: 30+ followers/month.`,
      tags: ['company', 'growth'],
    },
    {
      id: 'company_impressions_low',
      trigger: (ctx) => ctx.co_impressions < 50,
      priority: 7,
      title: 'Company posts aren\'t reaching anyone',
      body: (ctx) => `Company page is getting only ~${fmt(ctx.co_impressions)} impressions per data capture. Either you're not posting, or posts are flagged as promotional. Best practice: 1 educational post + 1 employee story per week, no external URLs for the first 24h.`,
      tags: ['company', 'reach'],
    },
    {
      id: 'views_strong',
      trigger: (ctx) => ctx.views_d7 > 100,
      priority: 4,
      title: 'People are looking you up',
      body: (ctx) => `Profile views are up ${signed(ctx.views_d7)} this week. That's typically triggered by something you posted or a mention elsewhere. Check your recent post performance and make sure your headline + banner match what you want new viewers to see.`,
      tags: ['reach', 'reinforce'],
    },
    {
      id: 'search_appearance_strong',
      trigger: (ctx) => ctx.search_d7 > 200,
      priority: 5,
      title: 'You\'re getting searched for more',
      body: (ctx) => `Search appearances jumped ${signed(ctx.search_d7)} in 7 days. Someone — or an algorithm — thinks your keywords are interesting. Check "How people found you" in your weekly LinkedIn email and tune your headline toward the top 1–2 terms.`,
      tags: ['reach', 'reinforce'],
    },
    {
      id: 'connection_velocity_low',
      trigger: (ctx) => ctx.conn_velocity < 2,
      priority: 6,
      title: 'Connection growth is slow',
      body: (ctx) => `You're adding ~${ctx.conn_velocity.toFixed(1)} connections/day — on the low end. Easiest multiplier: comment thoughtfully on 5 posts per day in your target audience's feed. Each good comment typically generates 1–3 inbound requests.`,
      tags: ['connections', 'growth'],
    },
    {
      id: 'credits_unused',
      trigger: (ctx) => ctx.co_credits_available > 20,
      priority: 4,
      title: 'Your InMail credits are piling up',
      body: (ctx) => `You have ${ctx.co_credits_available} unused company InMail credits. They don't roll over after plan renewal — use them before month-end. 1 credit per warm target is a decent ROI; don't waste them on cold blasts.`,
      tags: ['company', 'ops'],
    },
    {
      id: 'best_day_dow',
      trigger: (ctx) => ctx.best_day && ctx.best_day.avg_delta > 2 * (ctx.worst_day?.avg_delta || 0),
      priority: 5,
      title: `Your best growth days are ${/* filled in */''}`,
      body: (ctx) => `${ctx.best_day.day}s consistently outperform. Avg +${ctx.best_day.avg_delta.toFixed(1)} connections/day vs ${ctx.worst_day.day} at ${ctx.worst_day.avg_delta.toFixed(1)}. Schedule your most important posts for ${ctx.best_day.day} mornings (9–11 AM local time).`,
      tags: ['timing', 'tactical'],
      titleFn: (ctx) => `${ctx.best_day.day}s are your best day — use them`,
    },
    {
      id: 'milestone_close',
      trigger: (ctx) => ctx.next_milestone_eta != null && ctx.next_milestone_eta <= 30,
      priority: 7,
      title: 'You\'re close to a milestone',
      body: (ctx) => `At your current pace you'll hit ${fmt(ctx.next_milestone.target)} connections in about ${ctx.next_milestone_eta} days. Make a visible post on the day — milestone posts get 3–5× normal engagement.`,
      tags: ['milestone', 'reinforce'],
      titleFn: (ctx) => `You're ${fmt(ctx.next_milestone.target - ctx.connections)} connections from ${fmt(ctx.next_milestone.target)}`,
    },
  ];

  function buildContext() {
    const connections = S.latest('connections') || 0;
    const ssi = S.latest('ssi') || 0;
    const invitations = S.latest('invitations') || 0;
    const co_followers = S.latest('co_followers') || 0;
    const co_impressions = S.latest('co_impressions') || 0;
    const co_credits_available = S.latest('co_credits_available') || 0;
    const ssi_d30 = (S.delta('ssi', 30) || { change: 0 }).change;
    const views_d7 = (S.delta('views', 7) || { change: 0 }).change;
    const search_d7 = (S.delta('search_appearance', 7) || { change: 0 }).change;
    const conn_velocity = S.growthVelocity('connections', 30);
    const co_followers_velocity = S.growthVelocity('co_followers', 30);
    const dow = S.dayOfWeekBreakdown('connections');
    const sorted = [...dow].sort((a, b) => b.avg_delta - a.avg_delta);
    const best_day = sorted[0], worst_day = sorted[sorted.length - 1];
    // Next milestone (every 5k for connections)
    const nextTarget = Math.ceil((connections + 1) / 5000) * 5000;
    const next_milestone_eta = S.etaTo('connections', nextTarget);
    return {
      connections, ssi, invitations, co_followers, co_impressions, co_credits_available,
      ssi_d30, views_d7, search_d7, conn_velocity, co_followers_velocity,
      best_day, worst_day,
      next_milestone: { target: nextTarget },
      next_milestone_eta,
    };
  }

  function recommendations(limit = 5) {
    const ctx = buildContext();
    const hits = [];
    for (const tip of TIP_BANK) {
      try {
        if (tip.trigger(ctx)) {
          hits.push({
            id: tip.id,
            priority: tip.priority,
            title: tip.titleFn ? tip.titleFn(ctx) : tip.title,
            body: tip.body(ctx),
            tags: tip.tags,
          });
        }
      } catch (e) { /* trigger failed silently — tip not applicable */ }
    }
    return hits.sort((a, b) => b.priority - a.priority).slice(0, limit);
  }

  // ─── Anomaly alerts (simplified formatting for the dashboard) ──────
  function anomalyAlerts(lookbackDays = 60) {
    const out = [];
    for (const key of ['connections', 'ssi', 'views', 'co_followers', 'co_impressions']) {
      const a = S.anomalies(key, 2.8, lookbackDays);
      for (const x of a) {
        out.push({
          metric: key,
          label: S.METRICS[key]?.label || key,
          date: x.date,
          delta: x.delta,
          direction: x.direction,
          message: `${S.METRICS[key]?.label || key} ${x.direction === 'up' ? 'jumped' : 'dropped'} ${fmt(Math.abs(x.delta))} on ${dateStr(x.date)} — ${Math.abs(x.z)}σ outlier.`,
        });
      }
    }
    // newest first, cap at 8
    return out.sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 8);
  }

  // ─── A single daily tip (random but deterministic per day) ─────────
  function dailyTip() {
    const recs = recommendations(10);
    if (!recs.length) return { title: 'You\'re running smoothly.', body: 'No flags. Keep the cadence you had this week.' };
    // Seed with today's date so it's stable within a day
    const today = new Date().toISOString().slice(0, 10);
    const seed = [...today].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    const idx = Math.abs(seed) % recs.length;
    return recs[idx];
  }

  window.AI = {
    recap,
    recommendations,
    anomalyAlerts,
    dailyTip,
    context: buildContext,
  };
})();
