-- Match results (event packs phase 2). The sync saves each finished match's
-- score; the resolvers turn it into a suggested answer for every fixture
-- question; a platform admin confirms (or edits) those answers in /admin;
-- Crow then reveals every linked room question that's locked. A room that
-- revealed by hand is left alone.

-- ------------------------------------------------------------
-- Scores
-- ------------------------------------------------------------

-- One part of a saved result as {home, away}: 'ninety' (90 minutes plus
-- stoppage time), 'total' (with extra time, without the shootout),
-- 'half_time' or 'penalties'. Null when the result can't tell.
create or replace function private.fixture_score(p_result jsonb, p_part text)
returns int[]
language plpgsql
immutable
set search_path = public, private
as $$
declare
  v_duration text := p_result->>'duration';
  v_score    jsonb;
begin
  if p_result is null then
    return null;
  end if;

  v_score := case p_part
    when 'ninety' then
      case
        when p_result ? 'regular_time' then p_result->'regular_time'
        when v_duration = 'regular' then p_result->'full_time'
      end
    when 'total' then
      case
        when p_result ? 'regular_time' and p_result ? 'extra_time' then
          jsonb_build_object(
            'home', (p_result->'regular_time'->>'home')::int + (p_result->'extra_time'->>'home')::int,
            'away', (p_result->'regular_time'->>'away')::int + (p_result->'extra_time'->>'away')::int
          )
        when v_duration in ('regular', 'extra_time') then p_result->'full_time'
      end
    when 'half_time' then p_result->'half_time'
    when 'penalties' then p_result->'penalties'
  end;

  if v_score is null
    or jsonb_typeof(v_score->'home') <> 'number'
    or jsonb_typeof(v_score->'away') <> 'number'
  then
    return null;
  end if;

  return array[(v_score->>'home')::int, (v_score->>'away')::int];
end;
$$;

-- 'home', 'away' or 'draw' for a {home, away} score.
create or replace function private.score_winner(p_score int[])
returns text
language sql
immutable
as $$
  select case
    when p_score is null then null
    when p_score[1] > p_score[2] then 'home'
    when p_score[1] < p_score[2] then 'away'
    else 'draw'
  end;
$$;

-- The suggested answer for one fixture question, from its fixture's saved
-- result: an option key, or null when the result can't settle it (no
-- score yet, a called-off match, a one-off extra). Admins see it in /admin
-- and confirm or change it. Each template's resolver key is a rule here.
create or replace function private.fixture_question_outcome(p_question_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_resolver  text;
  v_fixture   catalog.fixtures%rowtype;
  v_result    jsonb;
  v_ninety    int[];
  v_total     int[];
  v_half      int[];
  v_first     jsonb;
  v_first_total int[];
  v_shootout  text;
begin
  select f.* into v_fixture
  from catalog.fixture_questions q
  join catalog.fixtures f on f.id = q.fixture_id
  where q.id = p_question_id;

  select t.resolver into v_resolver
  from catalog.fixture_questions q
  join catalog.question_templates t on t.id = q.template_id
  where q.id = p_question_id;

  v_result := v_fixture.result;
  if v_resolver is null or v_result is null then
    return null;
  end if;

  -- Cricket: the adapter saves the winner, the toss and each innings with
  -- sides as home or away (see supabase/functions/sync-fixtures).
  if v_fixture.match_format is not null then
    return private.cricket_outcome(v_resolver, v_result);
  end if;

  if v_fixture.status <> 'finished' then
    return null;
  end if;

  v_ninety := private.fixture_score(v_result, 'ninety');
  v_total := private.fixture_score(v_result, 'total');
  v_half := private.fixture_score(v_result, 'half_time');
  -- Who won the shootout: from its score, or the provider's winner.
  v_shootout := case
    when v_result->>'duration' <> 'penalties' then null
    when private.fixture_score(v_result, 'penalties') is not null
      then nullif(private.score_winner(private.fixture_score(v_result, 'penalties')), 'draw')
    else nullif(v_result->>'winner', 'draw')
  end;

  return case v_resolver
    when 'full_time_winner' then private.score_winner(v_ninety)
    when 'both_score' then
      case when v_ninety is null then null
           when v_ninety[1] > 0 and v_ninety[2] > 0 then 'yes' else 'no' end
    when 'three_plus_goals' then
      case when v_ninety is null then null
           when v_ninety[1] + v_ninety[2] >= 3 then 'yes' else 'no' end
    when 'clean_sheet_home' then
      case when v_ninety is null then null
           when v_ninety[2] = 0 then 'yes' else 'no' end
    when 'more_goals_half' then
      case when v_ninety is null or v_half is null then null
           when v_half[1] + v_half[2] > v_ninety[1] + v_ninety[2] - v_half[1] - v_half[2] then 'first'
           when v_half[1] + v_half[2] < v_ninety[1] + v_ninety[2] - v_half[1] - v_half[2] then 'second'
           else 'same' end
    when 'penalties' then
      case when v_result->>'duration' = 'penalties' then 'yes' else 'no' end
    -- A single game that sends someone through: the shootout, or the score
    -- with extra time.
    when 'match_winner' then
      coalesce(v_shootout, nullif(private.score_winner(v_total), 'draw'))
    -- Who goes through: the shootout, or the score over both legs when this
    -- is a second leg (the first leg's home side is this game's away side).
    when 'tie_winner' then
      case
        when v_shootout is not null then v_shootout
        else (
          select case
            when g.id is null then nullif(private.score_winner(v_total), 'draw')
            when private.fixture_score(g.result, 'total') is null or g.status <> 'finished' then null
            else nullif(private.score_winner(array[
              v_total[1] + (private.fixture_score(g.result, 'total'))[2],
              v_total[2] + (private.fixture_score(g.result, 'total'))[1]
            ]), 'draw')
          end
          from (select 1) one
          left join catalog.fixtures g
            on g.competition_id = v_fixture.competition_id
           and g.season = v_fixture.season
           and g.round_label is not distinct from v_fixture.round_label
           and g.home_team_id = v_fixture.away_team_id
           and g.away_team_id = v_fixture.home_team_id
           and g.kickoff_at < v_fixture.kickoff_at
        )
      end
    else null
  end;
end;
$$;

-- The suggested answer for a cricket question. p_result is
--   {"winner": "home" | "away" | "draw" | "tie" | "no_result" | null,
--    "toss_winner": "home" | "away" | null, "toss_choice": "bat" | "bowl" | null,
--    "innings": [{"team": "home" | "away", "runs": 245, "wickets": 6, "overs": 50}],
--    "status_text": "India won by 5 wkts"}
-- A match with no result answers its result questions with no_result
-- (everyone gets their points back); the toss still counts if it happened.
-- A tie with no super over winner suggests nothing: an admin decides.
create or replace function private.cricket_outcome(p_resolver text, p_result jsonb)
returns text
language plpgsql
immutable
set search_path = public, private
as $$
declare
  v_winner      text := p_result->>'winner';
  v_toss        text := p_result->>'toss_winner';
  v_choice      text := p_result->>'toss_choice';
  v_first_team  text;
  v_first_runs  int;
  v_threshold   int;
begin
  v_first_team := case
    when v_toss is null or v_choice is null then p_result->'innings'->0->>'team'
    when v_choice = 'bat' then v_toss
    else case v_toss when 'home' then 'away' else 'home' end
  end;
  v_first_runs := (p_result->'innings'->0->>'runs')::int;

  if p_resolver in ('toss_winner', 'toss_choice') then
    return case p_resolver when 'toss_winner' then v_toss else v_choice end;
  end if;

  if v_winner = 'no_result' then
    return 'no_result';
  end if;

  if p_resolver = 'cricket_winner' then
    -- Limited overs: no draw option; a tie needs its super over.
    return case when v_winner in ('home', 'away') then v_winner end;
  elsif p_resolver = 'cricket_test_winner' then
    return case when v_winner in ('home', 'away', 'draw') then v_winner end;
  elsif p_resolver = 'batting_first_wins' then
    return case
      when v_winner not in ('home', 'away') or v_first_team is null then null
      when v_winner = v_first_team then 'yes'
      else 'no'
    end;
  elsif p_resolver like 'first_innings_at_least:%' then
    v_threshold := split_part(p_resolver, ':', 2)::int;
    return case
      when v_first_runs is null then null
      when v_first_runs >= v_threshold then 'yes'
      else 'no'
    end;
  end if;

  return null;
end;
$$;

-- ------------------------------------------------------------
-- Revealing in rooms
-- ------------------------------------------------------------

-- Reveals, as Crow, every locked room question linked to a confirmed
-- fixture question (one fixture, or all). Runs when an admin confirms, and
-- every 15 minutes for questions that lock later (a host moved the
-- deadline past kickoff). A room that already revealed by hand isn't
-- touched: only locked ones are. One push per room. Returns how many.
create or replace function private.reveal_confirmed_fixture_questions(p_fixture_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_item      record;
  v_result    json;
  v_closed    uuid[] := '{}';
  v_revealed  int := 0;
begin
  perform set_config('crow.skip_prediction_push', 'on', true);

  -- Oldest first, so streaks and ratings move in the order things happened.
  for v_item in
    select p.id, p.room_id, q.outcome, f.status as fixture_status,
      (select o.id from public.prediction_options o
       where o.prediction_id = p.id and o.option_key = q.outcome) as option_id
    from public.predictions p
    join catalog.fixture_questions q on q.id = p.fixture_question_id
    join catalog.fixtures f on f.id = q.fixture_id
    where p.status = 'locked'
      and q.outcome is not null
      and f.result_confirmed_at is not null
      and (p_fixture_id is null or f.id = p_fixture_id)
    order by p.deadline, p.series_prediction_number, p.id
    for update of p skip locked
  loop
    if v_item.outcome = 'no_result' then
      v_result := private.resolve_prediction(
        v_item.id, v_item.room_id, 'no_result', null,
        case v_item.fixture_status
          when 'abandoned' then 'Match abandoned'
          when 'postponed' then 'Match postponed'
          when 'cancelled' then 'Match called off'
        end,
        null
      );
    elsif v_item.option_id is not null then
      v_result := private.resolve_prediction(v_item.id, v_item.room_id, 'win', v_item.option_id, null, null);
    else
      continue;
    end if;

    v_closed := v_closed || v_item.id;
    if v_result->>'outcome' = 'revealed' then
      v_revealed := v_revealed + 1;
    end if;
  end loop;

  perform set_config('crow.skip_prediction_push', 'off', true);

  perform private.push_for_predictions(
    'result_revealed',
    v_closed,
    '🏆 Result''s in',
    case
      when v_revealed > 0 then '🏆 %s results are in'
      else '↩️ %s questions called off · points back'
    end
  );

  return cardinality(v_closed);
end;
$$;

-- Cron, every 15 minutes: while a match that rooms have questions on is
-- likely over but has no final score yet, asks for a fixture sync; and
-- reveals confirmed questions that have locked since.
create or replace function private.run_fixture_results()
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  -- One request for all of them: the sync function fetches what's due
  -- (get_fixture_result_targets), and syncs season lists only as often as
  -- each provider allows.
  if exists (
    select 1
    from catalog.fixtures f
    join catalog.competitions c on c.id = f.competition_id and c.active
    where f.result_confirmed_at is null
      and f.kickoff_at between now() - interval '7 days' and now() - interval '105 minutes'
      and private.fixture_result_due(f.id)
  ) then
    perform private.request_fixture_sync();
  end if;

  perform private.reveal_confirmed_fixture_questions();
end;
$$;

-- ------------------------------------------------------------
-- Admin: results
-- ------------------------------------------------------------

-- A fixture as /admin shows it, with the questions rooms have from it:
-- each with its options, the suggested answer, the confirmed one, and how
-- its room questions stand.
create or replace function private.admin_fixture_json(p_fixture_id uuid)
returns json
language sql
stable
security definer
set search_path = public, private
as $$
  select json_build_object(
    'id', f.id,
    'competition_name', c.name,
    'round_label', f.round_label,
    'kickoff_at', f.kickoff_at,
    'status', f.status,
    'home', h.short_name,
    'away', a.short_name,
    'sport', c.sport,
    'format', f.match_format,
    'label', f.label,
    'result', f.result,
    'result_source', f.result_source,
    'confirmed_at', f.result_confirmed_at,
    'confirmed_by', (select username from public.players where id = f.result_confirmed_by),
    'questions', (
      select coalesce(json_agg(json_build_object(
        'id', q.id,
        'title', q.title,
        'options', q.options,
        'suggested', private.fixture_question_outcome(q.id),
        'outcome', q.outcome,
        'rooms', s.rooms,
        'waiting', s.waiting,
        'by_crow', s.by_crow,
        'by_hand', s.by_hand
      ) order by q.display_order, q.created_at), '[]'::json)
      from catalog.fixture_questions q
      cross join lateral (
        select
          count(distinct p.room_id)::int as rooms,
          count(*) filter (where p.status in ('draft', 'locked'))::int as waiting,
          count(*) filter (where p.status in ('revealed', 'no_result') and p.revealed_by_crow)::int as by_crow,
          count(*) filter (where p.status in ('revealed', 'no_result') and not p.revealed_by_crow)::int as by_hand
        from public.predictions p
        where p.fixture_question_id = q.id
          and p.status <> 'cancelled'
      ) s
      where q.fixture_id = f.id
        and (s.rooms > 0 or q.outcome is not null)
    )
  )
  from catalog.fixtures f
  join catalog.competitions c on c.id = f.competition_id
  left join catalog.teams h on h.id = f.home_team_id
  left join catalog.teams a on a.id = f.away_team_id
  where f.id = p_fixture_id;
$$;

-- Platform admins: matches rooms have questions on that have kicked off
-- and wait for a confirmed result (oldest first), and the ones confirmed
-- in the last two weeks, to fix if needed.
create or replace function public.admin_get_results()
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  return json_build_object(
    'to_confirm', (
      select coalesce(json_agg(private.admin_fixture_json(f.id) order by f.kickoff_at), '[]'::json)
      from catalog.fixtures f
      where f.result_confirmed_at is null
        and f.kickoff_at < now()
        and exists (
          select 1 from catalog.fixture_questions q
          join public.predictions p on p.fixture_question_id = q.id
          where q.fixture_id = f.id and p.status <> 'cancelled'
        )
    ),
    'confirmed', (
      select coalesce(json_agg(private.admin_fixture_json(x.id) order by x.result_confirmed_at desc), '[]'::json)
      from (
        select f.id, f.result_confirmed_at
        from catalog.fixtures f
        where f.result_confirmed_at > now() - interval '14 days'
        order by f.result_confirmed_at desc
        limit 30
      ) x
    ),
    'last_synced_at', (select max(synced_at) from catalog.competitions where active)
  );
end;
$$;

-- Platform admins type a match's score when the feed is missing or wrong,
-- or mark it called off. p_result is
--   {"ninety": {"home": 2, "away": 1}, "half_time": {"home": 1, "away": 0},
--    "duration": "regular" | "extra_time" | "penalties",
--    "after_extra_time": {...}, "penalties": {...}}
-- (after_extra_time with extra time or penalties, penalties with
-- penalties). Null with a status other than finished for a match that
-- didn't finish. The feed won't overwrite it. Suggested answers follow;
-- nothing is revealed until the admin confirms.
create or replace function public.admin_set_fixture_result(
  p_fixture_id uuid,
  p_status     text,
  p_result     jsonb default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_duration text := p_result->>'duration';
  v_ninety   int[];
  v_half     int[];
  v_after    int[];
  v_pens     int[];
  v_result   jsonb;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if p_status not in ('finished', 'abandoned', 'postponed', 'cancelled') then
    raise exception 'Status must be finished, abandoned, postponed or cancelled' using errcode = 'P0001';
  end if;

  -- Cricket has no score form: an admin marks a match finished (or called
  -- off) and picks each answer when confirming.
  if p_status = 'finished' and p_result is null and exists (
    select 1 from catalog.fixtures f
    join catalog.competitions c on c.id = f.competition_id
    where f.id = p_fixture_id and c.sport = 'cricket'
  ) then
    update catalog.fixtures
    set status = 'finished', result_source = 'manual', updated_at = now()
    where id = p_fixture_id;
    return private.admin_fixture_json(p_fixture_id);
  end if;

  if p_status = 'finished' then
    if v_duration not in ('regular', 'extra_time', 'penalties') then
      raise exception 'Say how the match ended: 90 minutes, extra time or penalties' using errcode = 'P0001';
    end if;

    v_ninety := array[(p_result->'ninety'->>'home')::int, (p_result->'ninety'->>'away')::int];
    v_half := array[(p_result->'half_time'->>'home')::int, (p_result->'half_time'->>'away')::int];
    v_after := case when v_duration = 'regular' then v_ninety
      else array[(p_result->'after_extra_time'->>'home')::int, (p_result->'after_extra_time'->>'away')::int] end;
    v_pens := case when v_duration = 'penalties'
      then array[(p_result->'penalties'->>'home')::int, (p_result->'penalties'->>'away')::int] end;

    if array_position(v_ninety || v_half || v_after || coalesce(v_pens, '{0,0}'), null) is not null
      or least(v_ninety[1], v_ninety[2], v_half[1], v_half[2], v_after[1], v_after[2],
               coalesce(v_pens[1], 0), coalesce(v_pens[2], 0)) < 0
    then
      raise exception 'Every score needs both numbers, 0 or more' using errcode = 'P0001';
    end if;

    if v_half[1] > v_ninety[1] or v_half[2] > v_ninety[2]
      or v_ninety[1] > v_after[1] or v_ninety[2] > v_after[2]
    then
      raise exception 'Scores can only go up from half time to the end' using errcode = 'P0001';
    end if;

    -- No check that extra time follows a level score: in a second leg it
    -- follows a level aggregate.
    if v_duration = 'penalties' and v_pens[1] = v_pens[2] then
      raise exception 'A shootout has a winner' using errcode = 'P0001';
    end if;

    v_result := jsonb_build_object(
      'winner', case when v_duration = 'penalties'
        then private.score_winner(v_pens) else private.score_winner(v_after) end,
      'duration', v_duration,
      'full_time', jsonb_build_object('home', v_after[1], 'away', v_after[2]),
      'half_time', jsonb_build_object('home', v_half[1], 'away', v_half[2]),
      'regular_time', jsonb_build_object('home', v_ninety[1], 'away', v_ninety[2]),
      'extra_time', jsonb_build_object('home', v_after[1] - v_ninety[1], 'away', v_after[2] - v_ninety[2])
    ) || case when v_pens is null then '{}'::jsonb
      else jsonb_build_object('penalties', jsonb_build_object('home', v_pens[1], 'away', v_pens[2])) end;
  end if;

  update catalog.fixtures
  set status = p_status,
      result = v_result,
      result_source = 'manual',
      updated_at = now()
  where id = p_fixture_id;

  if not found then
    raise exception 'Fixture not found' using errcode = 'P0002';
  end if;

  return private.admin_fixture_json(p_fixture_id);
end;
$$;

-- Platform admins confirm a match: p_outcomes gives every question rooms
-- have from it its answer, {"<fixture question id>": "<option key>" or
-- "no_result"}. Crow then reveals every linked room question that's
-- locked. Confirming again with different answers fixes the result in
-- every room Crow revealed (a room that revealed or fixed it by hand is
-- left alone; so is one whose series has finished).
create or replace function public.admin_confirm_fixture(
  p_fixture_id uuid,
  p_outcomes   jsonb
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_admin_id  uuid := private.get_player_id_from_auth();
  v_question  record;
  v_value     text;
  v_changed   uuid[] := '{}';
  v_item      record;
  v_fixed     int := 0;
  v_not_fixed int := 0;
  v_revealed  int;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  perform 1 from catalog.fixtures where id = p_fixture_id for update;
  if not found then
    raise exception 'Fixture not found' using errcode = 'P0002';
  end if;

  if p_outcomes is null or jsonb_typeof(p_outcomes) <> 'object' then
    raise exception 'Give an answer for each question' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_object_keys(p_outcomes) k
    where not exists (
      select 1 from catalog.fixture_questions q
      where q.fixture_id = p_fixture_id and q.id::text = k
    )
  ) then
    raise exception 'Those answers are for another match' using errcode = 'P0001';
  end if;

  for v_question in
    select q.id, q.title, q.options, q.outcome,
      exists (select 1 from public.predictions p where p.fixture_question_id = q.id and p.status <> 'cancelled') as in_play
    from catalog.fixture_questions q
    where q.fixture_id = p_fixture_id
    for update of q
  loop
    v_value := p_outcomes->>v_question.id::text;

    if v_value is null then
      if v_question.in_play then
        raise exception 'Give an answer for "%"', v_question.title using errcode = 'P0001';
      end if;
      continue;
    end if;

    if v_value <> 'no_result' and not exists (
      select 1 from jsonb_array_elements(v_question.options) o where o->>'key' = v_value
    ) then
      raise exception '"%" isn''t an answer to "%"', v_value, v_question.title using errcode = 'P0001';
    end if;

    if v_question.outcome is distinct from v_value then
      update catalog.fixture_questions
      set outcome = v_value, updated_at = now()
      where id = v_question.id;
      v_changed := v_changed || v_question.id;
    end if;
  end loop;

  update catalog.fixtures
  set result_confirmed_at = now(),
      result_confirmed_by = v_admin_id,
      updated_at = now()
  where id = p_fixture_id;

  -- A changed answer: fix the rooms Crow revealed (and no host fixed since).
  for v_item in
    select p.id, p.room_id, p.status, p.winning_option_id, p.ratings_reversible, s.status as series_status, q.outcome,
      (select o.id from public.prediction_options o
       where o.prediction_id = p.id and o.option_key = q.outcome) as option_id
    from public.predictions p
    join catalog.fixture_questions q on q.id = p.fixture_question_id
    left join public.series s on s.id = p.series_id
    where q.id = any(v_changed)
      and p.status in ('revealed', 'no_result')
      and p.revealed_by_crow
      and p.corrected_by is null
    order by p.deadline, p.series_prediction_number, p.id
  loop
    if v_item.series_status is distinct from 'active'
      or (v_item.status = 'revealed' and not v_item.ratings_reversible)
      or (v_item.outcome <> 'no_result' and v_item.option_id is null)
    then
      v_not_fixed := v_not_fixed + 1;
      continue;
    end if;

    begin
      perform private.correct_prediction(
        v_item.id, v_item.room_id,
        case when v_item.outcome = 'no_result' then 'no_result' else 'win' end,
        v_item.option_id, null, null
      );
      v_fixed := v_fixed + 1;
    exception when sqlstate 'P0001' then
      -- Already that result (e.g. nobody picked the new winner either).
      null;
    end;
  end loop;

  v_revealed := private.reveal_confirmed_fixture_questions(p_fixture_id);

  return json_build_object(
    'fixture', private.admin_fixture_json(p_fixture_id),
    'revealed', v_revealed,
    'fixed', v_fixed,
    'not_fixed', v_not_fixed
  );
end;
$$;

-- ------------------------------------------------------------
-- Admin: competitions and fixture questions
-- ------------------------------------------------------------

-- Every competition, on or off, with how many rooms follow it.
create or replace function public.admin_get_competitions()
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  return (
    select coalesce(json_agg(json_build_object(
      'id', c.id,
      'name', c.name,
      -- The tag its questions get, and whether an admin set it.
      'tag', private.competition_tag(c.tag, c.name, c.sport),
      'tag_is_custom', c.tag is not null,
      'archived_at', c.archived_at,
      'sport', c.sport,
      'provider', c.provider,
      'provider_ref', c.provider_ref,
      'kind', c.kind,
      'starts_on', c.starts_on,
      'ends_on', c.ends_on,
      'region', c.region,
      'season', c.current_season,
      'active', c.active,
      'synced_at', c.synced_at,
      'last_sync_error', c.last_sync_error,
      'last_sync_error_at', c.last_sync_error_at,
      'rooms', (select count(*)::int from public.room_competitions rc where rc.competition_id = c.id),
      'upcoming', (
        select count(*)::int from catalog.fixtures f
        where f.competition_id = c.id and f.status = 'scheduled' and f.kickoff_at > now()
      )
    -- Current first: leagues (no dates), then series newest first; then the
    -- finished ones (ended or archived), latest first.
    ) order by
      -- coalesce: no end date means not over (a null would sort last).
      (c.archived_at is not null or coalesce(c.ends_on < current_date, false)),
      c.starts_on desc nulls first,
      c.display_order,
      c.name
    ), '[]'::json)
    from catalog.competitions c
  );
end;
$$;

-- Files a competition away, or brings it back. Archiving switches it off
-- (not synced or offered); questions rooms already have still get their
-- results. Brought back, it stays off until an admin turns it on.
create or replace function public.admin_set_competition_archived(
  p_competition_id uuid,
  p_archived       boolean
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  update catalog.competitions
  set archived_at = case when p_archived then coalesce(archived_at, now()) end,
      active = case when p_archived then false else active end
  where id = p_competition_id;

  if not found then
    raise exception 'Competition not found' using errcode = 'P0002';
  end if;

  return json_build_object('id', p_competition_id, 'archived', p_archived);
end;
$$;

-- Turns a competition on or off for every room. Off: it isn't synced or
-- offered, but questions rooms already have still get their results here.
create or replace function public.admin_set_competition_active(
  p_competition_id uuid,
  p_active         boolean
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  -- Turning one on brings it out of the archive too.
  update catalog.competitions
  set active = p_active,
      archived_at = case when p_active then null else archived_at end
  where id = p_competition_id;
  if not found then
    raise exception 'Competition not found' using errcode = 'P0002';
  end if;

  return json_build_object('id', p_competition_id, 'active', p_active);
end;
$$;

-- Sets the tag a competition's questions get in rooms (null or blank goes
-- back to the default: the name when it fits, else the sport). Questions
-- rooms already added from it, still linked to it (a host's edit unlinks
-- one), swap the old tag for the new one.
create or replace function public.admin_set_competition_tag(
  p_competition_id uuid,
  p_tag            text
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_competition catalog.competitions%rowtype;
  v_old text;
  v_new text;
  v_tag text := nullif(btrim(p_tag), '');
  v_updated int := 0;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if v_tag is not null and char_length(v_tag) > 24 then
    raise exception 'A tag is 24 characters at most' using errcode = 'P0001';
  end if;

  select * into v_competition from catalog.competitions where id = p_competition_id for update;
  if not found then
    raise exception 'Competition not found' using errcode = 'P0002';
  end if;

  v_old := private.competition_tag(v_competition.tag, v_competition.name, v_competition.sport);
  v_new := private.competition_tag(v_tag, v_competition.name, v_competition.sport);

  update catalog.competitions set tag = v_tag where id = p_competition_id;

  if v_new is distinct from v_old then
    -- Room questions linked to this competition's matches that carry the old tag.
    create temporary table _retag on commit drop as
    select t.id, t.prediction_id
    from public.prediction_tags t
    join public.predictions p on p.id = t.prediction_id
    join catalog.fixture_questions q on q.id = p.fixture_question_id
    join catalog.fixtures f on f.id = q.fixture_id
    where f.competition_id = p_competition_id
      and lower(t.tag) = lower(v_old);

    -- A question that already has the new tag just loses the old one.
    delete from public.prediction_tags t
    using _retag r
    where t.id = r.id
      and exists (
        select 1 from public.prediction_tags other
        where other.prediction_id = r.prediction_id
          and other.id <> r.id
          and lower(other.tag) = lower(v_new)
      );

    update public.prediction_tags t
    set tag = v_new
    from _retag r
    where t.id = r.id;
    get diagnostics v_updated = row_count;

    drop table _retag;
  end if;

  return json_build_object(
    'id', p_competition_id,
    'tag', v_new,
    'tag_is_custom', v_tag is not null,
    'questions_retagged', v_updated
  );
end;
$$;

-- Asks the sync-fixtures function to sync now: every active competition,
-- or one provider's. False when the sync isn't set up (fixture_sync_secret
-- missing).
create or replace function public.admin_request_fixture_sync(p_provider text default null)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if not exists (select 1 from private.notification_config where key = 'fixture_sync_secret') then
    return false;
  end if;

  perform private.request_fixture_sync(p_provider);
  return true;
end;
$$;

-- Upcoming fixtures (optionally one competition's) with every question
-- that fits, shown or hidden, and how many rooms have each.
create or replace function public.admin_get_fixtures(
  p_competition_id uuid default null,
  p_days           integer default 14
)
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 14), 1), 60);
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  return (
    select coalesce(json_agg(json_build_object(
      'id', f.id,
      'competition_name', c.name,
      'round_label', f.round_label,
      'kickoff_at', f.kickoff_at,
      'format', f.match_format,
      'label', f.label,
      'venue', f.venue,
      'home', h.short_name,
      'away', a.short_name,
      'questions', (
        select coalesce(json_agg(json_build_object(
          'id', q.id,
          'title', q.title,
          'description', q.description,
          'options', q.options,
          'hidden', q.hidden,
          -- A one-off question an admin wrote for this match.
          'extra', q.template_id is null,
          'closes_before', coalesce(t.close_minutes_before, 0),
          'customized', q.customized_at is not null,
          'rooms', (select count(*)::int from public.predictions p
                    where p.fixture_question_id = q.id and p.status <> 'cancelled')
        ) order by q.display_order, q.created_at), '[]'::json)
        from catalog.fixture_questions q
        left join catalog.question_templates t on t.id = q.template_id
        where q.fixture_id = f.id
          and (q.template_id is null or private.template_fits(t.active, t.stages, t.formats, f.stage_kind, f.match_format))
      )
    ) order by f.kickoff_at, h.short_name), '[]'::json)
    from catalog.fixtures f
    join catalog.competitions c on c.id = f.competition_id
    join catalog.teams h on h.id = f.home_team_id
    join catalog.teams a on a.id = f.away_team_id
    where (p_competition_id is null or c.id = p_competition_id)
      and f.status = 'scheduled'
      and f.kickoff_at > now()
      and f.kickoff_at < now() + make_interval(days => v_days)
  );
end;
$$;

-- Platform admins hide, show or reword one match's question. Rewording
-- (title, description) sticks through later syncs; p_reset puts the
-- template's wording back. Rooms that already added it keep their copy.
create or replace function public.admin_update_fixture_question(
  p_question_id uuid,
  p_hidden      boolean default null,
  p_title       text default null,
  p_description text default null,
  p_reset       boolean default false
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_question catalog.fixture_questions%rowtype;
  v_title    text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  select * into v_question from catalog.fixture_questions where id = p_question_id for update;
  if not found then
    raise exception 'Question not found' using errcode = 'P0002';
  end if;

  if char_length(v_title) > 200 then
    raise exception 'Keep the question under 200 characters' using errcode = 'P0001';
  end if;
  if char_length(v_description) > 500 then
    raise exception 'Keep the description under 500 characters' using errcode = 'P0001';
  end if;

  if p_reset then
    update catalog.fixture_questions
    set customized_at = null, updated_at = now()
    where id = p_question_id;
    perform private.refresh_fixture_questions(v_question.fixture_id);
  elsif v_title is not null
    and (v_title, v_description) is distinct from (v_question.title, v_question.description)
  then
    update catalog.fixture_questions
    set title = v_title,
        description = v_description,
        customized_at = now(),
        updated_at = now()
    where id = p_question_id;
  end if;

  if p_hidden is not null then
    update catalog.fixture_questions
    set hidden = p_hidden, updated_at = now()
    where id = p_question_id;
  end if;

  return (
    select json_build_object(
      'id', q.id,
      'title', q.title,
      'description', q.description,
      'hidden', q.hidden,
      'customized', q.customized_at is not null
    )
    from catalog.fixture_questions q
    where q.id = p_question_id
  );
end;
$$;

-- Platform admins add a competition the provider lists (a cricket series
-- found with the search in /admin), or turn an existing one back on. It's
-- synced on the next run; Sync in /admin starts it now.
create or replace function public.admin_add_competition(
  p_provider     text,
  p_provider_ref text,
  p_name         text,
  p_sport        text,
  p_kind         text,
  p_region       text default null,
  p_starts_on    date default null,
  p_ends_on      date default null,
  -- The tag its questions get; null for the default (see competition_tag).
  p_tag          text default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if nullif(btrim(p_name), '') is null or nullif(btrim(p_provider_ref), '') is null then
    raise exception 'A competition needs a name and the provider''s id' using errcode = 'P0001';
  end if;

  if char_length(btrim(coalesce(p_tag, ''))) > 24 then
    raise exception 'A tag is 24 characters at most' using errcode = 'P0001';
  end if;

  insert into catalog.competitions (
    sport, name, format, kind, region, provider, provider_ref, active, display_order, starts_on, ends_on, tag
  )
  values (
    p_sport, left(btrim(p_name), 40),
    case p_kind when 'league' then 'league' when 'cup' then 'knockout' else 'mixed' end,
    p_kind, nullif(btrim(p_region), ''), p_provider, p_provider_ref, true,
    coalesce((select max(display_order) + 1 from catalog.competitions), 1),
    p_starts_on, p_ends_on, nullif(btrim(p_tag), '')
  )
  on conflict (provider, provider_ref) do update
    set active = true,
        archived_at = null,
        tag = coalesce(excluded.tag, catalog.competitions.tag),
        starts_on = coalesce(excluded.starts_on, catalog.competitions.starts_on),
        ends_on = coalesce(excluded.ends_on, catalog.competitions.ends_on)
  returning id into v_id;

  return json_build_object('id', v_id);
end;
$$;

-- Platform admins write a one-off question for one match ("Will Kohli score
-- 50?"), offered to rooms next to the ready-made ones. No feed can settle
-- it: the admin picks its answer when confirming the match. Options are
-- 2 to 6 labels; their keys are o1, o2, ...
create or replace function public.admin_add_fixture_extra(
  p_fixture_id  uuid,
  p_title       text,
  p_description text,
  p_options     text[]
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_title   text := nullif(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), '');
  v_labels  text[] := array(select btrim(o) from unnest(coalesce(p_options, '{}')) with ordinality as x(o, n) where btrim(o) <> '' order by n);
  v_id      uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if not exists (select 1 from catalog.fixtures where id = p_fixture_id and status = 'scheduled' and kickoff_at > now()) then
    raise exception 'That match has started or isn''t on the list' using errcode = 'P0001';
  end if;

  if v_title is null or char_length(v_title) > 200 then
    raise exception 'Write a question under 200 characters' using errcode = 'P0001';
  end if;

  if cardinality(v_labels) not between 2 and 6 then
    raise exception 'Give 2 to 6 options' using errcode = 'P0001';
  end if;

  if (select count(distinct lower(l)) from unnest(v_labels) l) <> cardinality(v_labels) then
    raise exception 'Each option must be different' using errcode = 'P0001';
  end if;

  insert into catalog.fixture_questions (fixture_id, template_id, title, description, options, display_order, hidden)
  values (
    p_fixture_id,
    null,
    v_title,
    nullif(btrim(coalesce(p_description, '')), ''),
    (select jsonb_agg(jsonb_build_object('key', 'o' || n, 'label', l) order by n)
     from unnest(v_labels) with ordinality as x(l, n)),
    100 + (select count(*) from catalog.fixture_questions where fixture_id = p_fixture_id and template_id is null),
    false
  )
  returning id into v_id;

  return json_build_object('id', v_id);
end;
$$;

-- Platform admins remove a one-off question no room has added yet (once a
-- room has it, hide it instead).
create or replace function public.admin_delete_fixture_extra(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if exists (select 1 from public.predictions where fixture_question_id = p_question_id) then
    raise exception 'A room has added it: hide it instead' using errcode = 'P0001';
  end if;

  delete from catalog.fixture_questions
  where id = p_question_id and template_id is null;

  if not found then
    raise exception 'Only an extra question can be removed' using errcode = 'P0002';
  end if;
end;
$$;
