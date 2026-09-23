# Worker patch — 2026-09-11 — collection fixes (NOT YET DEPLOYED ❌)

Apply to the **deployed** `linalysis-api` script, NOT to `worker/src/index.mjs`.
The local file (2026-08-28) and production (build `2026-09-03.2005-monthly`) have drifted in
BOTH directions: prod has the monthly report the local file lacks; the local file has the
`sample` fix prod lacks. Overwriting prod with the local file would delete the monthly report.

Route (verified working today, read-only calls already succeeded):
from a `dash.cloudflare.com` tab, account `0b8434adba9af8231df90a1f3d2e6e12`
1. `GET  /api/v4/accounts/{A}/workers/scripts/linalysis-api/content/v2` → multipart, take the `index.mjs` part
2. apply the six string replacements below (each anchor verified to occur EXACTLY once)
3. `GET  .../settings` → re-send every binding (plain_text: name+text, kv_namespace: name+namespace_id,
   secret_text: `{type:'inherit', name}`), carry `compatibility_date` forward
4. `PUT  /api/v4/accounts/{A}/workers/scripts/linalysis-api` with FormData(metadata, index.mjs)
5. set the `BUILD` plain_text binding to `2026-09-11.1345-collection-fixes`

## Edit 1 — restore the diagnostic sample  (this is why every bug below stayed invisible)
FIND (inside `userCollectReport`):
```
        visible: body.visible === true || body.visible === false ? body.visible : null,
        at: new Date().toISOString(),
```
REPLACE: same, with this line inserted before `at:`
```
        sample: body.sample ? String(body.sample).slice(0, 3000) : null,
```

## Edit 2 — map the premium fields at ingest  (the premium page could never succeed)
FIND: `const CSV_TO_COL = {`
REPLACE: same, followed by
```
  'InMail Credits':  'inmail_credits',
  'Inmail Credits':  'inmail_credits',
  'Premium Plan':    'premium_plan',
  'Premium Renews':  'premium_renews',
```

## Edit 3 — a metric LinkedIn does not publish is not a broken selector
FIND:    `    page: 'premium', core: false,`
REPLACE: `    page: 'premium', core: false, soft: ['InMail Credits'],`

## Edit 4/5/6 — teach computePages about soft fields
FIND:    `    const got = [], lost = [];`
REPLACE: `    const got = [], lost = [], absent = [];`

FIND:    `      if (v == null || v === '') lost.push(label); else got.push(label);`
REPLACE: `      if (v == null || v === '') { if (src.soft && src.soft.indexOf(label) >= 0) absent.push(label); else lost.push(label); } else got.push(label);`

FIND:    `      state, captured: got, missing: lost,`
REPLACE: `      state, captured: got, missing: lost, absent,`

## Verify after deploy
- `GET https://api.linalysis.net/api/version` → `2026-09-11.1345-collection-fixes`
- tomorrow 07:00 ET the report must show the premium row GREEN (plan + renewal captured)
- any still-failing page must now print its page sample under "page landed on …"
