
-- Enums
DO $$ BEGIN
  CREATE TYPE public.reminder_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reminder_status AS ENUM ('todo', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reminder_recurrence AS ENUM ('none', 'daily', 'weekly', 'monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  due_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  priority public.reminder_priority NOT NULL DEFAULT 'medium',
  status public.reminder_status NOT NULL DEFAULT 'todo',
  recurrence public.reminder_recurrence NOT NULL DEFAULT 'none',
  recurrence_until timestamptz,
  notify_before_minutes integer NOT NULL DEFAULT 30,
  favorite boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own reminders" ON public.reminders;
CREATE POLICY "Users manage own reminders"
  ON public.reminders FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reminders_user_due ON public.reminders (user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user_status ON public.reminders (user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_user_favorite ON public.reminders (user_id, favorite) WHERE favorite = true;

DROP TRIGGER IF EXISTS trg_reminders_updated_at ON public.reminders;
CREATE TRIGGER trg_reminders_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;
ALTER TABLE public.reminders REPLICA IDENTITY FULL;
