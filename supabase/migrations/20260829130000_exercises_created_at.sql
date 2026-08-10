-- Offline-first (cf. CLAUDE.md) — correctif Cœur Fitness.
--
-- Cause racine du bug prod "31 actions en échec — nouvelle tentative
-- automatique" (panneau de sync, iPhone en ligne) : `exercises` est la SEULE
-- table câblée sur `createOfflineRepository` (repository.ts, cf.
-- 20260828090000_fitness_core_offline_first_updated_at.sql) à ne PAS avoir de
-- colonne `created_at` — `repository.ts::create()` l'ajoute pourtant
-- inconditionnellement à CHAQUE payload créé (contrat générique partagé par
-- toutes les tables offline). Résultat : tout `POST /exercises` échouait en
-- 400 (PGRST204, colonne inconnue du schema cache) → l'exercice n'était
-- jamais créé côté serveur → chaque `exercise_sets` dépendant (FK
-- `exercise_id`) échouait en cascade en 409 (violation de clé étrangère,
-- `exercise_sets_exercise_id_fkey`) dès que la queue le traitait, retenté à
-- l'infini par le sync engine sans jamais pouvoir réussir. Confirmé par les
-- logs Supabase (API + Postgres) du projet en prod.
--
-- Correctif : aligner `exercises` sur le contrat générique déjà respecté par
-- toutes les autres tables offline (`workouts`, `exercise_sets`,
-- `workout_template_*`, `workout_analyses`…), comme `updated_at` l'avait déjà
-- été dans la migration du 26/08. Additive et idempotente.
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Backfill best-effort pour les lignes existantes : `updated_at` est la
-- meilleure approximation disponible (aucune date de création n'a jamais été
-- enregistrée pour cette table).
UPDATE public.exercises SET created_at = updated_at WHERE created_at IS DISTINCT FROM updated_at;

NOTIFY pgrst, 'reload schema';
