# Database Security Rules

The browser talks to Postgres directly with the public anon key, so the database is the only thing keeping the scoreboard honest. These rules are enforced by `supabase/tests/security_hardening.sql`, which runs in CI.

## Writes

- The app never writes tables directly. Every change goes through a `security definer` RPC that checks who is calling.
- `anon` and `authenticated` have no `insert`, `update`, `delete` or `truncate` privilege on any public table or view.
- Don't add policies that allow writes (for example `for update using (user_id = auth.uid())`). Add or extend an RPC instead.

## Reads

- Logged-out users (`anon`) can't read anything.
- Logged-in users can only read rows belonging to rooms they are a member of. Policies use the helpers in `private`: `is_room_member`, `can_view_prediction`, `can_view_series` and `shares_room_with`.
- Views must be created `with (security_invoker = true)`, otherwise they run as their owner and skip RLS.
- `players` is readable column by column. `player_token`, `user_id` and `last_visited_room_id` are never granted.
- Non-members see a room only through `get_room_by_code`, which returns just what the join screen needs.

## Functions

- Function access is an allowlist in `supabase/schemas/_final/function_execute_grants.sql`. Supabase grants new public functions to `anon` and `authenticated` by default, and Postgres grants them to `PUBLIC`, so a new migration that creates a function must also revoke it:

  ```sql
  revoke execute on function public.my_function(uuid) from public, anon, authenticated;
  grant execute on function public.my_function(uuid) to authenticated; -- only if the app calls it
  ```

- When the app starts calling a new RPC, add it to the grants file and to the allowlist in `supabase/tests/security_hardening.sql`. The test fails if the two drift apart.
- Internal functions (stats, ratings, settlement) are called from inside other RPCs and need no grant.

## Points

- Points live in `series_wallets`, one row per player per series. `players.points_balance` and `points_in_escrow` are retired and stay at 0.
- RPCs that move points lock the wallet row (`select ... for update`) before checking the balance, and lock the prediction before changing its status.
- `series_wallets_escrow_within_balance` guarantees escrowed points never exceed the balance.
- Only `private.ensure_series_wallet` creates wallets and only `private.pay_series_topups` (the Monday cron job) adds top-ups.

## Running the tests

```bash
npx supabase@2.120.0 db start
npx supabase@2.120.0 test db
```
