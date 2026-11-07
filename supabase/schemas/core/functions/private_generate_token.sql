create or replace function private.generate_token()
returns text
language sql
set search_path = public, private
as $$
  select encode(extensions.gen_random_bytes(16), 'hex');
$$;
