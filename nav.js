// Shared sidebar navigation for Linalysis — injects into <aside id="sidebar" data-active="{key}"></aside>
// Also injects: bottom-right build badge + health score badge next to avatar + auth chip + plan-aware nav.
const LINALYSIS_BUILD = '__BUILD__';
console.log('%cLinalysis build ' + LINALYSIS_BUILD, 'color:#FE1B04;font-weight:700');

(function () {
  var NAV = [
    { key: 'dashboard',  label: 'My Dashboard', href: '/dashboard.html',  icon: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>' },
    { key: 'summary',    label: 'My Summary',   href: '/summary.html',    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
    { key: 'campaigns',  label: 'My Campaigns', href: '/campaigns.html',  icon: '<path d="M3 11l18-8-8 18-2-8-8-2z"/>', arrow: true },
    { key: 'my-data',    label: 'My Data',      href: '/my-data.html',    icon: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/>' },
    { key: 'company',    label: 'My Company',   href: '/company.html',    icon: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/>', arrow: true },
    { key: 'goals',      label: 'My Goals',     href: '/goals.html',      icon: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>' },
    { key: 'credits',    label: 'My Credits',   href: '/credits.html',    icon: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 11h20"/><path d="M7 15h2M11 15h2"/>' },
    { key: 'account',    label: 'My Account',   href: '/account.html',    icon: '<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' },
    { key: 'insights',   label: 'AI Insights',  href: '/insights.html',   icon: '<path d="M12 2a7 7 0 0 0-4 12.7V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.3A7 7 0 0 0 12 2z"/><path d="M9 22h6"/>', tier: 'gold' }
  ];
  var SECONDARY = [
    { key: 'milestones',      label: 'Milestones',      href: '/milestones.html' },
    { key: 'benchmarks',      label: 'Benchmarks',      href: '/benchmarks.html' },
    { key: 'pricing',         label: 'Pricing',         href: '/pricing.html' },
    { key: 'troubleshooting', label: 'Troubleshooting', href: '/troubleshooting.html' },
    { key: 'logout',          label: 'Logout',          href: '/' }
  ];
  var BRAND_SVG = '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="14" fill="#FE1B04"/><g fill="#fff"><rect x="9" y="17" width="3" height="8" rx="0.5"/><rect x="14.5" y="12" width="3" height="13" rx="0.5"/><rect x="20" y="15" width="3" height="10" rx="0.5"/></g></svg>';

  function renderSidebar() {
    var el = document.getElementById('sidebar');
    if (!el) return;
    var active = el.dataset.active || '';
    var brand = '<a class="brand" href="/">' + BRAND_SVG + 'Linalysis</a>';
    var curPlan = (window.Plan && window.Plan.current()) || 'gold';
    var rank = { silver: 1, gold: 2, platinum: 3 };
    var primary = NAV.map(function (i) {
      var lock = '';
      if (i.tier && rank[curPlan] < rank[i.tier]) {
        lock = '<span title="' + i.tier + ' feature" style="font-size:11px;margin-left:auto;margin-right:4px;opacity:0.7">\u{1F512}</span>';
      }
      var arrowHTML = i.arrow ? '<span style="color:var(--text-muted);font-size:14px">&rsaquo;</span>' : '';
      return '<a class="nav-item' + (i.key === active ? ' active' : '') + '" href="' + i.href + '">' +
        '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + i.icon + '</svg>' +
        '<span style="flex:1">' + i.label + '</span>' + lock + arrowHTML +
        '</a>';
    }).join('');
    var secondary = SECONDARY.map(function (i) {
      var style = i.key === 'logout' ? ' style="color:var(--text-muted)"' : '';
      return '<a class="nav-item' + (i.key === active ? ' active' : '') + '" href="' + i.href + '"' + style + '>' + i.label + '</a>';
    }).join('');
    var footer = '<div class="nav-spacer"></div><div style="padding:0 4px 8px">' + secondary + '</div><div class="sidebar-footer"><div>&copy; 2026 Linalysis</div></div>';
    el.innerHTML = brand + '<div class="nav-group">' + primary + '</div>' + footer;
  }

  function addBuildBadge() {
    if (document.getElementById('linalysis-build-badge')) return;
    var el = document.createElement('div');
    el.id = 'linalysis-build-badge';
    el.style.cssText = 'position:fixed;bottom:10px;right:12px;z-index:200;font-family:SFMono-Regular,Consolas,monospace;font-size:10px;color:#6e6e73;background:rgba(255,255,255,0.92);padding:4px 9px;border-radius:6px;border:1px solid #e5e7eb;cursor:pointer;user-select:none;box-shadow:0 2px 6px rgba(0,0,0,0.04)';
    el.textContent = 'Build ' + LINALYSIS_BUILD;
    el.title = 'Click to copy build stamp';
    el.onclick = function () {
      try { navigator.clipboard && navigator.clipboard.writeText(LINALYSIS_BUILD); el.style.color = '#FE1B04'; setTimeout(function(){ el.style.color='#6e6e73'; }, 1200); } catch (e) {}
    };
    document.body.appendChild(el);
  }

  function addHealthBadge() {
    var avatar = document.querySelector('.topbar .topbar-right .avatar');
    if (!avatar) return;
    if (avatar.parentElement.querySelector('.linalysis-health')) return;
    var score = null;
    try { score = localStorage.getItem('linalysis_health_score'); } catch (e) {}
    var badge = document.createElement('a');
    badge.className = 'linalysis-health';
    badge.href = '/troubleshooting.html';
    badge.style.cssText = 'padding:5px 11px;border-radius:999px;font-size:12px;font-weight:700;text-decoration:none;margin-right:2px;display:inline-flex;align-items:center;gap:4px';
    badge.title = 'Troubleshooting health';
    if (score === null || score === '') {
      badge.style.background = '#e5e7eb'; badge.style.color = '#6e6e73';
      badge.textContent = 'Run check';
    } else {
      var pct = parseInt(score, 10);
      if (pct >= 90) { badge.style.background = '#e6f4ea'; badge.style.color = '#057642'; }
      else if (pct >= 70) { badge.style.background = '#fff4e5'; badge.style.color = '#b76b00'; }
      else { badge.style.background = '#fdecea'; badge.style.color = '#cc1016'; }
      badge.textContent = pct + '%';
    }
    avatar.parentElement.insertBefore(badge, avatar);
  }

  function addPlanChip() {
    var avatar = document.querySelector('.topbar .topbar-right .avatar');
    if (!avatar) return;
    if (avatar.parentElement.querySelector('.linalysis-plan-chip')) return;
    if (!window.Plan) return;
    var plan = window.Plan.current();
    var info = window.Plan.PLANS[plan];
    var chip = document.createElement('span');
    chip.className = 'linalysis-plan-chip';
    chip.style.cssText = 'padding:4px 9px;border-radius:999px;font-size:11px;font-weight:700;margin-right:6px;border:1px solid ' + info.color + '33;background:' + info.color + '14;color:' + info.color;
    chip.textContent = info.label;
    chip.title = info.label + ' plan — switch via the chip at bottom-left';
    avatar.parentElement.insertBefore(chip, avatar);
  }

  function addAuthChip() {
    var avatar = document.querySelector('.topbar .topbar-right .avatar');
    if (!avatar) return;
    if (avatar.parentElement.querySelector('.linalysis-auth')) return;
    if (typeof LinalysisAPI === 'undefined') return;
    var chip = document.createElement('span');
    chip.className = 'linalysis-auth';
    chip.style.cssText = 'font-size:12px;color:#6e6e73;margin-right:8px;display:inline-flex;align-items:center;gap:6px';
    chip.innerHTML = '<span style="opacity:.6">Checking...</span>';
    avatar.parentElement.insertBefore(chip, avatar);
    LinalysisAPI.me().then(function (d) {
      // Impersonation banner \u2014 show on every page when this session is impersonated
      if (d.user.impersonator_email && !document.getElementById('linalysis-impersonate-banner')) {
        var banner = document.createElement('div');
        banner.id = 'linalysis-impersonate-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:300;background:#FE1B04;color:#fff;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,0.15)';
        banner.innerHTML = '<span>\ud83d\udc41 Impersonating <strong>' + d.user.email + '</strong> as admin <strong>' + d.user.impersonator_email + '</strong></span><button id="exit-impersonate-btn" style="background:#fff;color:#FE1B04;border:none;padding:5px 12px;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px">Exit impersonation</button>';
        document.body.insertBefore(banner, document.body.firstChild);
        document.body.style.paddingTop = banner.offsetHeight + 'px';
        document.getElementById('exit-impersonate-btn').onclick = function(){
          LinalysisAPI.post('/api/admin/exit-impersonate', {}).finally(function(){ location.href = '/admin.html'; });
        };
      }
      // Admin link \u2014 only visible to admins (insert after sidebar render)
      if (d.user.is_admin) {
        var sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.querySelector('[href="/admin.html"]')) {
          var ng = sidebar.querySelector('.nav-group');
          if (ng) {
            var a = document.createElement('a');
            a.className = 'nav-item';
            a.href = '/admin.html';
            a.style.cssText = 'border-top:1px solid var(--border);margin-top:6px;padding-top:10px;color:var(--brand);font-weight:700';
            a.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1l9 4v6c0 5.5-3.8 10.7-9 12-5.2-1.3-9-6.5-9-12V5l9-4z"/></svg><span style="flex:1">Admin</span>';
            ng.appendChild(a);
          }
        }
      }
      var liBadge = d.user.linkedin_sub
        ? '<span title="Signed in via LinkedIn" style="display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:#e7f0fa;color:#0a66c2;border-radius:999px;font-size:10px;font-weight:700"><svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>LinkedIn</span>'
        : '';
      chip.innerHTML = '<span style="color:#057642">\u25cf</span> <span>' + d.user.email + '</span>' + liBadge + '<a href="#" data-logout style="color:#6e6e73;text-decoration:none;margin-left:6px">Logout</a>';
      chip.querySelector('[data-logout]').onclick = function (e) {
        e.preventDefault();
        LinalysisAPI.logout().finally(function () { location.href = '/'; });
      };
    }).catch(function (err) {
      if (err && err.status === 401) {
        chip.innerHTML = '<a href="/login.html" style="color:#FE1B04;text-decoration:none;font-weight:600">Sign in</a>';
      } else {
        chip.innerHTML = '<span style="opacity:.5" title="API unreachable">demo</span>';
      }
    });
  }

  function render() {
    try { renderSidebar(); } catch (e) { console.error('renderSidebar', e); }
    try { addBuildBadge(); } catch (e) { console.error('addBuildBadge', e); }
    try { addHealthBadge(); } catch (e) { console.error('addHealthBadge', e); }
    try { addPlanChip(); } catch (e) { console.error('addPlanChip', e); }
    try { addAuthChip(); } catch (e) { console.error('addAuthChip', e); }
  }

  function ensureScript(src, id, cb) {
    if (document.getElementById(id)) { cb && cb(); return; }
    var s = document.createElement('script');
    s.id = id; s.src = src;
    s.onload = cb || null;
    s.onerror = cb || null;
    document.head.appendChild(s);
  }

  function boot() { ensureScript('/plan.js', 'linalysis-plan-js', render); }

  if (document.readyState !== 'loading') boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();

// build-stamp 1777420658
// build-stamp 1777423605
// admin-build 1777513846
