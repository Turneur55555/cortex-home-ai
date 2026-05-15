# Mémoire projet — cortex-home-ai

## Dernière mise à jour
2026-05-15

## Ce que fait cette app
Application fitness recovery mobile. Permet de suivre ses séances, sa récupération musculaire, ses macros alimentaires. Interface premium, usage post-séance (mobile, fatigué, faible luminosité).

## Stack
- React + TypeScript + Vite
- Tailwind CSS
- Supabase (auth + BDD)
- Lovable pour la génération UI
- Claude Code pour la logique domaine

## Architecture actée (Sprints 1 et 2 terminés)
- MuscleId en français canonique ("pectoraux", "quadriceps") = source de vérité
- MuscleMap.tsx = seul renderer SVG canonique
- useRecoveryMap() = hook central transformation Supabase → domaine
- RECOVERY_COLORS centralisé dans recovery.ts
- resolveMuscleSlugs() gère les alias ("jambes" → ["quadriceps", "ischio", "fessiers"])
- "cardio" a le flag isCardio: true, bypass computeRecovery()
- lib/fitness/index.ts = façade point d'entrée unique du domaine

## Composants supprimés définitivement
- MuscleBodyMap → supprimé Sprint 1
- bodymap-paths.json → supprimé Sprint 1

## Règles UX importantes
- Interface fluide, design premium
- Animations légères
- Pas de popup inutile
- Responsive parfait mobile obligatoire
