-- Table d'objectifs nutritionnels par utilisateur (1 ligne par user)
CREATE TABLE public.nutrition_goals (
  user_id UUID PRIMARY KEY,
  calories INTEGER,
  proteins DOUBLE PRECISION,
  carbs DOUBLE PRECISION,
  fats DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.nutrition_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own nutrition goals"
  ON public.nutrition_goals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.set_nutrition_goals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nutrition_goals_updated_at
BEFORE UPDATE ON public.nutrition_goals
FOR EACH ROW
EXECUTE FUNCTION public.set_nutrition_goals_updated_at();