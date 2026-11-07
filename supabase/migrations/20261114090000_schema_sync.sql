-- ============================================================
-- Migration: schema_sync
-- Description: The last differences between the migrations and
--   supabase/schemas, settled in favour of the schema files (which
--   scripts/check-schema-drift.sh now keeps in step):
--   - series_minimum_predictions_for_awards_check duplicated the column's
--     own check (min_bets_to_rank between 0 and 50).
--   - private.refund_all_bets (v1) has had no callers since
--     resolve_prediction_v2.
--   - pay_series_topups: same code, clearer comment.
-- ============================================================

alter table public.series drop constraint if exists series_minimum_predictions_for_awards_check;

drop function if exists private.refund_all_bets(uuid);

-- Run by the series-weekly-topup cron job every Monday.
-- Pays each active series' weekly top-up, at most once per ISO week, to the
-- players who bet in the series during the week that just ended. Players with
-- nothing left to bet with are topped up too, so going broke never locks
-- anyone out of a series.
create or replace function private.pay_series_topups()
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_week_key   text := private.current_week_key();
  v_this_week  timestamptz := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
  v_last_week  timestamptz := v_this_week - interval '7 days';
  v_series     record;
  v_paid       integer;
  v_count      integer := 0;
begin
  for v_series in
    select s.id, s.room_id, s.title, s.weekly_topup, r.room_code
    from public.series s
    join public.rooms r on r.id = s.room_id
    where s.status = 'active'
      and s.weekly_topup > 0
      and s.last_topup_week is distinct from v_week_key
    for update of s
  loop
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
        last_topup_week = v_week_key,
        last_topup_recipients = v_paid
    where id = v_series.id;

    -- The Monday push goes out from private.notify_weekly_recap(), one per room.

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function private.pay_series_topups() from public, anon, authenticated;
