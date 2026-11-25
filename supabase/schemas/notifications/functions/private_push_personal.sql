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
