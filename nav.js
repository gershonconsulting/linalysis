// Shared sidebar navigation for Linalysis — injects into <aside id="sidebar" data-active="{key}"></aside>
// BUILD stamp is replaced at deploy time by the Python deploy script.
const LINALYSIS_BUILD = '__BUILD__';
console.log('%cLinalysis build ' + LINALYSIS_BUILD, 'color:#FE1B04;font-weight:700');
(function () {
  // Flat menu, "My" prefix, matches user's canonical menu.
  // Order matters.
  const NAV = [
    { key: 'dashboard', label: 'My Dashboard',        href: '/dashboard.html',      icon: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>' },
    { key: 'summary',   label: 'My Summary',          href: '/summary.html',        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
    { key: 'company',   label: 'My Company',          href: '/company.html',        icon: '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/>',                      arrow: true },
    { key: 'campaigns', label: 'My Campaigns',        href: '/campaigns.html',      icon: '<path d="M3 11l18-8-8 18-2-8-8-2z"/>',                                     arrow: true },
    { key: 'my-data',   label: 'My Data',             href: '/my-data.html',        icon: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/>' },
    { key: 'guests',    label: 'My Guests',           href: '/guests.html',         icon: '<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' },
    { key: 'account',   label: 'My Account',          href: '/account.html',        icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
  ];
  // Secondary items surfaced below the main menu
  const SECONDARY = [
    { key: 'pricing',         label: 'Pricing',         href: '/pricing.html' },
    { key: 'troubleshooting', label: 'Troubleshooting', href: '/troubleshooting.html' },
    { key: 'logout',          label: 'Logout',          href: '/' },
  ];

  function render() {
    const el = document.getElementById('sidebar');
    if (!el) return;
    const active = el.dataset.active || '';
    const brand = `<a class="brand" href="/">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="4" y1="20" x2="4" y2="12"></line>
        <line x1="10" y1="20" x2="10" y2="4"></line>
        <line x1="16" y1="20" x2="16" y2="8"></line>
        <line x1="22" y1="20" x2="22" y2="14"></line>
      </svg>
      Linalysis
    </a>`;

    const primary = NAV.map(i => `<a class="nav-item${i.key === active ? ' active' : ''}" href="${i.href}">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${i.icon}</svg>
      <span style="flex:1">${i.label}</span>${i.arrow ? '<span style="color:var(--text-muted);font-size:14px">›</span>' : ''}
    </a>`).join('');

    const secondary = SECONDARY.map(i => `<a class="nav-item${i.key === active ? ' active' : ''}" href="${i.href}" ${i.key === 'logout' ? 'style="color:var(--text-muted)"' : ''}>${i.label}</a>`).join('');

    const footer = `<div class="nav-spacer"></div>
      <div style="padding:0 4px 8px">${secondary}</div>
      <div class="sidebar-footer">
        <div>© 2026 Linalysis</div>
        <div style="margin-top:4px"><a href="https://linalysis.streamlit.app" target="_blank" style="color:var(--brand);font-weight:600">Legacy app →</a></div>
        <div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border);font-family:SFMono-Regular,Consolas,monospace;font-size:10px;color:var(--text-muted)" title="Click to copy">Build <span id="build-stamp" style="cursor:pointer" onclick="navigator.clipboard&&navigator.clipboard.writeText(LINALYSIS_BUILD);this.style.color='var(--brand)';setTimeout(()=>this.style.color='',1200)">${LINALYSIS_BUILD}</span></div>
      </div>`;

    el.innerHTML = brand + `<div class="nav-group">${primary}</div>` + footer;
  }
  if (document.readyState !== 'loading') render();
  else document.addEventListener('DOMContentLoaded', render);
})();
