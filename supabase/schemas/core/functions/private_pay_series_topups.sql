-- Pays one series' weekly top-up, at most once per ISO week, to the players
-- who bet in the series during the week that just ended. Players with nothing
-- left to bet with are topped up too, so going broke never locks anyone out of
-- a series. Returns whether this call paid the week's round.
create or replace function private.pay_one_series_topup(p_series_id uuid, p_week_key text)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_this_week  timestamptz := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
  v_last_week  timestamptz := v_this_week - interval '7 days';
  v_series     public.series%rowtype;
  v_paid       integer;
begin
  select * into v_series
  from public.series s
  where s.id = p_series_id
    and s.status = 'active'
    and s.weekly_topup > 0
    and s.last_topup_week is distinct from p_week_key
  for update;

  if not found then
    return false;
  end if;

  update public.series_wallets w
  set balance = w.balance + v_series.weekly_topup,
      granted = w.granted + v_series.weekly_topup,
      updated_at = now()
  where w.series_id = v_series.id
    and (
      w.balance - w.escrow <= 0
      or exists (
        select 1
        from public.bets b
        join public.predictions p on p.id = b.prediction_id
        where p.series_id = v_series.id
          and b.player_id = w.player_id
          and greatest(b.placed_at, b.updated_at) >= v_last_week
          and greatest(b.placed_at, b.updated_at) < v_this_week
      )
    );
  get diagnostics v_paid = row_count;

  -- Counts every week a top-up round ran; caps what a late joiner can start with.
  update public.series
  set topups_paid = topups_paid + 1,
      last_topup_week = p_week_key,
      last_topup_recipients = v_paid
  where id = v_series.id;

  -- The Monday push goes out from private.notify_one_series_weekly_recap.
  return true;
end;
$$;

-- Every active series' top-up, in one go (the Monday job runs them one by one
-- through private.run_weekly_jobs instead).
create or replace function private.pay_series_topups()
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
    select s.id from public.series s
    where s.status = 'active'
      and s.weekly_topup > 0
      and s.last_topup_week is distinct from v_week_key
  loop
    if private.pay_one_series_topup(v_series.id, v_week_key) then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;
