-- =====================================================================
-- B06 « Mon rythme » — le plan de la semaine (30/09/2026).
--
-- Un plan hebdomadaire RÉCURRENT : pour chaque jour de la semaine, le
-- joueur choisit repos, des groupes musculaires, ou une de ses séances
-- sauvegardées. Le plan se règle une fois et se rejoue chaque semaine.
--
-- Ce qui est STOCKÉ : l'intention de chaque jour (au plus 7 lignes par
-- utilisateur). Ce qui n'est JAMAIS stocké : l'état fait / à faire. Il se
-- dérive à la lecture des séances de la semaine en cours (lib/fitness/
-- weeklyPlan.ts) — aucune réconciliation, aucune donnée qui puisse
-- diverger de la réalité des séances.
--
-- ── Pas de contrainte UNIQUE (user_id, day_of_week), et c'est voulu ──
-- La table est branchée sur `createOfflineRepository` : un jour peut être
-- créé hors ligne sur deux appareils. Une violation d'unicité inconnue du
-- moteur de synchronisation est classée « définitive » (syncErrors.ts,
-- classifyUniqueViolation) : l'opération passerait `blocked` et allumerait
-- le point d'attention du Profil pour une simple modification de planning.
-- On préfère donc tolérer un doublon ponctuel et le départager à la
-- LECTURE (la ligne la plus récemment modifiée gagne, voir
-- resolveWeeklyPlan). L'écriture met à jour la ligne existante d'un jour
-- plutôt que d'en créer une seconde, donc le doublon reste exceptionnel.
--
-- ── Contrat offline-first ──
-- id / user_id / created_at / updated_at : exigés par repository.ts
-- (scripts/check-offline-repository-contract.mjs). Trigger set_updated_at
-- comme les autres tables offline.
--
-- ── Séance supprimée ──
-- template_id est en ON DELETE SET NULL : supprimer un modèle ne doit
-- JAMAIS être bloqué par le planning. Le jour garde alors kind='template'
-- avec template_id NULL, et l'app le présente comme « séance supprimée »
-- plutôt que de l'effacer en silence. Les CHECK ci-dessous sont écrits
-- dans le sens qui reste vrai après ce SET NULL (jamais « kind='template'
-- EXIGE un template_id », qui ferait échouer la suppression du modèle).
--
-- Additive et idempotente : rejouable sans erreur.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.weekly_plan_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Jour ISO : 1 = lundi … 7 = dimanche (la semaine CORTEX commence le
  -- lundi, comme lib/dates.ts::localWeekStartYMD).
  day_of_week smallint NOT NULL,

  -- Ce que le joueur a prévu ce jour-là.
  kind text NOT NULL,

  -- kind = 'muscles' : les familles ciblées. Vocabulaire des 6 familles de
  -- SPECIALIZATION_GROUPS (lib/fitness/chronicles.ts) — jamais un second
  -- vocabulaire de muscles.
  muscle_groups text[] NOT NULL DEFAULT '{}',

  -- kind = 'template' : la séance sauvegardée. NULL après suppression du
  -- modèle (voir plus haut).
  template_id uuid REFERENCES public.workout_templates(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_plan_days
  DROP CONSTRAINT IF EXISTS weekly_plan_days_day_check;
ALTER TABLE public.weekly_plan_days
  ADD CONSTRAINT weekly_plan_days_day_check
  CHECK (day_of_week BETWEEN 1 AND 7);

ALTER TABLE public.weekly_plan_days
  DROP CONSTRAINT IF EXISTS weekly_plan_days_kind_check;
ALTER TABLE public.weekly_plan_days
  ADD CONSTRAINT weekly_plan_days_kind_check
  CHECK (kind IN ('rest', 'muscles', 'template'));

-- Les familles autorisées. Filet de sécurité : l'UI n'en propose pas
-- d'autres et valide avant d'écrire ; ce CHECK empêche seulement qu'une
-- valeur étrangère n'entre en base par un autre chemin.
ALTER TABLE public.weekly_plan_days
  DROP CONSTRAINT IF EXISTS weekly_plan_days_groups_check;
ALTER TABLE public.weekly_plan_days
  ADD CONSTRAINT weekly_plan_days_groups_check
  CHECK (muscle_groups <@ ARRAY['dos', 'pecs', 'epaules', 'bras', 'jambes', 'tronc']::text[]);

-- Cohérence kind ↔ contenu, dans le sens stable (voir « Séance supprimée »).
ALTER TABLE public.weekly_plan_days
  DROP CONSTRAINT IF EXISTS weekly_plan_days_muscles_only_check;
ALTER TABLE public.weekly_plan_days
  ADD CONSTRAINT weekly_plan_days_muscles_only_check
  CHECK (kind = 'muscles' OR cardinality(muscle_groups) = 0);

ALTER TABLE public.weekly_plan_days
  DROP CONSTRAINT IF EXISTS weekly_plan_days_template_only_check;
ALTER TABLE public.weekly_plan_days
  ADD CONSTRAINT weekly_plan_days_template_only_check
  CHECK (kind = 'template' OR template_id IS NULL);

-- Un jour « muscles » sans aucune famille n'a pas de sens : ce serait un
-- repos déguisé.
ALTER TABLE public.weekly_plan_days
  DROP CONSTRAINT IF EXISTS weekly_plan_days_muscles_not_empty_check;
ALTER TABLE public.weekly_plan_days
  ADD CONSTRAINT weekly_plan_days_muscles_not_empty_check
  CHECK (kind <> 'muscles' OR cardinality(muscle_groups) >= 1);

CREATE INDEX IF NOT EXISTS weekly_plan_days_user_id_idx
  ON public.weekly_plan_days (user_id);
CREATE INDEX IF NOT EXISTS weekly_plan_days_template_id_idx
  ON public.weekly_plan_days (template_id)
  WHERE template_id IS NOT NULL;

ALTER TABLE public.weekly_plan_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_plan_days_owner_all ON public.weekly_plan_days;
CREATE POLICY weekly_plan_days_owner_all
  ON public.weekly_plan_days
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS weekly_plan_days_set_updated_at ON public.weekly_plan_days;
CREATE TRIGGER weekly_plan_days_set_updated_at
  BEFORE UPDATE ON public.weekly_plan_days
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
