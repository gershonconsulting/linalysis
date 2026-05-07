// Linalysis — first-login welcome overlay.
// Fires on /dashboard.html the first time a freshly OAuth'd user lands.
// Shows the LinkedIn profile data we captured (name, picture, location) plus
// whatever metrics we have so far. Dismissible; remembers via localStorage.

(function () {
  if (typeof LinalysisAPI === 'undefined') return;

  var SEEN_KEY = 'linalysis_onboarding_seen_v1';
  if (location.pathname.indexOf('dashboard') === -1 && location.pathname !== '/' && location.pathname !== '') return;

  LinalysisAPI.me().then(function (d) {
    var u = d.user;
    if (!u) return;

    // Only show for fresh LinkedIn-OAuth'd users
    if (!u.linkedin_sub) return;
    var seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === u.email; } catch (e) {}
    if (seen) return;

    // Pull what data we have
    var stats = (window.Stats && Stats.latest) ? {
      connections: Stats.latest('connections'),
      invitations: Stats.latest('invitations'),
      views:       Stats.latest('views'),
      search:      Stats.latest('search_appearance'),
      ssi:         Stats.latest('ssi'),
      ssi_ind:     Stats.latest('ssi_industry'),
      ssi_net:     Stats.latest('ssi_network'),
    } : {};
    var dataDays = (window.LINALYSIS_DATA && LINALYSIS_DATA.dates) ? LINALYSIS_DATA.dates.length : 0;
    var first = (window.LINALYSIS_DATA && LINALYSIS_DATA.meta) ? LINALYSIS_DATA.meta.first_date : null;

    show(u, stats, dataDays, first);
  }).catch(function () { /* not logged in or backend unreachable — skip */ });

  function show(u, stats, dataDays, first) {
    var pic = u.linkedin_picture
      ? '<img src="' + u.linkedin_picture + '" alt="" style="width:64px;height:64px;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.1);object-fit:cover" referrerpolicy="no-referrer">'
      : '<div style="width:64px;height:64px;border-radius:50%;background:#FE1B04;color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800">' + (u.full_name ? u.full_name[0].toUpperCase() : 'L') + '</div>';

    var firstName = u.full_name ? u.full_name.split(' ')[0] : 'there';
    var registered = u.linkedin_first_login_at ? new Date(u.linkedin_first_login_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : 'today';

    var fmt = function (n) { return (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('en-US'); };

    function row(emoji, label, value, link) {
      var v = '<strong style="font-variant-numeric:tabular-nums">' + fmt(value) + '</strong>';
      var l = link ? '<a href="' + link + '" target="_blank" style="font-size:12px;color:#0a66c2;text-decoration:none">on LinkedIn →</a>' : '';
      return '<div style="display:grid;grid-template-columns:32px 1fr auto auto;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #f1f1f3"><span style="font-size:18px">' + emoji + '</span><span style="font-weight:600">' + label + '</span>' + v + '<span style="margin-left:12px">' + l + '</span></div>';
    }

    var rows =
      row('🔗', 'Connections',       stats.connections, 'https://www.linkedin.com/mynetwork/') +
      row('📨', 'Invitations',       stats.invitations, 'https://www.linkedin.com/mynetwork/invitation-manager/sent/') +
      row('👁️', 'Profile views',     stats.views,       'https://www.linkedin.com/me/profile-views/urn:li:wvmp:summary/') +
      row('🔍', 'Search appearances',stats.search,      'https://www.linkedin.com/me/search-appearances/') +
      row('📊', 'SSI overall',       stats.ssi,         'https://www.linkedin.com/sales/ssi') +
      (stats.ssi_ind != null ? row('🏆', 'SSI Industry %ile', stats.ssi_ind, null) : '') +
      (stats.ssi_net != null ? row('🌐', 'SSI Network %ile',  stats.ssi_net, null) : '');

    var nextLine = dataDays >= 7
      ? '<strong style="color:#057642">✓ We have ' + dataDays + ' days of history</strong> — your charts are populated.'
      : 'It takes about a <strong>week of daily syncs</strong> for full charts. Install the extension and we\'ll start collecting automatically.';

    var html =
      '<div id="lnz-onboard-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;animation:fadein .2s">' +
        '<div style="max-width:560px;background:#fff;border-radius:18px;padding:32px 36px;box-shadow:0 30px 80px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px">' +
            '<div>' +
              '<div style="font-size:11px;font-weight:800;color:#FE1B04;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">✦ Welcome aboard</div>' +
              '<h2 style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin:0">Hi ' + firstName + ', welcome to Linalysis</h2>' +
            '</div>' +
            '<button onclick="document.getElementById(\'lnz-onboard-overlay\').remove()" style="background:none;border:none;font-size:24px;line-height:1;color:#6e6e73;cursor:pointer;padding:0;margin-top:-4px">×</button>' +
          '</div>' +
          '<p style="font-size:14px;color:#1d1d1f;line-height:1.6;margin:0 0 20px">Whatever reason you registered, it was the right one. Now let\'s get to work.</p>' +
          '<div style="display:flex;align-items:center;gap:14px;padding:14px 18px;background:linear-gradient(135deg,#fff5f5,#fafafa);border-radius:14px;margin-bottom:20px">' +
            pic +
            '<div style="flex:1;min-width:0"><div style="font-size:16px;font-weight:800">' + (u.full_name || u.email) + '</div><div style="font-size:13px;color:#6e6e73">Signed in via LinkedIn · ' + registered + '</div></div>' +
            '<span style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;background:#e7f0fa;color:#0a66c2;border-radius:999px;font-size:11px;font-weight:700">● Connected</span>' +
          '</div>' +
          '<div style="font-size:13px;color:#6e6e73;margin-bottom:6px">Here\'s what we captured from your profile:</div>' +
          '<div style="margin-bottom:20px">' + rows + '</div>' +
          '<p style="font-size:13px;color:#6e6e73;line-height:1.6;margin:0 0 22px;padding:14px 16px;background:#fafafa;border-radius:10px">' + nextLine + '</p>' +
          '<div style="display:flex;gap:10px">' +
            '<a href="/troubleshooting.html" onclick="document.getElementById(\'lnz-onboard-overlay\').remove()" style="flex:1;padding:12px;border:1px solid #e5e7eb;border-radius:10px;text-decoration:none;text-align:center;color:#1d1d1f;font-size:13px;font-weight:600">Install extension</a>' +
            '<a href="/dashboard.html" onclick="document.getElementById(\'lnz-onboard-overlay\').remove()" style="flex:1;padding:12px;background:#FE1B04;color:#fff;border-radius:10px;text-decoration:none;text-align:center;font-size:13px;font-weight:700">See my dashboard</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);
    try { localStorage.setItem(SEEN_KEY, u.email); } catch (e) {}
  }
})();
