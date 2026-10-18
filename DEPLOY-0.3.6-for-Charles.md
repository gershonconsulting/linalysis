# Linalysis 0.3.6 — deploy handoff for Charles (2026-10-15)

Approved by Olivier 2026-10-15. Replaces DEPLOY-0.3.5-for-Charles.md (0.3.6 includes everything in 0.3.5).
Three steps, about 3 minutes in total. Nothing is needed from Olivier.

## Step 1 — Worker (server) ❌ not deployed yet
The patch was already dry-run against the live Worker on 2026-10-15. All 6 edits land exactly once, the
script parses, and every binding is kept.

1. Open https://dash.cloudflare.com in the Oattia Chrome (signed in as oattia@gmail.com).
2. Press F12 → Console. Paste this ONE line and press Enter:

   `fetch('https://raw.githubusercontent.com/gershonconsulting/linalysis/release-0.3.6/deploy/worker-release-0.3.6-2026-10-15.js').then(r=>r.text()).then(s=>(0,eval)(s)).then(console.log)`

3. It prints `DEPLOY 200 true`. If it prints `ABORT …`, nothing was deployed: send the message to Claude.
4. Check https://api.linalysis.net/api/version → `2026-10-15.0600-ssi-ranks-credits`.

## Step 2 — Correct past SSI ranks ❌
On https://linalysis.net/admin (signed in as admin), console:

`fetch('https://api.linalysis.net/api/admin/fix-ssi-ranks',{method:'POST',credentials:'include'}).then(r=>r.json()).then(console.log)`

Expect rows_fixed > 0 for zeitount@gmail.com and david.liese12@gmail.com.

## Step 3 — Site + extension 0.3.6 ❌ (only AFTER step 1 shows the new build)
Merge PR https://github.com/gershonconsulting/linalysis/pull/2 into `main`. The deploy workflow publishes
the site (new Credits page) and the 0.3.6 extension zip. Close PR #1, which this one supersedes.

## What ships
- Worker: German/French SSI ranks fixed at the server (works for every installed extension version);
  daily report shows the real Company Page failure reason; new Credits data route
  `GET /api/data/credits` and the 7 new network-reader columns.
- Site: rebuilt Credits page showing InMail % used, connections new vs removed, and invitations sent per day.
- Extension 0.3.6: reads LinkedIn's own JSON endpoints for connections, invitations and InMail.

⚠ Accounts installed with "Load unpacked" only get 0.3.6 by reinstalling the zip
(today: david.liese12 and vincent.puard are still on 0.2.9).
