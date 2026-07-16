# Architecture technique

## Documents de référence

- [`docs/architecture/exercise-central-architecture.md`](architecture/exercise-central-architecture.md) — architecture officielle du domaine Fitness (référentiel `exercise_reference`, identité `exercise_id`/`exercise_reference_id`/`identityKey`, services centraux, flux d'écriture/lecture, invariants, principes d'évolution, vision long terme). À consulter avant toute évolution touchant aux exercices, aux disciplines, à Sensei ou aux statistiques.
- [`docs/architecture/nutrition-meal-slugs.md`](architecture/nutrition-meal-slugs.md) — source unique de vérité des slugs de repas (`nutrition.meal`), procédure pour en ajouter un, régénération des types Supabase, garde-fous automatiques anti-dérive. À consulter avant toute évolution touchant aux repas (Nutrition), aux Edge Functions IA nutrition, ou à `nutrition_meal_check`.

## Chemin des données
CoachSheet (sélection UI)
  → resolveMuscleSlugs()
  → useRecoveryMap()
  → computeRecovery()
  → Map<MuscleId, Recovery>
  → MuscleMap (renderer SVG)

## Séparation des couches
- /src/lib/fitness/ → domaine pur (zéro React)
- /src/hooks/ → Supabase queries/mutations
- /src/utils/fitness/ → utilitaires (fmtHours, formatWeight)
- /src/components/fitness/ → UI seulement

## Workflow
Claude Code → modifie /lib et /hooks
Lovable → modifie /components
Claude Code → vérifie les PR Lovable
