-- Checked only inside RPCs (private.is_platform_admin): no direct access.
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;
