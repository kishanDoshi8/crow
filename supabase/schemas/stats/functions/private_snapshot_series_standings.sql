-- One series' standings as they stood when the week ended. Safe to repeat.
create or replace function private.snapshot_one_series(p_series_id uuid, p_week_key text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  insert into public.series_standing_snapshots (series_id, player_id, week_key, rank, is_ranked, balance)
  select p_series_id, st.player_id, p_week_key, st.rank, st.is_ranked, st.balance
  from private.series_standings(p_series_id) st
  on conflict (series_id, player_id, week_key) do nothing;
end;
$$;

-- Every active series' snapshot, in one go (the Monday job runs them one by
-- one through private.run_weekly_jobs instead). Safe to run twice in a week.
create or replace function private.snapshot_series_standings()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_week_key text := private.current_week_key();
  v_series   record;
  v_count    integer := 0;
begin
  for v_series in
    select s.id from public.series s where s.status = 'active'
  loop
    perform private.snapshot_one_series(v_series.id, v_week_key);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
