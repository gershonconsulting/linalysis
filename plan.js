// Linalysis — 3-tier plan gating
// Silver / Gold / Platinum. Plan is stored in localStorage under 'linalysis_plan'.
// Defaults to 'gold' so new visitors see the premium experience during demo.
// A plan switcher (dev helper) is rendered on every page bottom-left.

(function () {
  const PLANS = {
    silver:   { label: 'Silver',   price: 9.95,  color: '#71717a' },
    gold:     { label: 'Gold',     price: 19.95, color: '#D4AF37' },
    platinum: { label: 'Platinum', price: 29.95, color: '#9333ea' },
  };

  // Feature flags. true = allowed, 'locked' = visible but locked, false = hidden.
  const FEATURES = {
    // Silver (base)
    dashboard_basic:      { silver: true, gold: true, platinum: true },
    weekly_email:         { silver: true, gold: true, platinum: true },
    goals_preset:         { silver: true, gold: true, platinum: true },
    milestones:           { silver: true, gold: true, platinum: true },
    history_30d:          { silver: true, gold: true, platinum: true },

    // Gold
    history_full:         { silver: 'locked', gold: true, platinum: true },
    ai_insights:          { silver: 'locked', gold: true, platinum: true },
    ai_recap:             { silver: 'locked', gold: true, platinum: true },
    anomaly_alerts:       { silver: 'locked', gold: true, platinum: true },
    goals_custom:         { silver: 'locked', gold: true, platinum: true },
    yoy_comparison:       { silver: 'locked', gold: true, platinum: true },
    dow_breakdown:        { silver: 'locked', gold: true, platinum: true },
    projections:          { silver: 'locked', gold: true, platinum: true },
    custom_date_range:    { silver: 'locked', gold: true, platinum: true },
    monthly_report:       { silver: 'locked', gold: true, platinum: true },

    // Platinum
    benchmarks:           { silver: 'locked', gold: 'locked', platinum: true },
    api_access:           { silver: 'locked', gold: 'locked', platinum: true },
    multi_account:        { silver: 'locked', gold: 'locked', platinum: true },
    competitor_tracking:  { silver: 'locked', gold: 'locked', platinum: true },
    priority_support:     { silver: 'locked', gold: 'locked', platinum: true },
    white_label_exports:  { silver: 'locked', gold: 'locked', platinum: true },
  };

  function currentPlan() {
    try {
      const p = localStorage.getItem('linalysis_plan');
      if (p && PLANS[p]) return p;
    } catch (e) {}
    return 'gold';  // demo default
  }

  function setPlan(plan) {
    if (!PLANS[plan]) return;
    try { localStorage.setItem('linalysis_plan', plan); } catch (e) {}
    // Re-render anything that listens
    window.dispatchEvent(new CustomEvent('linalysis:planchange', { detail: { plan } }));
  }

  function allows(feature) {
    const p = currentPlan();
    const f = FEATURES[feature];
    if (!f) return true;   // unknown feature → allow (fail open)
    return f[p] === true;
  }

  function isLocked(feature) {
    const p = currentPlan();
    const f = FEATURES[feature];
    if (!f) return false;
    return f[p] === 'locked';
  }

  function requiredTier(feature) {
    const f = FEATURES[feature];
    if (!f) return null;
    for (const p of ['silver', 'gold', 'platinum']) {
      if (f[p] === true) return p;
    }
    return null;
  }

  /** Wrap a DOM element — if the feature is locked, overlay a lock + CTA.
   *  Usage: Plan.gate(element, 'ai_insights')
   */
  function gate(el, feature, opts = {}) {
    if (!el) return;
    if (allows(feature)) return;   // fully allowed → no-op
    const required = requiredTier(feature);
    const plan = PLANS[required];
    el.classList.add('plan-locked');
    const badge = document.createElement('div');
    badge.className = 'plan-lock-overlay';
    badge.innerHTML = `
      <div class="plan-lock-badge">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block;vertical-align:-2px">
          <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        <span>${plan?.label || 'Premium'} feature</span>
        <a href="/pricing.html" class="plan-lock-upgrade">Upgrade →</a>
      </div>
      ${opts.teaser !== false ? '<div class="plan-lock-teaser">Unlock to see this feature.</div>' : ''}
    `;
    el.appendChild(badge);
  }

  /** Dev-mode plan switcher. Fixed bottom-left. Click-to-cycle. */
  function renderSwitcher() {
    if (document.getElementById('plan-switcher')) return;
    const el = document.createElement('div');
    el.id = 'plan-switcher';
    const style = 'position:fixed;bottom:10px;left:12px;z-index:200;font-family:SFMono-Regular,Consolas,monospace;font-size:10px;color:#6e6e73;background:rgba(255,255,255,0.92);padding:4px 9px;border-radius:6px;border:1px solid #e5e7eb;cursor:pointer;user-select:none;box-shadow:0 2px 6px rgba(0,0,0,0.04);display:inline-flex;align-items:center;gap:6px';
    el.style.cssText = style;
    const render = () => {
      const p = currentPlan();
      const info = PLANS[p];
      el.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${info.color}"></span> ${info.label} · click to switch`;
    };
    render();
    const order = ['silver', 'gold', 'platinum'];
    el.onclick = () => {
      const cur = currentPlan();
      const next = order[(order.indexOf(cur) + 1) % order.length];
      setPlan(next);
      render();
      // Reload so gated UI re-evaluates
      setTimeout(() => location.reload(), 150);
    };
    document.body.appendChild(el);
  }

  // Inject the CSS once
  function injectCss() {
    if (document.getElementById('plan-lock-css')) return;
    const css = `
      .plan-locked { position: relative; }
      .plan-locked > :not(.plan-lock-overlay) { filter: blur(3px); opacity: 0.55; pointer-events: none; }
      .plan-lock-overlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:5; background: linear-gradient(180deg, rgba(255,255,255,0.3), rgba(255,255,255,0.75)); border-radius: 14px; }
      .plan-lock-badge { display:inline-flex; align-items:center; gap:10px; padding:10px 16px; background:#fff; border:1px solid var(--border,#e5e7eb); border-radius:999px; font-weight:700; color:#1d1d1f; box-shadow: 0 6px 22px rgba(0,0,0,0.08); }
      .plan-lock-upgrade { color:var(--brand,#FE1B04); text-decoration:none; font-weight:700; font-size:12px; padding:4px 10px; background:#fff5f5; border-radius:999px; }
      .plan-lock-upgrade:hover { background:#FE1B04; color:#fff; }
      .plan-lock-teaser { margin-top:8px; font-size:12px; color:#6e6e73; }
    `;
    const style = document.createElement('style');
    style.id = 'plan-lock-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  window.Plan = {
    PLANS,
    FEATURES,
    current:      currentPlan,
    set:          setPlan,
    allows:       allows,
    isLocked:     isLocked,
    requiredTier: requiredTier,
    gate:         gate,
  };

  // Auto-init
  if (document.readyState !== 'loading') { injectCss(); renderSwitcher(); }
  else document.addEventListener('DOMContentLoaded', () => { injectCss(); renderSwitcher(); });
})();
