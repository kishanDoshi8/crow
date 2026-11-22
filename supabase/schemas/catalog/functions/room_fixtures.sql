-- Event packs for rooms: follow a competition, see its upcoming fixtures
-- with ready-made questions, and add them to the active series.

-- Organizers: the competitions on offer (and which ones the room follows),
-- and the followed ones' fixtures in the next p_days days that haven't
-- kicked off, each with its questions and, for the ones the room already
-- has, the room's question.
create or replace function public.get_room_fixtures(
  p_room_id uuid,
  p_days    integer default 14
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 14), 1), 31);
begin
  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only organizers can add questions' using errcode = 'P0012';
  end if;

  return json_build_object(
    'competitions', (
      select coalesce(json_agg(json_build_object(
        'id', c.id,
        'name', c.name,
        'sport', c.sport,
        'season', c.current_season,
        'following', rc.room_id is not null
      ) order by c.display_order, c.name), '[]'::json)
      from catalog.competitions c
      left join public.room_competitions rc on rc.competition_id = c.id and rc.room_id = p_room_id
      where c.active
    ),
    'fixtures', (
      select coalesce(json_agg(json_build_object(
        'id', f.id,
        'competition_id', c.id,
        'competition_name', c.name,
        'kickoff_at', f.kickoff_at,
        'matchday', f.matchday,
        'round_label', f.round_label,
        'home', h.short_name,
        'away', a.short_name,
        'questions', (
          select coalesce(json_agg(json_build_object(
            'id', q.id,
            'title', q.title,
            'description', q.description,
            'options', (select json_agg(o->>'label') from jsonb_array_elements(q.options) o),
            'prediction_id', (
              select p.id from public.predictions p
              where p.room_id = p_room_id
                and p.fixture_question_id = q.id
                and p.status <> 'cancelled'
              limit 1
            )
          ) order by q.display_order, q.created_at), '[]'::json)
          from catalog.fixture_questions q
          left join catalog.question_templates t on t.id = q.template_id
          where q.fixture_id = f.id
            and not q.hidden
            and (q.template_id is null or (t.active and f.stage_kind = any(t.stages)))
        )
      ) order by f.kickoff_at, h.short_name), '[]'::json)
      from catalog.fixtures f
      join catalog.competitions c on c.id = f.competition_id and c.active
      join public.room_competitions rc on rc.competition_id = c.id and rc.room_id = p_room_id
      join catalog.teams h on h.id = f.home_team_id
      join catalog.teams a on a.id = f.away_team_id
      where f.status = 'scheduled'
        and f.kickoff_at > now()
        and f.kickoff_at < now() + make_interval(days => v_days)
    )
  );
end;
$$;

-- Organizers follow (or stop following) a competition for the room.
-- Questions already added stay put either way.
create or replace function public.set_room_competition(
  p_room_id        uuid,
  p_competition_id uuid,
  p_follow         boolean
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid := private.get_player_id_from_auth();
begin
  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only organizers can follow competitions' using errcode = 'P0012';
  end if;

  if not exists (select 1 from public.rooms where id = p_room_id and status = 'active') then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  if p_follow then
    if not exists (select 1 from catalog.competitions where id = p_competition_id and active) then
      raise exception 'Competition not found' using errcode = 'P0002';
    end if;

    insert into public.room_competitions (room_id, competition_id, followed_by)
    values (p_room_id, p_competition_id, v_player_id)
    on conflict (room_id, competition_id) do nothing;
  else
    delete from public.room_competitions
    where room_id = p_room_id
      and competition_id = p_competition_id;
  end if;

  return json_build_object('competition_id', p_competition_id, 'following', p_follow);
end;
$$;

-- Organizers add fixture questions to a series: each becomes a normal
-- question that closes at kickoff, linked back to its fixture question.
-- Questions for one match share an event (the one the room already has for
-- that match, if any). Live now, or hidden until p_opens_at as with
-- create_predictions; members get one push for the lot. Questions the room
-- already has are skipped. All or nothing otherwise.
create or replace function public.add_fixture_questions(
  p_room_id              uuid,
  p_series_id            uuid,
  p_fixture_question_ids uuid[],
  p_opens_at             timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id     uuid;
  v_scheduled     boolean := p_opens_at is not null and p_opens_at > now();
  v_series        public.series%rowtype;
  v_next_number   int;
  v_requested     int;
  v_question      record;
  v_event_id      uuid;
  v_event_fixture uuid;
  v_prediction_id uuid;
  v_ids           uuid[] := '{}';
  v_position      int := 0;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only organizers can create predictions' using errcode = 'P0012';
  end if;

  if not exists (select 1 from public.rooms where id = p_room_id and status = 'active') then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  v_requested := (select count(distinct x) from unnest(p_fixture_question_ids) x where x is not null);
  if v_requested not between 1 and 60 then
    raise exception 'Add between 1 and 60 questions' using errcode = 'P0001';
  end if;

  if p_series_id is null then
    raise exception 'Predictions must belong to an active series' using errcode = 'P0001';
  end if;

  -- Same lock create_prediction takes, so numbers never collide.
  select * into v_series
  from public.series
  where id = p_series_id
    and room_id = p_room_id
  for update;

  if not found then
    raise exception 'Series not found for this room' using errcode = 'P0002';
  end if;

  if v_series.status <> 'active' then
    raise exception 'Predictions can only be assigned to active series' using errcode = 'P0001';
  end if;

  -- Every one must still be on offer: shown, for a match yet to kick off.
  if (
    select count(*)
    from catalog.fixture_questions q
    join catalog.fixtures f on f.id = q.fixture_id
    join catalog.competitions c on c.id = f.competition_id
    left join catalog.question_templates t on t.id = q.template_id
    where q.id = any(p_fixture_question_ids)
      and not q.hidden
      and (q.template_id is null or (t.active and f.stage_kind = any(t.stages)))
      and c.active
      and f.status = 'scheduled'
      and f.kickoff_at > now()
      and f.home_team_id is not null
      and f.away_team_id is not null
  ) <> v_requested then
    raise exception 'Some of those matches have kicked off or changed. Refresh and try again.' using errcode = 'P0001';
  end if;

  if v_scheduled and exists (
    select 1
    from catalog.fixture_questions q
    join catalog.fixtures f on f.id = q.fixture_id
    where q.id = any(p_fixture_question_ids)
      and f.kickoff_at < p_opens_at + interval '5 minutes'
  ) then
    raise exception 'Leave at least 5 minutes between going live and the deadline' using errcode = 'P0001';
  end if;

  if not v_scheduled then
    select coalesce(max(series_prediction_number), 0) + 1
      into v_next_number
    from public.predictions
    where series_id = p_series_id;
  end if;

  -- One push for the lot (below), not one per prediction.
  perform set_config('crow.skip_prediction_push', 'on', true);

  for v_question in
    select q.id, q.title, q.description, q.options,
      f.id as fixture_id, f.kickoff_at,
      h.short_name || ' vs ' || a.short_name as event_title,
      c.name as competition_name
    from catalog.fixture_questions q
    join catalog.fixtures f on f.id = q.fixture_id
    join catalog.competitions c on c.id = f.competition_id
    join catalog.teams h on h.id = f.home_team_id
    join catalog.teams a on a.id = f.away_team_id
    where q.id = any(p_fixture_question_ids)
      -- Already in the room: skip.
      and not exists (
        select 1 from public.predictions p
        where p.room_id = p_room_id
          and p.fixture_question_id = q.id
          and p.status <> 'cancelled'
      )
    order by f.kickoff_at, f.id, q.display_order, q.created_at
  loop
    if v_event_fixture is distinct from v_question.fixture_id then
      v_event_fixture := v_question.fixture_id;
      v_event_id := null;

      select e.id into v_event_id
      from public.prediction_events e
      where e.room_id = p_room_id
        and e.fixture_id = v_question.fixture_id
      order by e.created_at desc
      limit 1;

      if v_event_id is null then
        insert into public.prediction_events (room_id, title, created_by, fixture_id)
        values (p_room_id, left(v_question.event_title, 80), v_player_id, v_question.fixture_id)
        returning id into v_event_id;
      end if;
    end if;

    v_position := v_position + 1;

    insert into public.predictions (
      room_id, series_id, series_prediction_number, created_by, title,
      status, deadline, opens_at, event_id, fixture_question_id, created_at
    )
    values (
      p_room_id,
      p_series_id,
      case when v_scheduled then null else v_next_number + v_position - 1 end,
      v_player_id,
      v_question.title,
      case when v_scheduled then 'scheduled' else 'draft' end,
      -- Picks close at kickoff.
      v_question.kickoff_at,
      case when v_scheduled then p_opens_at else now() end,
      v_event_id,
      v_question.id,
      -- Scheduled ones go live in created order: keep kickoff order.
      now() + (v_position - 1) * interval '1 microsecond'
    )
    returning id into v_prediction_id;

    insert into public.prediction_options (prediction_id, label, display_order, option_key)
    select v_prediction_id, o.value->>'label', (o.position - 1)::smallint, o.value->>'key'
    from jsonb_array_elements(v_question.options) with ordinality as o(value, position);

    -- The competition's name as a tag, so History can filter by it.
    perform public.set_prediction_details(
      v_prediction_id,
      v_question.description,
      array[v_question.competition_name]
    );

    if not v_scheduled then
      perform private.create_room_activity(
        p_room_id := p_room_id,
        p_activity_type := 'prediction_created',
        p_activity_tier := 2,
        p_metadata := private.build_prediction_activity_metadata(v_prediction_id),
        p_click_action := jsonb_build_object('type', 'prediction', 'predictionId', v_prediction_id),
        p_created_by_player_id := v_player_id,
        p_dedupe_key := 'prediction_created:' || v_prediction_id::text
      );
    end if;

    v_ids := v_ids || v_prediction_id;
  end loop;

  perform set_config('crow.skip_prediction_push', 'off', true);

  if cardinality(v_ids) = 0 then
    raise exception 'Those questions are already in this room' using errcode = 'P0001';
  end if;

  if not v_scheduled then
    perform private.push_for_predictions(
      'prediction_live',
      v_ids,
      '🎯 New question',
      '🎯 %s new questions'
    );
  end if;

  return json_build_object(
    'room_id',        p_room_id,
    'series_id',      p_series_id,
    'status',         case when v_scheduled then 'scheduled' else 'draft' end,
    'opens_at',       case when v_scheduled then p_opens_at else now() end,
    'prediction_ids', to_json(v_ids),
    'count',          cardinality(v_ids),
    'skipped',        v_requested - cardinality(v_ids)
  );
end;
$$;

-- Organizers: every competition on offer, for the Fixtures home (the ones
-- the room follows) and Browse (the rest). Each with what's next and how
-- much of the coming week the room has added.
create or replace function public.get_room_competitions(p_room_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only organizers can add questions' using errcode = 'P0012';
  end if;

  return (
    select coalesce(json_agg(json_build_object(
      'id', c.id,
      'name', c.name,
      'sport', c.sport,
      'kind', c.kind,
      'region', c.region,
      'season', c.current_season,
      'following', rc.room_id is not null,
      'next', (
        select json_build_object('home', h.short_name, 'away', a.short_name, 'kickoff_at', f.kickoff_at)
        from catalog.fixtures f
        join catalog.teams h on h.id = f.home_team_id
        join catalog.teams a on a.id = f.away_team_id
        where f.competition_id = c.id and f.status = 'scheduled' and f.kickoff_at > now()
        order by f.kickoff_at
        limit 1
      ),
      'week_matches', w.matches,
      'week_added', w.added
    ) order by c.display_order, c.name), '[]'::json)
    from catalog.competitions c
    left join public.room_competitions rc on rc.competition_id = c.id and rc.room_id = p_room_id
    cross join lateral (
      select
        count(*)::int as matches,
        count(*) filter (where exists (
          select 1 from catalog.fixture_questions q
          join public.predictions p on p.fixture_question_id = q.id
          where q.fixture_id = f.id and p.room_id = p_room_id and p.status <> 'cancelled'
        ))::int as added
      from catalog.fixtures f
      where f.competition_id = c.id
        and f.status = 'scheduled'
        and f.kickoff_at > now()
        and f.kickoff_at < now() + interval '7 days'
        and f.home_team_id is not null
        and f.away_team_id is not null
    ) w
    where c.active
  );
end;
$$;

-- Organizers: one competition's matches over the next six weeks that
-- haven't kicked off, each with its questions and, for the ones the room
-- already has, the room's question. The page groups them by round
-- (round_label) and day.
create or replace function public.get_room_competition_fixtures(
  p_room_id        uuid,
  p_competition_id uuid
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_room_organizer(p_room_id) then
    raise exception 'Only organizers can add questions' using errcode = 'P0012';
  end if;

  if not exists (select 1 from catalog.competitions where id = p_competition_id and active) then
    raise exception 'Competition not found' using errcode = 'P0002';
  end if;

  return json_build_object(
    'competition', (
      select json_build_object(
        'id', c.id,
        'name', c.name,
        'sport', c.sport,
        'kind', c.kind,
        'region', c.region,
        'season', c.current_season,
        'following', exists (
          select 1 from public.room_competitions rc
          where rc.room_id = p_room_id and rc.competition_id = c.id
        )
      )
      from catalog.competitions c
      where c.id = p_competition_id
    ),
    'fixtures', (
      select coalesce(json_agg(json_build_object(
        'id', f.id,
        'kickoff_at', f.kickoff_at,
        'matchday', f.matchday,
        'round_label', f.round_label,
        'home', h.short_name,
        'away', a.short_name,
        'questions', (
          select coalesce(json_agg(json_build_object(
            'id', q.id,
            'title', q.title,
            'description', q.description,
            'options', (select json_agg(o->>'label') from jsonb_array_elements(q.options) o),
            'prediction_id', (
              select p.id from public.predictions p
              where p.room_id = p_room_id
                and p.fixture_question_id = q.id
                and p.status <> 'cancelled'
              limit 1
            )
          ) order by q.display_order, q.created_at), '[]'::json)
          from catalog.fixture_questions q
          left join catalog.question_templates t on t.id = q.template_id
          where q.fixture_id = f.id
            and not q.hidden
            and (q.template_id is null or (t.active and f.stage_kind = any(t.stages)))
        )
      ) order by f.kickoff_at, h.short_name), '[]'::json)
      from (
        select * from catalog.fixtures
        where competition_id = p_competition_id
          and status = 'scheduled'
          and kickoff_at > now()
          and kickoff_at < now() + interval '42 days'
          and home_team_id is not null
          and away_team_id is not null
        order by kickoff_at
        limit 150
      ) f
      join catalog.teams h on h.id = f.home_team_id
      join catalog.teams a on a.id = f.away_team_id
    )
  );
end;
$$;
