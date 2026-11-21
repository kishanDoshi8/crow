-- ============================================================
-- Migration: event_packs_results (phase 2, docs/event-packs.md)
-- Description: Match results for event packs. Platform admins
--   (public.platform_admins, added by hand) confirm each played match in
--   /admin: resolvers suggest every question's answer from the synced score,
--   the admin confirms or changes them (or types the score), and Crow
--   reveals every linked locked room question ("Revealed by Crow",
--   predictions.revealed_by_crow). Confirming again with other answers fixes
--   the rooms Crow revealed; rooms that revealed or fixed by hand are left
--   alone. Admins can also turn competitions on or off and hide or reword a
--   match's question (fixture_questions.customized_at keeps the wording
--   through syncs). A 15-minute job asks for a sync while matches rooms have
--   questions on are finishing, and reveals confirmed questions that lock
--   late. correct_prediction_result is split into a private core so Crow
--   can use it. Works with the previous frontend.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Platform admins
-- ------------------------------------------------------------
-- The Crow team: who can open /admin and run the admin RPCs (confirm match
-- results, turn competitions on or off, reword fixture questions). Added by
-- hand in SQL; nothing in the app writes here.
create table if not exists public.platform_admins (
  player_id uuid primary key references public.players(id) on delete cascade,
  note text,
  added_at timestamptz not null default now()
);

-- Checked only inside RPCs (private.is_platform_admin): no direct access.
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

-- Whether the signed-in player is on the Crow team (public.platform_admins).
-- Every admin RPC checks this first; the /admin page only hides itself.
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.platform_admins
    where player_id = private.get_player_id_from_auth()
  );
$$;

-- For the app: show the way into /admin.
create or replace function public.get_my_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.is_platform_admin();
$$;

-- ------------------------------------------------------------
-- 2. Results, confirmations and Crow's reveals
-- ------------------------------------------------------------
alter table catalog.fixtures
  add column if not exists result_confirmed_at timestamptz,
  add column if not exists result_confirmed_by uuid references public.players(id) on delete set null;

alter table catalog.fixture_questions
  add column if not exists customized_at timestamptz,
  add column if not exists outcome text;

alter table public.predictions
  add column if not exists revealed_by_crow boolean not null default false;
-- The web app reads predictions with "select *".
grant select (revealed_by_crow) on public.predictions to authenticated;

-- Closes one prediction as p_player_id: settles the points, then ratings,
-- stats and the room feed. The caller has already checked that the player is
-- room staff. Shared by resolve_prediction_v2 (one) and resolve_predictions
-- (several at once). A null player is Crow, revealing from a confirmed match
-- result (private.reveal_confirmed_fixture_questions).
create or replace function private.resolve_prediction(
  p_prediction_id     uuid,
  p_room_id           uuid,
  p_outcome           text,
  p_winning_option_id uuid,
  p_no_result_reason  varchar(120),
  p_player_id         uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id   uuid := p_player_id;
  v_prediction  public.predictions%rowtype;
  v_plan        record;
  v_counts      record;
  v_activity    text;
begin
  select * into v_prediction
  from public.predictions
  where id      = p_prediction_id
    and room_id = p_room_id
    -- Locked predictions can be closed any way; open ones can only be cancelled.
    and (status = 'locked' or (status = 'draft' and p_outcome = 'cancel'))
  -- Lock the prediction so a second resolve call waits, then finds it no longer locked.
  for update;

  if not found then
    raise exception 'Prediction not found or already closed' using errcode = 'P0006';
  end if;

  select * into v_plan
  from private.plan_settlement(p_prediction_id, p_outcome, p_winning_option_id, p_no_result_reason);

  select * into v_counts
  from private.apply_settlement(p_prediction_id, v_plan.status, v_plan.winning_option_id);

  update public.predictions
  set status            = v_plan.status,
      winning_option_id = v_plan.winning_option_id,
      no_result_reason  = v_plan.no_result_reason,
      resolved_at       = now(),
      resolved_by       = v_player_id,
      revealed_by_crow  = v_player_id is null
  where id = p_prediction_id
  returning * into v_prediction;

  if v_plan.status = 'revealed' then
    perform public.update_prediction_ratings(
      p_room_id,
      p_prediction_id,
      v_plan.winning_option_id
    );
  end if;

  perform public.update_player_stats_after_resolution(
    p_room_id,
    p_prediction_id,
    case when v_plan.status = 'revealed' then v_plan.winning_option_id end,
    case when v_plan.status = 'revealed' then 'win' else v_plan.status end
  );

  perform public.update_room_stats_after_resolution(
    p_room_id,
    p_prediction_id,
    case when v_plan.status = 'revealed' then v_plan.winning_option_id end,
    case when v_plan.status = 'revealed' then 'win' else v_plan.status end
  );

  v_activity := case v_plan.status
    when 'revealed' then 'prediction_revealed'
    when 'cancelled' then 'prediction_cancelled'
    else 'prediction_no_result'
  end;

  perform private.create_room_activity(
    p_room_id := p_room_id,
    p_activity_type := v_activity,
    p_activity_tier := 1,
    p_metadata := private.build_prediction_activity_metadata(p_prediction_id)
      || case when v_player_id is null then jsonb_build_object('byCrow', true) else '{}'::jsonb end,
    p_click_action := jsonb_build_object(
      'type', 'prediction',
      'predictionId', p_prediction_id
    ),
    p_created_by_player_id := v_player_id,
    p_dedupe_key := v_activity || ':' || p_prediction_id::text
  );

  if v_plan.status = 'revealed' then
    return json_build_object(
      'resolved',          true,
      'outcome',           'revealed',
      'winning_option_id', v_plan.winning_option_id,
      'winning_label',     (select label from public.prediction_options where id = v_plan.winning_option_id),
      'winners',           v_counts.winners,
      'losers',            v_counts.losers
    );
  end if;

  return json_build_object(
    'resolved',          true,
    'outcome',           v_plan.status,
    'reason',            v_plan.no_result_reason,
    'winning_option_id', v_plan.winning_option_id,
    'refunded',          true
  );
end;
$$;

-- Staff close one prediction: reveal the winner, mark no result, or cancel.
create or replace function public.resolve_prediction_v2(
  p_prediction_id     uuid,
  p_room_id           uuid,
  p_outcome           text,
  p_winning_option_id uuid default null,
  p_no_result_reason  varchar(120) default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id   uuid;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and player_id = v_player_id
      and role in ('owner', 'organizer', 'resolver')
  ) then
    raise exception 'Only room staff can close predictions' using errcode = 'P0012';
  end if;

  return private.resolve_prediction(
    p_prediction_id, p_room_id, p_outcome, p_winning_option_id, p_no_result_reason, v_player_id
  );
end;
$$;

-- Fixes a revealed (or no-result) prediction as p_player_id: points,
-- winnings, ratings, streaks and room stats move to what they'd be had the
-- right result gone out first. Only while the series is still running, so
-- final standings and trophies are never rewritten. The caller has checked
-- who may do it. A null player is Crow, fixing a confirmed match result for
-- every room (public.admin_confirm_fixture).
create or replace function private.correct_prediction(
  p_prediction_id     uuid,
  p_room_id           uuid,
  p_outcome           text,
  p_winning_option_id uuid,
  p_no_result_reason  varchar(120),
  p_player_id         uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id      uuid := p_player_id;
  v_prediction     public.predictions%rowtype;
  v_previous       public.predictions%rowtype;
  v_series_status  text;
  v_plan           record;
  v_bettors        uuid[];
begin
  if p_outcome not in ('win', 'no_result') then
    raise exception 'A result can be corrected to a winner or to no result' using errcode = 'P0001';
  end if;

  select * into v_prediction
  from public.predictions
  where id = p_prediction_id
    and room_id = p_room_id
  for update;

  if not found or v_prediction.status not in ('revealed', 'no_result') then
    raise exception 'Only revealed or no-result predictions can be corrected' using errcode = 'P0006';
  end if;

  select s.status into v_series_status
  from public.series s
  where s.id = v_prediction.series_id;

  if v_series_status is distinct from 'active' then
    raise exception 'Results can only be corrected while the series is running' using errcode = 'P0006';
  end if;

  if v_prediction.status = 'revealed' and not v_prediction.ratings_reversible then
    raise exception 'This result was revealed before corrections were possible' using errcode = 'P0006';
  end if;

  select * into v_plan
  from private.plan_settlement(p_prediction_id, p_outcome, p_winning_option_id, p_no_result_reason);

  if v_plan.status = v_prediction.status
    and v_plan.winning_option_id is not distinct from v_prediction.winning_option_id
  then
    raise exception 'That''s already the result' using errcode = 'P0001';
  end if;

  v_previous := v_prediction;

  if v_prediction.status = 'revealed' then
    perform private.reverse_prediction_ratings(p_prediction_id);
  end if;

  perform private.apply_settlement(p_prediction_id, v_plan.status, v_plan.winning_option_id);

  -- resolved_at stays, so the result keeps its place in streaks and history.
  update public.predictions
  set status            = v_plan.status,
      winning_option_id = v_plan.winning_option_id,
      no_result_reason  = v_plan.no_result_reason,
      corrected_at      = now(),
      corrected_by      = v_player_id,
      ratings_reversible = true
  where id = p_prediction_id
  returning * into v_prediction;

  if v_plan.status = 'revealed' then
    perform public.update_prediction_ratings(
      p_room_id,
      p_prediction_id,
      v_plan.winning_option_id
    );
  end if;

  select coalesce(array_agg(distinct b.player_id), '{}')
  into v_bettors
  from public.bets b
  where b.prediction_id = p_prediction_id;

  perform private.recompute_room_streaks(p_room_id, v_bettors);

  -- 'corrected' refreshes the streak stats without counting this result
  -- again: streaks were just recounted above.
  perform public.update_player_stats_after_resolution(p_room_id, p_prediction_id, null, 'corrected');
  perform public.update_room_stats_after_resolution(p_room_id, p_prediction_id, null, 'corrected');

  perform private.create_room_activity(
    p_room_id := p_room_id,
    p_activity_type := 'prediction_corrected',
    p_activity_tier := 1,
    p_metadata := private.build_prediction_activity_metadata(p_prediction_id)
      || jsonb_build_object(
        'previousStatus', v_previous.status,
        'previousWinningOptionLabel', (
          select po.label from public.prediction_options po
          where po.id = v_previous.winning_option_id
            and v_previous.status = 'revealed'
        )
      )
      || case when v_player_id is null then jsonb_build_object('byCrow', true) else '{}'::jsonb end,
    p_click_action := jsonb_build_object(
      'type', 'prediction',
      'predictionId', p_prediction_id
    ),
    p_created_by_player_id := v_player_id,
    p_dedupe_key := 'prediction_corrected:' || p_prediction_id::text || ':' || extract(epoch from now())::text
  );

  return json_build_object(
    'corrected',         true,
    'outcome',           v_plan.status,
    'winning_option_id', v_plan.winning_option_id,
    'reason',            v_plan.no_result_reason
  );
end;
$$;

-- Organizers fix a result that went out wrong: pick a different winner, or
-- turn a revealed result into no result (or back).
create or replace function public.correct_prediction_result(
  p_prediction_id     uuid,
  p_room_id           uuid,
  p_outcome           text,
  p_winning_option_id uuid default null,
  p_no_result_reason  varchar(120) default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and player_id = v_player_id
      and role in ('owner', 'organizer')
  ) then
    raise exception 'Only organizers can correct a result' using errcode = 'P0012';
  end if;

  return private.correct_prediction(
    p_prediction_id, p_room_id, p_outcome, p_winning_option_id, p_no_result_reason, v_player_id
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. Fixture sync keeps admins' wording
-- ------------------------------------------------------------
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
-- 4. Resolvers, reveals and the admin RPCs
-- ------------------------------------------------------------
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
  if v_resolver is null or v_result is null or v_fixture.status <> 'finished' then
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
  if exists (
    select 1
    from catalog.fixtures f
    join catalog.competitions c on c.id = f.competition_id and c.active
    where f.result_confirmed_at is null
      and f.kickoff_at between now() - interval '6 hours' and now() - interval '105 minutes'
      and (f.status <> 'finished' or f.result is null)
      and exists (
        select 1 from catalog.fixture_questions q
        join public.predictions p on p.fixture_question_id = q.id
        where q.fixture_id = f.id
      )
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
    )
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
      'season', c.current_season,
      'active', c.active,
      'synced_at', c.synced_at,
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

-- Asks the sync-fixtures function to sync now. False when the sync isn't
-- set up (fixture_sync_secret missing).
create or replace function public.admin_request_fixture_sync()
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

  perform private.request_fixture_sync();
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
      'home', h.short_name,
      'away', a.short_name,
      'questions', (
        select coalesce(json_agg(json_build_object(
          'id', q.id,
          'title', q.title,
          'description', q.description,
          'options', q.options,
          'hidden', q.hidden,
          'customized', q.customized_at is not null,
          'rooms', (select count(*)::int from public.predictions p
                    where p.fixture_question_id = q.id and p.status <> 'cancelled')
        ) order by q.display_order, q.created_at), '[]'::json)
        from catalog.fixture_questions q
        left join catalog.question_templates t on t.id = q.template_id
        where q.fixture_id = f.id
          and (q.template_id is null or (t.active and f.stage_kind = any(t.stages)))
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

-- ------------------------------------------------------------
-- 5. Function access
-- ------------------------------------------------------------
revoke execute on function private.is_platform_admin() from public, anon, authenticated;
revoke execute on function private.correct_prediction(uuid, uuid, text, uuid, character varying, uuid) from public, anon, authenticated;
revoke execute on function private.fixture_score(jsonb, text) from public, anon, authenticated;
revoke execute on function private.score_winner(integer[]) from public, anon, authenticated;
revoke execute on function private.fixture_question_outcome(uuid) from public, anon, authenticated;
revoke execute on function private.reveal_confirmed_fixture_questions(uuid) from public, anon, authenticated;
revoke execute on function private.run_fixture_results() from public, anon, authenticated;
revoke execute on function private.admin_fixture_json(uuid) from public, anon, authenticated;
revoke execute on function public.get_my_platform_admin() from public, anon, authenticated;
revoke execute on function public.admin_get_results() from public, anon, authenticated;
revoke execute on function public.admin_set_fixture_result(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_confirm_fixture(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_get_competitions() from public, anon, authenticated;
revoke execute on function public.admin_set_competition_active(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.admin_request_fixture_sync() from public, anon, authenticated;
revoke execute on function public.admin_get_fixtures(uuid, integer) from public, anon, authenticated;
revoke execute on function public.admin_update_fixture_question(uuid, boolean, text, text, boolean) from public, anon, authenticated;
-- Platform admin (/admin): match results, competitions, fixture questions.
-- Each checks private.is_platform_admin() itself.
grant execute on function public.get_my_platform_admin() to authenticated;
grant execute on function public.admin_get_results() to authenticated;
grant execute on function public.admin_set_fixture_result(uuid, text, jsonb) to authenticated;
grant execute on function public.admin_confirm_fixture(uuid, jsonb) to authenticated;
grant execute on function public.admin_get_competitions() to authenticated;
grant execute on function public.admin_set_competition_active(uuid, boolean) to authenticated;
grant execute on function public.admin_request_fixture_sync() to authenticated;
grant execute on function public.admin_get_fixtures(uuid, integer) to authenticated;
grant execute on function public.admin_update_fixture_question(uuid, boolean, text, text, boolean) to authenticated;
-- correct_prediction_result was replaced (same signature): keep its grant.
grant execute on function public.correct_prediction_result(uuid, uuid, text, uuid, character varying) to authenticated;

-- ------------------------------------------------------------
-- 6. Results job, every 15 minutes
-- ------------------------------------------------------------
select cron.schedule('fixture-results', '*/15 * * * *', $$select private.run_fixture_results()$$);
