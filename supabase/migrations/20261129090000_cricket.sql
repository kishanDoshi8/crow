-- ============================================================
-- Migration: cricket (event packs phase 3, docs/event-packs.md)
-- Description: Cricket from CricketData.org. Admins find a series (tour,
--   league, cup) with the provider's search in /admin and add it
--   (admin_add_competition); its matches carry a format (Test, ODI, T20), a
--   label and a venue. Cricket questions: who wins (a draw only in Tests),
--   the toss and the toss winner's choice (closing 35 minutes before the
--   start), whether the team batting first wins, and a first-innings par
--   score. Results are fetched match by match only while due
--   (private.fixture_result_due), to stay inside the free plan's 100 calls
--   a day. Admins can also write one-off questions for a match
--   (admin_add_fixture_extra) and pick their answers when confirming.
--   Works with the previous frontend.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------
alter table catalog.competitions
  add column if not exists starts_on date,
  add column if not exists ends_on date;

alter table catalog.fixtures
  add column if not exists match_format text check (match_format in ('test', 'odi', 't20')),
  add column if not exists label text,
  add column if not exists venue text,
  add column if not exists result_checked_at timestamptz;

alter table catalog.question_templates
  add column if not exists formats text[],
  add column if not exists close_minutes_before smallint not null default 0 check (close_minutes_before between 0 and 240);

-- ------------------------------------------------------------
-- 2. Functions
-- ------------------------------------------------------------
-- Its result columns change.
drop function if exists public.get_fixture_sync_targets();
-- Gains p_partial.
drop function if exists public.sync_competition_fixtures(text, text, text, jsonb);

-- Fixture sync: the sync-fixtures edge function fetches each active
-- competition from its provider, maps it to one shape (its adapter) and hands
-- it to sync_competition_fixtures. A cron job starts it (request_fixture_sync).

-- Writes out a fixture's questions from the templates that fit its sport,
-- with the teams' names. New ones start hidden unless their template is on
-- by default; an admin's hide or show is kept when the names are rewritten,
-- and a question an admin reworded (customized_at) keeps its wording.
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
    where catalog.fixture_questions.customized_at is null
      and (catalog.fixture_questions.title, catalog.fixture_questions.description, catalog.fixture_questions.options)
        is distinct from (excluded.title, excluded.description, excluded.options);
end;
$$;

-- Whether a template's question fits a fixture: its stage (league,
-- knockout...) and, for cricket, its format (Test, ODI, T20).
create or replace function private.template_fits(
  p_active     boolean,
  p_stages     text[],
  p_formats    text[],
  p_stage_kind text,
  p_format     text
)
returns boolean
language sql
immutable
as $$
  select p_active
    and p_stage_kind = any(p_stages)
    and (p_formats is null or p_format = any(p_formats));
$$;

-- The competitions to sync: every active one that hasn't ended more than a
-- week ago, with its provider and when it last synced (the edge function
-- syncs some providers less often to stay inside their call limits).
create or replace function public.get_fixture_sync_targets()
returns table (provider text, provider_ref text, name text, synced_at timestamptz)
language sql
stable
security definer
set search_path = public, private
as $$
  select c.provider, c.provider_ref, c.name, c.synced_at
  from catalog.competitions c
  where c.active
    and (c.ends_on is null or c.ends_on >= current_date - 7)
  order by c.display_order, c.name;
$$;

-- Whether to ask the provider how a played match stands: rooms have
-- questions on it, it isn't confirmed or finished with a score, it should
-- be over by now (a T20 runs about 3.5 hours, an ODI 8, a Test up to five
-- days), and it wasn't checked too recently. Cricket costs one call per
-- match, so its checks are spaced out.
create or replace function private.fixture_result_due(p_fixture_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from catalog.fixtures f
    cross join lateral (
      select
        case f.match_format
          when 't20' then interval '3 hours'
          when 'odi' then interval '7 hours'
          when 'test' then interval '60 hours'
          else interval '105 minutes'
        end as earliest,
        case f.match_format
          when 'test' then interval '7 days'
          when 'odi' then interval '30 hours'
          when 't20' then interval '30 hours'
          else interval '6 hours'
        end as latest,
        case f.match_format
          when 'test' then interval '6 hours'
          when 'odi' then interval '1 hour'
          when 't20' then interval '45 minutes'
          else interval '10 minutes'
        end as every
    ) w
    where f.id = p_fixture_id
      and f.result_confirmed_at is null
      and not (f.status = 'finished' and f.result is not null)
      and f.kickoff_at between now() - w.latest and now() - w.earliest
      and (f.result_checked_at is null or f.result_checked_at < now() - w.every)
      and exists (
        select 1 from catalog.fixture_questions q
        join public.predictions p on p.fixture_question_id = q.id
        where q.fixture_id = f.id and p.status <> 'cancelled'
      )
  );
$$;

-- Played matches whose result the sync should fetch one by one (providers
-- whose season list doesn't carry results, like CricketData.org): the
-- active competitions' matches that private.fixture_result_due says are
-- due. Server only (service role).
create or replace function public.get_fixture_result_targets(p_provider text)
returns table (competition_ref text, provider_ref text)
language sql
stable
security definer
set search_path = public, private
as $$
  select c.provider_ref, f.provider_ref
  from catalog.fixtures f
  join catalog.competitions c on c.id = f.competition_id
  where c.provider = p_provider
    and c.active
    and private.fixture_result_due(f.id)
  order by f.kickoff_at
  limit 20;
$$;

-- Saves one competition's fixtures from its provider. p_fixtures is an
-- array of
--   {"provider_ref": "...", "kickoff_at": "...", "status": "scheduled",
--    "matchday": 13, "round_label": "Matchweek 13", "stage_kind": "league",
--    "match_format": null, "label": null, "venue": null,
--    "home": {"provider_ref": "...", "name": "...", "short_name": "..."},
--    "away": {...}, "result": {...}}
-- (home and away null until known, result null until the end). Knockout
-- games played over two legs are told apart here: the earlier of two games
-- between the same teams in the same round is a first leg.
-- When a kickoff moves, room questions still open for picks that close at
-- the old kickoff (or their template's time before it, like a toss) move
-- with it; ones a host gave another deadline stay. A season list can carry
-- only some of a competition's matches (or one, from a result check):
-- matches left out are untouched.
-- Server only (service role).
create or replace function public.sync_competition_fixtures(
  p_provider     text,
  p_provider_ref text,
  p_season       text,
  p_fixtures     jsonb,
  -- Only a few matches (a result check): the competition's season list
  -- still needs its regular sync, so synced_at stays.
  p_partial      boolean default false
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
        match_format, label, venue,
        home_team_id, away_team_id, kickoff_at, status, result, result_source, synced_at,
        result_checked_at
      )
      values (
        v_competition.id,
        v_item->>'provider_ref',
        coalesce(nullif(v_item->>'season', ''), p_season),
        (v_item->>'matchday')::smallint,
        nullif(v_item->>'round_label', ''),
        v_item->>'stage_kind',
        nullif(v_item->>'match_format', ''),
        nullif(v_item->>'label', ''),
        nullif(v_item->>'venue', ''),
        v_home_id,
        v_away_id,
        v_new_kickoff,
        v_item->>'status',
        case when jsonb_typeof(v_item->'result') = 'object' then v_item->'result' end,
        case when jsonb_typeof(v_item->'result') = 'object' then 'provider' end,
        now(),
        case when v_new_kickoff < now() then now() end
      )
      returning id into v_fixture_id;
    else
      update catalog.fixtures
      set season = coalesce(nullif(v_item->>'season', ''), p_season),
          matchday = (v_item->>'matchday')::smallint,
          round_label = nullif(v_item->>'round_label', ''),
          stage_kind = v_item->>'stage_kind',
          match_format = nullif(v_item->>'match_format', ''),
          label = nullif(v_item->>'label', ''),
          venue = nullif(v_item->>'venue', ''),
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
          result_checked_at = case when v_new_kickoff < now() then now() else result_checked_at end,
          updated_at = now()
      where id = v_fixture_id;

      if v_old_kickoff is distinct from v_new_kickoff and v_new_kickoff > now() then
        -- Picks close at kickoff: the room questions that close at the old
        -- kickoff follow it. Scheduled ones still go live before it.
        update public.predictions p
        set deadline = v_new_kickoff - m.before,
            opens_at = case
              when p.status = 'scheduled' and p.opens_at > v_new_kickoff - m.before - interval '5 minutes'
                then greatest(now(), v_new_kickoff - m.before - interval '5 minutes')
              else p.opens_at
            end,
            notified_1h = false
        from catalog.fixture_questions q
        left join catalog.question_templates t on t.id = q.template_id
        cross join lateral (select make_interval(mins => coalesce(t.close_minutes_before, 0)::int) as before) m
        where q.fixture_id = v_fixture_id
          and p.fixture_question_id = q.id
          and p.status in ('scheduled', 'draft')
          and p.deadline = v_old_kickoff - m.before
          and v_new_kickoff - m.before > now();
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
      synced_at = case when p_partial then synced_at else now() end,
      last_sync_error = null,
      last_sync_error_at = null
  where id = v_competition.id;

  return json_build_object(
    'competition', v_competition.name,
    'fixtures', cardinality(v_fixture_ids),
    'moved_deadlines', v_moved
  );
end;
$$;

-- Cron: asks the sync-fixtures edge function to sync every active
-- competition, or only one provider's (p_provider). Uses the push
-- function's config (supabase_url, service_role_key) plus its own secret,
-- fixture_sync_secret, which must match the function's FIXTURE_SYNC_SECRET.
-- Does nothing until it's set.
create or replace function private.request_fixture_sync(p_provider text default null)
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
    body    := jsonb_strip_nulls(jsonb_build_object('provider', p_provider)),
    -- A full season for each competition: give it time.
    timeout_milliseconds := 60000
  );
end;
$$;

-- The sync-fixtures function reports a competition it couldn't sync (the
-- provider failed or refused), so /admin can show it. Server only.
create or replace function public.record_fixture_sync_error(
  p_provider     text,
  p_provider_ref text,
  p_message      text
)
returns void
language sql
security definer
set search_path = public, private
as $$
  update catalog.competitions
  set last_sync_error = left(coalesce(nullif(btrim(p_message), ''), 'Unknown error'), 500),
      last_sync_error_at = now()
  where provider = p_provider
    and provider_ref = p_provider_ref;
$$;

-- Match results (event packs phase 2). The sync saves each finished match's
-- score; the resolvers turn it into a suggested answer for every fixture
-- question; a platform admin confirms (or edits) those answers in /admin;
-- Crow then reveals every linked room question that's locked. A room that
-- revealed by hand is left alone.

-- ------------------------------------------------------------
-- Scores
-- ------------------------------------------------------------

-- One part of a saved result as {home, away}: 'ninety' (90 minutes plus
-- stoppage time), 'total' (with extra time, without the shootout),
-- 'half_time' or 'penalties'. Null when the result can't tell.
create or replace function private.fixture_score(p_result jsonb, p_part text)
returns int[]
language plpgsql
immutable
set search_path = public, private
as $$
declare
  v_duration text := p_result->>'duration';
  v_score    jsonb;
begin
  if p_result is null then
    return null;
  end if;

  v_score := case p_part
    when 'ninety' then
      case
        when p_result ? 'regular_time' then p_result->'regular_time'
        when v_duration = 'regular' then p_result->'full_time'
      end
    when 'total' then
      case
        when p_result ? 'regular_time' and p_result ? 'extra_time' then
          jsonb_build_object(
            'home', (p_result->'regular_time'->>'home')::int + (p_result->'extra_time'->>'home')::int,
            'away', (p_result->'regular_time'->>'away')::int + (p_result->'extra_time'->>'away')::int
          )
        when v_duration in ('regular', 'extra_time') then p_result->'full_time'
      end
    when 'half_time' then p_result->'half_time'
    when 'penalties' then p_result->'penalties'
  end;

  if v_score is null
    or jsonb_typeof(v_score->'home') <> 'number'
    or jsonb_typeof(v_score->'away') <> 'number'
  then
    return null;
  end if;

  return array[(v_score->>'home')::int, (v_score->>'away')::int];
end;
$$;

-- 'home', 'away' or 'draw' for a {home, away} score.
create or replace function private.score_winner(p_score int[])
returns text
language sql
immutable
as $$
  select case
    when p_score is null then null
    when p_score[1] > p_score[2] then 'home'
    when p_score[1] < p_score[2] then 'away'
    else 'draw'
  end;
$$;

-- The suggested answer for one fixture question, from its fixture's saved
-- result: an option key, or null when the result can't settle it (no
-- score yet, a called-off match, a one-off extra). Admins see it in /admin
-- and confirm or change it. Each template's resolver key is a rule here.
create or replace function private.fixture_question_outcome(p_question_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_resolver  text;
  v_fixture   catalog.fixtures%rowtype;
  v_result    jsonb;
  v_ninety    int[];
  v_total     int[];
  v_half      int[];
  v_first     jsonb;
  v_first_total int[];
  v_shootout  text;
begin
  select f.* into v_fixture
  from catalog.fixture_questions q
  join catalog.fixtures f on f.id = q.fixture_id
  where q.id = p_question_id;

  select t.resolver into v_resolver
  from catalog.fixture_questions q
  join catalog.question_templates t on t.id = q.template_id
  where q.id = p_question_id;

  v_result := v_fixture.result;
  if v_resolver is null or v_result is null then
    return null;
  end if;

  -- Cricket: the adapter saves the winner, the toss and each innings with
  -- sides as home or away (see supabase/functions/sync-fixtures).
  if v_fixture.match_format is not null then
    return private.cricket_outcome(v_resolver, v_result);
  end if;

  if v_fixture.status <> 'finished' then
    return null;
  end if;

  v_ninety := private.fixture_score(v_result, 'ninety');
  v_total := private.fixture_score(v_result, 'total');
  v_half := private.fixture_score(v_result, 'half_time');
  -- Who won the shootout: from its score, or the provider's winner.
  v_shootout := case
    when v_result->>'duration' <> 'penalties' then null
    when private.fixture_score(v_result, 'penalties') is not null
      then nullif(private.score_winner(private.fixture_score(v_result, 'penalties')), 'draw')
    else nullif(v_result->>'winner', 'draw')
  end;

  return case v_resolver
    when 'full_time_winner' then private.score_winner(v_ninety)
    when 'both_score' then
      case when v_ninety is null then null
           when v_ninety[1] > 0 and v_ninety[2] > 0 then 'yes' else 'no' end
    when 'three_plus_goals' then
      case when v_ninety is null then null
           when v_ninety[1] + v_ninety[2] >= 3 then 'yes' else 'no' end
    when 'clean_sheet_home' then
      case when v_ninety is null then null
           when v_ninety[2] = 0 then 'yes' else 'no' end
    when 'more_goals_half' then
      case when v_ninety is null or v_half is null then null
           when v_half[1] + v_half[2] > v_ninety[1] + v_ninety[2] - v_half[1] - v_half[2] then 'first'
           when v_half[1] + v_half[2] < v_ninety[1] + v_ninety[2] - v_half[1] - v_half[2] then 'second'
           else 'same' end
    when 'penalties' then
      case when v_result->>'duration' = 'penalties' then 'yes' else 'no' end
    -- A single game that sends someone through: the shootout, or the score
    -- with extra time.
    when 'match_winner' then
      coalesce(v_shootout, nullif(private.score_winner(v_total), 'draw'))
    -- Who goes through: the shootout, or the score over both legs when this
    -- is a second leg (the first leg's home side is this game's away side).
    when 'tie_winner' then
      case
        when v_shootout is not null then v_shootout
        else (
          select case
            when g.id is null then nullif(private.score_winner(v_total), 'draw')
            when private.fixture_score(g.result, 'total') is null or g.status <> 'finished' then null
            else nullif(private.score_winner(array[
              v_total[1] + (private.fixture_score(g.result, 'total'))[2],
              v_total[2] + (private.fixture_score(g.result, 'total'))[1]
            ]), 'draw')
          end
          from (select 1) one
          left join catalog.fixtures g
            on g.competition_id = v_fixture.competition_id
           and g.season = v_fixture.season
           and g.round_label is not distinct from v_fixture.round_label
           and g.home_team_id = v_fixture.away_team_id
           and g.away_team_id = v_fixture.home_team_id
           and g.kickoff_at < v_fixture.kickoff_at
        )
      end
    else null
  end;
end;
$$;

-- The suggested answer for a cricket question. p_result is
--   {"winner": "home" | "away" | "draw" | "tie" | "no_result" | null,
--    "toss_winner": "home" | "away" | null, "toss_choice": "bat" | "bowl" | null,
--    "innings": [{"team": "home" | "away", "runs": 245, "wickets": 6, "overs": 50}],
--    "status_text": "India won by 5 wkts"}
-- A match with no result answers its result questions with no_result
-- (everyone gets their points back); the toss still counts if it happened.
-- A tie with no super over winner suggests nothing: an admin decides.
create or replace function private.cricket_outcome(p_resolver text, p_result jsonb)
returns text
language plpgsql
immutable
set search_path = public, private
as $$
declare
  v_winner      text := p_result->>'winner';
  v_toss        text := p_result->>'toss_winner';
  v_choice      text := p_result->>'toss_choice';
  v_first_team  text;
  v_first_runs  int;
  v_threshold   int;
begin
  v_first_team := case
    when v_toss is null or v_choice is null then p_result->'innings'->0->>'team'
    when v_choice = 'bat' then v_toss
    else case v_toss when 'home' then 'away' else 'home' end
  end;
  v_first_runs := (p_result->'innings'->0->>'runs')::int;

  if p_resolver in ('toss_winner', 'toss_choice') then
    return case p_resolver when 'toss_winner' then v_toss else v_choice end;
  end if;

  if v_winner = 'no_result' then
    return 'no_result';
  end if;

  if p_resolver = 'cricket_winner' then
    -- Limited overs: no draw option; a tie needs its super over.
    return case when v_winner in ('home', 'away') then v_winner end;
  elsif p_resolver = 'cricket_test_winner' then
    return case when v_winner in ('home', 'away', 'draw') then v_winner end;
  elsif p_resolver = 'batting_first_wins' then
    return case
      when v_winner not in ('home', 'away') or v_first_team is null then null
      when v_winner = v_first_team then 'yes'
      else 'no'
    end;
  elsif p_resolver like 'first_innings_at_least:%' then
    v_threshold := split_part(p_resolver, ':', 2)::int;
    return case
      when v_first_runs is null then null
      when v_first_runs >= v_threshold then 'yes'
      else 'no'
    end;
  end if;

  return null;
end;
$$;

-- ------------------------------------------------------------
-- Revealing in rooms
-- ------------------------------------------------------------

-- Reveals, as Crow, every locked room question linked to a confirmed
-- fixture question (one fixture, or all). Runs when an admin confirms, and
-- every 15 minutes for questions that lock later (a host moved the
-- deadline past kickoff). A room that already revealed by hand isn't
-- touched: only locked ones are. One push per room. Returns how many.
create or replace function private.reveal_confirmed_fixture_questions(p_fixture_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_item      record;
  v_result    json;
  v_closed    uuid[] := '{}';
  v_revealed  int := 0;
begin
  perform set_config('crow.skip_prediction_push', 'on', true);

  -- Oldest first, so streaks and ratings move in the order things happened.
  for v_item in
    select p.id, p.room_id, q.outcome, f.status as fixture_status,
      (select o.id from public.prediction_options o
       where o.prediction_id = p.id and o.option_key = q.outcome) as option_id
    from public.predictions p
    join catalog.fixture_questions q on q.id = p.fixture_question_id
    join catalog.fixtures f on f.id = q.fixture_id
    where p.status = 'locked'
      and q.outcome is not null
      and f.result_confirmed_at is not null
      and (p_fixture_id is null or f.id = p_fixture_id)
    order by p.deadline, p.series_prediction_number, p.id
    for update of p skip locked
  loop
    if v_item.outcome = 'no_result' then
      v_result := private.resolve_prediction(
        v_item.id, v_item.room_id, 'no_result', null,
        case v_item.fixture_status
          when 'abandoned' then 'Match abandoned'
          when 'postponed' then 'Match postponed'
          when 'cancelled' then 'Match called off'
        end,
        null
      );
    elsif v_item.option_id is not null then
      v_result := private.resolve_prediction(v_item.id, v_item.room_id, 'win', v_item.option_id, null, null);
    else
      continue;
    end if;

    v_closed := v_closed || v_item.id;
    if v_result->>'outcome' = 'revealed' then
      v_revealed := v_revealed + 1;
    end if;
  end loop;

  perform set_config('crow.skip_prediction_push', 'off', true);

  perform private.push_for_predictions(
    'result_revealed',
    v_closed,
    '🏆 Result''s in',
    case
      when v_revealed > 0 then '🏆 %s results are in'
      else '↩️ %s questions called off · points back'
    end
  );

  return cardinality(v_closed);
end;
$$;

-- Cron, every 15 minutes: while a match that rooms have questions on is
-- likely over but has no final score yet, asks for a fixture sync; and
-- reveals confirmed questions that have locked since.
create or replace function private.run_fixture_results()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  -- One request for all of them: the sync function fetches what's due
  -- (get_fixture_result_targets), and syncs season lists only as often as
  -- each provider allows.
  if exists (
    select 1
    from catalog.fixtures f
    join catalog.competitions c on c.id = f.competition_id and c.active
    where f.result_confirmed_at is null
      and f.kickoff_at between now() - interval '7 days' and now() - interval '105 minutes'
      and private.fixture_result_due(f.id)
  ) then
    perform private.request_fixture_sync();
  end if;

  perform private.reveal_confirmed_fixture_questions();
end;
$$;

-- ------------------------------------------------------------
-- Admin: results
-- ------------------------------------------------------------

-- A fixture as /admin shows it, with the questions rooms have from it:
-- each with its options, the suggested answer, the confirmed one, and how
-- its room questions stand.
create or replace function private.admin_fixture_json(p_fixture_id uuid)
returns json
language sql
stable
security definer
set search_path = public, private
as $$
  select json_build_object(
    'id', f.id,
    'competition_name', c.name,
    'round_label', f.round_label,
    'kickoff_at', f.kickoff_at,
    'status', f.status,
    'home', h.short_name,
    'away', a.short_name,
    'sport', c.sport,
    'format', f.match_format,
    'label', f.label,
    'result', f.result,
    'result_source', f.result_source,
    'confirmed_at', f.result_confirmed_at,
    'confirmed_by', (select username from public.players where id = f.result_confirmed_by),
    'questions', (
      select coalesce(json_agg(json_build_object(
        'id', q.id,
        'title', q.title,
        'options', q.options,
        'suggested', private.fixture_question_outcome(q.id),
        'outcome', q.outcome,
        'rooms', s.rooms,
        'waiting', s.waiting,
        'by_crow', s.by_crow,
        'by_hand', s.by_hand
      ) order by q.display_order, q.created_at), '[]'::json)
      from catalog.fixture_questions q
      cross join lateral (
        select
          count(distinct p.room_id)::int as rooms,
          count(*) filter (where p.status in ('draft', 'locked'))::int as waiting,
          count(*) filter (where p.status in ('revealed', 'no_result') and p.revealed_by_crow)::int as by_crow,
          count(*) filter (where p.status in ('revealed', 'no_result') and not p.revealed_by_crow)::int as by_hand
        from public.predictions p
        where p.fixture_question_id = q.id
          and p.status <> 'cancelled'
      ) s
      where q.fixture_id = f.id
        and (s.rooms > 0 or q.outcome is not null)
    )
  )
  from catalog.fixtures f
  join catalog.competitions c on c.id = f.competition_id
  left join catalog.teams h on h.id = f.home_team_id
  left join catalog.teams a on a.id = f.away_team_id
  where f.id = p_fixture_id;
$$;

-- Platform admins: matches rooms have questions on that have kicked off
-- and wait for a confirmed result (oldest first), and the ones confirmed
-- in the last two weeks, to fix if needed.
create or replace function public.admin_get_results()
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  return json_build_object(
    'to_confirm', (
      select coalesce(json_agg(private.admin_fixture_json(f.id) order by f.kickoff_at), '[]'::json)
      from catalog.fixtures f
      where f.result_confirmed_at is null
        and f.kickoff_at < now()
        and exists (
          select 1 from catalog.fixture_questions q
          join public.predictions p on p.fixture_question_id = q.id
          where q.fixture_id = f.id and p.status <> 'cancelled'
        )
    ),
    'confirmed', (
      select coalesce(json_agg(private.admin_fixture_json(x.id) order by x.result_confirmed_at desc), '[]'::json)
      from (
        select f.id, f.result_confirmed_at
        from catalog.fixtures f
        where f.result_confirmed_at > now() - interval '14 days'
        order by f.result_confirmed_at desc
        limit 30
      ) x
    ),
    'last_synced_at', (select max(synced_at) from catalog.competitions where active)
  );
end;
$$;

-- Platform admins type a match's score when the feed is missing or wrong,
-- or mark it called off. p_result is
--   {"ninety": {"home": 2, "away": 1}, "half_time": {"home": 1, "away": 0},
--    "duration": "regular" | "extra_time" | "penalties",
--    "after_extra_time": {...}, "penalties": {...}}
-- (after_extra_time with extra time or penalties, penalties with
-- penalties). Null with a status other than finished for a match that
-- didn't finish. The feed won't overwrite it. Suggested answers follow;
-- nothing is revealed until the admin confirms.
create or replace function public.admin_set_fixture_result(
  p_fixture_id uuid,
  p_status     text,
  p_result     jsonb default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_duration text := p_result->>'duration';
  v_ninety   int[];
  v_half     int[];
  v_after    int[];
  v_pens     int[];
  v_result   jsonb;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if p_status not in ('finished', 'abandoned', 'postponed', 'cancelled') then
    raise exception 'Status must be finished, abandoned, postponed or cancelled' using errcode = 'P0001';
  end if;

  -- Cricket has no score form: an admin marks a match finished (or called
  -- off) and picks each answer when confirming.
  if p_status = 'finished' and p_result is null and exists (
    select 1 from catalog.fixtures f
    join catalog.competitions c on c.id = f.competition_id
    where f.id = p_fixture_id and c.sport = 'cricket'
  ) then
    update catalog.fixtures
    set status = 'finished', result_source = 'manual', updated_at = now()
    where id = p_fixture_id;
    return private.admin_fixture_json(p_fixture_id);
  end if;

  if p_status = 'finished' then
    if v_duration not in ('regular', 'extra_time', 'penalties') then
      raise exception 'Say how the match ended: 90 minutes, extra time or penalties' using errcode = 'P0001';
    end if;

    v_ninety := array[(p_result->'ninety'->>'home')::int, (p_result->'ninety'->>'away')::int];
    v_half := array[(p_result->'half_time'->>'home')::int, (p_result->'half_time'->>'away')::int];
    v_after := case when v_duration = 'regular' then v_ninety
      else array[(p_result->'after_extra_time'->>'home')::int, (p_result->'after_extra_time'->>'away')::int] end;
    v_pens := case when v_duration = 'penalties'
      then array[(p_result->'penalties'->>'home')::int, (p_result->'penalties'->>'away')::int] end;

    if array_position(v_ninety || v_half || v_after || coalesce(v_pens, '{0,0}'), null) is not null
      or least(v_ninety[1], v_ninety[2], v_half[1], v_half[2], v_after[1], v_after[2],
               coalesce(v_pens[1], 0), coalesce(v_pens[2], 0)) < 0
    then
      raise exception 'Every score needs both numbers, 0 or more' using errcode = 'P0001';
    end if;

    if v_half[1] > v_ninety[1] or v_half[2] > v_ninety[2]
      or v_ninety[1] > v_after[1] or v_ninety[2] > v_after[2]
    then
      raise exception 'Scores can only go up from half time to the end' using errcode = 'P0001';
    end if;

    -- No check that extra time follows a level score: in a second leg it
    -- follows a level aggregate.
    if v_duration = 'penalties' and v_pens[1] = v_pens[2] then
      raise exception 'A shootout has a winner' using errcode = 'P0001';
    end if;

    v_result := jsonb_build_object(
      'winner', case when v_duration = 'penalties'
        then private.score_winner(v_pens) else private.score_winner(v_after) end,
      'duration', v_duration,
      'full_time', jsonb_build_object('home', v_after[1], 'away', v_after[2]),
      'half_time', jsonb_build_object('home', v_half[1], 'away', v_half[2]),
      'regular_time', jsonb_build_object('home', v_ninety[1], 'away', v_ninety[2]),
      'extra_time', jsonb_build_object('home', v_after[1] - v_ninety[1], 'away', v_after[2] - v_ninety[2])
    ) || case when v_pens is null then '{}'::jsonb
      else jsonb_build_object('penalties', jsonb_build_object('home', v_pens[1], 'away', v_pens[2])) end;
  end if;

  update catalog.fixtures
  set status = p_status,
      result = v_result,
      result_source = 'manual',
      updated_at = now()
  where id = p_fixture_id;

  if not found then
    raise exception 'Fixture not found' using errcode = 'P0002';
  end if;

  return private.admin_fixture_json(p_fixture_id);
end;
$$;

-- Platform admins confirm a match: p_outcomes gives every question rooms
-- have from it its answer, {"<fixture question id>": "<option key>" or
-- "no_result"}. Crow then reveals every linked room question that's
-- locked. Confirming again with different answers fixes the result in
-- every room Crow revealed (a room that revealed or fixed it by hand is
-- left alone; so is one whose series has finished).
create or replace function public.admin_confirm_fixture(
  p_fixture_id uuid,
  p_outcomes   jsonb
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin_id  uuid := private.get_player_id_from_auth();
  v_question  record;
  v_value     text;
  v_changed   uuid[] := '{}';
  v_item      record;
  v_fixed     int := 0;
  v_not_fixed int := 0;
  v_revealed  int;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  perform 1 from catalog.fixtures where id = p_fixture_id for update;
  if not found then
    raise exception 'Fixture not found' using errcode = 'P0002';
  end if;

  if p_outcomes is null or jsonb_typeof(p_outcomes) <> 'object' then
    raise exception 'Give an answer for each question' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_outcomes) k
    where not exists (
      select 1 from catalog.fixture_questions q
      where q.fixture_id = p_fixture_id and q.id::text = k
    )
  ) then
    raise exception 'Those answers are for another match' using errcode = 'P0001';
  end if;

  for v_question in
    select q.id, q.title, q.options, q.outcome,
      exists (select 1 from public.predictions p where p.fixture_question_id = q.id and p.status <> 'cancelled') as in_play
    from catalog.fixture_questions q
    where q.fixture_id = p_fixture_id
    for update of q
  loop
    v_value := p_outcomes->>v_question.id::text;

    if v_value is null then
      if v_question.in_play then
        raise exception 'Give an answer for "%"', v_question.title using errcode = 'P0001';
      end if;
      continue;
    end if;

    if v_value <> 'no_result' and not exists (
      select 1 from jsonb_array_elements(v_question.options) o where o->>'key' = v_value
    ) then
      raise exception '"%" isn''t an answer to "%"', v_value, v_question.title using errcode = 'P0001';
    end if;

    if v_question.outcome is distinct from v_value then
      update catalog.fixture_questions
      set outcome = v_value, updated_at = now()
      where id = v_question.id;
      v_changed := v_changed || v_question.id;
    end if;
  end loop;

  update catalog.fixtures
  set result_confirmed_at = now(),
      result_confirmed_by = v_admin_id,
      updated_at = now()
  where id = p_fixture_id;

  -- A changed answer: fix the rooms Crow revealed (and no host fixed since).
  for v_item in
    select p.id, p.room_id, p.status, p.winning_option_id, p.ratings_reversible, s.status as series_status, q.outcome,
      (select o.id from public.prediction_options o
       where o.prediction_id = p.id and o.option_key = q.outcome) as option_id
    from public.predictions p
    join catalog.fixture_questions q on q.id = p.fixture_question_id
    left join public.series s on s.id = p.series_id
    where q.id = any(v_changed)
      and p.status in ('revealed', 'no_result')
      and p.revealed_by_crow
      and p.corrected_by is null
    order by p.deadline, p.series_prediction_number, p.id
  loop
    if v_item.series_status is distinct from 'active'
      or (v_item.status = 'revealed' and not v_item.ratings_reversible)
      or (v_item.outcome <> 'no_result' and v_item.option_id is null)
    then
      v_not_fixed := v_not_fixed + 1;
      continue;
    end if;

    begin
      perform private.correct_prediction(
        v_item.id, v_item.room_id,
        case when v_item.outcome = 'no_result' then 'no_result' else 'win' end,
        v_item.option_id, null, null
      );
      v_fixed := v_fixed + 1;
    exception when sqlstate 'P0001' then
      -- Already that result (e.g. nobody picked the new winner either).
      null;
    end;
  end loop;

  v_revealed := private.reveal_confirmed_fixture_questions(p_fixture_id);

  return json_build_object(
    'fixture', private.admin_fixture_json(p_fixture_id),
    'revealed', v_revealed,
    'fixed', v_fixed,
    'not_fixed', v_not_fixed
  );
end;
$$;

-- ------------------------------------------------------------
-- Admin: competitions and fixture questions
-- ------------------------------------------------------------

-- Every competition, on or off, with how many rooms follow it.
create or replace function public.admin_get_competitions()
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  return (
    select coalesce(json_agg(json_build_object(
      'id', c.id,
      'name', c.name,
      'sport', c.sport,
      'provider', c.provider,
      'provider_ref', c.provider_ref,
      'kind', c.kind,
      'starts_on', c.starts_on,
      'ends_on', c.ends_on,
      'region', c.region,
      'season', c.current_season,
      'active', c.active,
      'synced_at', c.synced_at,
      'last_sync_error', c.last_sync_error,
      'last_sync_error_at', c.last_sync_error_at,
      'rooms', (select count(*)::int from public.room_competitions rc where rc.competition_id = c.id),
      'upcoming', (
        select count(*)::int from catalog.fixtures f
        where f.competition_id = c.id and f.status = 'scheduled' and f.kickoff_at > now()
      )
    ) order by c.display_order, c.name), '[]'::json)
    from catalog.competitions c
  );
end;
$$;

-- Turns a competition on or off for every room. Off: it isn't synced or
-- offered, but questions rooms already have still get their results here.
create or replace function public.admin_set_competition_active(
  p_competition_id uuid,
  p_active         boolean
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  update catalog.competitions set active = p_active where id = p_competition_id;
  if not found then
    raise exception 'Competition not found' using errcode = 'P0002';
  end if;

  return json_build_object('id', p_competition_id, 'active', p_active);
end;
$$;

-- Asks the sync-fixtures function to sync now: every active competition,
-- or one provider's. False when the sync isn't set up (fixture_sync_secret
-- missing).
create or replace function public.admin_request_fixture_sync(p_provider text default null)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if not exists (select 1 from private.notification_config where key = 'fixture_sync_secret') then
    return false;
  end if;

  perform private.request_fixture_sync(p_provider);
  return true;
end;
$$;

-- Upcoming fixtures (optionally one competition's) with every question
-- that fits, shown or hidden, and how many rooms have each.
create or replace function public.admin_get_fixtures(
  p_competition_id uuid default null,
  p_days           integer default 14
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 14), 1), 60);
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  return (
    select coalesce(json_agg(json_build_object(
      'id', f.id,
      'competition_name', c.name,
      'round_label', f.round_label,
      'kickoff_at', f.kickoff_at,
      'format', f.match_format,
      'label', f.label,
      'venue', f.venue,
      'home', h.short_name,
      'away', a.short_name,
      'questions', (
        select coalesce(json_agg(json_build_object(
          'id', q.id,
          'title', q.title,
          'description', q.description,
          'options', q.options,
          'hidden', q.hidden,
          -- A one-off question an admin wrote for this match.
          'extra', q.template_id is null,
          'closes_before', coalesce(t.close_minutes_before, 0),
          'customized', q.customized_at is not null,
          'rooms', (select count(*)::int from public.predictions p
                    where p.fixture_question_id = q.id and p.status <> 'cancelled')
        ) order by q.display_order, q.created_at), '[]'::json)
        from catalog.fixture_questions q
        left join catalog.question_templates t on t.id = q.template_id
        where q.fixture_id = f.id
          and (q.template_id is null or private.template_fits(t.active, t.stages, t.formats, f.stage_kind, f.match_format))
      )
    ) order by f.kickoff_at, h.short_name), '[]'::json)
    from catalog.fixtures f
    join catalog.competitions c on c.id = f.competition_id
    join catalog.teams h on h.id = f.home_team_id
    join catalog.teams a on a.id = f.away_team_id
    where (p_competition_id is null or c.id = p_competition_id)
      and f.status = 'scheduled'
      and f.kickoff_at > now()
      and f.kickoff_at < now() + make_interval(days => v_days)
  );
end;
$$;

-- Platform admins hide, show or reword one match's question. Rewording
-- (title, description) sticks through later syncs; p_reset puts the
-- template's wording back. Rooms that already added it keep their copy.
create or replace function public.admin_update_fixture_question(
  p_question_id uuid,
  p_hidden      boolean default null,
  p_title       text default null,
  p_description text default null,
  p_reset       boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_question catalog.fixture_questions%rowtype;
  v_title    text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  select * into v_question from catalog.fixture_questions where id = p_question_id for update;
  if not found then
    raise exception 'Question not found' using errcode = 'P0002';
  end if;

  if char_length(v_title) > 200 then
    raise exception 'Keep the question under 200 characters' using errcode = 'P0001';
  end if;
  if char_length(v_description) > 500 then
    raise exception 'Keep the description under 500 characters' using errcode = 'P0001';
  end if;

  if p_reset then
    update catalog.fixture_questions
    set customized_at = null, updated_at = now()
    where id = p_question_id;
    perform private.refresh_fixture_questions(v_question.fixture_id);
  elsif v_title is not null
    and (v_title, v_description) is distinct from (v_question.title, v_question.description)
  then
    update catalog.fixture_questions
    set title = v_title,
        description = v_description,
        customized_at = now(),
        updated_at = now()
    where id = p_question_id;
  end if;

  if p_hidden is not null then
    update catalog.fixture_questions
    set hidden = p_hidden, updated_at = now()
    where id = p_question_id;
  end if;

  return (
    select json_build_object(
      'id', q.id,
      'title', q.title,
      'description', q.description,
      'hidden', q.hidden,
      'customized', q.customized_at is not null
    )
    from catalog.fixture_questions q
    where q.id = p_question_id
  );
end;
$$;

-- Platform admins add a competition the provider lists (a cricket series
-- found with the search in /admin), or turn an existing one back on. It's
-- synced on the next run; Sync in /admin starts it now.
create or replace function public.admin_add_competition(
  p_provider     text,
  p_provider_ref text,
  p_name         text,
  p_sport        text,
  p_kind         text,
  p_region       text default null,
  p_starts_on    date default null,
  p_ends_on      date default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if nullif(btrim(p_name), '') is null or nullif(btrim(p_provider_ref), '') is null then
    raise exception 'A competition needs a name and the provider''s id' using errcode = 'P0001';
  end if;

  insert into catalog.competitions (
    sport, name, format, kind, region, provider, provider_ref, active, display_order, starts_on, ends_on
  )
  values (
    p_sport, left(btrim(p_name), 40),
    case p_kind when 'league' then 'league' when 'cup' then 'knockout' else 'mixed' end,
    p_kind, nullif(btrim(p_region), ''), p_provider, p_provider_ref, true,
    coalesce((select max(display_order) + 1 from catalog.competitions), 1),
    p_starts_on, p_ends_on
  )
  on conflict (provider, provider_ref) do update
    set active = true,
        starts_on = coalesce(excluded.starts_on, catalog.competitions.starts_on),
        ends_on = coalesce(excluded.ends_on, catalog.competitions.ends_on)
  returning id into v_id;

  return json_build_object('id', v_id);
end;
$$;

-- Platform admins write a one-off question for one match ("Will Kohli score
-- 50?"), offered to rooms next to the ready-made ones. No feed can settle
-- it: the admin picks its answer when confirming the match. Options are
-- 2 to 6 labels; their keys are o1, o2, ...
create or replace function public.admin_add_fixture_extra(
  p_fixture_id  uuid,
  p_title       text,
  p_description text,
  p_options     text[]
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_title   text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
  v_labels  text[] := array(select btrim(o) from unnest(coalesce(p_options, '{}')) with ordinality as x(o, n) where btrim(o) <> '' order by n);
  v_id      uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if not exists (select 1 from catalog.fixtures where id = p_fixture_id and status = 'scheduled' and kickoff_at > now()) then
    raise exception 'That match has started or isn''t on the list' using errcode = 'P0001';
  end if;

  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Write a question under 200 characters' using errcode = 'P0001';
  end if;

  if cardinality(v_labels) not between 2 and 6 then
    raise exception 'Give 2 to 6 options' using errcode = 'P0001';
  end if;

  if (select count(distinct lower(l)) from unnest(v_labels) l) <> cardinality(v_labels) then
    raise exception 'Each option must be different' using errcode = 'P0001';
  end if;

  insert into catalog.fixture_questions (fixture_id, template_id, title, description, options, display_order, hidden)
  values (
    p_fixture_id,
    null,
    v_title,
    nullif(btrim(coalesce(p_description, '')), ''),
    (select jsonb_agg(jsonb_build_object('key', 'o' || n, 'label', l) order by n)
     from unnest(v_labels) with ordinality as x(l, n)),
    100 + (select count(*) from catalog.fixture_questions where fixture_id = p_fixture_id and template_id is null),
    false
  )
  returning id into v_id;

  return json_build_object('id', v_id);
end;
$$;

-- Platform admins remove a one-off question no room has added yet (once a
-- room has it, hide it instead).
create or replace function public.admin_delete_fixture_extra(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if exists (select 1 from public.predictions where fixture_question_id = p_question_id) then
    raise exception 'A room has added it: hide it instead' using errcode = 'P0001';
  end if;

  delete from catalog.fixture_questions
  where id = p_question_id and template_id is null;

  if not found then
    raise exception 'Only an extra question can be removed' using errcode = 'P0002';
  end if;
end;
$$;

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
            and (q.template_id is null or private.template_fits(t.active, t.stages, t.formats, f.stage_kind, f.match_format))
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

  -- Every one must still be on offer: shown, for a match yet to kick off,
  -- and still open (a toss question closes before the start).
  if (
    select count(*)
    from catalog.fixture_questions q
    join catalog.fixtures f on f.id = q.fixture_id
    join catalog.competitions c on c.id = f.competition_id
    left join catalog.question_templates t on t.id = q.template_id
    where q.id = any(p_fixture_question_ids)
      and not q.hidden
      and (q.template_id is null or private.template_fits(t.active, t.stages, t.formats, f.stage_kind, f.match_format))
      and c.active
      and f.status = 'scheduled'
      and f.kickoff_at - make_interval(mins => coalesce(t.close_minutes_before, 0)::int) > now()
      and f.home_team_id is not null
      and f.away_team_id is not null
  ) <> v_requested then
    raise exception 'Some of those matches have kicked off or changed. Refresh and try again.' using errcode = 'P0001';
  end if;

  if v_scheduled and exists (
    select 1
    from catalog.fixture_questions q
    join catalog.fixtures f on f.id = q.fixture_id
    left join catalog.question_templates t on t.id = q.template_id
    where q.id = any(p_fixture_question_ids)
      and f.kickoff_at - make_interval(mins => coalesce(t.close_minutes_before, 0)::int) < p_opens_at + interval '5 minutes'
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
      f.kickoff_at - make_interval(mins => coalesce(t.close_minutes_before, 0)::int) as closes_at,
      h.short_name || ' vs ' || a.short_name as event_title,
      -- Tags are 24 characters at most: a longer name (a tour) tags the sport.
      case
        when char_length(c.name) <= 24 then c.name
        when c.sport = 'soccer' then 'Football'
        else initcap(c.sport)
      end as competition_name
    from catalog.fixture_questions q
    left join catalog.question_templates t on t.id = q.template_id
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
      -- Picks close at kickoff (a toss question a little before).
      v_question.closes_at,
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

-- Organizers: every competition on offer, for the Fixtures home (the ones
-- the room follows) and Browse (the rest). Each with what's next and how
-- much of the coming week the room has added.
create or replace function public.get_room_competitions(p_room_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only organizers can add questions' using errcode = 'P0012';
  end if;

  return (
    select coalesce(json_agg(json_build_object(
      'id', c.id,
      'name', c.name,
      'sport', c.sport,
      'kind', c.kind,
      'region', c.region,
      'season', c.current_season,
      'following', rc.room_id is not null,
      'next', (
        select json_build_object('home', h.short_name, 'away', a.short_name, 'kickoff_at', f.kickoff_at)
        from catalog.fixtures f
        join catalog.teams h on h.id = f.home_team_id
        join catalog.teams a on a.id = f.away_team_id
        where f.competition_id = c.id and f.status = 'scheduled' and f.kickoff_at > now()
        order by f.kickoff_at
        limit 1
      ),
      'week_matches', w.matches,
      'week_added', w.added
    ) order by c.display_order, c.name), '[]'::json)
    from catalog.competitions c
    left join public.room_competitions rc on rc.competition_id = c.id and rc.room_id = p_room_id
    cross join lateral (
      select
        count(*)::int as matches,
        count(*) filter (where exists (
          select 1 from catalog.fixture_questions q
          join public.predictions p on p.fixture_question_id = q.id
          where q.fixture_id = f.id and p.room_id = p_room_id and p.status <> 'cancelled'
        ))::int as added
      from catalog.fixtures f
      where f.competition_id = c.id
        and f.status = 'scheduled'
        and f.kickoff_at > now()
        and f.kickoff_at < now() + interval '7 days'
        and f.home_team_id is not null
        and f.away_team_id is not null
    ) w
    where c.active
      -- A tour or cup that's over drops out the day after it ends.
      and (c.ends_on is null or c.ends_on >= current_date - 1)
  );
end;
$$;

-- Organizers: one competition's matches over the next six weeks that
-- haven't kicked off, each with its questions and, for the ones the room
-- already has, the room's question. The page groups them by round
-- (round_label) and day.
create or replace function public.get_room_competition_fixtures(
  p_room_id        uuid,
  p_competition_id uuid
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only organizers can add questions' using errcode = 'P0012';
  end if;

  if not exists (select 1 from catalog.competitions where id = p_competition_id and active) then
    raise exception 'Competition not found' using errcode = 'P0002';
  end if;

  return json_build_object(
    'competition', (
      select json_build_object(
        'id', c.id,
        'name', c.name,
        'sport', c.sport,
        'kind', c.kind,
        'region', c.region,
        'season', c.current_season,
        'following', exists (
          select 1 from public.room_competitions rc
          where rc.room_id = p_room_id and rc.competition_id = c.id
        )
      )
      from catalog.competitions c
      where c.id = p_competition_id
    ),
    'fixtures', (
      select coalesce(json_agg(json_build_object(
        'id', f.id,
        'kickoff_at', f.kickoff_at,
        'matchday', f.matchday,
        'format', f.match_format,
        'label', f.label,
        'venue', f.venue,
        'round_label', f.round_label,
        'home', h.short_name,
        'away', a.short_name,
        'questions', (
          select coalesce(json_agg(json_build_object(
            'id', q.id,
            'title', q.title,
            'description', q.description,
            -- Minutes before the start that picks close (a toss question).
            'closes_before', coalesce(t.close_minutes_before, 0),
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
            and (q.template_id is null or private.template_fits(t.active, t.stages, t.formats, f.stage_kind, f.match_format))
        )
      ) order by f.kickoff_at, h.short_name), '[]'::json)
      from (
        select * from catalog.fixtures
        where competition_id = p_competition_id
          and status = 'scheduled'
          and kickoff_at > now()
          and kickoff_at < now() + interval '42 days'
          and home_team_id is not null
          and away_team_id is not null
        order by kickoff_at
        limit 150
      ) f
      join catalog.teams h on h.id = f.home_team_id
      join catalog.teams a on a.id = f.away_team_id
    )
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. Function access
-- ------------------------------------------------------------
revoke execute on function private.template_fits(boolean, text[], text[], text, text) from public, anon, authenticated;
revoke execute on function private.fixture_result_due(uuid) from public, anon, authenticated;
revoke execute on function private.cricket_outcome(text, jsonb) from public, anon, authenticated;
revoke execute on function public.get_fixture_sync_targets() from public, anon, authenticated;
revoke execute on function public.sync_competition_fixtures(text, text, text, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.get_fixture_result_targets(text) from public, anon, authenticated;
revoke execute on function public.admin_add_competition(text, text, text, text, text, text, date, date) from public, anon, authenticated;
revoke execute on function public.admin_add_fixture_extra(uuid, text, text, text[]) from public, anon, authenticated;
revoke execute on function public.admin_delete_fixture_extra(uuid) from public, anon, authenticated;
grant execute on function public.get_fixture_sync_targets() to service_role;
grant execute on function public.sync_competition_fixtures(text, text, text, jsonb, boolean) to service_role;
grant execute on function public.get_fixture_result_targets(text) to service_role;
grant execute on function public.admin_add_competition(text, text, text, text, text, text, date, date) to authenticated;
grant execute on function public.admin_add_fixture_extra(uuid, text, text, text[]) to authenticated;
grant execute on function public.admin_delete_fixture_extra(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Cricket questions
-- ------------------------------------------------------------
-- Wording follows apps/web/VOICE.md. Toss questions close 35 minutes
-- before the first ball: the toss is about 30 minutes before it.
insert into catalog.question_templates
  (sport, key, title_pattern, description_pattern, options, stages, formats, resolver, default_on, display_order, close_minutes_before)
values
  ('cricket', 'who_wins',
   'Who wins {home} vs {away}?',
   'A tie goes to the super over. If there''s no result, everyone gets their points back.',
   '[{"key": "home", "label": "{home}"}, {"key": "away", "label": "{away}"}]',
   array['league', 'group', 'first_leg', 'knockout', 'final'], array['t20', 'odi'], 'cricket_winner', true, 1, 0),
  ('cricket', 'who_wins_test',
   'Who wins {home} vs {away}?',
   'A Test can end in a draw. If it''s abandoned, everyone gets their points back.',
   '[{"key": "home", "label": "{home}"}, {"key": "draw", "label": "Draw"}, {"key": "away", "label": "{away}"}]',
   array['league', 'group', 'first_leg', 'knockout', 'final'], array['test'], 'cricket_test_winner', true, 1, 0),
  ('cricket', 'toss_winner',
   'Who wins the toss, {home} or {away}?',
   'Picks close 35 minutes before the start, before the toss.',
   '[{"key": "home", "label": "{home}"}, {"key": "away", "label": "{away}"}]',
   array['league', 'group', 'first_leg', 'knockout', 'final'], null, 'toss_winner', true, 2, 35),
  ('cricket', 'toss_choice',
   'Does the toss winner bat or bowl first in {home} vs {away}?',
   'Picks close 35 minutes before the start, before the toss.',
   '[{"key": "bat", "label": "Bat"}, {"key": "bowl", "label": "Bowl"}]',
   array['league', 'group', 'first_leg', 'knockout', 'final'], null, 'toss_choice', true, 3, 35),
  ('cricket', 'batting_first_wins',
   'Does the team batting first win {home} vs {away}?',
   'Counts a super over. If there''s no result, everyone gets their points back.',
   '[{"key": "yes", "label": "Yes"}, {"key": "no", "label": "No"}]',
   array['league', 'group', 'first_leg', 'knockout', 'final'], array['t20', 'odi'], 'batting_first_wins', true, 4, 0),
  ('cricket', 'par_t20',
   '160 or more in the first innings of {home} vs {away}?',
   'Runs in the first innings, however many overs it lasts.',
   '[{"key": "yes", "label": "Yes"}, {"key": "no", "label": "No"}]',
   array['league', 'group', 'first_leg', 'knockout', 'final'], array['t20'], 'first_innings_at_least:160', true, 5, 0),
  ('cricket', 'par_odi',
   '300 or more in the first innings of {home} vs {away}?',
   'Runs in the first innings, however many overs it lasts.',
   '[{"key": "yes", "label": "Yes"}, {"key": "no", "label": "No"}]',
   array['league', 'group', 'first_leg', 'knockout', 'final'], array['odi'], 'first_innings_at_least:300', true, 5, 0)
on conflict (sport, key) do nothing;
