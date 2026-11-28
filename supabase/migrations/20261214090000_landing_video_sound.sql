-- ============================================================
-- Migration: landing_video_sound
-- Description: The landing hero's example question is replaced by a launch
--   video. New event landing_video_sound (a visitor turns the video's sound
--   on) is accepted by app_events and log_app_event; landing_demo_pick stays
--   accepted so its history still counts. analytics.landing_funnel gains a
--   video_sound column at the end.
-- ============================================================

alter table public.app_events drop constraint if exists app_events_name_check;
alter table public.app_events add constraint app_events_name_check check (name in (
  'landing_view', 'landing_start_room', 'landing_join', 'landing_demo_pick',
  'landing_video_sound', 'account_created'
));

-- Records one product event (public.app_events). The only function signed-out
-- visitors may call, so the landing page can count visits: names come from a
-- fixed list, text is trimmed and capped, and repeats from one visitor are
-- dropped (a landing view counts once per 30 minutes, anything else once per
-- 10 seconds). Never raises: analytics must not break the page.
create or replace function public.log_app_event(
  p_name text,
  p_visitor_id uuid,
  p_source text default null,
  p_path text default null
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_window interval := case when p_name = 'landing_view' then interval '30 minutes' else interval '10 seconds' end;
begin
  if p_visitor_id is null or p_name not in (
    'landing_view', 'landing_start_room', 'landing_join', 'landing_demo_pick',
    'landing_video_sound', 'account_created'
  ) then
    return;
  end if;

  if exists (
    select 1 from public.app_events
    where visitor_id = p_visitor_id and name = p_name and created_at > now() - v_window
  ) then
    return;
  end if;

  insert into public.app_events (name, visitor_id, player_id, source, path)
  values (
    p_name,
    p_visitor_id,
    private.get_player_id_from_auth(),
    nullif(left(lower(btrim(coalesce(p_source, ''))), 64), ''),
    nullif(left(btrim(coalesce(p_path, '')), 200), '')
  );
exception when others then
  return;
end;
$$;

-- Landing page funnel by week and where visitors came from (?ref= or
-- ?utm_source=). "accounts" are visitors who created an account afterwards.
-- "tried_demo" is the old example question (until November 2026);
-- "video_sound" is visitors who turned on the launch video's sound, which
-- replaced it. New columns go at the end so the view can be replaced.
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
    where e.visitor_id = v.visitor_id and e.name = 'account_created')) as accounts,
  count(*) filter (where exists (select 1 from public.app_events e
    where e.visitor_id = v.visitor_id and e.name = 'landing_video_sound')) as video_sound
from visits v
group by 1, 2
order by 1 desc, visitors desc;

revoke all on all tables in schema analytics from public, anon, authenticated;
