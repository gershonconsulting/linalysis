# Linalysis 0.3.3 release — for Charles (supersedes 0.3.2) ❌ NOT DEPLOYED

## Step 1 — Worker (api.linalysis.net), ~1 minute
Open dash.cloudflare.com (signed in), press F12 → Console, paste the whole of
`deploy/charles-worker-deploy-2026-09-23-safe.js`, press Enter.
It makes 6 edits to the LIVE script, and each anchor has been checked against production: the
30,000-connection warning in the daily report, the premium fields saved at ingest, and page samples
kept on failing pages. It checks that every edit matches exactly once, that the code still loads,
keeps every binding and secret, and sets BUILD 2026-09-23.1600-conncap-premium. If anything does not
match, it stops and deploys NOTHING — send the console output back to Olivier in that case.

⚠ The bigger `deploy/charles-worker-deploy-2026-09-23.js` (languages, disconnection alerts, per-page
diagnostics) was written against the LOCAL Worker copy, which differs from production. It has NOT been
checked against the live script and will most likely stop safely at the first mismatch. Don't use it
until someone re-bases those patches on the live code.

## Step 2 — Extension + site (GitHub web upload)

Follow DEPLOY-0.3.2-for-Charles.md exactly, with these files instead of the 0.3.2 ones.
The text files are on the `release-0.3.3` branch of gershonconsulting/linalysis; the two signed binaries
(.crx and .zip) exist only in Olivier's Linalysis folder on his Surface (C:\Users\oatti\Documents\Claude\Projects\Linalysis).

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
