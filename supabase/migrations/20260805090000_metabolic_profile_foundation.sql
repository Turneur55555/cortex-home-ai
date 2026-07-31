-- Fondation pour le futur moteur métabolique (BMR/TDEE personnalisés,
-- dépense adaptative, NEAT/EAT/TEF) exposé par la refonte de la fiche
-- Santé nutritionnelle. Aucune donnée d'âge/sexe/niveau d'activité n'existe
-- ailleurs dans le schéma (poids → body_tracking, taille → user_preferences),
-- donc une table dédiée est nécessaire plutôt qu'une duplication.
--
-- Schéma préparé uniquement : le frontend ne consomme pas encore cette table
-- dans cette phase (V1 affiche BMR/TDEE réutilisés depuis les objectifs
-- nutritionnels existants ou un état "à venir" — voir sante-nutritionnelle.tsx).

CREATE TABLE IF NOT EXISTS public.metabolic_profile (
  user_id        uuid PRIMARY KEY,
  sex            text CHECK (sex IN ('homme', 'femme')),
  age            integer CHECK (age > 0 AND age < 130),
  activity_level numeric CHECK (activity_level > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.metabolic_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own metabolic profile" ON public.metabolic_profile;
CREATE POLICY "Users manage own metabolic profile" ON public.metabolic_profile
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_metabolic_profile_updated_at ON public.metabolic_profile;
CREATE TRIGGER trg_metabolic_profile_updated_at
  BEFORE UPDATE ON public.metabolic_profile
  FOR EACH ROW EXECUTE FUNCTION public.set_nutrition_goals_updated_at();
