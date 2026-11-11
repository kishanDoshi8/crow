-- ============================================================
-- Migration: history_filter_counts
-- Description: The History page shows how many predictions each of its
--   filters holds (all, won, lost, my bets). One small read-only RPC,
--   with the same room, series and search rules as the history list.
-- ============================================================

-- How many finished predictions each History filter holds for the caller:
-- all of them, the ones they won, lost, and bet on at all. Same room,
-- series and search rules as get_room_prediction_history, so the numbers on
-- the filter buttons match the lists behind them.
create or replace function public.get_room_prediction_history_counts(
  p_room_id uuid,
  p_series_id uuid default null,
  p_search text default null
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_caller_id uuid;
  v_search text := nullif(trim(p_search), '');
  v_result json;
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

  select json_build_object(
    'all', count(*)::int,
    'wins', (count(*) filter (
      where pred.status = 'revealed' and user_bet.option_id = pred.winning_option_id
    ))::int,
    'losses', (count(*) filter (
      where pred.status = 'revealed' and user_bet.option_id <> pred.winning_option_id
    ))::int,
    'my_bets', count(user_bet.option_id)::int
  )
  into v_result
  from public.predictions pred
  left join public.bets user_bet
    on user_bet.prediction_id = pred.id
    and user_bet.player_id = v_caller_id
  where pred.room_id = p_room_id
    and pred.status in ('revealed', 'cancelled', 'no_result')
    and (p_series_id is null or pred.series_id = p_series_id)
    and (v_search is null or coalesce(pred.title, '') ilike '%' || v_search || '%');

  return v_result;
end;
$$;

revoke execute on function public.get_room_prediction_history_counts(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.get_room_prediction_history_counts(uuid, uuid, text) to authenticated;
