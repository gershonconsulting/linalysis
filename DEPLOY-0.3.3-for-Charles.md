# Linalysis 0.3.3 release — for Charles (supersedes 0.3.2) ❌ NOT DEPLOYED

## Step 1 — Worker (api.linalysis.net), ~1 minute — ALL server fixes
Script: https://github.com/gershonconsulting/linalysis/blob/release-0.3.3/deploy/charles-worker-deploy-2026-09-23-full-rebased.js
(branch `release-0.3.3`, NOT main). Open dash.cloudflare.com (signed in), F12 → Console, paste the whole
script, Enter. 28 edits, every anchor checked against the LIVE script (build 2026-09-03.2005-monthly) on
2026-09-23: premium fields saved, page samples kept, per-page diagnostics, "not published on this plan",
never-set-up accounts out of the failure count, language label pack, LinkedIn disconnection alerts,
30,000-connection warning. It aborts and deploys NOTHING if any edit does not match exactly once or the
patched code does not load; keeps every binding and secret; sets BUILD 2026-09-23.1800-full-rebased.
Verify: https://api.linalysis.net/api/health shows the new build; https://api.linalysis.net/api/labels (signed in) returns a pack.
Fallback if it aborts: deploy/charles-worker-deploy-2026-09-23-safe.js on the same branch (6 edits only),
and send the console output back to Olivier.

## Step 2 — Extension + site (GitHub web upload)

Follow DEPLOY-0.3.2-for-Charles.md exactly, with these files instead of the 0.3.2 ones.
`nav.js` and `extension/updates.xml` are on the `release-0.3.3` branch. The two signed binaries (.crx and .zip)
are NOT on GitHub yet — they exist only on Olivier's Surface in C:\Users\oatti\Documents\Claude\Projects\Linalysis.
Do Step 2 only once they are on the branch: publishing updates.xml without the matching .crx breaks auto-update.

- `linalysis-extension-0.3.3.zip` (sha256 34682a57fc87fd8340007a9f5651cfac96990ae946956c5ee6e7a92b74b424e6) + `linalysis-extension.zip` (same file)
- `extension/linalysis.crx` (sha256 15ef45002191ac3ac77862255d4e0cc4ac6de346bb2638204bac4d580ff515cf, id eepopmbjjhmmgjehllmbcjpcncgkmcfb)
- `extension/updates.xml` (version 0.3.3)
- `nav.js` (latest extension version 0.3.3)

What 0.3.3 fixes — sent invitations (/mynetwork/invitation-manager/sent/), all verified live 2026-09-23:
1. The headline invitations number is the PENDING People count (the "People (448)" tab) — Olivier's decision 2026-09-23. It renders without scrolling. The sent-list scroll (10 rows at a time) is best-effort only; the extension does NOT steal window focus for it.
2. "Sent today" / "Sent yesterday" rows (no digit) were skipped — exactly the rows the 24h count is for.
3. Each distinct "Sent X ago" stamp was counted as an extra phantom invitation (23 counted for 20 rows).
4. LinkedIn changed the People/Pages tab links to /sent/CONNECTION/ and /sent/ORGANIZATION/; the language-independent fallback no longer matched, so non-English accounts (French) never got a pending count.

Users on Load-unpacked installs must still reinstall by hand (Chrome ignores update_url for those).

## 30,000-connection warning — included in Step 1
The daily report shows a red block (and a subject-line tag) when an account reaches LinkedIn's
30,000-connection maximum, and an amber block when it is within 1,000 of it. Olivier's account is at
~29,629, so the amber warning shows on the first report after Step 1.
