-- Which set of phrases fits a prediction right now.
create or replace function private.talk_stage(p_status text)
returns text
language sql
immutable
set search_path = public, private
as $$
  select case p_status
    when 'draft' then 'open'
    when 'locked' then 'locked'
    when 'revealed' then 'result'
    else 'void'
  end;
$$;

-- Everything the Room talk section shows for one prediction: reaction counts
-- and the caller's own, the posts (newest first), and the phrases the caller
-- can post now: the stage's phrases for everyone, plus those for people who
-- called it or missed it once it's revealed.
create or replace function public.get_prediction_talk(
  p_prediction_id uuid
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_prediction public.predictions%rowtype;
  v_stage text;
  v_audience text;
  v_my_option uuid;
begin
  v_player_id := private.get_player_id_from_auth();

  select * into v_prediction from public.predictions where id = p_prediction_id;
  if not found or not private.can_view_prediction(p_prediction_id) then
    raise exception 'Prediction not found' using errcode = 'P0002';
  end if;

  v_stage := private.talk_stage(v_prediction.status);

  select b.option_id into v_my_option
  from public.bets b
  where b.prediction_id = p_prediction_id
    and b.player_id = v_player_id;

  v_audience := case
    when v_prediction.status <> 'revealed' or v_my_option is null then null
    when v_my_option = v_prediction.winning_option_id then 'winner'
    else 'loser'
  end;

  return json_build_object(
    'stage', v_stage,
    'audience', v_audience,
    'post_limit', 3,
    'my_reaction', (
      select r.reaction from public.prediction_reactions r
      where r.prediction_id = p_prediction_id and r.player_id = v_player_id
    ),
    'reactions', coalesce((
      select json_agg(json_build_object('reaction', t.reaction, 'count', t.n) order by t.n desc, t.reaction)
      from (
        select r.reaction, count(*)::int as n
        from public.prediction_reactions r
        where r.prediction_id = p_prediction_id
        group by r.reaction
      ) t
    ), '[]'::json),
    'my_post_count', (
      select count(*)::int from public.prediction_posts p
      where p.prediction_id = p_prediction_id and p.player_id = v_player_id
    ),
    'posts', coalesce((
      select json_agg(json_build_object(
        'id', p.id,
        'player_id', p.player_id,
        'username', pl.username,
        'kind', p.kind,
        'text', ph.text,
        'created_at', p.created_at
      ) order by p.created_at desc, p.id desc)
      from public.prediction_posts p
      join public.players pl on pl.id = p.player_id
      left join public.talk_phrases ph on ph.id = p.phrase_id
      where p.prediction_id = p_prediction_id
    ), '[]'::json),
    'phrases', coalesce((
      select json_agg(json_build_object(
        'id', ph.id,
        'text', ph.text,
        'audience', ph.audience,
        'posted', exists (
          select 1 from public.prediction_posts p
          where p.prediction_id = p_prediction_id
            and p.player_id = v_player_id
            and p.phrase_id = ph.id
        )
      ) order by (ph.audience = 'any'), ph.sort_order, ph.id)
      from public.talk_phrases ph
      where ph.active
        and ph.stage = v_stage
        and (ph.audience = 'any' or ph.audience = v_audience)
    ), '[]'::json)
  );
end;
$$;

-- React to a prediction, switch reaction, or take it back (null).
create or replace function public.set_prediction_reaction(
  p_prediction_id uuid,
  p_reaction text default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_room_id uuid;
  v_reaction text := nullif(trim(coalesce(p_reaction, '')), '');
begin
  v_player_id := private.get_player_id_from_auth();

  select room_id into v_room_id from public.predictions where id = p_prediction_id;
  if v_room_id is null or not private.can_view_prediction(p_prediction_id) then
    raise exception 'Prediction not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.predictions where id = p_prediction_id and status = 'scheduled') then
    raise exception 'It isn''t live yet' using errcode = 'P0001';
  end if;

  if v_reaction is null then
    delete from public.prediction_reactions
    where prediction_id = p_prediction_id and player_id = v_player_id;
  else
    if v_reaction not in ('laugh', 'wow', 'cry', 'angry', 'meh', 'fire') then
      raise exception 'Unknown reaction' using errcode = 'P0001';
    end if;
    insert into public.prediction_reactions (prediction_id, player_id, room_id, reaction)
    values (p_prediction_id, v_player_id, v_room_id, v_reaction)
    on conflict (prediction_id, player_id)
    do update set reaction = excluded.reaction, created_at = now();
  end if;

  return json_build_object('reaction', v_reaction);
end;
$$;

-- Post a preset phrase to a prediction's room talk: one that fits its stage
-- (and the caller's result), each phrase once, up to 3 per person.
create or replace function public.post_prediction_phrase(
  p_prediction_id uuid,
  p_phrase_id smallint
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_prediction public.predictions%rowtype;
  v_phrase public.talk_phrases%rowtype;
  v_my_option uuid;
  v_audience text;
  v_post public.prediction_posts%rowtype;
begin
  v_player_id := private.get_player_id_from_auth();

  select * into v_prediction from public.predictions where id = p_prediction_id;
  if not found or not private.can_view_prediction(p_prediction_id) then
    raise exception 'Prediction not found' using errcode = 'P0002';
  end if;

  if v_prediction.status = 'scheduled' then
    raise exception 'It isn''t live yet' using errcode = 'P0001';
  end if;

  select * into v_phrase from public.talk_phrases where id = p_phrase_id and active;
  if not found or v_phrase.stage <> private.talk_stage(v_prediction.status) then
    raise exception 'That phrase isn''t available now' using errcode = 'P0001';
  end if;

  if v_phrase.audience <> 'any' then
    select b.option_id into v_my_option
    from public.bets b
    where b.prediction_id = p_prediction_id and b.player_id = v_player_id;

    v_audience := case
      when v_prediction.status <> 'revealed' or v_my_option is null then null
      when v_my_option = v_prediction.winning_option_id then 'winner'
      else 'loser'
    end;

    if v_audience is distinct from v_phrase.audience then
      raise exception 'That phrase isn''t available now' using errcode = 'P0001';
    end if;
  end if;

  -- One post at a time per person and prediction, so the limit holds.
  perform pg_advisory_xact_lock(hashtextextended(p_prediction_id::text || v_player_id::text, 0));

  if (
    select count(*) from public.prediction_posts
    where prediction_id = p_prediction_id and player_id = v_player_id
  ) >= 3 then
    raise exception 'You''ve used your 3 phrases on this prediction' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.prediction_posts
    where prediction_id = p_prediction_id
      and player_id = v_player_id
      and phrase_id = p_phrase_id
  ) then
    raise exception 'You''ve already said that one' using errcode = 'P0001';
  end if;

  insert into public.prediction_posts (prediction_id, room_id, player_id, kind, phrase_id)
  values (p_prediction_id, v_prediction.room_id, v_player_id, 'phrase', p_phrase_id)
  returning * into v_post;

  return json_build_object(
    'id', v_post.id,
    'text', v_phrase.text,
    'created_at', v_post.created_at
  );
end;
$$;
