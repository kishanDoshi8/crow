-- The questions on offer for one fixture: one per template that fits it,
-- written out with the teams' names, plus any one-off extras (no
-- template). They exist up front so an admin can hide or reword one for a
-- match. Rooms get a copy when they add one (predictions.fixture_question_id).
create table if not exists catalog.fixture_questions (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references catalog.fixtures(id) on delete cascade,
  template_id uuid references catalog.question_templates(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 500),
  -- [{"key": "home", "label": "Arsenal"}, ...]
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 12),
  display_order smallint not null default 0,
  -- Hidden ones aren't offered to rooms.
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, template_id)
);
