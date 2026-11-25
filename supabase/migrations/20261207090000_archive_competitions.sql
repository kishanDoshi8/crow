-- Archiving competitions in /admin: a platform admin files one away (and
-- switches it off); /admin lists current ones first (leagues, then series
-- newest first) and finished ones (ended or archived) after. Turning one
-- back on, or adding it again, takes it out of the archive.

alter table catalog.competitions add column if not exists archived_at timestamptz;


-- Every competition, on or off, with how many rooms follow it.
create or replace function public.admin_get_competitions()
returns json
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  return (
    select coalesce(json_agg(json_build_object(
      'id', c.id,
      'name', c.name,
      -- The tag its questions get, and whether an admin set it.
      'tag', private.competition_tag(c.tag, c.name, c.sport),
      'tag_is_custom', c.tag is not null,
      'archived_at', c.archived_at,
      'sport', c.sport,
      'provider', c.provider,
      'provider_ref', c.provider_ref,
      'kind', c.kind,
      'starts_on', c.starts_on,
      'ends_on', c.ends_on,
      'region', c.region,
      'season', c.current_season,
      'active', c.active,
      'synced_at', c.synced_at,
      'last_sync_error', c.last_sync_error,
      'last_sync_error_at', c.last_sync_error_at,
      'rooms', (select count(*)::int from public.room_competitions rc where rc.competition_id = c.id),
      'upcoming', (
        select count(*)::int from catalog.fixtures f
        where f.competition_id = c.id and f.status = 'scheduled' and f.kickoff_at > now()
      )
    -- Current first: leagues (no dates), then series newest first; then the
    -- finished ones (ended or archived), latest first.
    ) order by
      -- coalesce: no end date means not over (a null would sort last).
      (c.archived_at is not null or coalesce(c.ends_on < current_date, false)),
      c.starts_on desc nulls first,
      c.display_order,
      c.name
    ), '[]'::json)
    from catalog.competitions c
  );
end;
$$;

-- Files a competition away, or brings it back. Archiving switches it off
-- (not synced or offered); questions rooms already have still get their
-- results. Brought back, it stays off until an admin turns it on.
create or replace function public.admin_set_competition_archived(
  p_competition_id uuid,
  p_archived       boolean
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  update catalog.competitions
  set archived_at = case when p_archived then coalesce(archived_at, now()) end,
      active = case when p_archived then false else active end
  where id = p_competition_id;

  if not found then
    raise exception 'Competition not found' using errcode = 'P0002';
  end if;

  return json_build_object('id', p_competition_id, 'archived', p_archived);
end;
$$;

revoke execute on function public.admin_set_competition_archived(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_competition_archived(uuid, boolean) to authenticated;

-- Turns a competition on or off for every room. Off: it isn't synced or
-- offered, but questions rooms already have still get their results here.
create or replace function public.admin_set_competition_active(
  p_competition_id uuid,
  p_active         boolean
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  -- Turning one on brings it out of the archive too.
  update catalog.competitions
  set active = p_active,
      archived_at = case when p_active then null else archived_at end
  where id = p_competition_id;
  if not found then
    raise exception 'Competition not found' using errcode = 'P0002';
  end if;

  return json_build_object('id', p_competition_id, 'active', p_active);
end;
$$;

-- Platform admins add a competition the provider lists (a cricket series
-- found with the search in /admin), or turn an existing one back on. It's
-- synced on the next run; Sync in /admin starts it now.
create or replace function public.admin_add_competition(
  p_provider     text,
  p_provider_ref text,
  p_name         text,
  p_sport        text,
  p_kind         text,
  p_region       text default null,
  p_starts_on    date default null,
  p_ends_on      date default null,
  -- The tag its questions get; null for the default (see competition_tag).
  p_tag          text default null
)
returns json
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
begin
  if not private.is_platform_admin() then
    raise exception 'Only platform admins can do this' using errcode = 'P0012';
  end if;

  if nullif(btrim(p_name), '') is null or nullif(btrim(p_provider_ref), '') is null then
    raise exception 'A competition needs a name and the provider''s id' using errcode = 'P0001';
  end if;

  if char_length(btrim(coalesce(p_tag, ''))) > 24 then
    raise exception 'A tag is 24 characters at most' using errcode = 'P0001';
  end if;

  insert into catalog.competitions (
    sport, name, format, kind, region, provider, provider_ref, active, display_order, starts_on, ends_on, tag
  )
  values (
    p_sport, left(btrim(p_name), 40),
    case p_kind when 'league' then 'league' when 'cup' then 'knockout' else 'mixed' end,
    p_kind, nullif(btrim(p_region), ''), p_provider, p_provider_ref, true,
    coalesce((select max(display_order) + 1 from catalog.competitions), 1),
    p_starts_on, p_ends_on, nullif(btrim(p_tag), '')
  )
  on conflict (provider, provider_ref) do update
    set active = true,
        archived_at = null,
        tag = coalesce(excluded.tag, catalog.competitions.tag),
        starts_on = coalesce(excluded.starts_on, catalog.competitions.starts_on),
        ends_on = coalesce(excluded.ends_on, catalog.competitions.ends_on)
  returning id into v_id;

  return json_build_object('id', v_id);
end;
$$;
