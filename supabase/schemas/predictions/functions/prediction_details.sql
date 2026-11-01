-- Organizers set a prediction's optional description and tags. Tags are kept
-- as typed, trimmed, with repeats (any case) dropped; up to five, 24 chars each.
create or replace function public.set_prediction_details(
  p_prediction_id uuid,
  p_description text,
  p_tags text[]
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_room_id uuid;
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_tags text[];
begin
  v_player_id := private.get_player_id_from_auth();

  select p.room_id into v_room_id
  from public.predictions p
  where p.id = p_prediction_id;

  if v_room_id is null or not exists (
    select 1 from public.room_members rm
    where rm.room_id = v_room_id
      and rm.player_id = v_player_id
      and rm.role in ('owner', 'organizer')
  ) then
    raise exception 'Only organizers can edit a prediction' using errcode = 'P0012';
  end if;

  if v_description is not null and char_length(v_description) > 500 then
    raise exception 'Keep the description under 500 characters' using errcode = 'P0001';
  end if;

  -- Tidy, drop blanks and repeats (first spelling wins), keep the order given.
  select coalesce(array_agg(t.tag order by t.first_pos), '{}')
  into v_tags
  from (
    select distinct on (lower(c.tag)) c.tag, c.pos as first_pos
    from (
      select regexp_replace(btrim(x.tag), '\s+', ' ', 'g') as tag, x.pos
      from unnest(coalesce(p_tags, '{}')) with ordinality as x(tag, pos)
    ) c
    where c.tag <> ''
    order by lower(c.tag), c.pos
  ) t;

  if cardinality(v_tags) > 5 then
    raise exception 'Use up to 5 tags' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_tags) t where char_length(t) > 24) then
    raise exception 'Keep each tag under 24 characters' using errcode = 'P0001';
  end if;

  update public.predictions set description = v_description where id = p_prediction_id;

  delete from public.prediction_tags where prediction_id = p_prediction_id;
  insert into public.prediction_tags (prediction_id, tag)
  select p_prediction_id, t from unnest(v_tags) t;

  return json_build_object('description', v_description, 'tags', to_json(v_tags));
end;
$$;

-- Tags already used in a room, most used first, for suggestions. Each tag is
-- shown as it was last typed.
create or replace function public.get_room_tags(
  p_room_id uuid
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_result json;
begin
  if not private.is_room_member(p_room_id) then
    raise exception 'You are not a member of this room' using errcode = 'P0011';
  end if;

  select coalesce(json_agg(t.tag order by t.uses desc, t.last_used desc, lower(t.tag)), '[]'::json)
  into v_result
  from (
    select
      (array_agg(pt.tag order by pt.created_at desc))[1] as tag,
      count(*) as uses,
      max(pt.created_at) as last_used
    from public.prediction_tags pt
    join public.predictions p on p.id = pt.prediction_id
    where p.room_id = p_room_id
    group by lower(pt.tag)
    order by count(*) desc, max(pt.created_at) desc, lower(pt.tag)
    limit 30
  ) t;

  return v_result;
end;
$$;
