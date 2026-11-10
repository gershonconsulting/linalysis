-- Task [11] LinkedIn account health check (weekly) - tables + snapshot function.
-- Project: zywlzopoxhkbblembkja. Safe to re-run (idempotent).
-- Reads li_gate_accounts / li_gate_ledger; never writes to them.

create table if not exists public.li_health_checks (
  id               bigserial primary key,
  run_id           uuid        not null,
  checked_at       timestamptz not null default now(),
  account_key      text        not null,           -- '__run__' for a run-level 'Check failed' row
  label            text,
  health           text        not null check (health in ('OK','Degraded','Restricted','Check failed')),
  reasons          text[]      not null default '{}',
  gate_status      text,
  restricted_until timestamptz,
  daily_cap        integer,
  weekly_cap       integer,
  telemetry        boolean     not null default false, -- false = zero ledger rows ever ('no telemetry')
  ledger_rows      bigint,
  last_ledger_ts   timestamptz,
  v24              bigint,     -- null when no telemetry (never 0)
  v7d              bigint,
  denies_7d        bigint,
  error            text
);
create index if not exists li_health_checks_run_idx     on public.li_health_checks (run_id);
create index if not exists li_health_checks_account_idx on public.li_health_checks (account_key, checked_at desc);

create table if not exists public.li_health_incidents (
  id            bigserial primary key,
  account_key   text        not null,
  health        text        not null check (health in ('Degraded','Restricted','Check failed')),
  reasons       text[]      not null default '{}',
  opened_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  closed_at     timestamptz,
  first_run_id  uuid        not null,
  last_run_id   uuid        not null,
  weeks_open    integer     not null default 1
);
-- at most one open incident per account
create unique index if not exists li_health_incidents_one_open
  on public.li_health_incidents (account_key) where closed_at is null;

-- Service-role only (edge function). No policies = no anon/authenticated access.
alter table public.li_health_checks    enable row level security;
alter table public.li_health_incidents enable row level security;
revoke all on public.li_health_checks, public.li_health_incidents from anon, authenticated;

-- The two health queries, joined: one row per real account (templates skipped).
-- ledger_rows = 0 means 'no telemetry'; the function reports null volumes for those.
create or replace function public.li_health_snapshot()
returns table (
  account_key text, label text, gate_status text, restricted_until timestamptz,
  daily_cap int, weekly_cap int, hourly_cap int, notes text, updated_at timestamptz,
  ledger_rows bigint, last_ledger_ts timestamptz, v24 bigint, v7d bigint, denies_7d bigint
)
language sql stable security invoker set search_path = public
as $$
  select a.account_key, a.label, a.status, a.restricted_until,
         a.daily_cap, a.weekly_cap, a.hourly_cap, a.notes, a.updated_at,
         coalesce(l.ledger_rows, 0), l.last_ts,
         case when coalesce(l.ledger_rows,0) = 0 then null else coalesce(l.v24, 0) end,
         case when coalesce(l.ledger_rows,0) = 0 then null else coalesce(l.v7d, 0) end,
         case when coalesce(l.ledger_rows,0) = 0 then null else coalesce(l.denies_7d, 0) end
  from public.li_gate_accounts a
  left join (
    select g.account_key,
           count(*)                                                                     as ledger_rows,
           max(g.ts)                                                                    as last_ts,
           sum(g.units) filter (where g.decision = 'allow' and g.ts > now() - interval '24 hours') as v24,
           sum(g.units) filter (where g.decision = 'allow' and g.ts > now() - interval '7 days')   as v7d,
           count(*)     filter (where g.decision <> 'allow' and g.ts > now() - interval '7 days')  as denies_7d
    from public.li_gate_ledger g
    group by g.account_key
  ) l on l.account_key = a.account_key
  where a.account_key not like '%-template'
  order by a.account_key;
$$;
revoke all on function public.li_health_snapshot() from public, anon, authenticated;
grant execute on function public.li_health_snapshot() to service_role;
