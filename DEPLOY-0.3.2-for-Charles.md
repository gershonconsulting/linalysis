# DEPLOY — Linalysis v0.3.2 + Worker — for Charles

Date: 2026-09-22. This session is not permitted to perform production deploys (github.com and the
Cloudflare dashboard are both refused for it), so everything below is BUILT, SIGNED and TESTED and
needs only publishing. **66 automated assertions pass** — 44 in real Chromium, 22 against the Worker
source. No code needs writing.

Background: `COLLECTION-DIAGNOSIS-2026-09-22.md`.

**Do PART A first.** It fixes the collection bugs AND turns on the disconnection alerts for every
user with no reinstall by anyone. Part B only helps users who then reinstall the extension by hand.

---

## PART A — the Worker  (highest value, no user action needed)

Deployed script `linalysis-api`, Cloudflare account `0b8434adba9af8231df90a1f3d2e6e12`.
Current build `2026-09-03.2005-monthly`.

⚠ **PATCH THE DEPLOYED SCRIPT IN PLACE. Do NOT upload `worker/src/index.mjs` over it.** The two have
drifted in BOTH directions — production has the monthly report the local file lacks. Uploading the
local file deletes the monthly report.

1. `GET /api/v4/accounts/{A}/workers/scripts/linalysis-api/content/v2` → multipart; take `index.mjs`.
2. Apply `WORKER-PATCH-2026-09-11.md` (six replacements, still unapplied).
3. Apply `WORKER-PATCH-2026-09-22.diff` (collection fixes: per-page diagnostics, "not published on
   this plan", never-set-up accounts out of the failure denominator).
4. Apply `WORKER-PATCH-2026-09-22b.diff` (languages + disconnection alerts).
5. `GET .../settings` → re-send EVERY binding (plain_text: name+text; kv_namespace: name+namespace_id;
   secret_text: `{type:'inherit', name}`), carrying `compatibility_date` forward.
6. Set `BUILD` to `2026-09-22.1700-languages-alerts`.
7. `PUT /api/v4/accounts/{A}/workers/scripts/linalysis-api` with FormData(metadata, index.mjs).

**New bindings (optional — both have working defaults):**
- `DISCONNECT_ALERT_TO`   default `report@gershonconsulting.com`
- `DISCONNECT_ALERT_FROM` default `Linalysis Alerts <linalysis@gershon.ai>`

⚠ **`RESEND_API_KEY` must be set on the Worker or no disconnection email is sent.** The endpoint
still records the state and returns `{sent:false, reason:'RESEND_API_KEY not configured'}`, so if the
alerts are silent, check that secret first.

Verify:
- `GET https://api.linalysis.net/api/version` → `2026-09-22.1700-languages-alerts`
- `GET https://api.linalysis.net/api/labels` (signed in) → a pack with `de` and `fr`
- `GET https://api.linalysis.net/api/admin/linkedin-status` → per-account connectivity

## PART B — site + extension artifacts  (GitHub web upload, 2 commits)

Extension id printed at signing: `eepopmbjjhmmgjehllmbcjpcncgkmcfb` ✅ (unchanged).

Commit 1 → `/upload/main`
  - `nav.js`                        build `2026-09-22.1700-ext032-languages-alerts`, latest ext `0.3.2`
                                    (also carries the unshipped fix that showed every user Olivier's
                                    avatar and initial, and the new "signed out of LinkedIn" banner)
  - `linalysis-extension.zip`       74,472 B  sha256 76a3533d…3ed5da
  - `linalysis-extension-0.3.2.zip` 74,472 B  same file
Commit 2 → `/upload/main/extension`
  - `linalysis.crx`   74,997 B  sha256 aecd2d317a585ceab9e20d2264b69ffbf107d2e31424d00f1702eac3ed81b211
  - `updates.xml`     version 0.3.2, hash matches the crx above

Pages deploys automatically on push to `main` (~40s). **Verify every URL from a linalysis.net tab**,
not a github.com tab — a Pages 404 is served as HTTP 200 and looks like a successful deploy.

## PART C — two things only a person can do

1. **Sign in to LinkedIn AND Sales Navigator** in the Chrome profile that runs the extension on
   Olivier's computer. `/sales/ssi` redirects to `/sales/login` there today.
2. **Every user must reinstall the extension by hand.** These are "Load unpacked" installs and
   Chrome ignores `update_url` for those. All five accounts run v0.2.9 today.

## What proves it worked

- **Languages:** the daily report grows a LANG column; `GET /api/labels` returns the pack; adding a
  German label from now on is `PUT /api/admin/labels`, not a new extension build.
- **Disconnection:** signing out of LinkedIn in a collecting Chrome profile raises a desktop
  notification on that machine within one sync, puts a red bar on linalysis.net, and emails
  report@gershonconsulting.com: *"<name> (<email>) from <company> was disconnected from LinkedIn from
  this Chrome Browser (IP, country, city)."* Once on the transition, then at most once a day.
- **Collection:** InMail Credits reads "not published by LinkedIn on this plan" in grey rather than a
  red ✗; Premium Plan and the renewal date appear for the first time; the headline counts 5
  configured accounts, not 8; any page still failing prints its own page sample underneath it.
