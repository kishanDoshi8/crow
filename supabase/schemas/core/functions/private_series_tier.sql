-- How much a finished series' trophies are worth, from its size.
-- Players counts only those who qualified (see private.series_required_bets).
create or replace function private.series_tier(
  p_games integer,
  p_players integer
)
returns text
language sql
immutable
set search_path = public, private
as $$
  select case
    when coalesce(p_games, 0) <= 7 or coalesce(p_players, 0) <= 2 then 'minor'
    when p_games >= 20 and p_players >= 5 then 'major'
    else 'standard'
  end;
$$;

-- How many of a series' last settled predictions count as its finish.
create or replace function private.series_finish_window(
  p_games integer
)
returns integer
language sql
immutable
set search_path = public, private
as $$
  select greatest(3, ceil(coalesce(p_games, 0) * 0.25))::int;
$$;

-- How impressive an award was for its series: gold, silver or bronze.
-- Compares the type as text so new award types can be added and used in one migration.
create or replace function private.series_award_tier(
  p_award_type public.series_award_type,
  p_value numeric,
  p_games integer,
  p_starting_stack integer
)
returns text
language sql
immutable
set search_path = public, private
as $$
  select case p_award_type::text
    when 'LONGEST_STREAK' then case
      when p_value >= 4 and p_value >= 0.25 * greatest(p_games, 1) then 'gold'
      when p_value >= 3 and p_value >= 0.15 * greatest(p_games, 1) then 'silver'
      else 'bronze'
    end
    when 'BIGGEST_PROFIT' then case
      when p_value >= 1.0 * greatest(p_starting_stack, 1) then 'gold'
      when p_value >= 0.5 * greatest(p_starting_stack, 1) then 'silver'
      else 'bronze'
    end
    when 'MOST_POINTS_RISKED' then case
      when p_value >= 5 * greatest(p_starting_stack, 1) then 'gold'
      when p_value >= 2 * greatest(p_starting_stack, 1) then 'silver'
      else 'bronze'
    end
    when 'EVER_PRESENT' then case
      when p_value >= 20 then 'gold'
      when p_value >= 10 then 'silver'
      else 'bronze'
    end
    -- Win rate, as a percentage of settled bets.
    when 'SHARPSHOOTER' then case
      when p_value >= 75 then 'gold'
      when p_value >= 60 then 'silver'
      else 'bronze'
    end
    -- Payout multiplier of the winning bet.
    when 'UNDERDOG' then case
      when p_value >= 5 then 'gold'
      when p_value >= 3 then 'silver'
      else 'bronze'
    end
    -- Places climbed from the lowest weekly rank.
    when 'COMEBACK' then case
      when p_value >= 5 then 'gold'
      when p_value >= 3 then 'silver'
      else 'bronze'
    end
    -- Wins over the final stretch (see private.series_finish_window).
    when 'HOT_FINISH' then case
      when p_value >= private.series_finish_window(p_games) then 'gold'
      when p_value >= 0.75 * private.series_finish_window(p_games) then 'silver'
      else 'bronze'
    end
    else 'bronze'
  end;
$$;
