create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  -- Hours after the deadline before staff get a "result needed" push.
  result_reminder_hours integer not null default 3 check (result_reminder_hours between 1 and 48),
  -- Shown in Explore (public), or reached only by invite link or code (private).
  listed boolean not null default false,
  -- open: anyone with the link or code joins straight away · request: owners
  -- and organizers let each person in.
  join_policy text not null default 'open' check (join_policy in ('open', 'request')),
  -- Most members the room can have. A hard limit set by the operator in the
  -- database; no app call changes it.
  member_limit integer not null default 50 check (member_limit >= 1)
);

-- Explore lists active public rooms.
create index if not exists idx_rooms_listed on public.rooms (created_at desc) where listed and status = 'active';
