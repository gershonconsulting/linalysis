// Shared sidebar navigation for Linalysis — injects into <aside id="sidebar" data-active="{key}"></aside>
// Also injects: bottom-right build badge + health score badge next to avatar in topbar.
const LINALYSIS_BUILD = '__BUILD__';  // replaced at deploy: 2026-04-23.0000.backend-v1
console.log('%cLinalysis build ' + LINALYSIS_BUILD, 'color:#FE1B04;font-weight:700');

(function () {
  const NAV = [
    { key: 'dashboard', label: 'My Dashboard',  href: '/dashboard.html',     icon: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>' },
    { key: 'summary',   label: 'My Summary',    href: '/summary.html',       icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
    { key: 'company',   label: 'My Company',    href: '/company.html',       icon: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/>', arrow: true },
    { key: 'campaigns', label: 'My Campaigns',  href: '/campaigns.html',     icon: '<path d="M3 11l18-8-8 18-2-8-8-2z"/>', arrow: true },
    { key: 'my-data',   label: 'My Data',       href: '/my-data.html',       icon: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/>' },
    { key: 'account',   label: 'My Account',    href: '/account.html',       icon: '<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' },
  ];
  const SECONDARY = [
    { key: 'pricing',         label: 'Pricing',         href: '/pricing.html' },
    { key: 'troubleshooting', label: 'Troubleshooting', href: '/troubleshooting.html' },
    { key: 'logout',          label: 'Logout',          href: '/' },
  ];

  // New brand logo: red circle with 3 white vertical bars (matches favicon + physical logo)
  const BRAND_SVG = '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="16" cy="16" r="14" fill="#FE1B04"/>' +
    '<g fill="#fff">' +
    '<rect x="9" y="17" width="3" height="8" rx="0.5"/>' +
    '<rect x="14.5" y="12" width="3" height="13" rx="0.5"/>' +
    '<rect x="20" y="15" width="3" height="10" rx="0.5"/>' +
    '</g></svg>';

  function renderSidebar() {
    const el = document.getElementById('sidebar');
    if (!el) return;
    const active = el.dataset.active || '';
    const brand = '<a class="brand" href="/">' + BRAND_SVG + 'Linalysis</a>';
    const primary = NAV.map(i => '<a class="nav-item' + (i.key === active ? ' active' : '') + '" href="' + i.href + '">' +
      '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + i.icon + '</svg>' +
      '<span style="flex:1">' + i.label + '</span>' + (i.arrow ? '<span style="color:var(--text-muted);font-size:14px">&rsaquo;</span>' : '') +
      '</a>').join('');
    const secondary = SECONDARY.map(i => '<a class="nav-item' + (i.key === active ? ' active' : '') + '" href="' + i.href + '"' + (i.key === 'logout' ? ' style="color:var(--text-muted)"' : '') + '>' + i.label + '</a>').join('');
    const footer = '<div class="nav-spacer"></div>' +
      '<div style="padding:0 4px 8px">' + secondary + '</div>' +
      '<div class="sidebar-footer">' +
      '<div>&copy; 2026 Linalysis</div>' +
      '</div>';
    el.innerHTML = brand + '<div class="nav-group">' + primary + '</div>' + footer;
  }

  function addBuildBadge() {
    if (document.getElementById('linalysis-build-badge')) return;
    const el = document.createElement('div');
    el.id = 'linalysis-build-badge';
    el.style.cssText = 'position:fixed;bottom:10px;right:12px;z-index:200;font-family:SFMono-Regular,Consolas,monospace;font-size:10px;color:#6e6e73;background:rgba(255,255,255,0.92);padding:4px 9px;border-radius:6px;border:1px solid #e5e7eb;cursor:pointer;user-select:none;box-shadow:0 2px 6px rgba(0,0,0,0.04)';
    el.textContent = 'Build ' + LINALYSIS_BUILD;
    el.title = 'Click to copy build stamp';
    el.onclick = function() {
      try {
        navigator.clipboard && navigator.clipboard.writeText(LINALYSIS_BUILD);
        el.style.color = '#FE1B04';
        setTimeout(function() { el.style.color = '#6e6e73'; }, 1200);
      } catch(e) {}
    };
    document.body.appendChild(el);
  }

  function addHealthBadge() {
    var avatar = document.querySelector('.topbar .topbar-right .avatar');
    if (!avatar) return;
    if (avatar.parentElement.querySelector('.linalysis-health')) return;
    var score = null;
    try { score = localStorage.getItem('linalysis_health_score'); } catch(e) {}
    var badge = document.createElement('a');
    badge.className = 'linalysis-health';
    badge.href = '/troubleshooting.html';
    badge.style.cssText = 'padding:5px 11px;border-radius:999px;font-size:12px;font-weight:700;text-decoration:none;margin-right:2px;display:inline-flex;align-items:center;gap:4px;transition:transform .15s';
    badge.title = 'Troubleshooting health — click to view';
    if (score === null || score === '') {
      badge.style.background = '#e5e7eb';
      badge.style.color = '#6e6e73';
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

  function addAuthChip() {
    var avatar = document.querySelector('.topbar .topbar-right .avatar');
    if (!avatar) return;
    if (avatar.parentElement.querySelector('.linalysis-auth')) return;
    if (typeof LinalysisAPI === 'undefined') return;
    var chip = document.createElement('span');
    chip.className = 'linalysis-auth';
    chip.style.cssText = 'font-size:12px;c