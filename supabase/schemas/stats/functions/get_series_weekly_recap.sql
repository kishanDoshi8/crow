-- The last completed week of a series for the weekly share card: the top 5
-- and the biggest climber and faller, comparing the latest Monday snapshot
-- with the one before. Null until the first snapshot.
create or replace function public.get_series_weekly_recap(
  p_room_id   uuid,
  p_series_id uuid
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_caller_id   uuid;
  v_latest      text;
  v_previous    text;
  v_week_number integer;
begin
  v_caller_id := private.get_player_id_from_auth();
  if v_caller_id is null then
    raise exception 'Not authenticated' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and player_id = v_caller_id
  ) then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  if not exists (
    select 1 from public.series where id = p_series_id and room_id = p_room_id
  ) then
    raise exception 'Series not found for this room' using errcode = 'P0002';
  end if;

  -- Week keys look like 2026-W44, so text order is time order.
  select max(week_key), count(distinct week_key)::int
  into v_latest, v_week_number
  from public.series_standing_snapshots
  where series_id = p_series_id;

  if v_latest is null then
    return null;
  end if;

  select max(week_key) into v_previous
  from public.series_standing_snapshots
  where series_id = p_series_id and week_key < v_latest;

  return (
    with latest as (
      select s.player_id, s.rank, s.balance, s.net_points
      from public.series_standing_snapshots s
      where s.series_id = p_series_id and s.week_key = v_latest and s.rank is not null
    ),
    previous as (
      select s.player_id, s.rank
      from public.series_standing_snapshots s
      where s.series_id = p_series_id and s.week_key = v_previous and s.rank is not null
    ),
    moves as (
      select
        l.player_id,
        p.username,
        l.rank,
        l.balance,
        l.net_points,
        pv.rank - l.rank as rank_change,
        v_previous is not null and pv.rank is null as is_new
      from latest l
      join public.players p on p.id = l.player_id
      left join previous pv on pv.player_id = l.player_id
    )
    select json_build_object(
      'week_key', v_latest,
      'week_number', v_week_number,
      'has_previous', v_previous is not null,
      'standings', coalesce((
        select json_agg(json_build_object(
          'rank', m.rank,
          'username', m.username,
          'balance', m.balance,
          'net_points', m.net_points,
          'rank_change', m.rank_change,
          'is_new', m.is_new
        ) order by m.rank, m.username)
        from (select * from moves order by rank, username limit 5) m
      ), '[]'::json),
      'climber', (
        select json_build_object('username', m.username, 'rank', m.rank, 'rank_change', m.rank_change)
        from moves m
        where m.rank_change > 0
        order by m.rank_change desc, m.rank
        limit 1
      ),
      'faller', (
        select json_build_object('username', m.username, 'rank', m.rank, 'rank_change', m.rank_change)
        from moves m
        where m.rank_change < 0
        order by m.rank_change asc, m.rank
        limit 1
      )
    )
  );
end;
$$;
