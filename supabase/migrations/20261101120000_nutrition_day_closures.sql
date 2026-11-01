-- =====================================================================
-- Nutrition — la « journée bouclée » (01/11/2026).
--
-- Constat mesuré en production (60 jours) : le dîner n'est saisi que 7
-- jours sur 27. Les jours où il l'est, l'apport est dans la cible (1 600 à
-- 1 900 kcal) ; les autres, 700 à 1 100 kcal. Les moyennes comptaient
-- pourtant toute journée entamée comme complète : 1 091 kcal affichées pour
-- un objectif de 1 800, et un TDEE observé faussé d'autant.
--
-- Le joueur peut désormais dire « j'ai fini pour aujourd'hui ». Une ligne
-- ici = la journée `date` est bouclée. Rouvrir la journée = supprimer ses
-- lignes. Rien d'autre n'est stocké : la complétude d'une journée se DÉRIVE
-- à la lecture (bouclée OU dîner saisi, voir lib/nutrition/dayCompletion.ts).
--
-- ── Pas de contrainte UNIQUE (user_id, date), et c'est voulu ──
-- Même raison que weekly_plan_days (docs/INVARIANTS.md §1.7) : la table est
-- branchée sur `createOfflineRepository`, une journée peut être bouclée hors
-- ligne sur deux appareils. Une violation d'unicité inconnue du moteur
-- serait classée « définitive » (classifyUniqueViolation) : l'opération
-- passerait `blocked` pour un simple geste de fin de journée. Un doublon
-- est sans conséquence (« au moins une ligne » = bouclée) et l'écriture
-- n'en crée pas quand une ligne existe déjà localement.
--
-- ── Contrat offline-first ──
-- id / user_id / created_at / updated_at : exigés par repository.ts
-- (scripts/check-offline-repository-contract.mjs). Trigger set_updated_at
-- comme les autres tables offline.
--
-- Additive et idempotente : rejouable sans erreur.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.nutrition_day_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- La journée bouclée (même convention que nutrition.date : date locale
  -- du joueur, sans fuseau).
  date date NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nutrition_day_closures_user_date_idx
  ON public.nutrition_day_closures (user_id, date);

ALTER TABLE public.nutrition_day_closures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nutrition_day_closures_owner_all ON public.nutrition_day_closures;
CREATE POLICY nutrition_day_closures_owner_all
  ON public.nutrition_day_closures
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS nutrition_day_closures_set_updated_at ON public.nutrition_day_closures;
CREATE TRIGGER nutrition_day_closures_set_updated_at
  BEFORE UPDATE ON public.nutrition_day_closures
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
