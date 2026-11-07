-- Describes everything in the public and private schemas as sorted lines of
-- text, so two databases can be compared with diff. Used by
-- check-schema-drift.sh to prove supabase/schemas matches the migrations.
\pset format unaligned
\pset tuples_only on
\pset pager off

with objects as (
  -- Tables and views, with row level security flags.
  select format('relation %s.%s kind=%s rls=%s force_rls=%s',
           n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity) as line
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and c.relkind in ('r', 'v', 'm', 'p')

  union all
  -- Columns.
  select format('column %s.%s.%s type=%s not_null=%s default=%s generated=%s identity=%s',
           n.nspname, c.relname, a.attname,
           format_type(a.atttypid, a.atttypmod), a.attnotnull,
           pg_get_expr(d.adbin, d.adrelid), a.attgenerated, a.attidentity)
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname in ('public', 'private')
    and c.relkind in ('r', 'v', 'm', 'p')
    and a.attnum > 0
    and not a.attisdropped

  union all
  -- Constraints (by definition, so differently named copies show up).
  select format('constraint %s.%s %s %s',
           n.nspname, c.relname, con.conname, pg_get_constraintdef(con.oid))
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')

  union all
  -- Indexes.
  select format('index %s', pg_get_indexdef(i.indexrelid))
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')

  union all
  -- Policies.
  select format('policy %s.%s %s cmd=%s permissive=%s roles=%s using=%s check=%s',
           schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check)
  from pg_policies
  where schemaname in ('public', 'private')

  union all
  -- Table and column privileges for the API roles.
  select format('grant %s.%s to=%s %s', table_schema, table_name, grantee, privilege_type)
  from information_schema.role_table_grants
  where table_schema in ('public', 'private')
    and grantee in ('anon', 'authenticated', 'service_role', 'public')

  union all
  select format('column_grant %s.%s.%s to=%s %s',
           table_schema, table_name, column_name, grantee, privilege_type)
  from information_schema.column_privileges
  where table_schema in ('public', 'private')
    and grantee in ('anon', 'authenticated')
    -- Whole-table grants already show up above.
    and not exists (
      select 1 from information_schema.role_table_grants g
      where g.table_schema = column_privileges.table_schema
        and g.table_name = column_privileges.table_name
        and g.grantee = column_privileges.grantee
        and g.privilege_type = column_privileges.privilege_type
    )

  union all
  -- Functions: signature, settings and a hash of the body.
  select format('function %s.%s(%s) returns %s lang=%s volatility=%s secdef=%s config=%s body=%s',
           n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
           pg_get_function_result(p.oid), l.lanname, p.provolatile, p.prosecdef,
           p.proconfig, md5(regexp_replace(p.prosrc, '\s+', '', 'g')))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname in ('public', 'private')
    and not exists (
      select 1 from pg_depend dep
      where dep.objid = p.oid and dep.deptype = 'e'
    )

  union all
  -- Who may call each function.
  select format('execute %s.%s(%s) to=%s', n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid), r.rolname)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated')) as r(rolname)
  where n.nspname in ('public', 'private')
    and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
    and not exists (
      select 1 from pg_depend dep
      where dep.objid = p.oid and dep.deptype = 'e'
    )

  union all
  -- Triggers.
  select format('trigger %s enabled=%s', pg_get_triggerdef(t.oid), t.tgenabled)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and not t.tgisinternal

  union all
  -- Views, by a hash of their definition.
  select format('view %s.%s def=%s', n.nspname, c.relname,
           md5(regexp_replace(pg_get_viewdef(c.oid), '\s+', '', 'g')))
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and c.relkind in ('v', 'm')

  union all
  -- Enum types and their values, in order.
  select format('enum %s.%s %s', n.nspname, t.typname,
           (select string_agg(e.enumlabel, ',' order by e.enumsortorder)
            from pg_enum e where e.enumtypid = t.oid))
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname in ('public', 'private')
    and t.typtype = 'e'

  union all
  -- Tables published for realtime.
  select format('publication %s %s.%s', pubname, schemaname, tablename)
  from pg_publication_tables
  where pubname = 'supabase_realtime'

  union all
  -- Schema-level access.
  select format('schema_usage %s to=%s', n.nspname, r.rolname)
  from pg_namespace n
  cross join (values ('anon'), ('authenticated')) as r(rolname)
  where n.nspname in ('public', 'private')
    and has_schema_privilege(r.rolname, n.oid, 'USAGE')
)
select line from objects order by line;
