create or replace function private.current_week_key()
returns text
language sql
set search_path = public, private
as $$
  select to_char(now() at time zone 'UTC', 'IYYY"-W"IW');
$$;
