# Architecture technique

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
