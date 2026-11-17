# [11] LinkedIn account health check (weekly) - Supabase go-live package

Replaces Claude scheduled task #11 with a native job in Supabase project
`zywlzopoxhkbblembkja` (the project that owns the LinkedIn Access Gate:
`li_gate_accounts`, `li_gate_ledger`, edge function `linkedin-gate`).

Nothing here has been applied. Go-live needs Olivier's OK.

## What it does

Every Monday 15:00 UTC, pg_cron calls the edge function `li-health-weekly` through pg_net.
The function:

1. Reads `public.li_health_snapshot()`, one row per real gate account (`*-template` skipped), with
   allowed units in the last 24h/7d, denies in 7d, and total ledger rows.
2. Classifies each account:
   - **Restricted**: gate status `restricted` or `restricted_until` in the future
   - **Degraded**: status `paused`, or denies_7d > 0, or 24h >= 80% of `daily_cap`, or 7d >= 80% of `weekly_cap`
   - **OK**: everything else
   - zero ledger rows = **no telemetry** (volumes stored as null, never 0)
   - snapshot query error = one run-level **Check failed** row (`account_key = '__run__'`)
3. Writes one row per account to `li_health_checks`, and opens, updates or closes rows in `li_health_incidents`
   (one open incident per account; `weeks_open` counts how many weekly runs it has lasted).
4. Emails `report@gershonconsulting.com` from `LinkedIn Health <alerts@gershon.ai>` via Resend,
   **only** when something is Degraded, Restricted or Check failed.
   Subject: `[11] LinkedIn health — <summary> — <YYYY-MM-DD>`, e.g. `[11] LinkedIn health — 8 Degraded, 3 OK — 2026-11-02`.

## Files

| File | Purpose |
|---|---|
| `migrations/20261026150000_li_health_tables.sql` | `li_health_checks`, `li_health_incidents` (RLS on, service role only), `li_health_snapshot()` |
| `migrations/20261026150100_li_health_cron.sql` | enables `pg_cron` + `pg_net` (neither is installed today), schedules job `11-li-health-weekly` (`0 15 * * 1`) |
| `functions/li-health-weekly/index.ts` | the edge function (`?dry_run=1` = no writes/no email; `?force_email=1` = always email) |
| `functions/li-health-weekly/config.toml` | `verify_jwt = false` (the function checks `x-cron-secret` itself) |

## Secrets

| Where | Name | Value |
|---|---|---|
| Edge function secrets | `RESEND_API_KEY` | Resend key with send access on `gershon.ai` (domain verified in Resend). No function in this project uses it yet, so it must be added. |
| Edge function secrets | `LI_HEALTH_CRON_SECRET` | a new random string (e.g. 40 hex chars) |
| Vault | `li_health_cron_secret` | the same random string, read by the cron job |
| Edge function secrets (optional) | `LI_HEALTH_TO` | override recipient; default `report@gershonconsulting.com` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

## Go-live steps (in order; done by Claude via the Supabase MCP once Olivier approves)

1. **Apply migration 1**: `apply_migration` name `li_health_tables`, content of `20261026150000_li_health_tables.sql`.
   Check: `select * from public.li_health_snapshot();` returns the real accounts.
2. **Set function secrets** `RESEND_API_KEY` and `LI_HEALTH_CRON_SECRET` (Supabase dashboard -> Edge Functions -> Secrets;
   Charles does this dashboard step).
3. **Create the Vault secret** with the same value:
   `select vault.create_secret('<same random string>', 'li_health_cron_secret', 'Task 11 cron -> li-health-weekly');`
4. **Deploy the function**: `deploy_edge_function` name `li-health-weekly`, file `index.ts`, `verify_jwt: false`.
5. **Apply migration 2 without the schedule first** is not needed; instead enable pg_net only:
   `create extension if not exists pg_net with schema extensions;`
6. **Dry run** (no writes, no email):
   `select net.http_post(url := 'https://zywlzopoxhkbblembkja.supabase.co/functions/v1/li-health-weekly?dry_run=1', headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='li_health_cron_secret')), body := '{}'::jsonb);`
   then `select status_code, content from net._http_response order by created desc limit 1;`
   Compare with the statuses in the PR description.
7. **One real run with email**: same call with `?force_email=1`. Check the email arrives at report@gershonconsulting.com
   and rows appear in `li_health_checks` / `li_health_incidents`.
8. **Apply migration 2**: `apply_migration` name `li_health_cron`, content of `20261026150100_li_health_cron.sql`.
   Check: `select jobname, schedule, active from cron.job where jobname = '11-li-health-weekly';`
9. **Retire Claude scheduled task #11** (disable it) after the first Monday run is confirmed in
   `cron.job_run_details` and `li_health_checks`.

## Rollback

```sql
select cron.unschedule('11-li-health-weekly');
-- optional: drop table public.li_health_incidents, public.li_health_checks; drop function public.li_health_snapshot();
```
Then delete the `li-health-weekly` function and re-enable Claude task #11.

## Before merging this branch

The Cloudflare Pages deploy (`.github/workflows/deploy.yml`) uploads the repo root. Add `'supabase'` to the
`.assetsignore` list in that workflow before merging, or the SQL/TS files would be served on linalysis.com.
(Not changed in this PR: the integration that pushed it has no permission to edit workflow files.)
The go-live itself does not need the merge: everything is applied from this branch via the Supabase MCP.

## Note on paused accounts

By the rule above every `paused` account is Degraded. The gate holds several paused test or auto-registered keys
(`radar-__t__`, `radar-__t2__`, `radar-zzTestPrio1`, ...), so the email will go out every week until they are removed
from `li_gate_accounts` or the rule is changed. That is Olivier's call, not done here.
