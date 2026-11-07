create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  player_token text not null unique,
  points_balance integer not null default 0 check (points_balance >= 0),
  points_in_escrow integer not null default 0 check (points_in_escrow >= 0),
  total_won integer not null default 0,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_claim_at timestamptz,
  last_visited_room_id uuid references public.rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  user_id uuid unique references auth.users(id) on delete cascade,
  unique (username)
);

-- From the retired global wallet. NOT VALID: enforced on new writes only.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'players_escrow_within_balance'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players
      add constraint players_escrow_within_balance
      check (points_in_escrow <= points_balance) not valid;
  end if;
end $$;
create index if not exists idx_players_total_won on public.players(total_won desc);
create index if not exists idx_players_username on public.players(lower(username));
create index if not exists idx_players_user_id on public.players(user_id);
create index if not exists idx_players_last_visited_room_id on public.players(last_visited_room_id);
