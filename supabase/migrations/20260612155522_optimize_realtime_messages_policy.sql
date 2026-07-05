-- Dernière policy auth_rls_initplan (schéma realtime)
DROP POLICY IF EXISTS "Authenticated user-scoped realtime" ON realtime.messages;
CREATE POLICY "Authenticated user-scoped realtime" ON realtime.messages
FOR SELECT TO authenticated
USING (
  extension = 'postgres_changes'
  OR topic LIKE ((SELECT auth.uid())::text || ':%')
  OR topic = (SELECT auth.uid())::text
);
