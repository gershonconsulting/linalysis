# Linalysis 0.3.5 — deploy handoff for Charles (2026-10-13)

Two steps. Each takes about a minute. Nothing else is needed from Olivier.

## Step 1 — Worker (server) ❌ not deployed yet
1. Open https://dash.cloudflare.com (signed in as oattia@gmail.com).
2. Press F12 → Console. Paste the whole file `deploy/worker-ssi-ranks-2026-10-13.js` from this
   branch, then press Enter.
3. It prints `DEPLOY 200 true`. If it prints `ABORT …`, nothing was deployed. Send the message to Claude.
4. Check https://api.linalysis.net/api/version → `2026-10-13.2200-ssi-ranks-company-receipts`.
5. On https://linalysis.net/admin (signed in as admin), console:
   `fetch('https://api.linalysis.net/api/admin/fix-ssi-ranks',{method:'POST',credentials:'include'}).then(r=>r.json()).then(console.log)`
   This corrects past days. Expect rows_fixed > 0 for zeitount@gmail.com and david.liese12@gmail.com.

What it fixes:
- **German and French SSI ranks.** The network rank was saved with the industry number
  (zeitount 1 instead of 6, David 3 instead of 12), and the industry rank was never saved. The server now
  re-reads both from the SSI page text the extension already sends. That covers David on v0.2.9
  without a reinstall.
- **The daily report said "Company: not configured" when the real reason was something else.** For example,
  Anne Bougel has no admin access to the ALTAVIA Page, and the report now says so.

## Step 2 — Extension 0.3.5 + site ❌ not deployed yet
Merge the pull request from branch `release-0.3.5` into `main`. The deploy workflow builds
`linalysis-extension-0.3.5.zip` automatically, and `extension/updates.xml` says 0.3.5.

Extension changes (all tested against real German and French page text captured on 2026-10-13):
- SSI industry and network ranks are read correctly in every language (same bug as above, fixed at the source)
- German "In Suchen erschienen" / "Alle Ansichten" → search + all appearances
- French "Recherches de la Page" → company page searches
- A Company Page the account is not admin of is reported as "no admin access", not as "signed out"
- If Chrome's local cache was wiped, the extension falls back to the Company Page Linalysis already knows
- Company name no longer recorded as "LinkedIn"

⚠ Accounts installed with "Load unpacked" only get 0.3.5 by reinstalling it. Today that is David
(still on 0.2.9) and Vincent (0.2.9). Step 1 fixes David's ranks without a reinstall.
