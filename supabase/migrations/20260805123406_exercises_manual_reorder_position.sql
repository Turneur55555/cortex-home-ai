-- Réordonnancement manuel des exercices d'une séance (drag-and-drop).
--
-- `exercises` n'a jamais eu de colonne d'ordre explicite (voir MEMORY.md) —
-- l'app s'appuyait sur l'ordre d'insertion implicite. On matérialise cet
-- ordre existant dans une colonne `position` (backfill via l'ordre physique
-- actuel des lignes, qui EST cet ordre implicite) puis on la rend NOT NULL,
-- même convention que `workout_template_exercises.position`. Additif pur :
-- aucune donnée de séries/reps/charge/progression touchée.

alter table public.exercises
  add column if not exists position integer;

-- Backfill : matérialise l'ordre implicite déjà utilisé par l'app (ctid =
-- ordre physique de stockage ≈ ordre d'insertion) pour que les séances
-- existantes conservent exactement leur ordre actuel après ce déploiement.
with ranked as (
  select id, row_number() over (partition by workout_id order by ctid) - 1 as rn
  from public.exercises
  where position is null
)
update public.exercises e
set position = ranked.rn
from ranked
where e.id = ranked.id;

alter table public.exercises
  alter column position set default 0,
  alter column position set not null;

create index if not exists idx_exercises_workout_position
  on public.exercises (workout_id, position);
