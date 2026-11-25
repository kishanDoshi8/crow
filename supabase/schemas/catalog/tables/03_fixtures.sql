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
  -- Cricket: the format (Test, ODI, T20), which decides the questions and
  -- how long the match runs. Null for football.
  match_format text check (match_format in ('test', 'odi', 't20')),
  -- The match's own name where it has one ("1st Test") and where it's
  -- played, shown under the teams.
  label text,
  venue text,
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
  -- When the feed last told us how this match stands after kickoff, so the
  -- result checks (one provider call per match for cricket) aren't repeated
  -- too often. See private.fixture_result_due.
  result_checked_at timestamptz,
  -- Pushes to Crow admins about this match waiting to be confirmed: when it
  -- was first ready, and the one reminder if it's still waiting 6 hours on.
  admin_alerted_at timestamptz,
  admin_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, provider_ref)
);
create index if not exists idx_catalog_fixtures_competition_kickoff on catalog.fixtures (competition_id, kickoff_at);
create index if not exists idx_catalog_fixtures_upcoming on catalog.fixtures (kickoff_at) where status = 'scheduled';
