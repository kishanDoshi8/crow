-- A real competition rooms can follow, e.g. the Premier League. One row per
-- competition, not per season: a room that follows it keeps following it
-- into the next season. Only active ones are synced and offered to rooms.
create table if not exists catalog.competitions (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('soccer', 'cricket')),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  format text not null check (format in ('league', 'knockout', 'mixed')),
  -- How hosts browse it: a league, a cup, a tour between two countries, or a
  -- season of events with no home side (Formula 1).
  kind text not null default 'league' check (kind in ('league', 'cup', 'tour', 'season')),
  -- Where it's played, for grouping and search: "England", "Europe", or
  -- both countries of a tour ("New Zealand and India"). Null for none.
  region text,
  -- Where fixtures come from: the adapter in supabase/functions/sync-fixtures
  -- and that provider's id for the competition.
  provider text not null,
  provider_ref text not null,
  -- The season the provider is on now, e.g. "2026/27".
  current_season text,
  -- When it runs, where the provider says (tours and cups end; leagues
  -- roll into the next season). It drops out of Browse and the sync a week
  -- after it ends.
  starts_on date,
  ends_on date,
  active boolean not null default false,
  display_order smallint not null default 0,
  synced_at timestamptz,
  -- The last sync that failed for it, cleared by the next one that works.
  last_sync_error text,
  last_sync_error_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
