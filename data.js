// Linalysis dataset — empty scaffold. Live data is fed by the Chrome extension via /api/ingest/linkedin.
// data.js used to bake in a historical CSV — that data was intentionally wiped on 2026-07-24. Everything now
// comes from KV via live-data.js. If a signed-in visitor's live-data fetch fails, they see the empty state.
(function(){
  var OWNER = "olivier@attia.com";
  window.LINALYSIS_DATA = { dates: [], metrics: {}, meta: { owner_email: OWNER, first_time_user: true, source: 'empty' }, insights: [] };
})();
