-- ============================================================
-- Migration: scheduled_predictions
-- Description: Organizers can write predictions ahead and schedule when
--   they go live (status 'scheduled', opens_at). Scheduled predictions are
--   hidden from members; an every-minute job puts due ones live, giving
--   each its series number and activity post, with one push per room.
--   Organizers can edit them, put them live early, or delete them; ending a
--   series deletes its scheduled ones. The per-room open predictions limit
--   (rooms.predictions_limit) is removed.
-- ============================================================

-- ------------------------------------------------------------
-- 1. predictions: the scheduled status and when it goes live
-- ------------------------------------------------------------
alter table public.predictions add column if not exists opens_at timestamptz;

alter table public.predictions
  drop constraint if exists predictions_status_check,
  add constraint predictions_status_check
  check (status in ('scheduled', 'draft', 'locked', 'revealed', 'cancelled', 'no_result'));

alter table public.predictions
  drop constraint if exists predictions_scheduled_opens_check,
  add constraint predictions_scheduled_opens_check check (status <> 'scheduled' or opens_at is not null);

-- A prediction in a series has its number there, except while scheduled: it
-- gets the next number when it goes live, so numbers follow the order
-- people see them.
alter table public.predictions
  drop constraint if exists predictions_series_assignment_check,
  add constraint predictions_series_assignment_check
  check (
    (series_id is null and series_prediction_number is null)
    or (series_id is not null and (series_prediction_number is not null or status = 'scheduled'))
  );

-- The every-minute publish job looks for scheduled predictions that are due.
create index if not exists idx_predictions_scheduled_opens on public.predictions (opens_at) where status = 'scheduled';

-- ------------------------------------------------------------
-- 2. No more open predictions limit
-- ------------------------------------------------------------
drop view if exists public.player_rooms_by_activity;
alter table public.rooms drop column if exists predictions_limit;

drop function if exists public.create_prediction(uuid, text, text[], timestamptz, uuid);
drop function if exists public.update_prediction(uuid, text, timestamptz, text[]);
drop function if exists public.update_room(uuid, text, text, integer, integer);

-- ------------------------------------------------------------
-- 3. Who sees what
-- ------------------------------------------------------------
-- Owners and organizers: who can create and edit predictions, and see the
-- scheduled ones before they go live.
create or replace function private.is_room_organizer(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.room_members rm
    where rm.room_id = p_room_id
      and rm.player_id = private.get_player_id_from_auth()
      and rm.role in ('owner', 'organizer')
  );
$$;

-- Who can see a prediction: room members, except scheduled ones, which only
-- organizers see until they go live. Used by RLS on predictions, options,
-- tags and bets, and by the functions that read one prediction.
create or replace function private.can_view_prediction(p_prediction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1
    from public.predictions p
    where p.id = p_prediction_id
      and private.is_room_member(p.room_id)
      and (p.status <> 'scheduled' or private.is_room_organizer(p.room_id))
  );
$$;

drop policy if exists "predictions_select" on public.predictions;
-- Scheduled predictions stay hidden from members until they go live.
create policy "predictions_select" on public.predictions for select to authenticated using (
  private.is_room_member(room_id)
  and (status <> 'scheduled' or private.is_room_organizer(room_id))
);
grant select (id, room_id, series_id, series_prediction_number, created_by, title, status, deadline, opens_at, winning_option_id, no_result_reason, affects_rating, resolved_at, resolved_by, notified_1h, notified_result_needed, created_at, description, corrected_at, corrected_by, ratings_reversible) on public.predictions to authenticated;
grant select (id, room_code, name, description, status, created_at, result_reminder_hours) on public.rooms to authenticated;

-- ------------------------------------------------------------
-- 4. Creating, editing, publishing and deleting
-- ------------------------------------------------------------
-- Organizers create a prediction: live now, or scheduled to go live at
-- p_opens_at. A scheduled one stays hidden from members, gets its series
-- number and its activity post when it goes live, and must stay open for at
-- least 5 minutes after that.
create or replace function public.create_prediction(
  p_room_id  uuid,
  p_title    text,
  p_options  text[],
  p_deadline timestamptz,
  p_series_id uuid default null,
  p_opens_at timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id       uuid;
  v_member          public.room_members%rowtype;
  v_room            public.rooms%rowtype;
  v_prediction      public.predictions%rowtype;
  v_option          public.prediction_options%rowtype;
  v_option_ids      uuid[] := '{}';
  v_label           text;
  v_i               int;
  v_scheduled       boolean := p_opens_at is not null and p_opens_at > now();
  v_series          public.series%rowtype;
  v_series_prediction_number int;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  -- Owners and organizers create predictions
  select * into v_member
  from public.room_members
  where room_id = p_room_id
    and player_id = v_player_id
    and role in ('owner', 'organizer');

  if not found then
    raise exception 'Only organizers can create predictions' using errcode = 'P0012';
  end if;

  select * into v_room
  from public.rooms
  where id = p_room_id and status = 'active';

  if not found then
    raise exception 'Room not found or closed' using errcode = 'P0002';
  end if;

  -- Validate options count
  if coalesce(array_length(p_options, 1), 0) < 2 or array_length(p_options, 1) > 6 then
    raise exception 'Predictions must have between 2 and 6 options' using errcode = 'P0001';
  end if;

  if length(trim(p_title)) = 0 then
    raise exception 'Prediction title cannot be empty' using errcode = 'P0001';
  end if;

  if p_deadline <= now() then
    raise exception 'Deadline must be in the future' using errcode = 'P0001';
  end if;

  if v_scheduled and p_deadline < p_opens_at + interval '5 minutes' then
    raise exception 'Leave at least 5 minutes between going live and the deadline' using errcode = 'P0001';
  end if;

  -- Points live in series wallets, so every prediction needs a series.
  if p_series_id is null then
    raise exception 'Predictions must belong to an active series' using errcode = 'P0001';
  end if;

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

  if not v_scheduled then
    select coalesce(max(series_prediction_number), 0) + 1
      into v_series_prediction_number
    from public.predictions
    where series_id = p_series_id;
  end if;

  -- Create the prediction (a live one fires the "new prediction" push).
  insert into public.predictions (
    room_id,
    series_id,
    series_prediction_number,
    created_by,
    title,
    status,
    deadline,
    opens_at
  )
  values (
    p_room_id,
    p_series_id,
    v_series_prediction_number,
    v_player_id,
    trim(p_title),
    case when v_scheduled then 'scheduled' else 'draft' end,
    p_deadline,
    case when v_scheduled then p_opens_at else now() end
  )
  returning * into v_prediction;

  -- Create options
  v_i := 1;
  foreach v_label in array p_options loop
    if length(trim(v_label)) = 0 then
      raise exception 'Option labels cannot be empty' using errcode = 'P0001';
    end if;

    insert into public.prediction_options (prediction_id, label, display_order)
    values (v_prediction.id, trim(v_label), v_i - 1)
    returning * into v_option;

    v_option_ids := v_option_ids || v_option.id;
    v_i := v_i + 1;
  end loop;

  -- Members hear about a scheduled one when it goes live.
  if not v_scheduled then
    perform private.create_room_activity(
      p_room_id := p_room_id,
      p_activity_type := 'prediction_created',
      p_activity_tier := 2,
      p_metadata := private.build_prediction_activity_metadata(v_prediction.id),
      p_click_action := jsonb_build_object(
        'type', 'prediction',
        'predictionId', v_prediction.id
      ),
      p_created_by_player_id := v_player_id,
      p_dedupe_key := 'prediction_created:' || v_prediction.id::text
    );
  end if;

  return json_build_object(
    'prediction_id', v_prediction.id,
    'title',         v_prediction.title,
    'status',        v_prediction.status,
    'deadline',      v_prediction.deadline,
    'opens_at',      v_prediction.opens_at,
    'option_ids',    v_option_ids,
    'room_id',       p_room_id,
    'series_id', v_prediction.series_id,
    'series_prediction_number', v_prediction.series_prediction_number
  );
end;
$$;

-- Organizers fix a prediction that's still open for picks: the deadline, and
-- the question and options while nobody has bet. Pass null options to keep
-- them. A scheduled one can also move when it goes live (p_opens_at; null
-- keeps it), and must stay open at least 5 minutes after that.
create or replace function public.update_prediction(
  p_prediction_id uuid,
  p_title         text,
  p_deadline      timestamptz,
  p_options       text[] default null,
  p_opens_at      timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id  uuid;
  v_prediction public.predictions%rowtype;
  v_labels     text[];
  v_current    text[];
  v_i          int;
  v_opens_at   timestamptz;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select * into v_prediction
  from public.predictions
  where id = p_prediction_id
  for update;

  if not found then
    raise exception 'Prediction not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = v_prediction.room_id
      and player_id = v_player_id
      and role in ('owner', 'organizer')
  ) then
    raise exception 'Only organizers can edit predictions' using errcode = 'P0012';
  end if;

  if not (
    v_prediction.status = 'scheduled'
    or (v_prediction.status = 'draft' and v_prediction.deadline > now())
  ) then
    raise exception 'Only predictions still open for picks can be edited' using errcode = 'P0006';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Prediction title cannot be empty' using errcode = 'P0001';
  end if;

  if p_deadline is null or p_deadline <= now() then
    raise exception 'Deadline must be in the future' using errcode = 'P0001';
  end if;

  if v_prediction.status = 'scheduled' then
    v_opens_at := coalesce(p_opens_at, v_prediction.opens_at);
    if v_opens_at <= now() then
      raise exception 'Pick a go-live time in the future, or put it live now' using errcode = 'P0001';
    end if;
    if p_deadline < v_opens_at + interval '5 minutes' then
      raise exception 'Leave at least 5 minutes between going live and the deadline' using errcode = 'P0001';
    end if;
  end if;

  -- Once someone has bet, the question they bet on stays as it was.
  if trim(p_title) is distinct from v_prediction.title
    and exists (select 1 from public.bets where prediction_id = p_prediction_id)
  then
    raise exception 'The question can''t change once someone has bet' using errcode = 'P0001';
  end if;

  if p_options is not null then
    if coalesce(array_length(p_options, 1), 0) < 2 or array_length(p_options, 1) > 6 then
      raise exception 'Predictions must have between 2 and 6 options' using errcode = 'P0001';
    end if;

    v_labels := array(select trim(o) from unnest(p_options) with ordinality as t(o, n) order by n);

    if exists (select 1 from unnest(v_labels) l where length(l) = 0) then
      raise exception 'Option labels cannot be empty' using errcode = 'P0001';
    end if;

    v_current := array(
      select label from public.prediction_options
      where prediction_id = p_prediction_id
      order by display_order, created_at
    );

    if v_labels is distinct from v_current then
      if exists (select 1 from public.bets where prediction_id = p_prediction_id) then
        raise exception 'Options can''t change once someone has bet' using errcode = 'P0001';
      end if;

      delete from public.prediction_options where prediction_id = p_prediction_id;

      for v_i in 1 .. array_length(v_labels, 1) loop
        insert into public.prediction_options (prediction_id, label, display_order)
        values (p_prediction_id, v_labels[v_i], v_i - 1);
      end loop;
    end if;
  end if;

  update public.predictions
  set title       = trim(p_title),
      deadline    = p_deadline,
      opens_at    = coalesce(v_opens_at, opens_at),
      -- A moved deadline earns a fresh "1 hour left" reminder.
      notified_1h = case when p_deadline = deadline then notified_1h else false end
  where id = p_prediction_id;

  return json_build_object(
    'id',       p_prediction_id,
    'title',    trim(p_title),
    'deadline', p_deadline,
    'opens_at', coalesce(v_opens_at, v_prediction.opens_at)
  );
end;
$$;

-- Scheduled predictions: written ahead by organizers, hidden from members,
-- and put live on time by the every-minute job (or early with "Go live now").

-- Puts scheduled predictions live: the given ones, or every one that's due.
-- Each gets the next number in its series and its "new prediction" activity,
-- in go-live order; members get one push per room, however many went live.
-- Returns how many went live.
create or replace function private.publish_scheduled_predictions(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_prediction public.predictions%rowtype;
  v_published  uuid[] := '{}';
  v_room       record;
  v_series_title text;
begin
  for v_prediction in
    select p.*
    from public.predictions p
    join public.series s on s.id = p.series_id and s.status = 'active'
    where p.status = 'scheduled'
      and (case when p_ids is null then p.opens_at <= now() else p.id = any(p_ids) end)
    order by p.opens_at, p.created_at
    for update of p skip locked
  loop
    -- Same lock create_prediction takes, so numbers never collide.
    perform 1 from public.series where id = v_prediction.series_id for update;

    update public.predictions
    set status = 'draft',
        opens_at = now(),
        series_prediction_number = (
          select coalesce(max(series_prediction_number), 0) + 1
          from public.predictions
          where series_id = v_prediction.series_id
        )
    where id = v_prediction.id;

    perform private.create_room_activity(
      p_room_id := v_prediction.room_id,
      p_activity_type := 'prediction_created',
      p_activity_tier := 2,
      p_metadata := private.build_prediction_activity_metadata(v_prediction.id),
      p_click_action := jsonb_build_object('type', 'prediction', 'predictionId', v_prediction.id),
      p_created_by_player_id := v_prediction.created_by,
      p_dedupe_key := 'prediction_created:' || v_prediction.id::text
    );

    v_published := v_published || v_prediction.id;
  end loop;

  for v_room in
    select r.id, r.name, r.room_code,
      count(*)::int as n,
      (array_agg(p.id order by p.deadline, p.id))[1] as first_id,
      (array_agg(p.title order by p.deadline, p.id))[1] as first_title,
      (array_agg(p.series_id order by p.deadline, p.id))[1] as first_series_id,
      (array_agg(p.series_prediction_number order by p.deadline, p.id))[1] as first_number
    from public.predictions p
    join public.rooms r on r.id = p.room_id
    where p.id = any(v_published)
    group by r.id
  loop
    if v_room.n = 1 then
      select title into v_series_title from public.series where id = v_room.first_series_id;
      perform private.fire_push_notification(
        'prediction_live',
        v_room.first_id,
        v_room.id,
        '🎯 New Prediction',
        coalesce(v_room.name, 'Your room') || ' · ' || v_room.first_title,
        '/rooms/' || v_room.room_code || '/predictions/' || v_room.first_id::text,
        jsonb_build_object(
          'predictionId', v_room.first_id,
          'predictionTitle', v_room.first_title,
          'seriesId', v_room.first_series_id,
          'seriesTitle', v_series_title,
          'seriesPredictionNumber', v_room.first_number
        )
      );
    else
      perform private.fire_push_notification(
        'prediction_live',
        null,
        v_room.id,
        '🎯 ' || v_room.n || ' new predictions',
        coalesce(v_room.name, 'Your room') || ' · ' || v_room.first_title
          || ' and ' || (v_room.n - 1) || ' more',
        '/rooms/' || v_room.room_code,
        jsonb_build_object('predictionCount', v_room.n)
      );
    end if;
  end loop;

  return coalesce(array_length(v_published, 1), 0);
end;
$$;

-- Organizers put a scheduled prediction live straight away.
create or replace function public.publish_prediction_now(p_prediction_id uuid)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_prediction public.predictions%rowtype;
begin
  select * into v_prediction from public.predictions where id = p_prediction_id;

  if not found or not private.is_room_organizer(v_prediction.room_id) then
    raise exception 'Only organizers can publish predictions' using errcode = 'P0012';
  end if;

  if v_prediction.status <> 'scheduled' then
    raise exception 'This prediction is already live' using errcode = 'P0006';
  end if;

  if v_prediction.deadline <= now() + interval '5 minutes' then
    raise exception 'The deadline is too close. Move it first' using errcode = 'P0001';
  end if;

  if private.publish_scheduled_predictions(array[p_prediction_id]) = 0 then
    raise exception 'Its series isn''t active any more' using errcode = 'P0001';
  end if;

  select * into v_prediction from public.predictions where id = p_prediction_id;
  return json_build_object(
    'id', v_prediction.id,
    'status', v_prediction.status,
    'opens_at', v_prediction.opens_at,
    'series_prediction_number', v_prediction.series_prediction_number
  );
end;
$$;

-- Organizers delete a scheduled prediction. Nobody has seen or bet on it,
-- so it goes completely (options and tags with it).
create or replace function public.delete_scheduled_prediction(p_prediction_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_prediction public.predictions%rowtype;
begin
  select * into v_prediction from public.predictions where id = p_prediction_id for update;

  if not found or not private.is_room_organizer(v_prediction.room_id) then
    raise exception 'Only organizers can delete predictions' using errcode = 'P0012';
  end if;

  if v_prediction.status <> 'scheduled' then
    raise exception 'Only scheduled predictions can be deleted. Cancel a live one instead' using errcode = 'P0006';
  end if;

  delete from public.predictions where id = p_prediction_id;
end;
$$;

-- ------------------------------------------------------------
-- 5. Everything else that reads predictions or the limit
-- ------------------------------------------------------------
-- Owner only. Room name, description and staff settings.
create or replace function public.update_room(
  p_room_id               uuid,
  p_name                  text,
  p_description           text,
  p_result_reminder_hours integer
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_room      public.rooms%rowtype;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id
      and player_id = v_player_id
      and role = 'owner'
  ) then
    raise exception 'Only the room owner can change room settings' using errcode = 'P0012';
  end if;

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Room name cannot be empty' using errcode = 'P0001';
  end if;

  if length(trim(p_name)) > 50 then
    raise exception 'Room name must be 50 characters or fewer' using errcode = 'P0001';
  end if;

  if length(coalesce(p_description, '')) > 240 then
    raise exception 'Description must be 240 characters or fewer' using errcode = 'P0001';
  end if;

  if p_result_reminder_hours is null or p_result_reminder_hours not between 1 and 48 then
    raise exception 'Result reminder must be between 1 and 48 hours' using errcode = 'P0001';
  end if;

  update public.rooms
  set name                  = trim(p_name),
      description           = nullif(trim(coalesce(p_description, '')), ''),
      result_reminder_hours = p_result_reminder_hours
  where id = p_room_id
  returning * into v_room;

  if not found then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;

  return json_build_object(
    'id',                    v_room.id,
    'name',                  v_room.name,
    'description',           v_room.description,
    'result_reminder_hours', v_room.result_reminder_hours
  );
end;
$$;

-- Room lookup by invite code. Members get the full room; anyone else holding the
-- code gets enough to show the join screen, since table reads are member-only.
create or replace function public.get_room_by_code(
  p_room_code text
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_room      public.rooms%rowtype;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select * into v_room
  from public.rooms
  where room_code = upper(trim(p_room_code));

  if not found then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;

  return json_build_object(
    'id',                v_room.id,
    'room_code',         v_room.room_code,
    'name',              v_room.name,
    'description',       v_room.description,
    'status',            v_room.status,
    'created_at',        v_room.created_at,
    'result_reminder_hours', v_room.result_reminder_hours,
    'is_member',         private.is_room_member(v_room.id),
    -- Removed by the owner: the join screen explains instead of offering Join.
    'is_removed', exists (
      select 1 from public.room_former_members f
      where f.room_id = v_room.id
        and f.player_id = v_player_id
        and f.status in ('removed', 'deleted')
    ),
    'member_count', (
      select count(*)::int
      from public.room_members rm
      where rm.room_id = v_room.id
    ),
    'active_prediction_count', (
      select count(*)::int
      from public.predictions p
      where p.room_id = v_room.id
        and p.status in ('draft', 'locked')
    ),
    'organizer_username', (
      select pl.username
      from public.room_members rm
      join public.players pl on pl.id = rm.player_id
      where rm.room_id = v_room.id
        and rm.role = 'owner'
      order by rm.joined_at
      limit 1
    )
  );
end;
$$;

-- Staff only. Everything waiting on staff across the room, oldest first:
-- locked predictions to close, predictions still open for picks, and (for
-- organizers) scheduled ones by when they go live.
create or replace function public.get_room_manage_queue(
  p_room_id uuid
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_role      text;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select role into v_role
  from public.room_members
  where room_id = p_room_id
    and player_id = v_player_id;

  if v_role is null or v_role not in ('owner', 'organizer', 'resolver') then
    raise exception 'Only room staff can see the manage queue' using errcode = 'P0012';
  end if;

  return (
    with queue as (
      select
        p.id,
        p.title,
        p.status,
        p.deadline,
        p.opens_at,
        p.series_id,
        p.series_prediction_number,
        s.title as series_title,
        (select count(*)::int from public.bets b where b.prediction_id = p.id) as bet_count,
        (
          select coalesce(sum(po.total_bet), 0)::int
          from public.prediction_options po
          where po.prediction_id = p.id
        ) as total_pool,
        (
          select json_agg(
            json_build_object('id', po.id, 'label', po.label, 'display_order', po.display_order)
            order by po.display_order
          )
          from public.prediction_options po
          where po.prediction_id = p.id
        ) as options
      from public.predictions p
      left join public.series s on s.id = p.series_id
      where p.room_id = p_room_id
        and (
          p.status in ('draft', 'locked')
          -- Scheduled ones are for organizers (resolvers don't create).
          or (p.status = 'scheduled' and v_role in ('owner', 'organizer'))
        )
    )
    select json_build_object(
      'role', v_role,
      'to_resolve', coalesce(
        (select json_agg(q order by q.deadline, q.id) from queue q where q.status = 'locked'),
        '[]'::json
      ),
      'open', coalesce(
        (select json_agg(q order by q.deadline, q.id) from queue q where q.status = 'draft'),
        '[]'::json
      ),
      'scheduled', coalesce(
        (select json_agg(q order by q.opens_at, q.id) from queue q where q.status = 'scheduled'),
        '[]'::json
      )
    )
  );
end;
$$;

create or replace function public.complete_series(
  p_series_id uuid
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_player_id uuid;
  v_series public.series%rowtype;
  v_unfinished_predictions integer;
  v_required_bets integer;
  v_completed_predictions integer;
  v_eligible_players integer;
begin
  v_player_id := private.get_player_id_from_auth();

  if v_player_id is null then
    raise exception 'Player profile not found. Please complete registration.' using errcode = 'P0004';
  end if;

  select s.* into v_series
  from public.series s
  join public.room_members rm
    on rm.room_id = s.room_id
   and rm.player_id = v_player_id
   and rm.role in ('owner', 'organizer')
  where s.id = p_series_id
  for update;

  if not found then
    raise exception 'Series not found or access denied' using errcode = 'P0002';
  end if;

  if v_series.status <> 'active' then
    raise exception 'Only active series can be completed' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.series_placements sp where sp.series_id = p_series_id
  ) or exists (
    select 1 from public.series_awards sa where sa.series_id = p_series_id
  ) then
    raise exception 'Series final results already exist' using errcode = 'P0001';
  end if;

  select count(*)::int
  into v_unfinished_predictions
  from public.predictions p
  where p.series_id = p_series_id
    and p.status in ('draft', 'locked');

  if v_unfinished_predictions > 0 then
    raise exception 'Series has unfinished predictions and cannot be completed' using errcode = 'P0001';
  end if;

  -- Scheduled ones never went live (nobody saw or bet on them): they go with
  -- the series, before anything below counts the series' predictions.
  delete from public.predictions p
  where p.series_id = p_series_id
    and p.status = 'scheduled';

  -- The same bar decides who can place and who can win awards.
  v_required_bets := private.series_required_bets(p_series_id);

  select count(*)::int
  into v_completed_predictions
  from public.predictions p
  where p.series_id = p_series_id
    and p.status in ('revealed', 'no_result');

  -- Players who qualified, which (with games) sets how much the series' trophies are worth.
  select count(*)::int
  into v_eligible_players
  from (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ) eligible;

  insert into public.series_placements (series_id, player_id, placement, points)
  with leaderboard as (
    select
      rm.player_id,
      coalesce(w.balance, v_series.starting_stack + coalesce(stats.net_profit, 0))::numeric as balance,
      coalesce(w.balance - w.granted, coalesce(stats.net_profit, 0))::numeric as net_profit
    from public.room_members rm
    left join public.series_wallets w
      on w.series_id = p_series_id
     and w.player_id = rm.player_id
    left join private.get_leaderboard_player_stats(
      v_series.room_id,
      p_series_id,
      false
    ) stats on stats.player_id = rm.player_id
    where rm.room_id = v_series.room_id
      -- Only players who bet on enough settled predictions can place.
      and coalesce(stats.total_bets, 0) >= v_required_bets
  ),
  -- The final balance decides the title; placements record net profit for the Hall of Fame.
  ranked as (
    select
      l.player_id,
      l.net_profit,
      rank() over (order by l.balance desc) as placement
    from leaderboard l
  )
  select
    p_series_id,
    r.player_id,
    r.placement,
    r.net_profit
  from ranked r
  where r.placement <= 3;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with series_predictions as (
    select
      p.id,
      p.status,
      p.series_prediction_number,
      p.created_at,
      p.winning_option_id
    from public.predictions p
    where p.series_id = p_series_id
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as prediction_count
    from public.bets b
    join series_predictions sp
      on sp.id = b.prediction_id
     and sp.status in ('revealed', 'no_result')
    group by b.player_id
  ),
  eligible_players as (
    select pp.player_id
    from player_participation pp
    where pp.prediction_count >= v_required_bets
  ),
  -- The same streaks the series standings showed all season, results in the
  -- order they came in.
  player_streaks as (
    select ss.player_id, ss.highest_streak::numeric as award_value
    from private.series_streaks(p_series_id) ss
    join eligible_players ep on ep.player_id = ss.player_id
  ),
  top_value as (
    select max(ps.award_value) as value
    from player_streaks ps
  )
  select
    p_series_id,
    ps.player_id,
    'LONGEST_STREAK'::public.series_award_type,
    ps.award_value,
    'Achieved the longest winning streak in this Series.',
    private.series_award_tier('LONGEST_STREAK', ps.award_value, v_completed_predictions, v_series.starting_stack)
  from player_streaks ps
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and ps.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with series_predictions as (
    select p.id, p.status
    from public.predictions p
    where p.series_id = p_series_id
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as prediction_count
    from public.bets b
    join series_predictions sp
      on sp.id = b.prediction_id
     and sp.status in ('revealed', 'no_result')
    group by b.player_id
  ),
  eligible_players as (
    select pp.player_id
    from player_participation pp
    where pp.prediction_count >= v_required_bets
  ),
  player_biggest_profit as (
    select
      b.player_id,
      max(greatest(coalesce(b.payout, 0) - b.amount, 0))::numeric as award_value
    from public.bets b
    join series_predictions sp on sp.id = b.prediction_id
    join eligible_players ep on ep.player_id = b.player_id
    group by b.player_id
  ),
  top_value as (
    select max(pbp.award_value) as value
    from player_biggest_profit pbp
  )
  select
    p_series_id,
    pbp.player_id,
    'BIGGEST_PROFIT'::public.series_award_type,
    pbp.award_value,
    'Recorded the biggest single prediction profit.',
    private.series_award_tier('BIGGEST_PROFIT', pbp.award_value, v_completed_predictions, v_series.starting_stack)
  from player_biggest_profit pbp
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and pbp.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with series_predictions as (
    select p.id, p.status
    from public.predictions p
    where p.series_id = p_series_id
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as prediction_count
    from public.bets b
    join series_predictions sp
      on sp.id = b.prediction_id
     and sp.status in ('revealed', 'no_result')
    group by b.player_id
  ),
  eligible_players as (
    select pp.player_id
    from player_participation pp
    where pp.prediction_count >= v_required_bets
  ),
  points_risked as (
    select
      b.player_id,
      sum(b.amount)::numeric as award_value
    from public.bets b
    join series_predictions sp on sp.id = b.prediction_id
    join eligible_players ep on ep.player_id = b.player_id
    group by b.player_id
  ),
  top_value as (
    select max(pr.award_value) as value
    from points_risked pr
  )
  select
    p_series_id,
    pr.player_id,
    'MOST_POINTS_RISKED'::public.series_award_type,
    pr.award_value,
    'Risked the most points during this Series.',
    private.series_award_tier('MOST_POINTS_RISKED', pr.award_value, v_completed_predictions, v_series.starting_stack)
  from points_risked pr
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and pr.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with completed_predictions as (
    select p.id
    from public.predictions p
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
  ),
  player_participation as (
    select
      b.player_id,
      count(distinct p.id)::int as prediction_count
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
  ),
  eligible_players as (
    select pp.player_id
    from player_participation pp
    where pp.prediction_count >= v_required_bets
  ),
  player_completed_participation as (
    select
      b.player_id,
      count(distinct b.prediction_id)::int as completed_prediction_count
    from public.bets b
    join completed_predictions cp on cp.id = b.prediction_id
    group by b.player_id
  )
  select
    p_series_id,
    ep.player_id,
    'EVER_PRESENT'::public.series_award_type,
    v_completed_predictions::numeric,
    'Participated in every completed prediction.',
    private.series_award_tier('EVER_PRESENT', v_completed_predictions::numeric, v_completed_predictions, v_series.starting_stack)
  from eligible_players ep
  left join player_completed_participation pcp on pcp.player_id = ep.player_id
  where v_completed_predictions > 0
    and coalesce(pcp.completed_prediction_count, 0) = v_completed_predictions;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with
  eligible_players as (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ),
  -- Share of their settled bets that won, as a percentage.
  candidates as (
    select
      b.player_id,
      round(100.0 * count(*) filter (where b.option_id = p.winning_option_id) / count(*), 1) as award_value
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    join eligible_players ep on ep.player_id = b.player_id
    where p.series_id = p_series_id
      and p.status = 'revealed'
      and p.winning_option_id is not null
    group by b.player_id
    having count(*) >= greatest(v_required_bets, 3)
  ),
  top_value as (
    select max(c.award_value) as value
    from candidates c
  )
  select
    p_series_id,
    c.player_id,
    'SHARPSHOOTER'::public.series_award_type,
    c.award_value,
    'Called the highest share of results in this Series.',
    private.series_award_tier('SHARPSHOOTER', c.award_value, v_completed_predictions, v_series.starting_stack)
  from candidates c
  cross join top_value tv
  where tv.value is not null
    and tv.value > 0
    and c.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with
  eligible_players as (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ),
  -- The longest odds they won at: the whole pool over the stake on the winning side.
  odds as (
    select
      p.id,
      p.winning_option_id,
      sum(b.amount)::numeric / nullif(sum(b.amount) filter (where b.option_id = p.winning_option_id), 0) as value
    from public.predictions p
    join public.bets b on b.prediction_id = p.id
    where p.series_id = p_series_id
      and p.status = 'revealed'
    group by p.id, p.winning_option_id
  ),
  candidates as (
    select
      b.player_id,
      max(round(o.value, 2)) as award_value
    from public.bets b
    join odds o on o.id = b.prediction_id and b.option_id = o.winning_option_id
    join eligible_players ep on ep.player_id = b.player_id
    group by b.player_id
  ),
  top_value as (
    select max(c.award_value) as value
    from candidates c
  )
  select
    p_series_id,
    c.player_id,
    'UNDERDOG'::public.series_award_type,
    c.award_value,
    'Won against the longest odds in this Series.',
    private.series_award_tier('UNDERDOG', c.award_value, v_completed_predictions, v_series.starting_stack)
  from candidates c
  cross join top_value tv
  where tv.value is not null
    and tv.value >= 2
    and c.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with
  eligible_players as (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ),
  -- Places climbed from their lowest weekly rank to where they finished.
  final_ranks as (
    select st.player_id, st.rank
    from private.series_standings(p_series_id) st
    where st.is_ranked
  ),
  lowest_ranks as (
    select ss.player_id, max(ss.rank) as rank
    from public.series_standing_snapshots ss
    where ss.series_id = p_series_id
      and ss.is_ranked
      and ss.rank is not null
    group by ss.player_id
  ),
  candidates as (
    select fr.player_id, (lr.rank - fr.rank)::numeric as award_value
    from final_ranks fr
    join lowest_ranks lr on lr.player_id = fr.player_id
    join eligible_players ep on ep.player_id = fr.player_id
  ),
  top_value as (
    select max(c.award_value) as value
    from candidates c
  )
  select
    p_series_id,
    c.player_id,
    'COMEBACK'::public.series_award_type,
    c.award_value,
    'Climbed the most places from their lowest point in this Series.',
    private.series_award_tier('COMEBACK', c.award_value, v_completed_predictions, v_series.starting_stack)
  from candidates c
  cross join top_value tv
  where tv.value is not null
    and tv.value >= 2
    and c.award_value = tv.value;

  insert into public.series_awards (series_id, player_id, award_type, value, description, tier)
  with
  eligible_players as (
    select b.player_id
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = p_series_id
      and p.status in ('revealed', 'no_result')
    group by b.player_id
    having count(distinct b.prediction_id) >= v_required_bets
  ),
  -- Wins over the series' last few settled predictions.
  finish as (
    select p.id, p.winning_option_id
    from public.predictions p
    where p.series_id = p_series_id
      and p.status = 'revealed'
      and p.winning_option_id is not null
    order by coalesce(p.series_prediction_number, 2147483647) desc, p.created_at desc, p.id desc
    limit private.series_finish_window(v_completed_predictions)
  ),
  candidates as (
    select b.player_id, count(*)::numeric as award_value
    from public.bets b
    join finish f on f.id = b.prediction_id
    join eligible_players ep on ep.player_id = b.player_id
    where b.option_id = f.winning_option_id
    group by b.player_id
  ),
  top_value as (
    select max(c.award_value) as value
    from candidates c
  )
  select
    p_series_id,
    c.player_id,
    'HOT_FINISH'::public.series_award_type,
    c.award_value,
    'Won the most predictions in the final stretch of this Series.',
    private.series_award_tier('HOT_FINISH', c.award_value, v_completed_predictions, v_series.starting_stack)
  from candidates c
  cross join top_value tv
  where tv.value is not null
    and v_completed_predictions >= 6 and tv.value >= 2
    and c.award_value = tv.value;

  update public.series
  set
    status = 'completed',
    completed_at = now(),
    final_games = v_completed_predictions,
    final_players = v_eligible_players,
    tier = private.series_tier(v_completed_predictions, v_eligible_players)
  where id = p_series_id
  returning * into v_series;

  -- Titles, back-to-backs and Ever-Present seasons can unlock career milestones.
  perform private.award_milestones(v_series.room_id);

  return row_to_json(v_series);
end;
$$;

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

create or replace view public.series_with_stats
with (security_invoker = true) as
with series_prediction_stats as (
  select
    p.series_id,
    count(*)::int as total_predictions,
    count(*) filter (where p.status in ('draft', 'locked'))::int as active_predictions,
    count(*) filter (where p.status in ('revealed', 'no_result'))::int as completed_predictions,
    count(*) filter (where p.status = 'cancelled')::int as cancelled_predictions
  from public.predictions p
  where p.series_id is not null
    -- Not a game of the series until it goes live.
    and p.status <> 'scheduled'
  group by p.series_id
)
select
  s.id,
  s.room_id,
  s.title,
  s.description,
  s.status,
  s.expected_games,
  coalesce(sps.total_predictions, 0) as prediction_count,
  coalesce(sps.completed_predictions, 0) as completed_games,
  coalesce(sps.total_predictions, 0) as total_predictions,
  coalesce(sps.active_predictions, 0) as active_predictions,
  coalesce(sps.completed_predictions, 0) as completed_predictions,
  coalesce(sps.cancelled_predictions, 0) as cancelled_predictions,
  greatest(s.expected_games - coalesce(sps.completed_predictions, 0), 0) as remaining_games,
  case
    when s.expected_games > 0 then least(round((coalesce(sps.completed_predictions, 0)::numeric / s.expected_games::numeric) * 100, 2), 100)
    else 0::numeric
  end as progress_percentage,
  s.created_by,
  s.created_at,
  s.started_at,
  s.completed_at,
  s.archived_at,
  s.starting_stack,
  s.weekly_topup,
  s.topups_paid,
  exists (
    select 1
    from public.bets b
    join public.predictions p on p.id = b.prediction_id
    where p.series_id = s.id
  ) as has_bets,
  s.min_bets_to_rank
from public.series s
left join series_prediction_stats sps on sps.series_id = s.id;


create or replace view public.player_rooms_by_activity
with (security_invoker = true) as
select distinct on (rm.player_id, r.id)
  rm.player_id,
  r.id as room_id,
  r.name,
  r.room_code,
  r.status,              -- 🌟 Added
  r.created_at,
  -- 1. Compute the latest activity timestamp
  p.created_at as latest_prediction_at,
  -- 2. Dynamically count total room members
  (
    select count(*)::int 
    from public.room_members sub_rm 
    where sub_rm.room_id = r.id
  ) as member_count,
  -- 3. Dynamically count active predictions
  (
    select count(*)::int 
    from public.predictions sub_p 
    where sub_p.room_id = r.id 
      and sub_p.status in ('draft', 'locked')
  ) as active_prediction_count
from public.room_members rm
join public.rooms r on r.id = rm.room_id
-- Scheduled predictions don't count as activity until they go live.
left join public.predictions p on p.room_id = r.id and p.status <> 'scheduled'
order by rm.player_id, r.id, p.created_at desc;

-- ------------------------------------------------------------
-- 6. Function access
-- ------------------------------------------------------------
revoke execute on function private.is_room_organizer(uuid) from public, anon;
-- RLS policies call it as the signed-in user.
grant execute on function private.is_room_organizer(uuid) to authenticated;
revoke execute on function private.publish_scheduled_predictions(uuid[]) from public, anon, authenticated;
revoke execute on function public.create_prediction(uuid, text, text[], timestamptz, uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.update_prediction(uuid, text, timestamptz, text[], timestamptz) from public, anon, authenticated;
revoke execute on function public.update_room(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.publish_prediction_now(uuid) from public, anon, authenticated;
revoke execute on function public.delete_scheduled_prediction(uuid) from public, anon, authenticated;
grant execute on function public.create_prediction(uuid, text, text[], timestamp with time zone, uuid, timestamp with time zone) to authenticated;
grant execute on function public.update_prediction(uuid, text, timestamp with time zone, text[], timestamp with time zone) to authenticated;
grant execute on function public.update_room(uuid, text, text, integer) to authenticated;
grant execute on function public.publish_prediction_now(uuid) to authenticated;
grant execute on function public.delete_scheduled_prediction(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. Put due predictions live, every minute
-- ------------------------------------------------------------
select cron.schedule('publish-scheduled-predictions', '* * * * *', $$select private.publish_scheduled_predictions()$$);
