#!/usr/bin/env bash
# Proves supabase/schemas describes the same database as supabase/migrations.
#
# Builds a fresh database from the schema files, in the order config.toml's
# schema_paths gives (so it also proves they apply cleanly in that order),
# then compares every table, column, constraint, index, policy, grant,
# function, trigger, view, enum and realtime publication in public and
# private with an already migrated database. Exits 1 and prints the
# differences if they don't match.
#
# Usage: supabase/scripts/check-schema-drift.sh [migrated_database]
#   Connection comes from the usual PG* variables (PGHOST, PGPORT, PGUSER,
#   PGPASSWORD), defaulting to the local Supabase stack (supabase db start),
#   so `npm run db:drift` just works there. The user must be able to create
#   databases.
set -euo pipefail

# Defaults: the local Supabase stack.
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-54322}"
export PGUSER="${PGUSER:-postgres}" PGPASSWORD="${PGPASSWORD:-postgres}"

migrated_db="${1:-postgres}"
check_db="schema_drift_check"
here="$(cd "$(dirname "$0")" && pwd)"
supabase_dir="$(dirname "$here")"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

psql_quiet() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "Building $check_db from supabase/schemas..."
psql_quiet -d "$migrated_db" -c "drop database if exists $check_db" -c "create database $check_db"
psql_quiet -d "$check_db" -c "alter database $check_db set search_path = \"\$user\", public, extensions"
psql_quiet -d "$check_db" < "$here/schema-check-bootstrap.sql"

# The schema files, in config.toml order (each file once).
python3 - "$supabase_dir" > "$work/files" <<'PY'
import glob, os, sys, tomllib
root = sys.argv[1]
with open(os.path.join(root, "config.toml"), "rb") as f:
    patterns = tomllib.load(f)["db"]["migrations"]["schema_paths"]
seen = []
for pattern in patterns:
    for path in sorted(glob.glob(os.path.join(root, pattern), recursive=True)):
        path = os.path.normpath(path)
        if path not in seen:
            seen.append(path)
listed = set(seen)
missing = sorted(
    p for p in glob.glob(os.path.join(root, "schemas", "**", "*.sql"), recursive=True)
    if os.path.normpath(p) not in listed
)
if missing:
    sys.exit("Schema files not covered by schema_paths in config.toml:\n  " + "\n  ".join(missing))
print("\n".join(seen))
PY

# Like pg_dump's restores, don't check function bodies while loading: a SQL
# function may call one from a file that comes later. The migrations, which
# do check them, and the pgTAP tests cover the bodies.
while read -r file; do
  if ! PGOPTIONS="-c check_function_bodies=off" psql_quiet -d "$check_db" < "$file" > "$work/out" 2>&1; then
    echo "::error::${file#"$supabase_dir"/} failed to apply (check its place in schema_paths):"
    grep -v NOTICE "$work/out" >&2
    exit 1
  fi
done < "$work/files"

psql_quiet -d "$migrated_db" < "$here/schema_catalog.sql" > "$work/migrated.txt"
psql_quiet -d "$check_db" < "$here/schema_catalog.sql" > "$work/schemas.txt"
psql_quiet -d "$migrated_db" -c "drop database if exists $check_db"

if diff -u "$work/migrated.txt" "$work/schemas.txt" > "$work/diff"; then
  echo "supabase/schemas matches the migrations ($(wc -l < "$work/migrated.txt") objects checked)."
else
  echo "::error::supabase/schemas has drifted from the migrations."
  echo "Lines with - are only in the migrated database; + only in supabase/schemas."
  grep '^[-+][^-+]' "$work/diff"
  exit 1
fi
