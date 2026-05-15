# Bugs corrigés — ne pas réintroduire

## Bug critique Sprint 1
- bodymap-paths.json avait "muscles": [] — aucun path musculaire peuplé
- MuscleBodyMap en prod n'affichait aucun muscle interactif
- Résolution : suppression complète, MuscleMap.tsx devient le renderer canonique

## Nommage
- 3 conventions de nommage coexistaient (MuscleId français, IDs SVG anglais, labels UI)
- Résolution Sprint 2 : MuscleId français = seule source de vérité
