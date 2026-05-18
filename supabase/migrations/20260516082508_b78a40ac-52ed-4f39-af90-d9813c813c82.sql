-- Restrict Realtime channel subscriptions: only authenticated users may receive
-- messages, and only on topics scoped to their own user id, OR on postgres_changes
-- streams (which are themselves filtered by underlying table RLS).
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated user-scoped realtime" ON realtime.messages;

CREATE POLICY "Authenticated user-scoped realtime"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  extension = 'postgres_changes'
  OR topic LIKE (auth.uid()::text || ':%')
  OR topic = auth.uid()::text
);
