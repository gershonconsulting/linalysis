// Unit tests for the v0.2.8 metric reader in content-metrics.js.
// Every fixture below is a reconstruction of a layout that actually produced bad data in
// production, so a regression here is a regression that already cost real history once.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const SRC = require('path').join(__dirname, '..', 'content-metrics.js');
let src = fs.readFileSync(SRC, 'utf8');
const EXPORTS = `
  if (typeof window !== 'undefined') window.__T = {
    tileValue, countNearLabel, bareNumber, adjacentNumber, metric, put, withinBounds, parseCount,
    scrapeCoFollowers, scrapeCoUpdates, scrapeCoVisitors, scrapeProfileViews, scrapeAppearances, scrapeCoSearch,
  };
})();`;
const tail = src.lastIndexOf('})();');
if (tail < 0) { console.error('could not find IIFE tail'); process.exit(1); }
src = 'var chrome = { storage: { local: { set: function(){} } }, runtime: { onMessage: { addListener: function(){} }, sendMessage: function(){ return Promise.resolve({}); } } };\n'
    + src.slice(0, tail) + EXPORTS;

let pass = 0, fail = 0;
function eq(name, got, want) {
  const ok = got === want;
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)); }
}

function load(bodyHtml) {
  const dom = new JSDOM('<!doctype html><html lang="en"><body>' + bodyHtml + '</body></html>',
    { url: 'https://www.linkedin.com/company/3595691/admin/analytics/followers/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const w = dom.window;
  // jsdom has no layout, so innerText is undefined. The scraper reads it everywhere; approximate it
  // with textContent shaped into lines, which is what LinkedIn's real innerText looks like.
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    get() {
      const walk = el => {
        let out = '';
        for (const n of el.childNodes) {
          if (n.nodeType === 3) out += n.nodeValue;
          else if (n.nodeType === 1) {
            const block = /^(DIV|P|LI|TR|SECTION|H1|H2|H3|H4|H5|H6|TD|TH|UL|OL|MAIN|HEADER|FOOTER|ARTICLE|SPAN)$/.test(n.tagName);
            const inner = walk(n);
            out += block ? '\n' + inner + '\n' : inner;
          }
        }
        return out;
      };
      return walk(this).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
    },
    configurable: true,
  });
  w.eval(src);
  return w;
}

// Every fixture below is the REAL structure captured from Olivier's live LinkedIn pages on
// 2026-08-26, not an approximation. A LinkedIn analytics card is four sibling <p> elements —
// value, label, delta, caption — inside one container div.

// linkedin.com/analytics/profile-views/ — the page that stopped reporting on 24 Aug.
const VIEWS = `
<main>
  <div class="card"><p>1,156</p><p>Profile viewers</p><p>104%</p><p>vs. prior 7 days</p></div>
  <div class="chart-wrap"><h6>Chart</h6>
    <div>The chart has 1 Y axis displaying values. Data ranges from 63 to 139.</div>
    <svg class="highcharts-root"><text>Jun 3</text><text>Aug 22</text><text>0</text><text>100</text><text>200</text></svg>
  </div>
  <ul><li>Liz Owens</li><li>• 2nd</li><li>Viewed 18m ago</li><li>1 mutual connection</li></ul>
</main>`;

// linkedin.com/analytics/search-appearances/ — a WEEKLY figure LinkedIn republishes once a week.
const APPEARANCES = `
<main>
  <h2>Profile appearances</h2>
  <p>How often your profile appeared across LinkedIn between August 11 - August 17.</p>
  <div class="card"><p>777</p><p>All appearances</p><p>29% past 7 days</p></div>
  <div class="card"><p>277</p><p>Search appearances</p><p>0% past 7 days</p></div>
  <div><p>Posts  54.4%</p><p>Search  35.6%</p></div>
</main>`;

// company/…/admin/analytics/followers/ — note the label is now "New followers in the last 30 days".
const FOLLOWERS = `
<main>
  <nav><a>Content</a><a>Visitors</a><a>Followers</a><a>Search appearances</a></nav>
  <h2>Follower highlights</h2>
  <div class="card"><p>1,692</p><p>Total followers</p></div>
  <div class="card"><p>88</p><p>New followers in the last 30 days</p><p>34.8%</p></div>
  <div class="chart-wrap"><svg class="highcharts-root"><text>Jul 26</text><text>Aug 20</text><text>-5</text></svg></div>
</main>`;

// company/…/admin/analytics/visitors/ — three tiles in a row; "7.8%" sits between two of them.
const VISITORS = `
<main>
  <h2>Visitor highlights</h2>
  <div class="card"><p>153</p><p>Page views</p><p>7.8%</p></div>
  <div class="card"><p>122</p><p>Unique visitors</p><p>17%</p></div>
  <div class="card"><p>0</p><p>Custom button clicks</p></div>
</main>`;

// company/…/admin/analytics/updates/ — the real tile reads 580. Below it, the boost upsell offers
// "Get up to 190,000 more impressions", and 190,000 is exactly what went into history for three days.
const UPDATES = `
<main>
  <p>Data for 7/26/2026 - 8/24/2026</p>
  <div class="card"><p>580</p><p>Impressions</p><p>46.5%</p></div>
  <div class="card"><p>4</p><p>Reactions</p></div>
  <div class="post-row">
    <p>Olivier Attia</p><p>8/25/2026</p>
    <p>Get up to 190,000 more impressions by boosting this post.</p>
    <button>Boost</button>
  </div>
</main>`;

// company/…/admin/analytics/search-appearances/ — the nav tab "Search appearances" appears in the
// document BEFORE the real metric, whose label is "Page searches".
const CO_SEARCH = `
<main>
  <nav><a>Content</a><a>Visitors</a><a>Followers</a><a>Search appearances</a><a>Competitors</a></nav>
  <h2>Search appearance highlights</h2>
  <p>How often your Page appeared in search results between August 18 - August 24.</p>
  <div class="card"><p>809</p><p>Page searches</p><p>9% last 7 days</p></div>
</main>`;

console.log('\ncontent-metrics.js — v0.2.8 metric reader (fixtures captured live 2026-08-26)');

console.log('\n[bareNumber] deltas and date ticks are not values');
{
  const T = load('<main></main>').__T;
  eq('"1,692" -> 1692',       T.bareNumber('1,692'), 1692);
  eq('"1,692 ▲ 4%" -> 1692',  T.bareNumber('1,692 ▲ 4%'), 1692);
  eq('"104%" -> null',        T.bareNumber('104%'), null);
  eq('"7.8%" -> null',        T.bareNumber('7.8%'), null);
  eq('"29% past 7 days" -> null', T.bareNumber('29% past 7 days'), null);
  eq('"24 Aug" -> null',      T.bareNumber('24 Aug'), null);
  eq('"1 mo" -> null',        T.bareNumber('1 mo'), null);
  eq('"Letzte 30 Tage" -> null', T.bareNumber('Letzte 30 Tage'), null);
  eq('"29.861" -> 29861',     T.bareNumber('29.861'), 29861);
}

console.log('\n[profile views] broke 2026-08-24 — "104%" made the tile look ambiguous');
eq('Views = 1156', load(VIEWS).__T.scrapeProfileViews(1)['Views'], 1156);

console.log('\n[appearances] weekly figure, two tiles');
{
  const out = load(APPEARANCES).__T.scrapeAppearances(1);
  eq('All Appearances = 777',    out['All Appearances'], 777);
  eq('Search Appearances = 277', out['Search Appearances'], 277);
  eq('week recorded',            out['Appearances Week'], 'August 11 – August 17');
}

console.log('\n[company followers] blank since 2026-08-24');
{
  const out = load(FOLLOWERS).__T.scrapeCoFollowers(1);
  eq('Company Followers = 1692',   out['Company Followers'], 1692);
  eq('Company New Followers = 88', out['Company New Followers'], 88);
}

console.log('\n[company visitors] blank since 2026-08-24');
{
  const out = load(VISITORS).__T.scrapeCoVisitors(1);
  eq('Company Unique Visitors = 122', out['Company Unique Visitors'], 122);
  eq('Company Custom Clicks = 0',     out['Company Custom Clicks'], 0);
}

console.log('\n[company updates] the 190,000 boost-card false positive');
eq('Company Post Impressions = 580 (not 190000)',
   load(UPDATES).__T.scrapeCoUpdates(1)['Company Post Impressions'], 580);

console.log('\n[company search] nav tab must not outrank the real tile');
eq('Company Search Appearances = 809',
   load(CO_SEARCH).__T.scrapeCoSearch(1)['Company Search Appearances'], 809);

console.log('\n[bounds] absurd values are rejected, not stored');
{
  const T = load('<main></main>').__T;
  const a = {}, b = {};
  eq('29,884 connections accepted',  T.put(a, 'Connections', 29884), true);
  eq('190,000 connections rejected', T.put(b, 'Connections', 190000), false);
  eq('  ...and recorded',            b._rejected['Connections'], 190000);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
