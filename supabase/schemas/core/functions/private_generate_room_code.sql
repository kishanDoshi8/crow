create or replace function private.generate_room_code()
returns text
language plpgsql
set search_path = public, private
as $$
declare
  v_code   text;
  v_exists boolean;
begin
  loop
    v_code := upper(substring(md5(random()::text) from 1 for 6));
    select count(*) > 0 into v_exists
    from public.rooms where room_code = v_code;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;
