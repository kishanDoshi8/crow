-- Alerts for Crow admins: one push per platform admin, from the 15-minute
-- results job, when match results are waiting to be confirmed in /admin
-- (once per match, one reminder after 6 hours) and when a competition stops
-- syncing (once per error; CricketData's daily limit shows up as one).
-- Needs the send-push-notifications function with the admin_alert type.

alter table catalog.fixtures add column if not exists admin_alerted_at timestamptz;
alter table catalog.fixtures add column if not exists admin_reminded_at timestamptz;
alter table catalog.competitions add column if not exists sync_error_alerted_at timestamptz;


-- Pushes to Crow admins (platform admins) about event packs needing them:
-- match results waiting to be confirmed in /admin, and competitions that
-- stopped syncing (including CricketData's daily call limit running out,
-- which the sync reports as an error). Sent by the 15-minute results job
-- (private.run_fixture_results), each thing once: a match when it's first
-- ready (plus one reminder after 6 hours), a sync error when it starts.

-- What admins haven't been told yet, without telling them: the pushes it
-- would send ('title', 'body') and what they're about. Empty arrays when
-- there's nothing new.
create or replace function private.admin_alerts()
returns json
language sql
stable
security definer
set search_path = public, private
as $$
  with ready as (
    -- Played matches rooms have questions on that an admin can confirm:
    -- there's a score, or the match didn't happen (as /admin's isReady).
    select f.id, f.kickoff_at, f.admin_alerted_at, f.admin_reminded_at,
      coalesce(h.name, 'Home') || ' vs ' || coalesce(a.name, 'Away') as title
    from catalog.fixtures f
    left join catalog.teams h on h.id = f.home_team_id
    left join catalog.teams a on a.id = f.away_team_id
    where f.result_confirmed_at is null
      and f.kickoff_at < now()
      and (f.result is not null or f.status in ('postponed', 'abandoned', 'cancelled'))
      and exists (
        select 1 from catalog.fixture_questions q
        join public.predictions p on p.fixture_question_id = q.id
        where q.fixture_id = f.id and p.status <> 'cancelled'
      )
  ),
  fresh as (
    select * from ready where admin_alerted_at is null order by kickoff_at
  ),
  overdue as (
    select * from ready
    where admin_alerted_at < now() - interval '6 hours' and admin_reminded_at is null
    order by kickoff_at
  ),
  failing as (
    select c.id, c.name, c.last_sync_error
    from catalog.competitions c
    where c.active
      and c.last_sync_error is not null
      and c.sync_error_alerted_at is null
    order by c.name
  ),
  counts as (
    select
      (select count(*)::int from fresh) as fresh,
      (select count(*)::int from overdue) as overdue,
      (select count(*)::int from failing) as failing,
      (select title from fresh limit 1) as first_fresh,
      (select title from overdue limit 1) as first_overdue,
      (select name from failing limit 1) as first_failing,
      (select last_sync_error from failing limit 1) as first_error
  )
  select json_build_object(
    'fresh_fixture_ids', coalesce((select json_agg(id) from fresh), '[]'::json),
    'overdue_fixture_ids', coalesce((select json_agg(id) from overdue), '[]'::json),
    'failing_competition_ids', coalesce((select json_agg(id) from failing), '[]'::json),
    'pushes', (
      select coalesce(json_agg(p), '[]'::json)
      from (
        -- Results: one push for what's new, mentioning what's overdue.
        select json_build_object(
          'title', '⏳ Results to confirm',
          'body',
            case
              when c.fresh = 1 then c.first_fresh || ' is ready to confirm.'
              when c.fresh > 1 then c.first_fresh || ' and ' || (c.fresh - 1) || ' more are ready to confirm.'
              when c.overdue = 1 then c.first_overdue || ' has waited over 6 hours.'
              else c.overdue || ' results have waited over 6 hours.'
            end
            || case
              when c.fresh > 0 and c.overdue > 0
                then ' ' || c.overdue || ' older ' || case when c.overdue = 1 then 'one is' else 'ones are' end || ' still waiting.'
              else ''
            end
        ) as p
        from counts c
        where c.fresh > 0 or c.overdue > 0

        union all

        -- Sync: the error itself for one competition, the names for more.
        select json_build_object(
          'title', case when c.failing = 1 then 'Sync failed: ' || c.first_failing else c.failing || ' competitions failed to sync' end,
          'body',
            case
              when c.failing = 1 then c.first_error
              else (select string_agg(name, ', ') from failing) || '. Details in /admin.'
            end
        )
        from counts c
        where c.failing > 0
      ) x
    )
  )
  from counts;
$$;

-- Sends private.admin_alerts' pushes to every platform admin and marks what
-- they were told, so it isn't sent again. Returns how many pushes it asked
-- for (one per admin per alert).
create or replace function private.send_admin_alerts()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_alerts json := private.admin_alerts();
  v_push json;
  v_admin uuid;
  v_sent int := 0;
begin
  for v_push in select * from json_array_elements(v_alerts->'pushes') loop
    for v_admin in select player_id from public.platform_admins loop
      -- To one player, outside any room: the push function's privileged
      -- single-player path.
      perform private.fire_push_notification(
        'admin_alert',
        null,
        null,
        v_push->>'title',
        v_push->>'body',
        '/admin',
        jsonb_build_object('target_player_id', v_admin)
      );
      v_sent := v_sent + 1;
    end loop;
  end loop;

  update catalog.fixtures set admin_alerted_at = now()
  where id in (select (value #>> '{}')::uuid from json_array_elements(v_alerts->'fresh_fixture_ids'));

  update catalog.fixtures set admin_reminded_at = now()
  where id in (select (value #>> '{}')::uuid from json_array_elements(v_alerts->'overdue_fixture_ids'));

  update catalog.competitions set sync_error_alerted_at = now()
  where id in (select (value #>> '{}')::uuid from json_array_elements(v_alerts->'failing_competition_ids'));

  return v_sent;
end;
$$;


revoke execute on function private.admin_alerts() from public, anon, authenticated;
revoke execute on function private.send_admin_alerts() from public, anon, authenticated;

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

  -- Tell Crow admins about results waiting on them and syncs that failed.
  perform private.send_admin_alerts();
end;
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
      last_sync_error_at = null,
      sync_error_alerted_at = null
  where id = v_competition.id;

  return json_build_object(
    'competition', v_competition.name,
    'fixtures', cardinality(v_fixture_ids),
    'moved_deadlines', v_moved
  );
end;
$$;
