-- metabolic_profile.activity_level : stocke le niveau d'activité quotidienne
-- HORS SPORT sous forme de catégorie métier stable (very_sedentary/
-- lightly_active/active/very_active) plutôt que le coefficient numérique
-- utilisé aujourd'hui par le moteur NEAT (0.15/0.25/0.35/0.50, voir
-- src/lib/fitness/neat.ts NEAT_ACTIVITY_COEFFICIENTS — seul point de
-- vérité des coefficients). Le profil décrit ce que l'utilisateur EST,
-- pas un détail d'implémentation de l'algorithme : si un coefficient
-- change demain, aucune migration de profil ne sera nécessaire.
--
-- Aucune ligne existante en base au moment de cette migration (table posée
-- par 20260805090000_metabolic_profile_foundation.sql, jamais consommée
-- par le frontend avant la Phase 2D) : conversion de colonne sans perte de
-- données possible, mais le backfill CASE ci-dessous reste écrit pour être
-- sûr même si des lignes existaient.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'metabolic_profile'
      AND column_name = 'activity_level'
      AND data_type = 'numeric'
  ) THEN
    ALTER TABLE public.metabolic_profile ADD COLUMN activity_level_category text;

    UPDATE public.metabolic_profile SET activity_level_category = CASE
      WHEN activity_level = 0.15 THEN 'very_sedentary'
      WHEN activity_level = 0.25 THEN 'lightly_active'
      WHEN activity_level = 0.35 THEN 'active'
      WHEN activity_level = 0.50 THEN 'very_active'
      ELSE NULL
    END;

    ALTER TABLE public.metabolic_profile DROP COLUMN activity_level;
    ALTER TABLE public.metabolic_profile RENAME COLUMN activity_level_category TO activity_level;
  END IF;
END $$;

ALTER TABLE public.metabolic_profile DROP CONSTRAINT IF EXISTS metabolic_profile_activity_level_check;
ALTER TABLE public.metabolic_profile
  ADD CONSTRAINT metabolic_profile_activity_level_check
  CHECK (activity_level IS NULL OR activity_level IN ('very_sedentary', 'lightly_active', 'active', 'very_active'));
