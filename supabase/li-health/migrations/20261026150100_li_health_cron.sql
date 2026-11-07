-- Task [11] LinkedIn account health check (weekly) - schedule.
-- Apply ONLY after: (1) the edge function li-health-weekly is deployed,
-- (2) the Vault secret 'li_health_cron_secret' exists (same value as the function secret
--     LI_HEALTH_CRON_SECRET). See ../README.md.
-- Runs Monday 15:00 UTC.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

-- Re-runnable: drop the old job of the same name first.
do $$
begin
  if exists (select 1 from cron.job where jobname = '11-li-health-weekly') then
    perform cron.unschedule('11-li-health-weekly');
  end if;
end $$;

select cron.schedule(
  '11-li-health-weekly',
  '0 15 * * 1',
  $job$
  select net.http_post(
    url     := 'https://zywlzopoxhkbblembkja.supabase.co/functions/v1/li-health-weekly',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'li_health_cron_secret')
    ),
    body    := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 60000
  );
  $job$
);
