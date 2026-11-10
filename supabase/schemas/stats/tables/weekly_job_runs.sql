-- The Monday job's progress, one row per series and step for each week, so a
-- failed step can be retried without redoing (or re-announcing) the rest.
--   snapshot: standings recorded · topup: weekly points paid · recap: push sent
create table if not exists private.weekly_job_runs (
  week_key text not null,
  series_id uuid not null references public.series(id) on delete cascade,
  step text not null check (step in ('snapshot', 'topup', 'recap')),
  status text not null check (status in ('done', 'failed')),
  attempts integer not null default 1,
  -- The last failure's message, for whoever looks into it.
  error text,
  updated_at timestamptz not null default now(),
  primary key (week_key, series_id, step)
);
