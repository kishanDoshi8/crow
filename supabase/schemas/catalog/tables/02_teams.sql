-- Teams as plain names: no crests or other marks (docs/event-packs.md).
create table if not exists catalog.teams (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('soccer', 'cricket')),
  provider text not null,
  provider_ref text not null,
  name text not null,
  -- What questions and options use, e.g. "Man City".
  short_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
