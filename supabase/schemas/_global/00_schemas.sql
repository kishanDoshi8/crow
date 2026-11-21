create schema if not exists private;
-- Real competitions, fixtures and ready-made questions (event packs), shared
-- by every room. Written by the fixture sync and platform admins; rooms read
-- it through RPCs only.
create schema if not exists catalog;
