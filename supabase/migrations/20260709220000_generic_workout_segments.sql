-- ============================================================
-- workout_segments — pendant générique de exercises/exercise_sets pour
-- les disciplines Sensei autres que la musculation. Phase pilote : Course
-- à pied (2026-07-09), voir src/lib/fitness/engines/courseEngine.ts.
--
-- Entité de premier niveau (demande Nathan) : chaque segment/bloc d'une
-- séance est une LIGNE éditable, réordonnable, historisable — pas un blob
-- jsonb figé dans workouts.metadata. `metrics` reste jsonb (valeurs libres
-- par discipline : distance_m, pace_min_per_km, zone, elevation_m...)
-- plutôt que des colonnes figées, pour que HYROX/Cardio/mobilité/
-- récupération puissent réutiliser cette même table plus tard SANS
-- nouvelle migration (décision explicite : "sans refonte de la base de
-- données ni de l'architecture").
--
-- Frontière feedsRankEngine INCHANGÉE : cette table n'est JAMAIS lue par
-- le moteur de Rang/Maîtrise/Badges/Succès (lib/fitness/rank/), qui reste
-- strictement scopé à exercises/exercise_sets. Le résumé d'affichage
-- (workouts.metadata.segments, lu par segmentsFromMetadata()) est
-- resynchronisé en copie à la clôture de la séance (même pattern que la
-- synchronisation exercises.sets/reps/weight pour la musculation, voir
-- useFinishWorkout) — zéro modification du kit UI générique existant
-- (SessionSegmentList, GenericHistoryCard, toSessionView, WorkoutCard).
-- ============================================================

create table if not exists public.workout_segments (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position smallint not null default 0,
  label text not null,
  -- Clé dans `metrics` à suivre pour une future recommandation de
  -- surcharge progressive (phase 2, non branchée dans cette migration).
  -- NULL si aucune progression n'a de sens pour ce segment.
  metric_key text,
  metrics jsonb not null default '{}'::jsonb,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workout_segments_workout_id
  on public.workout_segments (workout_id);
create index if not exists idx_workout_segments_user_id
  on public.workout_segments (user_id);
-- Future progression (phase 2) : historique par utilisateur + libellé de
-- segment pour la recommandation de surcharge progressive — index posé
-- maintenant pour éviter une migration dédiée le moment venu.
create index if not exists idx_workout_segments_user_label
  on public.workout_segments (user_id, label);

alter table public.workout_segments enable row level security;

drop policy if exists "Users manage own workout segments" on public.workout_segments;
create policy "Users manage own workout segments"
  on public.workout_segments
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.workout_segments is
  'Segments éditables en direct (pendant générique de exercises/exercise_sets) pour les disciplines Sensei non-musculation. Phase pilote : course à pied. Jamais lu par le moteur de Rang/Maîtrise/Badges.';

notify pgrst, 'reload schema';
