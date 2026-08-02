-- Phase 8 : objectif physique suivi dans le temps (poids/BF cible
-- facultatifs, rythme, snapshot de départ). Après audit exhaustif, aucune
-- structure équivalente n'existe déjà (`nutrition_goals` porte `goal`/
-- `target_rate`/mode manuel-automatique mais aucun poids/BF CIBLE ni
-- snapshot de départ ; `target_weight` existant dans
-- `coach_ia_v2_programs` est un concept totalement différent — charge
-- recommandée sur une série, pas un poids corporel cible).
--
-- Une seule table dédiée, propriétaire utilisateur, RLS stricte. Le
-- snapshot de départ (`starting_*`) est figé à la création et n'est
-- JAMAIS recalculé avec des données futures (§17 du brief).

CREATE TABLE IF NOT EXISTS public.physical_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  goal text NOT NULL,
  target_rate text,

  started_at date NOT NULL,

  -- Snapshot de départ — figé à la création, jamais recalculé (§17).
  starting_weight_kg double precision,
  starting_body_fat_percent double precision,
  starting_body_fat_method text,
  starting_lean_mass_kg double precision,

  -- Cibles facultatives — Cortex fonctionne sans (§3/§4/§6/§30).
  target_weight_kg double precision,
  target_body_fat_percent double precision,

  status text NOT NULL DEFAULT 'active',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- `goal` reprend EXACTEMENT la taxonomie stable Phase 4 (`nutrition_
-- goals.goal`) — aucune deuxième taxonomie créée (§2 du brief).
-- Idempotence : `DROP CONSTRAINT IF EXISTS` puis `ADD CONSTRAINT` — même
-- convention que le reste du projet (ex. migration 20260809090000) ; un
-- `ADD CONSTRAINT` nu n'est PAS idempotent en Postgres (pas d'`IF NOT
-- EXISTS` pour les contraintes), ce qui faisait échouer `supabase db
-- push` en CI lors d'une réapplication.
ALTER TABLE public.physical_goals
  DROP CONSTRAINT IF EXISTS physical_goals_goal_check;
ALTER TABLE public.physical_goals
  ADD CONSTRAINT physical_goals_goal_check
  CHECK (goal IN ('fat_loss', 'maintenance', 'muscle_gain'));

-- Même contrainte de cohérence rythme/objectif que `nutrition_goals_
-- target_rate_check` (migration 20260807090000) — maintien sans rythme.
ALTER TABLE public.physical_goals
  DROP CONSTRAINT IF EXISTS physical_goals_target_rate_check;
ALTER TABLE public.physical_goals
  ADD CONSTRAINT physical_goals_target_rate_check
  CHECK (
    target_rate IS NULL
    OR (goal = 'fat_loss' AND target_rate IN ('slow', 'moderate', 'fast'))
    OR (goal = 'muscle_gain' AND target_rate IN ('slow', 'moderate'))
  );

ALTER TABLE public.physical_goals
  DROP CONSTRAINT IF EXISTS physical_goals_status_check;
ALTER TABLE public.physical_goals
  ADD CONSTRAINT physical_goals_status_check
  CHECK (status IN ('active', 'completed', 'cancelled'));

-- Mêmes bornes plausibles que `body_tracking` (une seule définition de
-- "poids/BF plausible" dans la base, jamais une deuxième contradictoire).
ALTER TABLE public.physical_goals
  DROP CONSTRAINT IF EXISTS physical_goals_starting_weight_check;
ALTER TABLE public.physical_goals
  ADD CONSTRAINT physical_goals_starting_weight_check
  CHECK (starting_weight_kg IS NULL OR (starting_weight_kg >= 20 AND starting_weight_kg <= 500));
ALTER TABLE public.physical_goals
  DROP CONSTRAINT IF EXISTS physical_goals_target_weight_check;
ALTER TABLE public.physical_goals
  ADD CONSTRAINT physical_goals_target_weight_check
  CHECK (target_weight_kg IS NULL OR (target_weight_kg >= 20 AND target_weight_kg <= 500));
ALTER TABLE public.physical_goals
  DROP CONSTRAINT IF EXISTS physical_goals_starting_body_fat_check;
ALTER TABLE public.physical_goals
  ADD CONSTRAINT physical_goals_starting_body_fat_check
  CHECK (starting_body_fat_percent IS NULL OR (starting_body_fat_percent >= 1 AND starting_body_fat_percent <= 70));
ALTER TABLE public.physical_goals
  DROP CONSTRAINT IF EXISTS physical_goals_target_body_fat_check;
ALTER TABLE public.physical_goals
  ADD CONSTRAINT physical_goals_target_body_fat_check
  CHECK (target_body_fat_percent IS NULL OR (target_body_fat_percent >= 1 AND target_body_fat_percent <= 70));
ALTER TABLE public.physical_goals
  DROP CONSTRAINT IF EXISTS physical_goals_starting_lean_mass_check;
ALTER TABLE public.physical_goals
  ADD CONSTRAINT physical_goals_starting_lean_mass_check
  CHECK (starting_lean_mass_kg IS NULL OR starting_lean_mass_kg > 0);
ALTER TABLE public.physical_goals
  DROP CONSTRAINT IF EXISTS physical_goals_starting_body_fat_method_check;
ALTER TABLE public.physical_goals
  ADD CONSTRAINT physical_goals_starting_body_fat_method_check
  CHECK (starting_body_fat_method IS NULL OR starting_body_fat_method IN (
    'manual', 'dexa', 'bioimpedance', 'measurements', 'photo_estimate'
  ));

-- §19 : un seul objectif ACTIF par utilisateur — index unique partiel
-- (les objectifs terminés/annulés restent en base, historisés, jamais
-- écrasés, §21/§46).
CREATE UNIQUE INDEX IF NOT EXISTS physical_goals_one_active_per_user
  ON public.physical_goals (user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS physical_goals_user_id_idx ON public.physical_goals (user_id);
CREATE INDEX IF NOT EXISTS physical_goals_user_started_idx
  ON public.physical_goals (user_id, started_at DESC);

ALTER TABLE public.physical_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS physical_goals_owner_all ON public.physical_goals;
CREATE POLICY physical_goals_owner_all
  ON public.physical_goals
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS physical_goals_set_updated_at ON public.physical_goals;
CREATE TRIGGER physical_goals_set_updated_at
  BEFORE UPDATE ON public.physical_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
