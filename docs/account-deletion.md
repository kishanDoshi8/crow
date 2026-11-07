# Account deletion

Players ask for deletion from the room menu (Account → Delete account), which
opens `/account/delete`. Requests are carried out by hand for now; the page
promises it happens **within 30 days** and that we **email them when it's
done**.

## Process pending requests

In the Supabase SQL editor (it runs as `postgres`, which is the only role
allowed to call `private.delete_account`):

```sql
-- Who's waiting, oldest first, with the address to email afterwards.
select r.requested_at, p.id as player_id, p.username, u.email, r.reason
from public.account_deletion_requests r
join public.players p on p.id = r.player_id
left join auth.users u on u.id = p.user_id
where r.status = 'pending'
order by r.requested_at;
```

Note the email, then for each player:

```sql
select private.delete_account('<player_id>');
```

Then email them that it's done. Do it in that order: the email address is
deleted with the account.

## What `private.delete_account` does

- Every room they're in: open bets are refunded and they leave the room.
  Rooms they own pass to the next most senior member (organizer, then
  resolver, then whoever joined first); a room with nobody else is closed.
- The player row stays so bets, wallets, results and standings still add up,
  but it's renamed `Ghost crow XXXXXX` and detached from the login.
- Push subscriptions and notification preferences are deleted.
- The `auth.users` row (email, password, Google identity) is deleted.
- The request is marked `done` and its free-text reason cleared.

It can't be undone.

## Leaving vs removed vs deleted

`room_former_members` records why someone isn't in a room any more:

| status    | how                     | can rejoin with the code?                  |
|-----------|-------------------------|--------------------------------------------|
| `left`    | Room menu → Leave room  | Yes, with their old rating and streaks     |
| `removed` | Owner removes them      | Only after the owner taps "Let back in"    |
| `deleted` | `private.delete_account`| No                                         |

Their past bets and results stay either way, so history keeps their name.
