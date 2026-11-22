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
    'landing_view', 'landing_start_room', 'landing_join', 'landing_demo_pick', 'account_created'
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
