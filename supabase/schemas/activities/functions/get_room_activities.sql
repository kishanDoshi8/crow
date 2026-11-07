create or replace function public.get_room_activities(
  p_room_id uuid,
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_filter text default 'all',
  p_series_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_limit integer;
  v_filter text;
  v_items json;
  v_next_cursor_created_at timestamptz;
  v_next_cursor_id uuid;
  v_has_more boolean := false;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not exists (
    select 1
    from public.room_members rm
    where rm.room_id = p_room_id
      and rm.player_id = v_player_id
  ) then
    raise exception 'Only room members can view room activities' using errcode = 'P0013';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 20), 50));
  v_filter := coalesce(lower(trim(p_filter)), 'all');

  with scoped as (
    select
      a.id,
      a.activity_type,
      a.activity_tier,
      a.metadata,
      a.click_action,
      a.created_at,
      a.created_by_player_id
    from public.room_activities a
    where a.room_id = p_room_id
      and (
        p_cursor_created_at is null
        or p_cursor_id is null
        or a.created_at < p_cursor_created_at
        or (a.created_at = p_cursor_created_at and a.id < p_cursor_id)
      )
      and (
        v_filter = 'all'
        or (v_filter = 'predictions' and a.activity_type like 'prediction_%')
        or (v_filter = 'members' and a.activity_type like 'room_%')
        or (v_filter = 'achievements' and a.activity_type like 'achievement_%')
      )
      and (
        p_series_id is null
        or exists (
          select 1
          from public.predictions p
          where p.id = case
            when coalesce(
              a.metadata ->> 'predictionId',
              a.click_action ->> 'predictionId'
            ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then coalesce(
              a.metadata ->> 'predictionId',
              a.click_action ->> 'predictionId'
            )::uuid
            else null
          end
            and p.series_id = p_series_id
        )
      )
    order by a.created_at desc, a.id desc
    limit v_limit + 1
  ),
  limited as (
    select *
    from scoped
    order by created_at desc, id desc
    limit v_limit
  ),
  next_cursor as (
    select s.created_at, s.id
    from scoped s
    order by s.created_at desc, s.id desc
    offset v_limit
    limit 1
  )
  select
    coalesce(
      json_agg(
        json_build_object(
          'id', l.id,
          'activityType', l.activity_type,
          'activityTier', l.activity_tier,
          'metadata', l.metadata,
          'clickAction', l.click_action,
          'createdAt', l.created_at,
          -- Who acted, e.g. the staff member who revealed a result.
          'createdBy', (
            select json_build_object('id', pl.id, 'username', pl.username)
            from public.players pl
            where pl.id = l.created_by_player_id
          )
        )
        order by l.created_at desc, l.id desc
      ),
      '[]'::json
    ),
    (select created_at from next_cursor),
    (select id from next_cursor),
    exists(select 1 from next_cursor)
  into v_items, v_next_cursor_created_at, v_next_cursor_id, v_has_more
  from limited l;

  return json_build_object(
    'items', v_items,
    'next_cursor_created_at', v_next_cursor_created_at,
    'next_cursor_id', v_next_cursor_id,
    'has_more', v_has_more
  );
end;
$$;
