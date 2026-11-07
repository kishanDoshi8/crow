create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  series_id uuid references public.series(id) on delete set null,
  series_prediction_number integer,
  created_by uuid not null references public.players(id),
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'locked', 'revealed', 'cancelled', 'no_result')),
  deadline timestamptz not null,
  winning_option_id uuid,
  affects_rating boolean not null default true,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- Who revealed, marked no result, or cancelled it.
  resolved_by uuid references public.players(id) on delete set null,
  notified_1h boolean not null default false,
  -- Set once staff have been pushed that the result is overdue.
  notified_result_needed boolean not null default false,
  -- Optional context shown on the prediction page: how it's decided, etc.
  description text check (description is null or char_length(description) <= 500),
  -- Set when organizers fix a result after it was revealed.
  corrected_at timestamptz,
  corrected_by uuid references public.players(id) on delete set null,
  -- False for predictions revealed before rating changes were recorded per
  -- bet: their ratings can't be undone, so their result can't be corrected.
  ratings_reversible boolean not null default true
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'predictions_series_assignment_check'
      and conrelid = 'public.predictions'::regclass
  ) then
    alter table public.predictions
      add constraint predictions_series_assignment_check
      check (
        (series_id is null and series_prediction_number is null)
        or (series_id is not null and series_prediction_number is not null)
      );
  end if;
end $$;

create table if not exists public.prediction_options (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  label text not null,
  display_order smallint not null default 0,
  total_bet integer not null default 0 check (total_bet >= 0),
  created_at timestamptz not null default now()
);


alter table public.predictions
  drop constraint if exists fk_predictions_winning_option,
  add constraint fk_predictions_winning_option foreign key (winning_option_id) references public.prediction_options(id);
create index if not exists idx_predictions_room_status on public.predictions(room_id, status);
-- The every-minute lock job and the reminder jobs look across all rooms for
-- open or locked predictions by deadline.
create index if not exists idx_predictions_open_deadline on public.predictions(deadline) where status in ('draft', 'locked');
create index if not exists idx_predictions_room_status_deadline on public.predictions(room_id, status, deadline asc);
create index if not exists idx_predictions_room_resolved on public.predictions (room_id, status, resolved_at desc) where status in ('revealed', 'cancelled', 'no_result');
create unique index if not exists idx_predictions_series_number_unique on public.predictions (series_id, series_prediction_number) where series_id is not null and series_prediction_number is not null;
create index if not exists idx_predictions_series_id on public.predictions (series_id);

create or replace function private.enforce_series_prediction_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.series_prediction_number is not null and new.series_prediction_number is distinct from old.series_prediction_number then
    raise exception 'series_prediction_number cannot be changed once assigned' using errcode = 'P0001';
  end if;

  if old.series_prediction_number is not null and new.series_id is distinct from old.series_id then
    raise exception 'series_id cannot be changed after series_prediction_number is assigned' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_predictions_series_immutable on public.predictions;
create trigger trg_predictions_series_immutable
before update on public.predictions
for each row
execute function private.enforce_series_prediction_immutability();
