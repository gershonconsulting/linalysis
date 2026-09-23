# Linalysis 0.3.3 release — for Charles (supersedes 0.3.2) ❌ NOT DEPLOYED

## Step 1 — Worker (api.linalysis.net), ~1 minute
Open dash.cloudflare.com (signed in), press F12 → Console, paste the whole of
`deploy/charles-worker-deploy-2026-09-23.js`, press Enter.
It applies ALL pending server fixes in one go (09-11 + 09-22 + 09-22b + the new 30,000-connection warning)
to the LIVE script, checks every edit matches exactly once, checks the code loads, keeps every binding
and secret, sets BUILD 2026-09-23.1500-invites-conncap. If anything does not match it stops and deploys NOTHING —
send the console output back to Olivier in that case.

## Step 2 — Extension + site (GitHub web upload)

Follow DEPLOY-0.3.2-for-Charles.md exactly, with these files instead of the 0.3.2 ones:

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

## Worker — also ship WORKER-PATCH-2026-09-23-connection-cap.diff
Daily report now warns when an account reaches LinkedIn's 30,000-connection maximum (red block + subject tag)
and when it is within 1,000 of it (amber block). All four anchors were checked against the DEPLOYED script
(build 2026-09-03.2005-monthly): each occurs exactly once, so it applies to production as-is.
Apply after the 09-11 / 09-22 / 09-22b patches. Olivier's account is at ~29,629 → the amber warning will show on day one.
