-- SECURITY FIX — CTX-06 (audit du 16/08/2026 ; architecture choisie par
-- Nathan le 28/08/2026 : « exercices perso séparés du catalogue partagé »).
--
-- PROBLÈME
-- `exercise_reference` est un catalogue PARTAGÉ (1500 lignes, dont 1283
-- issues du dataset externe) sans colonne de propriété, et ses 4 policies
-- utilisaient la condition `auth.uid() IS NOT NULL` — c'est-à-dire « être
-- connecté », et rien d'autre. Tout compte authentifié pouvait donc modifier
-- ou supprimer n'importe quelle entrée de la bibliothèque commune à tous les
-- utilisateurs (`DELETE /rest/v1/exercise_reference?discipline_id=eq.muscu`),
-- et la policy UPDATE n'avait même pas de WITH CHECK.
--
-- Ce n'était pas un simple oubli : l'application expose volontairement
-- l'ajout / l'édition / la suppression d'exercices depuis
-- `ExerciseExplorerSheet`, via les hooks `useAddExercise`,
-- `useUpdateExercise`, `useDeleteExercise` et `usePromoteExercise`. Verrouiller
-- la table sans rien d'autre aurait cassé une fonctionnalité réelle — d'où
-- l'arbitrage produit demandé plutôt qu'un correctif unilatéral.
--
-- ARCHITECTURE RETENUE
-- Séparer les deux natures de données qui cohabitaient dans une même table :
--   · `exercise_reference`        → catalogue COMMUN, désormais en LECTURE
--                                   SEULE pour les clients. Les écritures
--                                   restent possibles pour le service_role
--                                   (import du dataset, edge function
--                                   `admin-exercise-actions`), qui contourne
--                                   RLS — aucun de ces flux n'est affecté.
--   · `user_exercise_reference`   → catalogue PERSONNEL, une ligne par
--                                   utilisateur, RLS propriétaire strict.
--                                   C'est là qu'atterrissent désormais les
--                                   exercices créés depuis l'application.
--
-- Les lignes existantes de `exercise_reference` ne sont PAS migrées : rien ne
-- permet de distinguer rétroactivement une entrée créée par un utilisateur
-- d'une entrée du catalogue Cortex d'origine (aucune colonne `created_by`
-- n'a jamais existé). Elles restent donc visibles par tous, en lecture seule
-- — aucune perte de donnée, aucun exercice ne disparaît d'un historique.

-- ── 1. Catalogue personnel ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_exercise_reference (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  category      text,
  discipline_id text NOT NULL DEFAULT 'muscu',
  sort_order    integer NOT NULL DEFAULT 999,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Un même utilisateur ne crée pas deux fois le même exercice dans une
-- discipline ; la casse et les espaces ne doivent pas permettre de doublon.
CREATE UNIQUE INDEX IF NOT EXISTS user_exercise_reference_unique_name
  ON public.user_exercise_reference (user_id, discipline_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS user_exercise_reference_user_discipline_idx
  ON public.user_exercise_reference (user_id, discipline_id);

ALTER TABLE public.user_exercise_reference ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_exercise_reference_select_own" ON public.user_exercise_reference;
CREATE POLICY "user_exercise_reference_select_own"
  ON public.user_exercise_reference FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_exercise_reference_insert_own" ON public.user_exercise_reference;
CREATE POLICY "user_exercise_reference_insert_own"
  ON public.user_exercise_reference FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_exercise_reference_update_own" ON public.user_exercise_reference;
CREATE POLICY "user_exercise_reference_update_own"
  ON public.user_exercise_reference FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_exercise_reference_delete_own" ON public.user_exercise_reference;
CREATE POLICY "user_exercise_reference_delete_own"
  ON public.user_exercise_reference FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP TRIGGER IF EXISTS trg_user_exercise_reference_updated_at ON public.user_exercise_reference;
CREATE TRIGGER trg_user_exercise_reference_updated_at
  BEFORE UPDATE ON public.user_exercise_reference
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

REVOKE TRUNCATE ON TABLE public.user_exercise_reference FROM authenticated, anon;
REVOKE ALL ON TABLE public.user_exercise_reference FROM anon;

-- ── 2. Catalogue partagé : lecture seule côté client ──────────────────────
-- SELECT conservé pour `authenticated` (la bibliothèque doit rester
-- consultable), écritures retirées. Le service_role n'est pas concerné par
-- RLS : import du dataset et actions d'administration restent fonctionnels.
DROP POLICY IF EXISTS "exercise_catalog_insert" ON public.exercise_reference;
DROP POLICY IF EXISTS "exercise_catalog_update" ON public.exercise_reference;
DROP POLICY IF EXISTS "exercise_catalog_delete" ON public.exercise_reference;

DROP POLICY IF EXISTS "exercise_catalog_select" ON public.exercise_reference;
CREATE POLICY "exercise_catalog_select"
  ON public.exercise_reference FOR SELECT TO authenticated
  USING (true);

-- Garde-fou explicite : même si une policy permissive était réintroduite par
-- erreur plus tard, ces RESTRICTIVE la neutraliseraient (c'est exactement le
-- scénario de régression qui a produit CTX-03).
DROP POLICY IF EXISTS "Block direct insert on exercise_reference" ON public.exercise_reference;
CREATE POLICY "Block direct insert on exercise_reference"
  ON public.exercise_reference AS RESTRICTIVE FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "Block direct update on exercise_reference" ON public.exercise_reference;
CREATE POLICY "Block direct update on exercise_reference"
  ON public.exercise_reference AS RESTRICTIVE FOR UPDATE TO authenticated, anon
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Block direct delete on exercise_reference" ON public.exercise_reference;
CREATE POLICY "Block direct delete on exercise_reference"
  ON public.exercise_reference AS RESTRICTIVE FOR DELETE TO authenticated, anon
  USING (false);

REVOKE TRUNCATE ON TABLE public.exercise_reference FROM authenticated, anon;
