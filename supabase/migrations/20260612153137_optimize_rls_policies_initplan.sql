-- Optimisation perf : wrap auth.uid()/auth.role()/auth.jwt() dans un sous-select
-- pour éviter la ré-évaluation par ligne (advisor auth_rls_initplan, 56 policies)
DO $do$
DECLARE
  r record;
  new_qual text;
  new_check text;
  sql text;
BEGIN
  FOR r IN
    SELECT * FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual,'') ~ '(^|[^T] )auth\.(uid|role|jwt|email)\(\)'
        OR coalesce(with_check,'') ~ '(^|[^T] )auth\.(uid|role|jwt|email)\(\)'
        OR coalesce(qual,'') LIKE '(auth.%' OR coalesce(with_check,'') LIKE '(auth.%'
      )
  LOOP
    new_qual := r.qual;
    new_check := r.with_check;
    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, 'SELECT auth.uid() AS uid', '___W1___');
      new_qual := regexp_replace(new_qual, 'auth\.(uid|role|jwt|email)\(\)', '(SELECT auth.\1())', 'g');
      new_qual := replace(new_qual, '___W1___', 'SELECT auth.uid() AS uid');
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, 'SELECT auth.uid() AS uid', '___W1___');
      new_check := regexp_replace(new_check, 'auth\.(uid|role|jwt|email)\(\)', '(SELECT auth.\1())', 'g');
      new_check := replace(new_check, '___W1___', 'SELECT auth.uid() AS uid');
    END IF;
    -- skip si rien n'a changé (déjà optimisé)
    CONTINUE WHEN coalesce(new_qual,'') = coalesce(r.qual,'') AND coalesce(new_check,'') = coalesce(r.with_check,'');

    sql := format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    EXECUTE sql;

    sql := format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      r.policyname, r.schemaname, r.tablename,
      r.permissive, r.cmd, array_to_string(r.roles, ', '));
    IF new_qual IS NOT NULL THEN
      sql := sql || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      sql := sql || format(' WITH CHECK (%s)', new_check);
    END IF;
    EXECUTE sql;
  END LOOP;
END
$do$;
