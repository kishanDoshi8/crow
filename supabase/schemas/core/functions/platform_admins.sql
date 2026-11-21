-- Whether the signed-in player is on the Crow team (public.platform_admins).
-- Every admin RPC checks this first; the /admin page only hides itself.
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.platform_admins
    where player_id = private.get_player_id_from_auth()
  );
$$;

-- For the app: show the way into /admin.
create or replace function public.get_my_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select private.is_platform_admin();
$$;
