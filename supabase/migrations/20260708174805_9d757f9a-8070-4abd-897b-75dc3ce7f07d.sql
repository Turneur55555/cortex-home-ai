
CREATE TABLE IF NOT EXISTS public.supplements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  dosage text,
  unit text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplements TO authenticated;
GRANT ALL ON public.supplements TO service_role;
ALTER TABLE public.supplements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their supplements" ON public.supplements;
CREATE POLICY "Users manage their supplements" ON public.supplements
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS supplements_user_idx ON public.supplements(user_id, sort_order);
DROP TRIGGER IF EXISTS supplements_touch ON public.supplements;
CREATE TRIGGER supplements_touch BEFORE UPDATE ON public.supplements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.supplement_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplement_id uuid NOT NULL REFERENCES public.supplements(id) ON DELETE CASCADE,
  date date NOT NULL,
  taken boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, supplement_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplement_logs TO authenticated;
GRANT ALL ON public.supplement_logs TO service_role;
ALTER TABLE public.supplement_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage their supplement logs" ON public.supplement_logs;
CREATE POLICY "Users manage their supplement logs" ON public.supplement_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS supplement_logs_user_date_idx ON public.supplement_logs(user_id, date);
