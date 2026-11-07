-- Organizers fix a result that went out wrong: pick a different winner, or
-- turn a revealed result into no result (or back). Points, winnings, ratings,
-- streaks and room stats all move to what they'd be had the right result gone
-- out first. Only while the series is still running, so final standings and
-- trophies are never rewritten.
create or replace function public.correct_prediction_result(
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
  v_player_id      uuid;
  v_prediction     public.predictions%rowtype;
  v_previous       public.predictions%rowtype;
  v_series_status  text;
  v_plan           record;
  v_bettors        uuid[];
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and player_id = v_player_id
      and role in ('owner', 'organizer')
  ) then
    raise exception 'Only organizers can correct a result' using errcode = 'P0012';
  end if;

  if p_outcome not in ('win', 'no_result') then
    raise exception 'A result can be corrected to a winner or to no result' using errcode = 'P0001';
  end if;

  select * into v_prediction
  from public.predictions
  where id = p_prediction_id
    and room_id = p_room_id
  for update;

  if not found or v_prediction.status not in ('revealed', 'no_result') then
    raise exception 'Only revealed or no-result predictions can be corrected' using errcode = 'P0006';
  end if;

  select s.status into v_series_status
  from public.series s
  where s.id = v_prediction.series_id;

  if v_series_status is distinct from 'active' then
    raise exception 'Results can only be corrected while the series is running' using errcode = 'P0006';
  end if;

  if v_prediction.status = 'revealed' and not v_prediction.ratings_reversible then
    raise exception 'This result was revealed before corrections were possible' using errcode = 'P0006';
  end if;

  select * into v_plan
  from private.plan_settlement(p_prediction_id, p_outcome, p_winning_option_id, p_no_result_reason);

  if v_plan.status = v_prediction.status
    and v_plan.winning_option_id is not distinct from v_prediction.winning_option_id
  then
    raise exception 'That''s already the result' using errcode = 'P0001';
  end if;

  v_previous := v_prediction;

  if v_prediction.status = 'revealed' then
    perform private.reverse_prediction_ratings(p_prediction_id);
  end if;

  perform private.apply_settlement(p_prediction_id, v_plan.status, v_plan.winning_option_id);

  -- resolved_at stays, so the result keeps its place in streaks and history.
  update public.predictions
  set status            = v_plan.status,
      winning_option_id = v_plan.winning_option_id,
      no_result_reason  = v_plan.no_result_reason,
      corrected_at      = now(),
      corrected_by      = v_player_id,
      ratings_reversible = true
  where id = p_prediction_id
  returning * into v_prediction;

  if v_plan.status = 'revealed' then
    perform public.update_prediction_ratings(
      p_room_id,
      p_prediction_id,
      v_plan.winning_option_id
    );
  end if;

  select coalesce(array_agg(distinct b.player_id), '{}')
  into v_bettors
  from public.bets b
  where b.prediction_id = p_prediction_id;

  perform private.recompute_room_streaks(p_room_id, v_bettors);

  -- 'corrected' refreshes the streak stats without counting this result
  -- again: streaks were just recounted above.
  perform public.update_player_stats_after_resolution(p_room_id, p_prediction_id, null, 'corrected');
  perform public.update_room_stats_after_resolution(p_room_id, p_prediction_id, null, 'corrected');

  perform private.create_room_activity(
    p_room_id := p_room_id,
    p_activity_type := 'prediction_corrected',
    p_activity_tier := 1,
    p_metadata := private.build_prediction_activity_metadata(p_prediction_id)
      || jsonb_build_object(
        'previousStatus', v_previous.status,
        'previousWinningOptionLabel', (
          select po.label from public.prediction_options po
          where po.id = v_previous.winning_option_id
            and v_previous.status = 'revealed'
        )
      ),
    p_click_action := jsonb_build_object(
      'type', 'prediction',
      'predictionId', p_prediction_id
    ),
    p_created_by_player_id := v_player_id,
    p_dedupe_key := 'prediction_corrected:' || p_prediction_id::text || ':' || extract(epoch from now())::text
  );

  return json_build_object(
    'corrected',         true,
    'outcome',           v_plan.status,
    'winning_option_id', v_plan.winning_option_id,
    'reason',            v_plan.no_result_reason
  );
end;
$$;
