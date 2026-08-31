-- Offline-first (cf. CLAUDE.md) — fiabilité serveur de `updated_at` sur
-- TOUTES les tables câblées sur `createOfflineRepository`.
--
-- Pourquoi `updated_at` doit être généré côté SERVEUR, et pas par le client :
--   1. le conflict detector (src/lib/offline/conflictDetector.ts) compare le
--      `updated_at` serveur courant au `baseUpdatedAt` snapshoté à la
--      modification locale. Si `updated_at` n'est pas bougé par la base à
--      chaque UPDATE, deux appareils qui modifient la même ligne voient
--      toujours `serverUpdatedAt === baseUpdatedAt` → AUCUN conflit n'est
--      jamais détecté → écrasement silencieux, exactement ce que la
--      stratégie validée interdit ;
--   2. depuis le passage de `repository.ts::update()` aux patchs partiels,
--      le client n'envoie plus JAMAIS `updated_at` dans un UPDATE (il ne
--      doit pas réécrire une colonne serveur avec son horloge locale, qui
--      peut dériver hors ligne). La base est donc désormais la SEULE à
--      pouvoir avancer `updated_at` : sans trigger, il resterait figé à sa
--      valeur d'insertion.
--
-- Ces 5 tables offline avaient bien la colonne `updated_at` mais aucun
-- trigger pour la tenir à jour (vérifié en direct sur la base via
-- `pg_trigger`, projet bcwfvpwxzlmkxobvbtzp).
--
-- Réutilise `public.set_updated_at()` (trigger générique déjà en place, cf.
-- 20260826090000_offline_first_updated_at.sql /
-- 20260828090000_fitness_core_offline_first_updated_at.sql) — pas de
-- nouvelle fonction dupliquée. Note : `supplements` et `food_custom_foods`
-- utilisent `public.touch_updated_at()`, strictement équivalent
-- (`NEW.updated_at = now()`) et déjà en place — volontairement non
-- rebranchées ici, on ne remplace pas un trigger qui fonctionne.
--
-- Migration strictement additive et idempotente.

-- ─── recipes ────────────────────────────────────────────────────────────
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_recipes_updated_at ON public.recipes;
CREATE TRIGGER trg_recipes_updated_at BEFORE UPDATE ON public.recipes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── recipe_collections ─────────────────────────────────────────────────
ALTER TABLE public.recipe_collections
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_recipe_collections_updated_at ON public.recipe_collections;
CREATE TRIGGER trg_recipe_collections_updated_at BEFORE UPDATE ON public.recipe_collections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── saved_meals ────────────────────────────────────────────────────────
ALTER TABLE public.saved_meals
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_saved_meals_updated_at ON public.saved_meals;
CREATE TRIGGER trg_saved_meals_updated_at BEFORE UPDATE ON public.saved_meals
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── workout_templates ──────────────────────────────────────────────────
ALTER TABLE public.workout_templates
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_workout_templates_updated_at ON public.workout_templates;
CREATE TRIGGER trg_workout_templates_updated_at BEFORE UPDATE ON public.workout_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── workout_segments ───────────────────────────────────────────────────
ALTER TABLE public.workout_segments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_workout_segments_updated_at ON public.workout_segments;
CREATE TRIGGER trg_workout_segments_updated_at BEFORE UPDATE ON public.workout_segments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

NOTIFY pgrst, 'reload schema';
