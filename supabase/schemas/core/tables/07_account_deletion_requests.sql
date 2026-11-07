-- Players asking for their account to be deleted. Processed by hand for now
-- with private.delete_account (see docs/account-deletion.md).
create table if not exists public.account_deletion_requests (
  player_id uuid primary key references public.players(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 500),
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'done')),
  requested_at timestamptz not null default now(),
  -- When it was cancelled or carried out.
  closed_at timestamptz
);

create index if not exists idx_account_deletion_requests_pending
  on public.account_deletion_requests (requested_at)
  where status = 'pending';
