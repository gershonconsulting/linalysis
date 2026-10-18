// v0.3.7 — language-independent readers. The structures below are the REAL markup LinkedIn
// served on 2026-10-18 (Olivier's English account + the Urban Factory Page), with the labels
// replaced by the German wording David's account sees. A reader that passes these never needed
// the label to match.
//   node test/i18n-structure.test.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
}

function mkDom(html, url, lang) {
  const dom = new JSDOM('<!doctype html><html lang="' + lang + '"><body><main>' + html + '</main></body></html>',
    { url, pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get() { return (this.textContent || '').replace(/[ \t]+/g, ' '); },
  });
  return w;
}

function loadMetrics(w) {
  let src = fs.readFileSync(path.join(__dirname, '..', 'content-metrics.js'), 'utf8');
  const tail = src.lastIndexOf('})();');
  src = 'var chrome = { storage: { local: { set: function(){}, get: function(){ return Promise.resolve({}); } } }, runtime: { onMessage: { addListener: function(){} }, sendMessage: function(){ return Promise.resolve({}); } } };\n'
      + src.slice(0, tail)
      + ' window.__T = { scrapeAppearances, scrapeCoFollowers, scrapeCoVisitors, scrapeCoSearch, findPlan, cardValues }; })();';
  w.eval(src);
  return w.__T;
}

const tile = (n, label, extra) =>
  '<li class="member-analytics-addon-summary__list-item"><div class="display-flex align-items-center">'
  + '<p class="text-body-medium-bold pr1 text-heading-large">' + n + '</p></div><p>' + label + '</p>'
  + (extra ? '<p>' + extra + '</p>' : '') + '</li>';
const infoTile = (n, label, extra) =>
  '<li class="member-analytics-addon-info-list__item"><div class="display-flex align-items-center">'
  + '<p class="text-body-medium-bold pr1">' + n + '</p></div><p>' + label + '</p>'
  + (extra ? '<p>' + extra + '</p>' : '') + '</li>';

// 1) Personal appearances, German labels nobody ever guessed.
{
  const w = mkDom('<h2>Profilanalysen</h2><div><ul class="member-analytics-addon-summary">'
    + tile('1.315', 'Profil-Impressionen gesamt', '15 % vergangene 7 Tage')
    + tile('182', 'Erscheinungen in Suchvorgängen', '0 % vergangene 7 Tage')
    + '</ul></div><ul class="member-analytics-addon-info-list">' + infoTile('4.976', 'Etwas anderes') + infoTile('125', 'Noch etwas') + '</ul>',
    'https://www.linkedin.com/analytics/search-appearances/', 'de');
  const T = loadMetrics(w);
  const d = T.scrapeAppearances(1);
  eq('DE appearances: all (1.315 → 1315)', d['All Appearances'], 1315);
  eq('DE appearances: search', d['Search Appearances'], 182);
}

// 2) Company followers, German.
{
  const w = mkDom('<div><ul class="member-analytics-addon-info-list">'
    + infoTile('1.107', 'Follower:innen gesamt') + infoTile('34', 'Neue Follower:innen in den letzten 30 Tagen', '47,7 %')
    + '</ul></div>', 'https://www.linkedin.com/company/5746687/admin/analytics/followers/', 'de');
  const d = loadMetrics(w).scrapeCoFollowers(1);
  eq('DE company followers: total', d['Company Followers'], 1107);
  eq('DE company followers: new', d['Company New Followers'], 34);
}

// 3) Company visitors, German — unique visitors is the SECOND tile, not the first.
{
  const w = mkDom('<div><ul class="member-analytics-addon-info-list">'
    + infoTile('222', 'Seitenaufrufe', '6,7 %') + infoTile('83', 'Besucher:innen (einmalig)', '3,5 %') + infoTile('0', 'Klicks auf benutzerdefinierte Schaltfläche')
    + '</ul></div>', 'https://www.linkedin.com/company/5746687/admin/analytics/visitors/', 'de');
  const d = loadMetrics(w).scrapeCoVisitors(1);
  eq('DE company visitors: unique', d['Company Unique Visitors'], 83);
  eq('DE company visitors: custom clicks', d['Company Custom Clicks'], 0);
}

// 4) Company search appearances.
{
  const w = mkDom('<ul class="member-analytics-addon-summary">' + tile('543', 'Seitensuchen', '22,9 % letzte 7 Tage') + '</ul>',
    'https://www.linkedin.com/company/5746687/admin/analytics/search-appearances/', 'de');
  eq('DE company search appearances', loadMetrics(w).scrapeCoSearch(1)['Company Search Appearances'], 543);
}

// 5) A strip with an unexpected tile count is NOT read by position.
{
  const w = mkDom('<ul class="member-analytics-addon-summary">' + tile('9', 'a') + tile('8', 'b') + tile('7', 'c') + '</ul>',
    'https://www.linkedin.com/analytics/search-appearances/', 'de');
  eq('3-tile strip refused for a 2-tile page', loadMetrics(w).cardValues('summary', 2), null);
}

// 6) Premium plan on the German hub (real text from David's diagnostic, 2026-10-18).
{
  const w = mkDom('', 'https://www.linkedin.com/premium/sb/explore/', 'de');
  const T = loadMetrics(w);
  const DE = 'Premium\nDr. David Liese\nFügen Sie Premium für Enzymicals AG hinzu\nPremium-Seite für 0 € testen\nFreund:in empfehlen\n'
    + 'Verschenken Sie eine kostenlose, 2-monatige Probeversion von Premium Business.\nDetails zu Ihrer Mitgliedschaft\nSales Navigator Core\n'
    + 'Wird am 24. Oktober 2026 verlängert\n';
  eq('DE plan from "Details zu Ihrer Mitgliedschaft"', T.findPlan(DE), 'Sales Navigator Core');
  eq('unknown heading → product-name fallback', T.findPlan('Ihre Mitgliedschaft XYZ\nSales Navigator Advanced\n'), 'Sales Navigator Advanced');
  eq('advertised trial is NOT a plan', T.findPlan('Try Sales Navigator Core for free\n'), null);
}

// 7) SSI ranks by structure — German page, real numbers from David's 2026-10-18 capture.
function loadSsi(w) {
  let src = fs.readFileSync(path.join(__dirname, '..', 'content-ssi.js'), 'utf8');
  const tail = src.lastIndexOf('})();');
  src = 'var chrome={runtime:{sendMessage:function(){return Promise.resolve({})},onMessage:{addListener:function(){}}}};'
      + 'var setTimeout=function(){};'
      + src.slice(0, tail) + ' window.__S={ranksFromDom:ranksFromDom,blockedReason:blockedReason}; })();';
  w.eval(src);
  return w.__S;
}
const rank = (name, scoreHtml) => '<div class="ssi-rank ssi-report__container group-scores-count--3 container-plain flex flex-1">'
  + '<div class="ssi-rank__category-name flex-1 order-1 mt2 t-24">' + name + '</div>'
  + '<div class="ssi-rank__category-score flex-1 t-black--light t-24">' + scoreHtml + '</div></div>';
{
  const w = mkDom('<div class="ssi-ranks flex mh-3">'
    + rank('SSI-Ranking des Teams', '<span class="t-black t-40">1</span> von 1')
    + rank('SSI-Ranking der Branche', '<span class="t-italic">Top</span> <span class="mh1 t-black t-40">5</span> %')
    + rank('SSI-Ranking des Netzwerks', '<span class="t-italic">Top</span> <span class="mh1 t-black t-40">19</span> %')
    + '</div>', 'https://www.linkedin.com/sales/ssi', 'de');
  const r = loadSsi(w).ranksFromDom();
  eq('DE SSI industry rank (was stored as network)', r.industry, 5);
  eq('DE SSI network rank', r.network, 19);
}
{
  // No team on the account: only the two percentile boxes.
  const w = mkDom('<div class="ssi-ranks">'
    + rank('Classement SSI du secteur', 'Top <span>3</span> %') + rank('Classement SSI du réseau', 'Top <span>12</span> %')
    + '</div>', 'https://www.linkedin.com/sales/ssi', 'fr');
  const r = loadSsi(w).ranksFromDom();
  eq('FR SSI ranks without a team box', r.industry + '/' + r.network, '3/12');
}
{
  // LinkedIn's SSI retirement notice (vincent.puard, 2026-10-17).
  const w = mkDom('', 'https://www.linkedin.com/sales/ssi', 'en');
  const b = loadSsi(w).blockedReason('Your Social Selling Index\nCurrent Social Selling Index\nYou do not have access to SSI\nYour access to the Social Selling Index (SSI) has been discontinued.');
  eq('SSI discontinued is recognised, not called a render failure', b && b.code, 'ssi_discontinued');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
