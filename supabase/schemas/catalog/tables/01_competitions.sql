-- A real competition rooms can follow, e.g. the Premier League. One row per
-- competition, not per season: a room that follows it keeps following it
-- into the next season. Only active ones are synced and offered to rooms.
create table if not exists catalog.competitions (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('soccer', 'cricket')),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  format text not null check (format in ('league', 'knockout', 'mixed')),
  -- Where fixtures come from: the adapter in supabase/functions/sync-fixtures
  -- and that provider's id for the competition.
  provider text not null,
  provider_ref text not null,
  -- The season the provider is on now, e.g. "2026/27".
  current_season text,
  active boolean not null default false,
  display_order smallint not null default 0,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
