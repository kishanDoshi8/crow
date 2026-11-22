-- Product metrics, phase 0. Read-only views over the app's own tables plus
-- public.app_events (landing visits). Not exposed through the API: query them
-- in the Supabase SQL editor. How to read them: docs/analytics.md.
--
-- Rooms are counted from their creation; a room is "activated" when, within
-- 7 days, it has 4+ players and at least one revealed result, and "still
-- playing in week 4" when it has a pick in days 22-28. Rooms of Crow team
-- members (public.platform_admins) are left out so testing doesn't count.

-- Rooms that aren't the Crow team's own test rooms.
create or replace view analytics.real_rooms as
select r.*
from public.rooms r
where not exists (
  select 1
  from public.room_members m
  join public.platform_admins a on a.player_id = m.player_id
  where m.room_id = r.id and m.role = 'owner'
);

-- One row per room: how its first week and fourth week went.
create or replace view analytics.room_health as
select
  r.id as room_id,
  r.name,
  r.created_at,
  (select count(*) from public.room_members m where m.room_id = r.id) as players_now,
  (select count(*) from public.room_members m
    where m.room_id = r.id and m.joined_at < r.created_at + interval '7 days') as players_day_7,
  (select count(*) from public.bets b join public.predictions p on p.id = b.prediction_id
    where p.room_id = r.id and b.placed_at < r.created_at + interval '7 days') as picks_day_7,
  (select count(*) from public.predictions p
    where p.room_id = r.id and p.status = 'revealed'
      and p.resolved_at < r.created_at + interval '7 days') as results_day_7,
  (
    (select count(*) from public.room_members m
      where m.room_id = r.id and m.joined_at < r.created_at + interval '7 days') >= 4
    and exists (select 1 from public.predictions p
      where p.room_id = r.id and p.status = 'revealed'
        and p.resolved_at < r.created_at + interval '7 days')
  ) as activated,
  exists (
    select 1 from public.bets b join public.predictions p on p.id = b.prediction_id
    where p.room_id = r.id
      and b.placed_at >= r.created_at + interval '21 days'
      and b.placed_at < r.created_at + interval '28 days'
  ) as playing_week_4,
  (select max(b.placed_at) from public.bets b join public.predictions p on p.id = b.prediction_id
    where p.room_id = r.id) as last_pick_at
from analytics.real_rooms r;

-- Rooms grouped by the week they were created: how many activated and how
-- many were still playing in week 4. Week 4 is blank until it has happened.
create or replace view analytics.room_cohorts as
select
  date_trunc('week', created_at)::date as week,
  count(*) as rooms,
  count(*) filter (where activated) as activated,
  round(100.0 * count(*) filter (where activated) / count(*), 0) as activated_pct,
  case when min(date_trunc('week', created_at)) + interval '35 days' <= now()
    then round(100.0 * count(*) filter (where playing_week_4) / count(*), 0) end as playing_week_4_pct
from analytics.room_health
group by 1
order by 1 desc;

-- The last 90 days, one row per day.
create or replace view analytics.daily as
with days as (
  select generate_series(current_date - 89, current_date, interval '1 day')::date as day
)
select
  d.day,
  (select count(distinct visitor_id) from public.app_events e
    where e.name = 'landing_view' and e.created_at::date = d.day) as landing_visitors,
  (select count(distinct visitor_id) from public.app_events e
    where e.name in ('landing_start_room', 'landing_join') and e.created_at::date = d.day) as landing_clicks,
  (select count(*) from public.players p where p.created_at::date = d.day) as new_players,
  (select count(*) from analytics.real_rooms r where r.created_at::date = d.day) as new_rooms,
  (select count(*) from public.predictions p
    where p.status <> 'scheduled' and p.created_at::date = d.day) as new_questions,
  (select count(*) from public.bets b where b.placed_at::date = d.day) as picks,
  (select count(distinct b.player_id) from public.bets b where b.placed_at::date = d.day) as pickers,
  (select count(*) from public.predictions p
    where p.status = 'revealed' and p.resolved_at::date = d.day) as results_revealed
from days d
order by d.day desc;

-- One row per week: who's actually playing.
create or replace view analytics.weekly as
with weeks as (
  select generate_series(date_trunc('week', current_date) - interval '25 weeks',
    date_trunc('week', current_date), interval '1 week')::date as week
)
select
  w.week,
  (select count(distinct b.player_id) from public.bets b
    where b.placed_at >= w.week and b.placed_at < w.week + 7) as active_players,
  (select count(distinct p.room_id) from public.bets b join public.predictions p on p.id = b.prediction_id
    where b.placed_at >= w.week and b.placed_at < w.week + 7) as active_rooms,
  (select count(*) from public.players p
    where p.created_at >= w.week and p.created_at < w.week + 7) as new_players,
  (select count(*) from analytics.real_rooms r
    where r.created_at >= w.week and r.created_at < w.week + 7) as new_rooms,
  (select count(*) from public.bets b
    where b.placed_at >= w.week and b.placed_at < w.week + 7) as picks
from weeks w
order by w.week desc;

-- New players by signup week: how many made a pick within a day and a week.
create or replace view analytics.first_picks as
select
  date_trunc('week', p.created_at)::date as week,
  count(*) as new_players,
  count(*) filter (where f.first_pick_at < p.created_at + interval '1 day') as picked_day_1,
  count(*) filter (where f.first_pick_at < p.created_at + interval '7 days') as picked_week_1,
  round(100.0 * count(*) filter (where f.first_pick_at < p.created_at + interval '1 day') / count(*), 0) as picked_day_1_pct
from public.players p
left join lateral (
  select min(b.placed_at) as first_pick_at from public.bets b where b.player_id = p.id
) f on true
group by 1
order by 1 desc;

-- Landing page funnel by week and where visitors came from (?ref= or
-- ?utm_source=). "accounts" are visitors who created an account afterwards.
create or replace view analytics.landing_funnel as
with visits as (
  select visitor_id, coalesce(min(source), 'direct') as source,
    date_trunc('week', min(created_at))::date as week
  from public.app_events
  where name = 'landing_view'
  group by visitor_id
)
select
  v.week,
  v.source,
  count(*) as visitors,
  count(*) filter (where exists (select 1 from public.app_events e
    where e.visitor_id = v.visitor_id and e.name = 'landing_demo_pick')) as tried_demo,
  count(*) filter (where exists (select 1 from public.app_events e
    where e.visitor_id = v.visitor_id and e.name in ('landing_start_room', 'landing_join'))) as clicked,
  count(*) filter (where exists (select 1 from public.app_events e
    where e.visitor_id = v.visitor_id and e.name = 'account_created')) as accounts
from visits v
group by 1, 2
order by 1 desc, visitors desc;

revoke all on all tables in schema analytics from public, anon, authenticated;
