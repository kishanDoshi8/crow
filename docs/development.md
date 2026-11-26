# Running Crow locally

Crow is an npm workspaces monorepo: the web app is in `apps/web`, and the
database, Edge Functions and SQL tests are in `supabase/`.

## Prerequisites

- Node.js 24 (see `.nvmrc`) and npm
- Docker, for the local Supabase stack
- The [Supabase CLI](https://supabase.com/docs/guides/cli)

## Start it

From the repo root:

```bash
npm install
```

```bash
supabase start
```

`supabase start` runs Postgres, Auth and the API locally and applies every
migration. It prints a local API URL and anon key. Copy the env template and
put those two values in it:

```bash
cp apps/web/.env.example apps/web/.env.local
```

```bash
npm run dev
```

The other variables in `.env.example` (push notifications, Sentry, short
invite links) are optional and can stay empty locally.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the web app |
| `npm run lint` / `npm run typecheck` | What CI runs on every pull request |
| `npm run check` | Lint, typecheck and build |
| `supabase test db` | Run the SQL tests in `supabase/tests/` |
| `npm run db:reset` | Rebuild the local database from the migrations |
| `npm run db:new <name>` | Create a new migration |
| `npm run db:drift` | Check `supabase/schemas/` matches the migrations |
| `npm run db:types` | Regenerate the TypeScript types after a schema change |

## Where to read next

- [database-schema.md](database-schema.md): how `schemas/` and `migrations/` relate
- [database-security.md](database-security.md): the rules every new table and function follows
- [engineering-standards.md](engineering-standards.md): structure and conventions for `apps/web`
- [server-setup.md](server-setup.md): production server and releases
