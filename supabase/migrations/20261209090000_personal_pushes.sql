-- ============================================================
-- Migration: personal_pushes
-- Description: Pushes written for each player, and clearer copy.
--   - The 1-hour reminder only goes to players with a question in it still
--     to pick, and says how far they are ("You've picked 1 of 3").
--   - Results tell each player what happened to their own pick ("You called
--     it: +120 pts", "India won. Time to eat crow.", "3 results are in: you
--     called 2"). Called-off questions only reach players who had picks.
--   - New questions say when picks close; locking says who picked what is
--     now there to see.
--   push_for_predictions sends reminders and results through the new
--   push_personal_for_predictions, so its callers are unchanged. Copy only:
--   no table changes, and the notification settings are the same.
-- ============================================================

-- "in 40 min", "in 5h", "in a day", "in 3 days": when something closes,
-- for a push. Relative, because the database doesn't know the reader's
-- time zone.
create or replace function private.push_closes_in(p_at timestamptz)
returns text
language sql
stable
set search_path = public, private
as $$
  select case
    when p_at <= now() then 'now'
    when p_at - now() < interval '1 hour'
      then 'in ' || greatest(1, ceil(extract(epoch from p_at - now()) / 60))::int || ' min'
    when p_at - now() < interval '24 hours'
      then 'in ' || round(extract(epoch from p_at - now()) / 3600)::int || 'h'
    when round(extract(epoch from p_at - now()) / 86400) = 1 then 'in a day'
    else 'in ' || round(extract(epoch from p_at - now()) / 86400)::int || ' days'
  end;
$$;

-- "+120 pts", "−50 pts", "±0 pts".
create or replace function private.push_signed_points(p_points integer)
returns text
language sql
immutable
as $$
  select case
    when p_points > 0 then '+' || p_points
    when p_points < 0 then '−' || abs(p_points)
    else '±0'
  end || ' pts';
$$;

-- Pushes written for each player, for a set of questions in one or more
-- rooms (one push per player per room):
--
-- deadline_1h: only players with a question in the set still to pick.
--   One question: "⏰ 1 hour left to pick", "Room · Question".
--   Several:      "⏰ 3 questions close in an hour", "Room · You've picked 1 of 3".
--
-- result_revealed: what happened to *your* picks.
--   One question you picked: "🏆 You called it: +120 pts" or
--   "🏆 India won. Time to eat crow."; one you didn't: "🏆 Result's in: India".
--   Several: "🏆 3 results are in: you called 2", "Room · +180 pts".
--   Called off (no result or scrapped) only reaches players who had picks:
--   "↩️ No result. Your points are back."
--
-- Each goes through fire_push_notification with target_player_id, so every
-- player's notification settings still apply.
create or replace function private.push_personal_for_predictions(
  p_event_type text,
  p_prediction_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_room record;
  v_member record;
  v_about text;
  v_title text;
  v_body text;
  v_url text;
  v_prediction_id uuid;
  v_extra jsonb;
begin
  for v_room in
    select r.id, r.name, r.room_code,
      count(*)::int as n,
      count(*) filter (where p.status = 'revealed')::int as revealed,
      (array_agg(p.id order by p.deadline, p.series_prediction_number, p.id))[1] as first_id,
      (array_agg(p.title order by p.deadline, p.series_prediction_number, p.id))[1] as first_title,
      (array_agg(p.status order by p.deadline, p.series_prediction_number, p.id))[1] as first_status,
      (array_agg(p.series_id order by p.deadline, p.series_prediction_number, p.id))[1] as first_series_id,
      (array_agg(p.series_prediction_number order by p.deadline, p.series_prediction_number, p.id))[1] as first_number,
      (array_agg(o.label order by p.deadline, p.series_prediction_number, p.id))[1] as first_winner,
      count(distinct p.event_id)::int as events,
      bool_and(p.event_id is not null) as all_in_events,
      min(e.title) as event_title
    from public.predictions p
    join public.rooms r on r.id = p.room_id
    left join public.prediction_events e on e.id = p.event_id
    left join public.prediction_options o on o.id = p.winning_option_id
    where p.id = any(p_prediction_ids)
    group by r.id
  loop
    v_about := case
      when v_room.n = 1 then v_room.first_title
      when v_room.all_in_events and v_room.events = 1 then v_room.event_title
      else v_room.first_title || ' and ' || (v_room.n - 1) || ' more'
    end;
    if v_room.n = 1 then
      v_url := '/rooms/' || v_room.room_code || '/predictions/' || v_room.first_id::text;
      v_prediction_id := v_room.first_id;
      v_extra := jsonb_build_object(
        'predictionId', v_room.first_id,
        'predictionTitle', v_room.first_title,
        'seriesId', v_room.first_series_id,
        'seriesTitle', (select title from public.series where id = v_room.first_series_id),
        'seriesPredictionNumber', v_room.first_number
      );
    else
      v_url := '/rooms/' || v_room.room_code;
      v_prediction_id := null;
      v_extra := jsonb_build_object('predictionCount', v_room.n);
    end if;

    for v_member in
      select m.player_id,
        count(b.id)::int as picks,
        count(b.id) filter (
          where p.status = 'revealed' and b.option_id = p.winning_option_id
        )::int as called,
        coalesce(sum(
          case when p.status = 'revealed' then coalesce(b.payout, 0) - b.amount else 0 end
        ), 0)::int as net
      from public.room_members m
      left join public.predictions p
        on p.room_id = v_room.id and p.id = any(p_prediction_ids)
      left join public.bets b
        on b.prediction_id = p.id and b.player_id = m.player_id
      where m.room_id = v_room.id
      group by m.player_id
    loop
      v_title := null;

      if p_event_type = 'deadline_1h' then
        if v_member.picks < v_room.n then
          if v_room.n = 1 then
            v_title := '⏰ 1 hour left to pick';
            v_body := coalesce(v_room.name, 'Your room') || ' · ' || v_room.first_title;
          else
            v_title := '⏰ ' || v_room.n || ' questions close in an hour';
            v_body := coalesce(v_room.name, 'Your room') || ' · You''ve picked '
              || v_member.picks || ' of ' || v_room.n;
          end if;
        end if;

      elsif p_event_type = 'result_revealed' then
        if v_room.n = 1 then
          if v_room.first_status = 'revealed' then
            if v_member.picks = 0 then
              v_title := '🏆 Result''s in: ' || coalesce(v_room.first_winner, 'see who won');
            elsif v_member.called > 0 then
              v_title := '🏆 You called it'
                || case when v_member.net > 0 then ': ' || private.push_signed_points(v_member.net) else '' end;
            else
              v_title := '🏆 ' || coalesce(v_room.first_winner, 'The other side') || ' won. Time to eat crow.';
            end if;
          elsif v_member.picks > 0 then
            v_title := '↩️ No result. Your points are back.';
          end if;
          v_body := coalesce(v_room.name, 'Your room') || ' · ' || v_room.first_title;
        else
          if v_room.revealed > 0 then
            if v_member.picks > 0 then
              v_title := '🏆 ' || v_room.n || ' results are in'
                || case when v_member.called > 0 then ': you called ' || v_member.called else '' end;
              v_body := coalesce(v_room.name, 'Your room') || ' · ' || private.push_signed_points(v_member.net);
            else
              v_title := '🏆 ' || v_room.n || ' results are in';
              v_body := coalesce(v_room.name, 'Your room') || ' · ' || v_about;
            end if;
          elsif v_member.picks > 0 then
            v_title := '↩️ ' || v_room.n || ' questions called off';
            v_body := coalesce(v_room.name, 'Your room') || ' · Your points are back.';
          end if;
        end if;
      end if;

      if v_title is not null then
        perform private.fire_push_notification(
          p_event_type,
          v_prediction_id,
          v_room.id,
          v_title,
          v_body,
          v_url,
          v_extra || jsonb_build_object('target_player_id', v_member.player_id)
        );
      end if;
    end loop;
  end loop;
end;
$$;

-- One push per room for a set of predictions that changed together (went
-- live, locked, got results...), instead of one per prediction. A room with
-- one prediction in the set gets the usual push that opens it; a room with
-- several gets a single push that opens the room. p_title_many is the title
-- for several, with %s where the count goes.
--
-- Reminders and results are written for each player instead
-- (push_personal_for_predictions), so the titles passed for those are not
-- used. New questions say when picks close; locking says who picked what
-- is now there to see.
create or replace function private.push_for_predictions(
  p_event_type text,
  p_prediction_ids uuid[],
  p_title_one text,
  p_title_many text
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_room record;
  v_series_title text;
  v_about text;
  v_title_one text := p_title_one;
  v_title_many text := p_title_many;
  v_closes text;
begin
  if p_event_type in ('deadline_1h', 'result_revealed') then
    perform private.push_personal_for_predictions(p_event_type, p_prediction_ids);
    return;
  end if;

  if p_event_type = 'prediction_locked' then
    v_title_one := '🔒 Picks locked: see who picked what';
    v_title_many := '🔒 Picks locked on %s questions';
  end if;

  for v_room in
    select r.id, r.name, r.room_code,
      count(*)::int as n,
      (array_agg(p.id order by p.deadline, p.series_prediction_number, p.id))[1] as first_id,
      (array_agg(p.title order by p.deadline, p.series_prediction_number, p.id))[1] as first_title,
      (array_agg(p.series_id order by p.deadline, p.series_prediction_number, p.id))[1] as first_series_id,
      (array_agg(p.series_prediction_number order by p.deadline, p.series_prediction_number, p.id))[1] as first_number,
      count(distinct p.event_id)::int as events,
      bool_and(p.event_id is not null) as all_in_events,
      min(e.title) as event_title,
      min(p.deadline) as first_deadline,
      max(p.deadline) as last_deadline
    from public.predictions p
    join public.rooms r on r.id = p.room_id
    left join public.prediction_events e on e.id = p.event_id
    where p.id = any(p_prediction_ids)
    group by r.id
  loop
    -- New questions say when picks close: "closes in 5h", or "first closes"
    -- when a set's deadlines differ.
    v_closes := case
      when p_event_type <> 'prediction_live' then ''
      when v_room.first_deadline = v_room.last_deadline
        then ' · closes ' || private.push_closes_in(v_room.first_deadline)
      else ' · first closes ' || private.push_closes_in(v_room.first_deadline)
    end;
    if v_room.n = 1 then
      select title into v_series_title from public.series where id = v_room.first_series_id;
      perform private.fire_push_notification(
        p_event_type,
        v_room.first_id,
        v_room.id,
        v_title_one,
        coalesce(v_room.name, 'Your room') || ' · ' || v_room.first_title || v_closes,
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
      -- All for one event: name it. Otherwise the first one "and N more".
      v_about := case
        when v_room.all_in_events and v_room.events = 1 then v_room.event_title
        else v_room.first_title || ' and ' || (v_room.n - 1) || ' more'
      end;
      perform private.fire_push_notification(
        p_event_type,
        null,
        v_room.id,
        replace(v_title_many, '%s', v_room.n::text),
        coalesce(v_room.name, 'Your room') || ' · ' || v_about
          || case when p_event_type = 'prediction_locked' then '. See who picked what.' else v_closes end,
        '/rooms/' || v_room.room_code,
        jsonb_build_object('predictionCount', v_room.n)
      );
    end if;
  end loop;
end;
$$;

-- Pushes for one prediction changing: it went live, or staff closed it.
-- Functions that change several at once (create_predictions,
-- resolve_predictions) switch this off for their transaction with
-- crow.skip_prediction_push and send one push for the set instead. Locking
-- is pushed per statement, below, so a deadline shared by several
-- predictions is one push too.
create or replace function private.on_prediction_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if coalesce(current_setting('crow.skip_prediction_push', true), '') = 'on' then
    return NEW;
  end if;

  -- New prediction published (draft = live for betting). Through
  -- push_for_predictions, like a set of one, so it says when picks close.
  if TG_OP = 'INSERT' and NEW.status = 'draft' then
    perform private.push_for_predictions(
      'prediction_live',
      array[NEW.id],
      '🎯 New question',
      '🎯 %s new questions'
    );

  -- Staff closed the prediction (win, no_result, or cancelled). Open
  -- predictions can be cancelled too, which refunds everyone. Each player
  -- hears what happened to their own pick.
  elsif TG_OP = 'UPDATE'
    and (
      (OLD.status = 'locked' and NEW.status in ('revealed', 'no_result', 'cancelled'))
      or (OLD.status = 'draft' and NEW.status = 'cancelled')
    )
  then
    perform private.push_personal_for_predictions('result_revealed', array[NEW.id]);
  end if;

  return NEW;
end;
$$;

-- Picks closed, by the every-minute job or an organizer. Runs once per
-- statement, so predictions that lock together are one push per room.
create or replace function private.on_predictions_locked()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_ids uuid[];
begin
  select array_agg(n.id) into v_ids
  from new_rows n
  join old_rows o on o.id = n.id
  where o.status = 'draft' and n.status = 'locked';

  if v_ids is not null then
    perform private.push_for_predictions(
      'prediction_locked',
      v_ids,
      '🔒 Picks locked: see who picked what',
      '🔒 Picks locked on %s questions'
    );
  end if;

  return null;
end;
$$;

revoke execute on function private.push_closes_in(timestamptz) from public, anon, authenticated;
revoke execute on function private.push_signed_points(integer) from public, anon, authenticated;
revoke execute on function private.push_personal_for_predictions(text, uuid[]) from public, anon, authenticated;
