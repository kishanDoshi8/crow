create or replace function public.get_series_awards(
  p_room_id uuid,
  p_series_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_result json;
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
    raise exception 'Room member not found' using errcode = 'P0011';
  end if;

  if not exists (
    select 1
    from public.series s
    where s.id = p_series_id
      and s.room_id = p_room_id
      and s.status in ('completed', 'archived')
  ) then
    raise exception 'Series results are not available yet' using errcode = 'P0002';
  end if;

  select coalesce(
    json_agg(
      json_build_object(
        'id', sa.id,
        'series_id', sa.series_id,
        'player_id', sa.player_id,
        'username', p.username,
        'award_type', sa.award_type,
        'value', sa.value,
        'description', sa.description,
        'collected_at', sa.collected_at,
        'created_at', sa.created_at
      )
      order by sa.award_type asc, sa.value desc, p.username asc
    ),
    '[]'::json
  )
  into v_result
  from public.series_awards sa
  join public.players p on p.id = sa.player_id
  where sa.series_id = p_series_id;

  return v_result;
end;
$$;

create or replace function public.get_series_placements(
  p_room_id uuid,
  p_series_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_result json;
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
    raise exception 'Room member not found' using errcode = 'P0011';
  end if;

  if not exists (
    select 1
    from public.series s
    where s.id = p_series_id
      and s.room_id = p_room_id
      and s.status in ('completed', 'archived')
  ) then
    raise exception 'Series results are not available yet' using errcode = 'P0002';
  end if;

  select coalesce(
    json_agg(
      json_build_object(
        'id', sp.id,
        'series_id', sp.series_id,
        'player_id', sp.player_id,
        'username', p.username,
        'placement', sp.placement,
        'points', sp.points,
        'collected_at', sp.collected_at,
        'created_at', sp.created_at
      )
      order by sp.placement asc, sp.points desc, p.username asc
    ),
    '[]'::json
  )
  into v_result
  from public.series_placements sp
  join public.players p on p.id = sp.player_id
  where sp.series_id = p_series_id;

  return v_result;
end;
$$;
