// Shared sidebar navigation for Linalysis — injects into <aside id="sidebar" data-active="{key}"></aside>
// Also injects: bottom-right build badge + health score badge next to avatar + auth chip + plan-aware nav.
const LINALYSIS_BUILD = '2026-08-19.1140-ext027-diag';
const LINALYSIS_LATEST_EXT_VERSION = '0.2.7'; // bump this whenever a new extension zip ships
console.log('%cLinalysis build ' + LINALYSIS_BUILD, 'color:#FE1B04;font-weight:700');

// ── Extension update banner ────────────────────────────────────────
// The extension's content-pair.js sets data-linalysis-ext-version on <html>.
// During the testing phase the extension is installed via "Load unpacked", which does NOT
// auto-update. So when a newer version exists we show one honest banner: download the new version
// from My Account and reload it. No false "Chrome will update automatically" promise — that only
// becomes true once we're on the Chrome Web Store.
(function extUpdateBanner() {
  function cmpVer(a, b) {
    var A = a.split('.').map(Number), B = b.split('.').map(Number);
    for (var i = 0; i < Math.max(A.length, B.length); i++) {
      var x = A[i] || 0, y = B[i] || 0;
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  }
  function check() {
    var installed = document.documentElement.getAttribute('data-linalysis-ext-version');
    if (!installed) return; // extension not installed / not detected — no banner
    if (cmpVer(installed, LINALYSIS_LATEST_EXT_VERSION) >= 0) return; // up to date
    if (document.getElementById('lin-ext-update-banner')) return; // already shown

    var b = document.createElement('div');
    b.id = 'lin-ext-update-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#cc1016;color:#fff;padding:11px 20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,0.2)';
    b.innerHTML =
      '<span style="font-size:16px">⬆</span>' +
      '<span>A newer Linalysis extension is available (you have v' + installed + ', latest v' + LINALYSIS_LATEST_EXT_VERSION + '). Download it and reload the extension.</span>' +
      '<a href="/account" style="background:#fff;color:#cc1016;padding:6px 14px;border-radius:6px;text-decoration:none;font-weight:800;margin-left:8px">Get v' + LINALYSIS_LATEST_EXT_VERSION + ' →</a>' +
      '<button onclick="document.getElementById(\'lin-ext-update-banner\').remove();document.body.style.paddingTop=\'\'" style="background:none;border:none;color:#fff;font-size:18px;cursor:pointer;margin-left:6px;opacity:0.8" title="Dismiss">×</button>';
    document.body.insertBefore(b, document.body.firstChild);
    document.body.style.paddingTop = '48px'; // avoid banner covering content
  }
  // The sentinel attribute is set by the extension's content script which runs at document_idle,
  // so we check now, again in 500ms, and once more after 2s.
  if (document.readyState !== 'loading') check();
  else document.addEventListener('DOMContentLoaded', check);
  setTimeout(check, 500);
  setTimeout(check, 2000);
})();

(function () {
  var NAV = [
    { key: 'dashboard',  label: 'My Dashboard', href: '/dashboard.html',  icon: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>' },
    { key: 'summary',    label: 'My Summary',   href: '/summary.html',    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
    { key: 'my-ssi',     label: 'My SSI',       href: '/my-ssi.html',     icon: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>' },
    { key: 'growth',     label: 'My Growth',    href: '/growth.html',     icon: '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>' },
    { key: 'campaigns',  label: 'My Campaigns', href: '/campaigns.html',  icon: '<path d="M3 11l18-8-8 18-2-8-8-2z"/>', arrow: true },
    { key: 'my-data',    label: 'My Data',      href: '/my-data.html',    icon: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/>' },
    { key: 'log',        label: 'Collection Log', href: '/log.html',      icon: '<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h5"/>' },
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
  var BRAND_SVG = '<img src="/logo-mark.png" alt="Linalysis" style="width:28px;height:28px;object-fit:contain;vertical-align:middle" />';

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
    el.style.cssText = 'position:fixed;bottom:10px;right:12px;z-index:200;font-family:SFMono-Regular,Consolas,monospace;font-size:11px;font-weight:600;color:#fff;background:#FE1B04;padding:6px 12px;border-radius:8px;cursor:pointer;user-select:none;box-shadow:0 4px 12px rgba(254,27,4,0.35);letter-spacing:0.02em';
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
