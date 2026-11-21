-- ============================================================
-- Migration: event_packs (phase 1, docs/event-packs.md)
-- Description: A room follows a real competition (Premier League and
--   Champions League to start, from football-data.org) and adds ready-made
--   questions for its upcoming matches in a tap. New catalog schema
--   (competitions, teams, fixtures, question templates, fixture questions),
--   filled by the sync-fixtures edge function every 3 hours. Added
--   questions are normal questions that close at kickoff and stay linked to
--   their fixture question: kickoff changes move them, and a host editing
--   the question or options detaches it. Results are still revealed by hand.
--   Works with the previous frontend: nothing it calls changes shape.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Catalog
-- ------------------------------------------------------------
-- Real competitions, fixtures and ready-made questions (event packs), shared
-- by every room. Written by the fixture sync and platform admins; rooms read
-- it through RPCs only.
create schema if not exists catalog;

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
  -- The provider's final score as it reported it (winner, duration, full
  -- and half time...). Nothing reads it yet: results reveal by hand until
  -- the resolvers arrive (phase 2).
  result jsonb,
  result_source text check (result_source in ('provider', 'manual')),
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competition_id, provider_ref)
);
create index if not exists idx_catalog_fixtures_competition_kickoff on catalog.fixtures (competition_id, kickoff_at);
create index if not exists idx_catalog_fixtures_upcoming on catalog.fixtures (kickoff_at) where status = 'scheduled';

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

-- ------------------------------------------------------------
-- 2. Rooms follow competitions; questions link back
-- ------------------------------------------------------------
-- The competitions a room follows. Its fixtures show up in the room's
-- Fixtures view, ready to add to whichever series is active.
create table if not exists public.room_competitions (
  room_id uuid not null references public.rooms(id) on delete cascade,
  competition_id uuid not null references catalog.competitions(id) on delete cascade,
  followed_by uuid references public.players(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (room_id, competition_id)
);

alter table public.prediction_events
  add column if not exists fixture_id uuid references catalog.fixtures(id) on delete set null;
create index if not exists idx_prediction_events_fixture on public.prediction_events (fixture_id, room_id) where fixture_id is not null;

alter table public.predictions
  add column if not exists fixture_question_id uuid references catalog.fixture_questions(id) on delete set null;
-- A room has each fixture question once (again only after scrapping it).
create unique index if not exists idx_predictions_room_fixture_question on public.predictions (room_id, fixture_question_id) where fixture_question_id is not null and status <> 'cancelled';
create index if not exists idx_predictions_fixture_question on public.predictions (fixture_question_id) where fixture_question_id is not null;

alter table public.prediction_options
  add column if not exists option_key text;


-- The catalog is read and written only through RPCs (security definer) and
-- the service role: no direct access for app users.
alter table catalog.competitions enable row level security;
alter table catalog.teams enable row level security;
alter table catalog.fixtures enable row level security;
alter table catalog.question_templates enable row level security;
alter table catalog.fixture_questions enable row level security;
revoke all on all tables in schema catalog from public, anon, authenticated;
revoke all on schema catalog from public, anon, authenticated;

-- Members see what their room follows; following goes through
-- set_room_competition.
alter table public.room_competitions enable row level security;
revoke all on public.room_competitions from anon;
revoke insert, update, delete, truncate, references, trigger on public.room_competitions from authenticated;
drop policy if exists "room_competitions_select" on public.room_competitions;
create policy "room_competitions_select" on public.room_competitions for select to authenticated using (private.is_room_member(room_id));
drop policy if exists "room_competitions_no_direct_write" on public.room_competitions;
create policy "room_competitions_no_direct_write" on public.room_competitions for insert with check (false);
drop policy if exists "room_competitions_no_direct_update" on public.room_competitions;
create policy "room_competitions_no_direct_update" on public.room_competitions for update using (false);
drop policy if exists "room_competitions_no_direct_delete" on public.room_competitions;
create policy "room_competitions_no_direct_delete" on public.room_competitions for delete using (false);
grant select (room_id, competition_id, followed_by, created_at) on public.room_competitions to authenticated;

-- The web app reads these tables with "select *", so the new columns have to
-- be readable from the start.
grant select (fixture_question_id) on public.predictions to authenticated;
grant select (option_key) on public.prediction_options to authenticated;
grant select (fixture_id) on public.prediction_events to authenticated;

-- ------------------------------------------------------------
-- 3. Fixture sync
-- ------------------------------------------------------------
-- Fixture sync: the sync-fixtures edge function fetches each active
-- competition from its provider, maps it to one shape (its adapter) and hands
-- it to sync_competition_fixtures. A cron job starts it (request_fixture_sync).

-- Writes out a fixture's questions from the templates that fit its sport,
-- with the teams' names. New ones start hidden unless their template is on
-- by default; an admin's hide or show is kept when the names are rewritten.
-- Templates that stop fitting (a knockout game found to be a first leg)
-- keep their row: get_room_fixtures only offers the ones that fit.
create or replace function private.refresh_fixture_questions(p_fixture_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_home text;
  v_away text;
  v_sport text;
begin
  select h.short_name, a.short_name, c.sport
    into v_home, v_away, v_sport
  from catalog.fixtures f
  join catalog.competitions c on c.id = f.competition_id
  left join catalog.teams h on h.id = f.home_team_id
  left join catalog.teams a on a.id = f.away_team_id
  where f.id = p_fixture_id;

  -- Nothing to ask until both teams are known.
  if v_home is null or v_away is null then
    return;
  end if;

  insert into catalog.fixture_questions (fixture_id, template_id, title, description, options, display_order, hidden)
  select
    p_fixture_id,
    t.id,
    replace(replace(t.title_pattern, '{home}', v_home), '{away}', v_away),
    replace(replace(t.description_pattern, '{home}', v_home), '{away}', v_away),
    (
      select jsonb_agg(
        jsonb_build_object(
          'key', o.value->>'key',
          'label', replace(replace(o.value->>'label', '{home}', v_home), '{away}', v_away)
        )
        order by o.position
      )
      from jsonb_array_elements(t.options) with ordinality as o(value, position)
    ),
    t.display_order,
    not t.default_on
  from catalog.question_templates t
  where t.sport = v_sport
    and t.active
  on conflict (fixture_id, template_id) do update
    set title = excluded.title,
        description = excluded.description,
        options = excluded.options,
        display_order = excluded.display_order,
        updated_at = now()
    where (catalog.fixture_questions.title, catalog.fixture_questions.description, catalog.fixture_questions.options)
      is distinct from (excluded.title, excluded.description, excluded.options);
end;
$$;

-- The competitions to sync: every active one, with its provider.
create or replace function public.get_fixture_sync_targets()
returns table (provider text, provider_ref text, name text)
language sql
stable
security definer
set search_path = public, private
as $$
  select c.provider, c.provider_ref, c.name
  from catalog.competitions c
  where c.active
  order by c.display_order, c.name;
$$;

-- Saves one competition's fixtures from its provider. p_fixtures is an
-- array of
--   {"provider_ref": "...", "kickoff_at": "...", "status": "scheduled",
--    "matchday": 13, "round_label": "Matchweek 13", "stage_kind": "league",
--    "home": {"provider_ref": "...", "name": "...", "short_name": "..."},
--    "away": {...}, "result": {...}}
-- (home and away null until known, result null until the end). Knockout
-- games played over two legs are told apart here: the earlier of two games
-- between the same teams in the same round is a first leg.
-- When a kickoff moves, room questions still open for picks that close at
-- the old kickoff move with it; ones a host gave another deadline stay.
-- Server only (service role).
create or replace function public.sync_competition_fixtures(
  p_provider     text,
  p_provider_ref text,
  p_season       text,
  p_fixtures     jsonb
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_competition catalog.competitions%rowtype;
  v_item        jsonb;
  v_fixture_id  uuid;
  v_old_kickoff timestamptz;
  v_new_kickoff timestamptz;
  v_home_id     uuid;
  v_away_id     uuid;
  v_fixture_ids uuid[] := '{}';
  v_moved       int := 0;
  v_count       int;
begin
  select * into v_competition
  from catalog.competitions
  where provider = p_provider
    and provider_ref = p_provider_ref
  for update;

  if not found then
    raise exception 'Competition % from % not found', p_provider_ref, p_provider using errcode = 'P0002';
  end if;

  if p_fixtures is null or jsonb_typeof(p_fixtures) <> 'array' then
    raise exception 'Fixtures must be an array' using errcode = 'P0001';
  end if;

  -- Teams first, so fixtures can point at them.
  insert into catalog.teams (sport, provider, provider_ref, name, short_name)
  select distinct on (t.team->>'provider_ref')
    v_competition.sport,
    p_provider,
    t.team->>'provider_ref',
    btrim(t.team->>'name'),
    btrim(coalesce(nullif(btrim(t.team->>'short_name'), ''), t.team->>'name'))
  from (
    select f->'home' as team from jsonb_array_elements(p_fixtures) f
    union all
    select f->'away' from jsonb_array_elements(p_fixtures) f
  ) t
  where jsonb_typeof(t.team) = 'object'
    and nullif(t.team->>'provider_ref', '') is not null
    and nullif(btrim(t.team->>'name'), '') is not null
  on conflict (provider, provider_ref) do update
    set name = excluded.name,
        short_name = excluded.short_name,
        updated_at = now()
    where (catalog.teams.name, catalog.teams.short_name) is distinct from (excluded.name, excluded.short_name);

  for v_item in select f from jsonb_array_elements(p_fixtures) f
  loop
    v_new_kickoff := (v_item->>'kickoff_at')::timestamptz;

    select id into v_home_id from catalog.teams
    where provider = p_provider and provider_ref = v_item->'home'->>'provider_ref';
    select id into v_away_id from catalog.teams
    where provider = p_provider and provider_ref = v_item->'away'->>'provider_ref';

    select id, kickoff_at into v_fixture_id, v_old_kickoff
    from catalog.fixtures
    where competition_id = v_competition.id
      and provider_ref = v_item->>'provider_ref'
    for update;

    if v_fixture_id is null then
      insert into catalog.fixtures (
        competition_id, provider_ref, season, matchday, round_label, stage_kind,
        home_team_id, away_team_id, kickoff_at, status, result, result_source, synced_at
      )
      values (
        v_competition.id,
        v_item->>'provider_ref',
        coalesce(nullif(v_item->>'season', ''), p_season),
        (v_item->>'matchday')::smallint,
        nullif(v_item->>'round_label', ''),
        v_item->>'stage_kind',
        v_home_id,
        v_away_id,
        v_new_kickoff,
        v_item->>'status',
        case when jsonb_typeof(v_item->'result') = 'object' then v_item->'result' end,
        case when jsonb_typeof(v_item->'result') = 'object' then 'provider' end,
        now()
      )
      returning id into v_fixture_id;
    else
      update catalog.fixtures
      set season = coalesce(nullif(v_item->>'season', ''), p_season),
          matchday = (v_item->>'matchday')::smallint,
          round_label = nullif(v_item->>'round_label', ''),
          stage_kind = v_item->>'stage_kind',
          home_team_id = v_home_id,
          away_team_id = v_away_id,
          kickoff_at = v_new_kickoff,
          status = v_item->>'status',
          -- A result an admin set by hand wins over the feed.
          result = case when result_source = 'manual' then result
                        when jsonb_typeof(v_item->'result') = 'object' then v_item->'result' end,
          result_source = case when result_source = 'manual' then 'manual'
                               when jsonb_typeof(v_item->'result') = 'object' then 'provider' end,
          synced_at = now(),
          updated_at = now()
      where id = v_fixture_id;

      if v_old_kickoff is distinct from v_new_kickoff and v_new_kickoff > now() then
        -- Picks close at kickoff: the room questions that close at the old
        -- kickoff follow it. Scheduled ones still go live before it.
        update public.predictions p
        set deadline = v_new_kickoff,
            opens_at = case
              when p.status = 'scheduled' and p.opens_at > v_new_kickoff - interval '5 minutes'
                then greatest(now(), v_new_kickoff - interval '5 minutes')
              else p.opens_at
            end,
            notified_1h = false
        from catalog.fixture_questions q
        where q.fixture_id = v_fixture_id
          and p.fixture_question_id = q.id
          and p.status in ('scheduled', 'draft')
          and p.deadline = v_old_kickoff;
        get diagnostics v_count = row_count;
        v_moved := v_moved + v_count;
      end if;
    end if;

    v_fixture_ids := v_fixture_ids || v_fixture_id;
    v_fixture_id := null;
  end loop;

  -- Two-legged ties: the earlier game is a first leg (it can end in a
  -- draw and sends nobody through); the later one decides the tie.
  update catalog.fixtures f
  set stage_kind = 'first_leg'
  where f.id = any(v_fixture_ids)
    and f.stage_kind = 'knockout'
    and exists (
      select 1 from catalog.fixtures g
      where g.competition_id = f.competition_id
        and g.season = f.season
        and g.round_label is not distinct from f.round_label
        and g.home_team_id = f.away_team_id
        and g.away_team_id = f.home_team_id
        and g.kickoff_at > f.kickoff_at
    );

  -- Questions only matter for games still to come.
  perform private.refresh_fixture_questions(f.id)
  from catalog.fixtures f
  where f.id = any(v_fixture_ids)
    and f.status = 'scheduled'
    and f.kickoff_at > now();

  update catalog.competitions
  set current_season = coalesce(nullif(p_season, ''), current_season),
      synced_at = now()
  where id = v_competition.id;

  return json_build_object(
    'competition', v_competition.name,
    'fixtures', cardinality(v_fixture_ids),
    'moved_deadlines', v_moved
  );
end;
$$;

-- Cron: asks the sync-fixtures edge function to sync every active
-- competition. Uses the push function's config (supabase_url,
-- service_role_key) plus its own secret, fixture_sync_secret, which must
-- match the function's FIXTURE_SYNC_SECRET. Does nothing until it's set.
create or replace function private.request_fixture_sync()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_supabase_url     text;
  v_service_role_key text;
  v_secret           text;
begin
  select value into v_supabase_url from private.notification_config where key = 'supabase_url';
  select value into v_service_role_key from private.notification_config where key = 'service_role_key';
  select value into v_secret from private.notification_config where key = 'fixture_sync_secret';

  if v_supabase_url is null or v_service_role_key is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url     := v_supabase_url || '/functions/v1/sync-fixtures',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_role_key,
      'x-sync-secret', v_secret
    ),
    body    := '{}'::jsonb,
    -- A full season for each competition: give it time.
    timeout_milliseconds := 60000
  );
end;
$$;

-- ------------------------------------------------------------
-- 4. Following, the fixtures view and adding questions
-- ------------------------------------------------------------
-- Event packs for rooms: follow a competition, see its upcoming fixtures
-- with ready-made questions, and add them to the active series.

-- Organizers: the competitions on offer (and which ones the room follows),
-- and the followed ones' fixtures in the next p_days days that haven't
-- kicked off, each with its questions and, for the ones the room already
-- has, the room's question.
create or replace function public.get_room_fixtures(
  p_room_id uuid,
  p_days    integer default 14
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 14), 1), 31);
begin
  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only organizers can add questions' using errcode = 'P0012';
  end if;

  return json_build_object(
    'competitions', (
      select coalesce(json_agg(json_build_object(
        'id', c.id,
        'name', c.name,
        'sport', c.sport,
        'season', c.current_season,
        'following', rc.room_id is not null
      ) order by c.display_order, c.name), '[]'::json)
      from catalog.competitions c
      left join public.room_competitions rc on rc.competition_id = c.id and rc.room_id = p_room_id
      where c.active
    ),
    'fixtures', (
      select coalesce(json_agg(json_build_object(
        'id', f.id,
        'competition_id', c.id,
        'competition_name', c.name,
        'kickoff_at', f.kickoff_at,
        'matchday', f.matchday,
        'round_label', f.round_label,
        'home', h.short_name,
        'away', a.short_name,
        'questions', (
          select coalesce(json_agg(json_build_object(
            'id', q.id,
            'title', q.title,
            'description', q.description,
            'options', (select json_agg(o->>'label') from jsonb_array_elements(q.options) o),
            'prediction_id', (
              select p.id from public.predictions p
              where p.room_id = p_room_id
                and p.fixture_question_id = q.id
                and p.status <> 'cancelled'
              limit 1
            )
          ) order by q.display_order, q.created_at), '[]'::json)
          from catalog.fixture_questions q
          left join catalog.question_templates t on t.id = q.template_id
          where q.fixture_id = f.id
            and not q.hidden
            and (q.template_id is null or (t.active and f.stage_kind = any(t.stages)))
        )
      ) order by f.kickoff_at, h.short_name), '[]'::json)
      from catalog.fixtures f
      join catalog.competitions c on c.id = f.competition_id and c.active
      join public.room_competitions rc on rc.competition_id = c.id and rc.room_id = p_room_id
      join catalog.teams h on h.id = f.home_team_id
      join catalog.teams a on a.id = f.away_team_id
      where f.status = 'scheduled'
        and f.kickoff_at > now()
        and f.kickoff_at < now() + make_interval(days => v_days)
    )
  );
end;
$$;

-- Organizers follow (or stop following) a competition for the room.
-- Questions already added stay put either way.
create or replace function public.set_room_competition(
  p_room_id        uuid,
  p_competition_id uuid,
  p_follow         boolean
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid := private.get_player_id_from_auth();
begin
  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only organizers can follow competitions' using errcode = 'P0012';
  end if;

  if not exists (select 1 from public.rooms where id = p_room_id and status = 'active') then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  if p_follow then
    if not exists (select 1 from catalog.competitions where id = p_competition_id and active) then
      raise exception 'Competition not found' using errcode = 'P0002';
    end if;

    insert into public.room_competitions (room_id, competition_id, followed_by)
    values (p_room_id, p_competition_id, v_player_id)
    on conflict (room_id, competition_id) do nothing;
  else
    delete from public.room_competitions
    where room_id = p_room_id
      and competition_id = p_competition_id;
  end if;

  return json_build_object('competition_id', p_competition_id, 'following', p_follow);
end;
$$;

-- Organizers add fixture questions to a series: each becomes a normal
-- question that closes at kickoff, linked back to its fixture question.
-- Questions for one match share an event (the one the room already has for
-- that match, if any). Live now, or hidden until p_opens_at as with
-- create_predictions; members get one push for the lot. Questions the room
-- already has are skipped. All or nothing otherwise.
create or replace function public.add_fixture_questions(
  p_room_id              uuid,
  p_series_id            uuid,
  p_fixture_question_ids uuid[],
  p_opens_at             timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id     uuid;
  v_scheduled     boolean := p_opens_at is not null and p_opens_at > now();
  v_series        public.series%rowtype;
  v_next_number   int;
  v_requested     int;
  v_question      record;
  v_event_id      uuid;
  v_event_fixture uuid;
  v_prediction_id uuid;
  v_ids           uuid[] := '{}';
  v_position      int := 0;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only organizers can create predictions' using errcode = 'P0012';
  end if;

  if not exists (select 1 from public.rooms where id = p_room_id and status = 'active') then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  v_requested := (select count(distinct x) from unnest(p_fixture_question_ids) x where x is not null);
  if v_requested not between 1 and 60 then
    raise exception 'Add between 1 and 60 questions' using errcode = 'P0001';
  end if;

  if p_series_id is null then
    raise exception 'Predictions must belong to an active series' using errcode = 'P0001';
  end if;

  -- Same lock create_prediction takes, so numbers never collide.
  select * into v_series
  from public.series
  where id = p_series_id
    and room_id = p_room_id
  for update;

  if not found then
    raise exception 'Series not found for this room' using errcode = 'P0002';
  end if;

  if v_series.status <> 'active' then
    raise exception 'Predictions can only be assigned to active series' using errcode = 'P0001';
  end if;

  -- Every one must still be on offer: shown, for a match yet to kick off.
  if (
    select count(*)
    from catalog.fixture_questions q
    join catalog.fixtures f on f.id = q.fixture_id
    join catalog.competitions c on c.id = f.competition_id
    left join catalog.question_templates t on t.id = q.template_id
    where q.id = any(p_fixture_question_ids)
      and not q.hidden
      and (q.template_id is null or (t.active and f.stage_kind = any(t.stages)))
      and c.active
      and f.status = 'scheduled'
      and f.kickoff_at > now()
      and f.home_team_id is not null
      and f.away_team_id is not null
  ) <> v_requested then
    raise exception 'Some of those matches have kicked off or changed. Refresh and try again.' using errcode = 'P0001';
  end if;

  if v_scheduled and exists (
    select 1
    from catalog.fixture_questions q
    join catalog.fixtures f on f.id = q.fixture_id
    where q.id = any(p_fixture_question_ids)
      and f.kickoff_at < p_opens_at + interval '5 minutes'
  ) then
    raise exception 'Leave at least 5 minutes between going live and the deadline' using errcode = 'P0001';
  end if;

  if not v_scheduled then
    select coalesce(max(series_prediction_number), 0) + 1
      into v_next_number
    from public.predictions
    where series_id = p_series_id;
  end if;

  -- One push for the lot (below), not one per prediction.
  perform set_config('crow.skip_prediction_push', 'on', true);

  for v_question in
    select q.id, q.title, q.description, q.options,
      f.id as fixture_id, f.kickoff_at,
      h.short_name || ' vs ' || a.short_name as event_title,
      c.name as competition_name
    from catalog.fixture_questions q
    join catalog.fixtures f on f.id = q.fixture_id
    join catalog.competitions c on c.id = f.competition_id
    join catalog.teams h on h.id = f.home_team_id
    join catalog.teams a on a.id = f.away_team_id
    where q.id = any(p_fixture_question_ids)
      -- Already in the room: skip.
      and not exists (
        select 1 from public.predictions p
        where p.room_id = p_room_id
          and p.fixture_question_id = q.id
          and p.status <> 'cancelled'
      )
    order by f.kickoff_at, f.id, q.display_order, q.created_at
  loop
    if v_event_fixture is distinct from v_question.fixture_id then
      v_event_fixture := v_question.fixture_id;
      v_event_id := null;

      select e.id into v_event_id
      from public.prediction_events e
      where e.room_id = p_room_id
        and e.fixture_id = v_question.fixture_id
      order by e.created_at desc
      limit 1;

      if v_event_id is null then
        insert into public.prediction_events (room_id, title, created_by, fixture_id)
        values (p_room_id, left(v_question.event_title, 80), v_player_id, v_question.fixture_id)
        returning id into v_event_id;
      end if;
    end if;

    v_position := v_position + 1;

    insert into public.predictions (
      room_id, series_id, series_prediction_number, created_by, title,
      status, deadline, opens_at, event_id, fixture_question_id, created_at
    )
    values (
      p_room_id,
      p_series_id,
      case when v_scheduled then null else v_next_number + v_position - 1 end,
      v_player_id,
      v_question.title,
      case when v_scheduled then 'scheduled' else 'draft' end,
      -- Picks close at kickoff.
      v_question.kickoff_at,
      case when v_scheduled then p_opens_at else now() end,
      v_event_id,
      v_question.id,
      -- Scheduled ones go live in created order: keep kickoff order.
      now() + (v_position - 1) * interval '1 microsecond'
    )
    returning id into v_prediction_id;

    insert into public.prediction_options (prediction_id, label, display_order, option_key)
    select v_prediction_id, o.value->>'label', (o.position - 1)::smallint, o.value->>'key'
    from jsonb_array_elements(v_question.options) with ordinality as o(value, position);

    -- The competition's name as a tag, so History can filter by it.
    perform public.set_prediction_details(
      v_prediction_id,
      v_question.description,
      array[v_question.competition_name]
    );

    if not v_scheduled then
      perform private.create_room_activity(
        p_room_id := p_room_id,
        p_activity_type := 'prediction_created',
        p_activity_tier := 2,
        p_metadata := private.build_prediction_activity_metadata(v_prediction_id),
        p_click_action := jsonb_build_object('type', 'prediction', 'predictionId', v_prediction_id),
        p_created_by_player_id := v_player_id,
        p_dedupe_key := 'prediction_created:' || v_prediction_id::text
      );
    end if;

    v_ids := v_ids || v_prediction_id;
  end loop;

  perform set_config('crow.skip_prediction_push', 'off', true);

  if cardinality(v_ids) = 0 then
    raise exception 'Those questions are already in this room' using errcode = 'P0001';
  end if;

  if not v_scheduled then
    perform private.push_for_predictions(
      'prediction_live',
      v_ids,
      '🎯 New question',
      '🎯 %s new questions'
    );
  end if;

  return json_build_object(
    'room_id',        p_room_id,
    'series_id',      p_series_id,
    'status',         case when v_scheduled then 'scheduled' else 'draft' end,
    'opens_at',       case when v_scheduled then p_opens_at else now() end,
    'prediction_ids', to_json(v_ids),
    'count',          cardinality(v_ids),
    'skipped',        v_requested - cardinality(v_ids)
  );
end;
$$;

-- ------------------------------------------------------------
-- 5. Editing a fixture question detaches it
-- ------------------------------------------------------------
-- Organizers fix a prediction that's still open for picks: the deadline, and
-- the question and options while nobody has bet. Pass null options to keep
-- them. A scheduled one can also move when it goes live (p_opens_at; null
-- keeps it), and must stay open at least 5 minutes after that.
-- A question added from the fixtures becomes the host's own once its
-- question or options change: the link to the fixture goes, so kickoff
-- changes no longer move it and its result is the host's to reveal.
create or replace function public.update_prediction(
  p_prediction_id uuid,
  p_title         text,
  p_deadline      timestamptz,
  p_options       text[] default null,
  p_opens_at      timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id  uuid;
  v_prediction public.predictions%rowtype;
  v_labels     text[];
  v_current    text[];
  v_i          int;
  v_opens_at   timestamptz;
  v_options_changed boolean := false;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select * into v_prediction
  from public.predictions
  where id = p_prediction_id
  for update;

  if not found then
    raise exception 'Prediction not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = v_prediction.room_id
      and player_id = v_player_id
      and role in ('owner', 'organizer')
  ) then
    raise exception 'Only organizers can edit predictions' using errcode = 'P0012';
  end if;

  if not (
    v_prediction.status = 'scheduled'
    or (v_prediction.status = 'draft' and v_prediction.deadline > now())
  ) then
    raise exception 'Only predictions still open for picks can be edited' using errcode = 'P0006';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Prediction title cannot be empty' using errcode = 'P0001';
  end if;

  if p_deadline is null or p_deadline <= now() then
    raise exception 'Deadline must be in the future' using errcode = 'P0001';
  end if;

  if v_prediction.status = 'scheduled' then
    v_opens_at := coalesce(p_opens_at, v_prediction.opens_at);
    if v_opens_at <= now() then
      raise exception 'Pick a go-live time in the future, or put it live now' using errcode = 'P0001';
    end if;
    if p_deadline < v_opens_at + interval '5 minutes' then
      raise exception 'Leave at least 5 minutes between going live and the deadline' using errcode = 'P0001';
    end if;
  end if;

  -- Once someone has bet, the question they bet on stays as it was.
  if trim(p_title) is distinct from v_prediction.title
    and exists (select 1 from public.bets where prediction_id = p_prediction_id)
  then
    raise exception 'The question can''t change once someone has bet' using errcode = 'P0001';
  end if;

  if p_options is not null then
    if coalesce(array_length(p_options, 1), 0) < 2 or array_length(p_options, 1) > 12 then
      raise exception 'Predictions must have between 2 and 12 options' using errcode = 'P0001';
    end if;

    v_labels := array(select trim(o) from unnest(p_options) with ordinality as t(o, n) order by n);

    if exists (select 1 from unnest(v_labels) l where length(l) = 0) then
      raise exception 'Option labels cannot be empty' using errcode = 'P0001';
    end if;

    v_current := array(
      select label from public.prediction_options
      where prediction_id = p_prediction_id
      order by display_order, created_at
    );

    if v_labels is distinct from v_current then
      if exists (select 1 from public.bets where prediction_id = p_prediction_id) then
        raise exception 'Options can''t change once someone has bet' using errcode = 'P0001';
      end if;

      v_options_changed := true;
      delete from public.prediction_options where prediction_id = p_prediction_id;

      for v_i in 1 .. array_length(v_labels, 1) loop
        insert into public.prediction_options (prediction_id, label, display_order)
        values (p_prediction_id, v_labels[v_i], v_i - 1);
      end loop;
    end if;
  end if;

  update public.predictions
  set title       = trim(p_title),
      deadline    = p_deadline,
      opens_at    = coalesce(v_opens_at, opens_at),
      -- A moved deadline earns a fresh "1 hour left" reminder.
      notified_1h = case when p_deadline = deadline then notified_1h else false end,
      fixture_question_id = case
        when v_options_changed or trim(p_title) is distinct from title then null
        else fixture_question_id
      end
  where id = p_prediction_id;

  if v_prediction.fixture_question_id is not null and (v_options_changed or trim(p_title) is distinct from v_prediction.title) then
    update public.prediction_options set option_key = null where prediction_id = p_prediction_id;
  end if;

  return json_build_object(
    'id',       p_prediction_id,
    'title',    trim(p_title),
    'deadline', p_deadline,
    'opens_at', coalesce(v_opens_at, v_prediction.opens_at)
  );
end;
$$;

-- ------------------------------------------------------------
-- 6. Function access
-- ------------------------------------------------------------
revoke execute on function private.refresh_fixture_questions(uuid) from public, anon, authenticated;
revoke execute on function private.request_fixture_sync() from public, anon, authenticated;
revoke execute on function public.get_fixture_sync_targets() from public, anon, authenticated;
revoke execute on function public.sync_competition_fixtures(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.get_room_fixtures(uuid, integer) from public, anon, authenticated;
revoke execute on function public.set_room_competition(uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.add_fixture_questions(uuid, uuid, uuid[], timestamp with time zone) from public, anon, authenticated;
grant execute on function public.get_room_fixtures(uuid, integer) to authenticated;
grant execute on function public.set_room_competition(uuid, uuid, boolean) to authenticated;
grant execute on function public.add_fixture_questions(uuid, uuid, uuid[], timestamp with time zone) to authenticated;
grant execute on function public.get_fixture_sync_targets() to service_role;
grant execute on function public.sync_competition_fixtures(text, text, text, jsonb) to service_role;

-- ------------------------------------------------------------
-- 7. Launch competitions and soccer questions
-- ------------------------------------------------------------
insert into catalog.competitions (sport, name, format, provider, provider_ref, active, display_order)
values
  ('soccer', 'Premier League', 'league', 'football-data', 'PL', true, 1),
  ('soccer', 'Champions League', 'mixed', 'football-data', 'CL', true, 2)
on conflict (provider, provider_ref) do nothing;

-- Wording follows apps/web/VOICE.md ("Three or more goals?", not "Over
-- 2.5"). "90 minutes" is spelled out where extra time could start an
-- argument. Knockout games never get a three-way "Who wins?".
insert into catalog.question_templates (sport, key, title_pattern, description_pattern, options, stages, resolver, default_on, display_order)
values
  ('soccer', 'who_wins',
   'Who wins {home} vs {away}? (90 minutes)',
   'Decided by the score after 90 minutes plus stoppage time. Extra time and penalties don''t count.',
   '[{"key": "home", "label": "{home}"}, {"key": "draw", "label": "Draw"}, {"key": "away", "label": "{away}"}]',
   array['league', 'group', 'first_leg'], 'full_time_winner', true, 1),
  ('soccer', 'goes_through',
   'Who goes through, {home} or {away}?',
   'Whoever reaches the next round, counting both legs, extra time and penalties.',
   '[{"key": "home", "label": "{home}"}, {"key": "away", "label": "{away}"}]',
   array['knockout'], 'tie_winner', true, 1),
  ('soccer', 'wins_final',
   'Who wins the final, {home} or {away}?',
   'Counts extra time and penalties.',
   '[{"key": "home", "label": "{home}"}, {"key": "away", "label": "{away}"}]',
   array['final'], 'match_winner', true, 1),
  ('soccer', 'both_score',
   'Do both teams score in {home} vs {away}?',
   'Goals in the 90 minutes plus stoppage time.',
   '[{"key": "yes", "label": "Yes"}, {"key": "no", "label": "No"}]',
   array['league', 'group', 'first_leg', 'knockout', 'final'], 'both_score', true, 2),
  ('soccer', 'three_plus_goals',
   'Three or more goals in {home} vs {away}?',
   'Goals in the 90 minutes plus stoppage time.',
   '[{"key": "yes", "label": "Yes"}, {"key": "no", "label": "No"}]',
   array['league', 'group', 'first_leg', 'knockout', 'final'], 'three_plus_goals', true, 3),
  ('soccer', 'penalties',
   'Does {home} vs {away} go to penalties?',
   'A penalty shootout at the end of the game.',
   '[{"key": "yes", "label": "Yes"}, {"key": "no", "label": "No"}]',
   array['knockout', 'final'], 'penalties', true, 4),
  ('soccer', 'clean_sheet_home',
   'Do {home} keep a clean sheet against {away}?',
   '{away} don''t score in the 90 minutes plus stoppage time.',
   '[{"key": "yes", "label": "Yes"}, {"key": "no", "label": "No"}]',
   array['league', 'group', 'first_leg', 'knockout', 'final'], 'clean_sheet_home', false, 5),
  ('soccer', 'more_goals_half',
   'More goals in which half of {home} vs {away}?',
   'First half against second half, stoppage time included. Extra time doesn''t count.',
   '[{"key": "first", "label": "First half"}, {"key": "second", "label": "Second half"}, {"key": "same", "label": "Same"}]',
   array['league', 'group', 'first_leg', 'knockout', 'final'], 'more_goals_half', false, 6)
on conflict (sport, key) do nothing;

-- ------------------------------------------------------------
-- 8. Sync fixtures every 3 hours
-- ------------------------------------------------------------
-- Daily would do for fixtures; every 3 hours also catches kickoff changes
-- on matchday. Two competitions: 16 provider calls a day.
select cron.schedule('sync-fixtures', '17 */3 * * *', $$select private.request_fixture_sync()$$);
