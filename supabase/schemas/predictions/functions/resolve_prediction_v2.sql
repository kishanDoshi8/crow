-- Closes one prediction as p_player_id: settles the points, then ratings,
-- stats and the room feed. The caller has already checked that the player is
-- room staff. Shared by resolve_prediction_v2 (one) and resolve_predictions
-- (several at once).
create or replace function private.resolve_prediction(
  p_prediction_id     uuid,
  p_room_id           uuid,
  p_outcome           text,
  p_winning_option_id uuid,
  p_no_result_reason  varchar(50),
  p_player_id         uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id   uuid := p_player_id;
  v_prediction  public.predictions%rowtype;
  v_plan        record;
  v_counts      record;
  v_activity    text;
begin
  select * into v_prediction
  from public.predictions
  where id      = p_prediction_id
    and room_id = p_room_id
    -- Locked predictions can be closed any way; open ones can only be cancelled.
    and (status = 'locked' or (status = 'draft' and p_outcome = 'cancel'))
  -- Lock the prediction so a second resolve call waits, then finds it no longer locked.
  for update;

  if not found then
    raise exception 'Prediction not found or already closed' using errcode = 'P0006';
  end if;

  select * into v_plan
  from private.plan_settlement(p_prediction_id, p_outcome, p_winning_option_id, p_no_result_reason);

  select * into v_counts
  from private.apply_settlement(p_prediction_id, v_plan.status, v_plan.winning_option_id);

  update public.predictions
  set status            = v_plan.status,
      winning_option_id = v_plan.winning_option_id,
      no_result_reason  = v_plan.no_result_reason,
      resolved_at       = now(),
      resolved_by       = v_player_id
  where id = p_prediction_id
  returning * into v_prediction;

  if v_plan.status = 'revealed' then
    perform public.update_prediction_ratings(
      p_room_id,
      p_prediction_id,
      v_plan.winning_option_id
    );
  end if;

  perform public.update_player_stats_after_resolution(
    p_room_id,
    p_prediction_id,
    case when v_plan.status = 'revealed' then v_plan.winning_option_id end,
    case when v_plan.status = 'revealed' then 'win' else v_plan.status end
  );

  perform public.update_room_stats_after_resolution(
    p_room_id,
    p_prediction_id,
    case when v_plan.status = 'revealed' then v_plan.winning_option_id end,
    case when v_plan.status = 'revealed' then 'win' else v_plan.status end
  );

  v_activity := case v_plan.status
    when 'revealed' then 'prediction_revealed'
    when 'cancelled' then 'prediction_cancelled'
    else 'prediction_no_result'
  end;

  perform private.create_room_activity(
    p_room_id := p_room_id,
    p_activity_type := v_activity,
    p_activity_tier := 1,
    p_metadata := private.build_prediction_activity_metadata(p_prediction_id),
    p_click_action := jsonb_build_object(
      'type', 'prediction',
      'predictionId', p_prediction_id
    ),
    p_created_by_player_id := v_player_id,
    p_dedupe_key := v_activity || ':' || p_prediction_id::text
  );

  if v_plan.status = 'revealed' then
    return json_build_object(
      'resolved',          true,
      'outcome',           'revealed',
      'winning_option_id', v_plan.winning_option_id,
      'winning_label',     (select label from public.prediction_options where id = v_plan.winning_option_id),
      'winners',           v_counts.winners,
      'losers',            v_counts.losers
    );
  end if;

  return json_build_object(
    'resolved',          true,
    'outcome',           v_plan.status,
    'reason',            v_plan.no_result_reason,
    'winning_option_id', v_plan.winning_option_id,
    'refunded',          true
  );
end;
$$;

-- Staff close one prediction: reveal the winner, mark no result, or cancel.
create or replace function public.resolve_prediction_v2(
  p_prediction_id     uuid,
  p_room_id           uuid,
  p_outcome           text,
  p_winning_option_id uuid default null,
  p_no_result_reason  varchar(50) default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id   uuid;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and player_id = v_player_id
      and role in ('owner', 'organizer', 'resolver')
  ) then
    raise exception 'Only room staff can close predictions' using errcode = 'P0012';
  end if;

  return private.resolve_prediction(
    p_prediction_id, p_room_id, p_outcome, p_winning_option_id, p_no_result_reason, v_player_id
  );
end;
$$;
