-- Finished series' results never change; the only edit allowed is marking a
-- placement or award collected (collected_at set once).
create or replace function private.prevent_series_result_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Series results are immutable once generated' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'collected_at') is distinct from (to_jsonb(old) - 'collected_at') then
      raise exception 'Series results are immutable once generated' using errcode = 'P0001';
    end if;

    if old.collected_at is null and new.collected_at is not null then
      return new;
    end if;

    if new.collected_at is not distinct from old.collected_at then
      return new;
    end if;

    raise exception 'Series results are immutable once generated' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
