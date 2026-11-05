create or replace function public.cancel_bet(
  p_prediction_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player     public.players%rowtype;
  v_prediction public.predictions%rowtype;
  v_bet        public.bets%rowtype;
  v_is_member  boolean;
begin
  select * into v_player
  from public.players
  where user_id = auth.uid();

  if not found then
    raise exception 'Player profile not found' using errcode = 'P0004';
  end if;

  select * into v_prediction
  from public.predictions
  where id = p_prediction_id and status = 'draft'
  for share;

  if not found then
    raise exception 'Prediction not found or not in draft phase' using errcode = 'P0006';
  end if;

  -- Picks are final at the deadline, even before the lock job catches up.
  if v_prediction.deadline <= now() then
    raise exception 'Betting deadline has passed' using errcode = 'P0007';
  end if;

  select exists (
    select 1 from public.room_members
    where room_id = v_prediction.room_id and player_id = v_player.id
  ) into v_is_member;

  if not v_is_member then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  -- Lock the wallet so a concurrent bet sees the freed points correctly.
  perform 1
  from public.series_wallets
  where series_id = v_prediction.series_id
    and player_id = v_player.id
  for update;

  select * into v_bet
  from public.bets
  where prediction_id = p_prediction_id and player_id = v_player.id;

  if not found then
    raise exception 'No bet found to cancel' using errcode = 'P0010';
  end if;

  update public.prediction_options
  set total_bet = total_bet - v_bet.amount
  where id = v_bet.option_id;

  update public.series_wallets
  set escrow     = escrow - v_bet.amount,
      updated_at = now()
  where series_id = v_prediction.series_id
    and player_id = v_player.id;

  delete from public.bets where id = v_bet.id;

  return json_build_object(
    'cancelled',    true,
    'points_freed', v_bet.amount
  );
end;
$$;
