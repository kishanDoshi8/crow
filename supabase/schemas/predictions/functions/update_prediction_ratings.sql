create or replace function public.update_prediction_ratings(
  p_room_id uuid,
  p_prediction_id uuid,
  p_winning_option_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_prediction public.predictions%rowtype;
  v_config record;
  v_participant record;
  v_member public.room_members%rowtype;

  v_total_predictors integer;
  v_winning_predictors integer;
  v_prediction_popularity numeric;
  v_surprise numeric;
  v_sample_weight numeric;
  v_difficulty numeric;

  v_experience numeric;
  v_effective_k numeric;
  v_change numeric;
  v_rounded_change integer;
  v_new_rating integer;
begin
  select *
  into v_prediction
  from public.predictions
  where id = p_prediction_id
    and room_id = p_room_id;

  if not found then
    raise exception 'Prediction not found for rating update' using errcode = 'P0006';
  end if;

  if not v_prediction.affects_rating then
    return;
  end if;

  if v_prediction.status <> 'revealed' then
    return;
  end if;

  if v_prediction.winning_option_id is distinct from p_winning_option_id then
    raise exception 'Winning option mismatch for rating update' using errcode = 'P0008';
  end if;

  select version, base_k, min_participants
  into v_config
  from public.rating_system_config
  where is_active = true
  order by version desc
  limit 1;

  if not found then
    raise exception 'No active rating system configuration found' using errcode = 'P0001';
  end if;

  select
    count(distinct b.player_id),
    count(distinct case when b.option_id = p_winning_option_id then b.player_id end)
  into v_total_predictors, v_winning_predictors
  from public.bets b
  where b.prediction_id = p_prediction_id;

  if v_total_predictors < v_config.min_participants then
    return;
  end if;

  -- Popular winners imply low surprise; unpopular winners imply upset outcomes.
  v_prediction_popularity := v_winning_predictors::numeric / v_total_predictors::numeric;
  v_surprise := 1 - v_prediction_popularity;

  -- Scale difficulty by participation size so larger samples carry stronger signal.
  v_sample_weight := ln(v_total_predictors::numeric + 1);
  v_difficulty := 1 + (v_surprise * v_sample_weight * 0.5);

  for v_participant in
    select distinct b.player_id, b.option_id
    from public.bets b
    where b.prediction_id = p_prediction_id
  loop
    select *
    into v_member
    from public.room_members
    where room_id = p_room_id
      and player_id = v_participant.player_id
    for update;

    if not found then
      continue;
    end if;

    v_experience := least(
      1.0::numeric,
      v_member.rated_predictions_count::numeric / 10.0
    );

    v_effective_k := v_config.base_k * (0.25 + (0.75 * v_experience));

    if v_participant.option_id = p_winning_option_id then
      v_change := v_effective_k * v_difficulty;
    else
      v_change := -(v_effective_k / v_difficulty);
    end if;

    v_rounded_change := round(v_change)::integer;
    v_new_rating := greatest(0, v_member.prediction_rating + v_rounded_change);

    update public.room_members
    set prediction_rating = v_new_rating,
        peak_prediction_rating = greatest(peak_prediction_rating, v_new_rating),
        rated_predictions_count = rated_predictions_count + 1,
        rating_system_version = v_config.version
    where id = v_member.id;

    -- Kept so a corrected result can undo exactly this change.
    update public.bets
    set rating_change = v_new_rating - v_member.prediction_rating
    where prediction_id = p_prediction_id
      and player_id = v_participant.player_id;
  end loop;
end;
$$;

-- Undoes the rating changes a revealed prediction made, before its result is
-- corrected. Peak ratings are left as they are.
create or replace function private.reverse_prediction_ratings(
  p_prediction_id uuid
)
returns void
language plpgsql
set search_path = public, private
as $$
begin
  update public.room_members rm
  set prediction_rating = greatest(0, rm.prediction_rating - b.rating_change),
      rated_predictions_count = greatest(0, rm.rated_predictions_count - 1)
  from public.bets b
  join public.predictions p on p.id = b.prediction_id
  where b.prediction_id = p_prediction_id
    and b.rating_change is not null
    and rm.room_id = p.room_id
    and rm.player_id = b.player_id;

  update public.bets
  set rating_change = null
  where prediction_id = p_prediction_id
    and rating_change is not null;
end;
$$;
