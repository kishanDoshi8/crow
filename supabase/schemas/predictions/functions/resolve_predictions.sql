-- Staff close several predictions in one go, each with its own outcome, e.g.
-- every question for a match once it's over, or all of them when it's
-- called off. Each item of p_results is
--   {"prediction_id": "...", "outcome": "win" | "no_result" | "cancel",
--    "winning_option_id": "...", "no_result_reason": "..."}
-- with the same rules as resolve_prediction_v2: locked predictions close any
-- way, open ones can only be cancelled. Members get one push for the set.
-- All or nothing: if one can't be closed, none are.
create or replace function public.resolve_predictions(
  p_room_id uuid,
  p_results jsonb
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id  uuid;
  v_item       record;
  v_result     json;
  v_ids        uuid[];
  v_closed     uuid[] := '{}';
  v_revealed   int := 0;
  v_no_result  int := 0;
  v_cancelled  int := 0;
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

  if p_results is null or jsonb_typeof(p_results) <> 'array'
    or jsonb_array_length(p_results) not between 1 and 50
  then
    raise exception 'Choose between 1 and 50 predictions to close' using errcode = 'P0001';
  end if;

  select array_agg((item->>'prediction_id')::uuid) into v_ids
  from jsonb_array_elements(p_results) item;

  if exists (select 1 from unnest(v_ids) id where id is null)
    or (select count(distinct id) from unnest(v_ids) id) <> cardinality(v_ids)
  then
    raise exception 'Each prediction can be closed only once' using errcode = 'P0001';
  end if;

  -- Lock them all first, in one order, so two staff closing overlapping sets
  -- wait for each other instead of deadlocking.
  perform 1
  from public.predictions
  where id = any(v_ids) and room_id = p_room_id
  order by id
  for update;

  -- Say which one is the problem before touching anything.
  for v_item in
    select r.outcome, r.no_result_reason, p.title, p.status
    from jsonb_to_recordset(p_results) as r(prediction_id uuid, outcome text, no_result_reason text)
    left join public.predictions p on p.id = r.prediction_id and p.room_id = p_room_id
  loop
    if v_item.status is null then
      raise exception 'Prediction not found in this room' using errcode = 'P0006';
    elsif v_item.status = 'draft' and v_item.outcome is distinct from 'cancel' then
      raise exception '"%" is still open for picks, so it can only be cancelled', v_item.title using errcode = 'P0001';
    elsif v_item.status not in ('draft', 'locked') then
      raise exception '"%" is already closed', v_item.title using errcode = 'P0006';
    elsif char_length(btrim(coalesce(v_item.no_result_reason, ''))) > 120 then
      raise exception 'Keep the reason under 120 characters' using errcode = 'P0001';
    end if;
  end loop;

  -- One push for the set (below), not one per prediction.
  perform set_config('crow.skip_prediction_push', 'on', true);

  -- Oldest first, so streaks and ratings move in the order things happened.
  for v_item in
    select r.prediction_id, r.outcome, r.winning_option_id, r.no_result_reason
    from jsonb_to_recordset(p_results)
      as r(prediction_id uuid, outcome text, winning_option_id uuid, no_result_reason text)
    join public.predictions p on p.id = r.prediction_id
    order by p.deadline, p.series_prediction_number, p.id
  loop
    v_result := private.resolve_prediction(
      v_item.prediction_id,
      p_room_id,
      v_item.outcome,
      v_item.winning_option_id,
      v_item.no_result_reason::varchar(120),
      v_player_id
    );

    v_closed := v_closed || v_item.prediction_id;
    -- A win nobody bet on ends as no result, so count what it became.
    case v_result->>'outcome'
      when 'revealed' then v_revealed := v_revealed + 1;
      when 'no_result' then v_no_result := v_no_result + 1;
      else v_cancelled := v_cancelled + 1;
    end case;
  end loop;

  perform set_config('crow.skip_prediction_push', 'off', true);

  perform private.push_for_predictions(
    'result_revealed',
    v_closed,
    '🏆 Result Is In',
    case
      when v_revealed > 0 then '🏆 %s results are in'
      else '↩️ %s predictions called off · points returned'
    end
  );

  return json_build_object(
    'resolved',  cardinality(v_closed),
    'revealed',  v_revealed,
    'no_result', v_no_result,
    'cancelled', v_cancelled
  );
end;
$$;
