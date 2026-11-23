-- ============================================================
-- Migration: cricket_results
-- Description: A cricket match counts as settled only once its own page
--   (match_info, marked "detailed") has been read after it ended: the
--   series list carries the winner but not the toss or innings, so toss,
--   batting-first and par-score questions had no suggested answer. A thinner
--   result from a later list sync no longer replaces a fuller one, and
--   cricket results are looked for up to three days after the start. A
--   cricket series list no longer counts as a result check, so the first
--   match_info fetch isn't held back.
--   get_prediction_match_result gives players a question's confirmed match
--   result (groundwork for showing it with the question's outcome).
-- ============================================================

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
          when 'odi' then interval '3 days'
          when 't20' then interval '3 days'
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
      -- Settled: football once it has a final score; cricket once the
      -- match's own page (match_info) has been read after it ended, since
      -- the series list carries the winner but not the toss or innings.
      and not (
        case
          when f.match_format is null then f.status = 'finished' and f.result is not null
          else f.status in ('finished', 'abandoned', 'cancelled', 'postponed')
            and coalesce((f.result->>'detailed')::boolean, false)
        end
      )
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
        -- A cricket series list isn't a result check (see below).
        case when v_new_kickoff < now() and (p_partial or nullif(v_item->>'match_format', '') is null) then now() end
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
          -- A result an admin set by hand wins over the feed. A list that
          -- carries no result (or a less detailed one, like a cricket
          -- series list without the toss) leaves a fuller one in place.
          result = case
            when result_source = 'manual' then result
            when coalesce(jsonb_typeof(v_item->'result'), '') <> 'object' then
              case when v_item->>'status' = 'scheduled' then null else result end
            when coalesce((result->>'detailed')::boolean, false)
              and not coalesce((v_item->'result'->>'detailed')::boolean, false) then result
            else v_item->'result'
          end,
          result_source = case
            when result_source = 'manual' then 'manual'
            when jsonb_typeof(v_item->'result') = 'object' then 'provider'
            when v_item->>'status' = 'scheduled' then null
            else result_source
          end,
          synced_at = now(),
          -- Football's season list carries results, so it counts as a check;
          -- a cricket series list doesn't (only match_info, a partial sync).
          result_checked_at = case
            when v_new_kickoff < now() and (p_partial or nullif(v_item->>'match_format', '') is null) then now()
            else result_checked_at
          end,
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

-- The match a room question came from, and how it ended, for showing next
-- to the question's result: its teams, the confirmed result (a football
-- score, or a cricket scoreboard and toss) and when it was confirmed. Null
-- for a question that isn't from the fixtures, or before an admin has
-- confirmed the match. Anyone who can see the question.
create or replace function public.get_prediction_match_result(p_prediction_id uuid)
returns json
language sql
stable
security definer
set search_path = public, private
as $$
  select json_build_object(
    'sport', c.sport,
    'competition', c.name,
    'format', f.match_format,
    'label', f.label,
    'venue', f.venue,
    'home', h.short_name,
    'away', a.short_name,
    'status', f.status,
    'result', f.result,
    'confirmed_at', f.result_confirmed_at
  )
  from public.predictions p
  join catalog.fixture_questions q on q.id = p.fixture_question_id
  join catalog.fixtures f on f.id = q.fixture_id
  join catalog.competitions c on c.id = f.competition_id
  left join catalog.teams h on h.id = f.home_team_id
  left join catalog.teams a on a.id = f.away_team_id
  where p.id = p_prediction_id
    and f.result_confirmed_at is not null
    and private.can_view_prediction(p.id);
$$;

revoke execute on function public.get_prediction_match_result(uuid) from public, anon, authenticated;
grant execute on function public.get_prediction_match_result(uuid) to authenticated;
