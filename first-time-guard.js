// Linalysis first-time-user guard.
// Included on pages that would otherwise leak the owner's hardcoded HTML numbers to a signed-out
// visitor or a new user with no captures yet.
//
// Runs synchronously AFTER data.js so window.LINALYSIS_DATA is already populated (or empty).
// If empty, replaces the entire <main class="content"> block with a welcome/setup card and sets
// window.__linalysisFirstTime = true so downstream inline scripts can short-circuit their renders.

(function firstTimeGuard() {
  var D = window.LINALYSIS_DATA;
  if (D && D.dates && D.dates.length > 0) return;  // has data → keep the page as-is
  var content = document.querySelector('main .content, main > .content, .content');
  if (!content) return;

  var name = '';
  try { name = (localStorage.getItem('linalysis_user_name') || '').split(' ')[0]; } catch (e) {}

  var pageName = document.title.split('—').pop() || 'this page';
  pageName = pageName.replace(/Linalysis/, '').trim() || 'this page';

  content.innerHTML =
    '<div style="background:linear-gradient(135deg,#1d1d1f,#2d1f2f);color:#fff;border-radius:18px;padding:44px 40px;margin-bottom:24px">' +
      '<div style="max-width:640px">' +
        '<div style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#FE1B04;margin-bottom:12px">Welcome to Linalysis' + (name ? ', ' + name : '') + '</div>' +
        '<h2 style="font-size:28px;font-weight:800;letter-spacing:-0.01em;margin-bottom:12px">' + pageName + ' is empty — install the extension to start tracking.</h2>' +
        '<p style="font-size:15px;opacity:0.8;line-height:1.55;margin-bottom:24px">Linalysis reads your LinkedIn Social Selling Index, connection growth, profile views, and company metrics from your own browser once a day. Nothing shows up here until the extension is installed and paired.</p>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
          '<a href="/troubleshooting.html" style="background:#FE1B04;color:#fff;padding:12px 22px;border-radius:10px;font-weight:700;text-decoration:none">Set up the extension →</a>' +
          '<a href="/help.html" style="background:rgba(255,255,255,0.1);color:#fff;padding:12px 22px;border-radius:10px;font-weight:600;text-decoration:none">Help &amp; guides</a>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:24px 28px">' +
      '<h3 style="font-size:16px;font-weight:800;margin-bottom:8px">What you\'ll see once data starts flowing</h3>' +
      '<ul style="font-size:14px;color:var(--text-muted);line-height:1.8;padding-left:20px;margin:0">' +
        '<li>Social Selling Index (SSI) — overall + industry + network rank</li>' +
        '<li>Net-new connections, profile views, search appearances</li>' +
        '<li>Company page followers, visitors, post impressions</li>' +
        '<li>Streaks, best days, milestones, weekly and monthly reports</li>' +
      '</ul>' +
    '</div>';

  window.__linalysisFirstTime = true;
})();
