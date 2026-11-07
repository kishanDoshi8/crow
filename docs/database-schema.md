# Database schema files

`supabase/migrations/` is what runs against the database. `supabase/schemas/`
is the readable picture of the database as it is now: one file per table,
function, policy set or trigger set. The two must always agree, and CI checks
that they do.

## Changing the database

1. Edit or add the file in `supabase/schemas/` (the table, the function...).
2. Write a migration in `supabase/migrations/` that makes the same change.
   For a function, the migration can include the schema file's text as is.
3. Run the drift check against your local stack:

   ```bash
   supabase db reset   # applies every migration
   npm run db:drift    # builds a database from supabase/schemas and compares
   ```

   It prints every difference (`-` only in the migrated database, `+` only in
   the schema files) and fails CI the same way.

## How the files are applied

`schema_paths` in `supabase/config.toml` sets the order, which matters:

1. `_global/`: schemas, extensions, default privileges (everything starts
   closed: anon gets nothing, authenticated can only read).
2. Tables, listed one by one in foreign-key order. **A new table file must be
   added to this list**, after every table it references; the drift check
   fails if a schema file isn't covered.
3. Functions, views, policies, triggers.
4. `_final/`: function grants (the RPC allowlist) and the realtime
   publication, which name things defined above.

## What the drift check compares

`supabase/scripts/schema_catalog.sql` lists, for the `public` and `private`
schemas: tables and views (with row level security flags), columns,
constraints, indexes, policies, table and column grants, functions
(signature, settings and a hash of the body), who may execute them,
triggers, enums and the tables published for realtime. Data (seed rows,
cron jobs) isn't compared.
