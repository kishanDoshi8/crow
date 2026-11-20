-- A ready-made question for every fixture of a sport. {home} and {away} in
-- the title, description and option labels become the teams' short names.
-- options is [{"key": "home", "label": "{home}"}, ...]: the key says what
-- the option means, so a result can find the winning one later.
create table if not exists catalog.question_templates (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('soccer', 'cricket')),
  key text not null,
  title_pattern text not null,
  description_pattern text,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 12),
  -- The fixtures' stage_kind values it fits.
  stages text[] not null,
  -- How a result settles it (phase 2). Only templates a result can settle
  -- belong here.
  resolver text,
  -- Offered for every fixture; the rest only where an admin shows them.
  default_on boolean not null default false,
  active boolean not null default true,
  display_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (sport, key)
);
