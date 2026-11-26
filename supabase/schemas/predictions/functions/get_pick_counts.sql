-- How many picks some predictions have, the points on them and how many
-- players picked, without saying who picked what or how the points split.
-- While a prediction is open players can read only their own bet, so the
-- app shows these instead: one question, or every question in a match.
create or replace function public.get_pick_counts(p_prediction_ids uuid[])
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if exists (
    select 1 from unnest(p_prediction_ids) as ids(id)
    where not private.can_view_prediction(ids.id)
  ) then
    raise exception 'Prediction not found' using errcode = 'P0002';
  end if;

  return (
    select json_build_object(
      'picks', count(*)::int,
      'pool', coalesce(sum(b.amount), 0)::int,
      'players', count(distinct b.player_id)::int
    )
    from public.bets b
    where b.prediction_id = any(p_prediction_ids)
  );
end;
$$;
