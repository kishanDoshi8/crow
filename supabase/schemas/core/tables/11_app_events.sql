-- First-party product events that leave no other trace in the database:
-- landing page visits and button taps, the launch video's sound being turned
-- on, account creation. (landing_demo_pick is the old example question, kept
-- for its history.)
-- Everything else (rooms, picks, results) is measured from its own tables
-- by the views in the analytics schema. Written only through
-- public.log_app_event; nobody reads it from the app.
--
-- visitor_id is a random id the browser keeps in local storage, so a visit
-- can be followed to a new account without cookies or third-party trackers.
create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  name text not null check (name in (
    'landing_view', 'landing_start_room', 'landing_join', 'landing_demo_pick',
    'landing_video_sound', 'account_created'
  )),
  visitor_id uuid not null,
  player_id uuid references public.players(id) on delete set null,
  -- Where the visitor came from: ?ref= or ?utm_source= on the landing URL.
  source text check (source is null or char_length(source) <= 64),
  path text check (path is null or char_length(path) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists idx_app_events_name_created on public.app_events(name, created_at desc);
create index if not exists idx_app_events_visitor on public.app_events(visitor_id, name, created_at desc);

alter table public.app_events enable row level security;
revoke all on public.app_events from anon, authenticated;
