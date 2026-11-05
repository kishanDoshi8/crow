create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  option_id uuid not null references public.prediction_options(id) on delete cascade,
  amount integer not null check (amount >= 1),
  payout integer,
  -- The rating points this bet moved, so a corrected result can undo them.
  rating_change integer,
  placed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prediction_id, player_id)
);
create index if not exists idx_bets_prediction_option on public.bets(prediction_id, option_id);
create index if not exists idx_bets_player on public.bets(player_id);
create index if not exists idx_bets_prediction_player on public.bets(prediction_id, player_id);
