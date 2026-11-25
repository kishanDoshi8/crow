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
