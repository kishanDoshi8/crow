-- Tables and functions start closed. Supabase grants new objects to anon and
-- authenticated by default; here anon gets nothing and authenticated can
-- only read, so each table opts in with its own grants (in its policies
-- file) and each RPC is granted in _final/function_execute_grants.sql.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke insert, update, delete, truncate, references, trigger on tables from authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;
