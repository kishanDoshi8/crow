create schema if not exists private;
-- Real competitions, fixtures and ready-made questions (event packs), shared
-- by every room. Written by the fixture sync and platform admins; rooms read
-- it through RPCs only.
create schema if not exists catalog;
-- Read-only views for product metrics (docs/analytics.md). Not exposed
-- through the API: read them in the Supabase SQL editor.
create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;
