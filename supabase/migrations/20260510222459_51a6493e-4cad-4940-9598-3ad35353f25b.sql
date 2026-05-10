
CREATE TABLE public.food_preferences (
  user_id uuid PRIMARY KEY,
  allergies text[] NOT NULL DEFAULT '{}',
  foods_to_avoid text[] NOT NULL DEFAULT '{}',
  goal text,
  no_meat_dairy_mix boolean NOT NULL DEFAULT false,
  other_rules text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.food_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own food prefs"
ON public.food_preferences FOR ALL
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_food_preferences_updated_at
BEFORE UPDATE ON public.food_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_nutrition_goals_updated_at();
