-- One match. Teams are null until a knockout draw decides them.
create table if not exists catalog.fixtures (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references catalog.competitions(id) on delete cascade,
  provider_ref text not null,
  season text not null,
  matchday smallint,
  -- How the round reads to people, e.g. "Matchweek 13" or "Quarter-finals".
  round_label text,
  -- Which questions fit: league and group games can end in a draw; a
  -- first leg can too, as it decides nothing on its own; a knockout game
  -- (single or second leg) and a final always send someone through.
  stage_kind text not null check (stage_kind in ('league', 'group', 'first_leg', 'knockout', 'final')),
  home_team_id uuid references catalog.teams(id) on delete set null,
  away_team_id uuid references catalog.teams(id) on delete set null,
  kickoff_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'live', 'finished', 'postponed', 'abandoned', 'cancelled')),
  -- The final score (winner, duration, full and half time...), as the
  -- provider reported it or an admin typed it. The resolvers read it to
  -- suggest each question's outcome.
  result jsonb,
  result_source text check (result_source in ('provider', 'manual')),
  -- Set when a platform admin confirms the result: the fixture questions'
  -- outcomes are final and rooms' linked questions get revealed by Crow.
  result_confirmed_at timestamptz,
  result_confirmed_by uuid references public.players(id) on delete set null,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, provider_ref)
);
create index if not exists idx_catalog_fixtures_competition_kickoff on catalog.fixtures (competition_id, kickoff_at);
create index if not exists idx_catalog_fixtures_upcoming on catalog.fixtures (kickoff_at) where status = 'scheduled';
