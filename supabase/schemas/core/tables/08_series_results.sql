-- A finished series' results, written once by complete_series: the top three
-- (placements) and its trophies (awards). Locked against changes by
-- trg_series_*_immutable, except marking them collected.

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'series_award_type'
  ) then
    create type public.series_award_type as enum (
      'LONGEST_STREAK',
      'BIGGEST_PROFIT',
      'MOST_POINTS_RISKED',
      'EVER_PRESENT',
      'SHARPSHOOTER',
      'UNDERDOG',
      'COMEBACK',
      'HOT_FINISH'
    );
  end if;
end $$;

create table if not exists public.series_placements (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  placement integer not null check (placement = any (array[1, 2, 3])),
  points numeric not null,
  collected_at timestamptz,
  created_at timestamptz not null default now(),
  unique (series_id, player_id)
);
create index if not exists idx_series_placements_series_placement
  on public.series_placements (series_id, placement, created_at);

create table if not exists public.series_awards (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  award_type public.series_award_type not null,
  value numeric not null,
  description text not null,
  collected_at timestamptz,
  created_at timestamptz not null default now(),
  tier text check (tier = any (array['gold', 'silver', 'bronze'])),
  unique (series_id, award_type, player_id)
);
create index if not exists idx_series_awards_series_type
  on public.series_awards (series_id, award_type, created_at);
