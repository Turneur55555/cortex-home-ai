# Claude Code Rules — cortex-home-ai

## Piliers RPG — règle de conception permanente (validée par Nathan, 17/07/2026)
Toute nouvelle fonctionnalité doit renforcer **au moins un** de ces quatre piliers :
1. donner envie de revenir **aujourd'hui** ;
2. donner envie de revenir **cette semaine** ;
3. donner envie **d'aller au bout de la saison** ;
4. **enrichir les Chroniques** pour qu'on ait envie de les relire des années plus tard.

Si une fonctionnalité ne renforce aucun de ces piliers, elle n'est probablement pas prioritaire.
Rappels structurants : la progression vient **toujours** de l'entraînement (muscu-primaire) ; les
Saisons **racontent** la progression, elles ne donnent aucun avantage de puissance. Vision détaillée :
`docs/architecture/rpg-vision-et-r1-niveau-personnage.md` et `docs/architecture/rpg-saisons.md`.

## Avant chaque modification, lire obligatoirement :
1. MEMORY.md
2. /docs/architecture.md
3. /docs/features.md
4. /docs/bugs.md

## Workflow GitHub (CRITIQUE — depuis juin 13)
- Le dossier Google Drive local est désynchronisé : les fichiers `src/components/fitness/` et `src/hooks/` présents localement peuvent être des versions obsolètes
- **Toujours lire la version GitHub** avant toute modification : `https://raw.githubusercontent.com/Turneur55555/cortex-home-ai/main/<chemin>`
- Après modification locale, l'utilisateur doit faire `git add + git commit + git push` pour que Lovable voie les changements
- Remote : `https://github.com/Turneur55555/cortex-home-ai.git` (branch `main`)

## À la fin de chaque session, mettre à jour :
- MEMORY.md → ajouter tout nouveau composant, hook, migration, feature, décision d'archi découvert pendant la session

## Stack technique
- React + TypeScript
- Vite
- Tailwind CSS
- Supabase (auth + base de données)
- Lovable (générateur UI)

## Règles absolues
- Mobile first — toujours vérifier le responsive
- Ne jamais supprimer une feature existante sans demande explicite
- Ne jamais créer de doublons de composants
- Ne jamais réintroduire un composant supprimé
- Toujours préserver le BodyMap / MuscleMap SVG
- Toujours vérifier les imports TypeScript avant de modifier
- Toujours synchroniser le pseudo entre profil et accueil

## Architecture des fichiers domaine
- /src/lib/fitness/ → logique pure, zéro import React
- /src/hooks/ → connexion Supabase
- /src/components/fitness/ → composants UI seulement

## Interdictions
- Jamais de couleur dans le domaine (lib/)
- Jamais de slug UI comme "jambes" ou "cardio" dans computeRecovery()
- Jamais de logique métier dans un composant Lovable

## Clé GitHub (mise à jour 15/06/2026)
- Token valide, expire le 15/07/2026 (scope: repo) — stocker dans un gestionnaire de mots de passe
- Remote : `https://github.com/Turneur55555/cortex-home-ai.git` (branch `main`)

## Edge Functions IA (migration 15/06/2026)
- Toutes les edge functions utilisent désormais `GEMINI_API_KEY` + `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
- **Plus de `LOVABLE_API_KEY` ni de gateway Lovable**
- Modèle : `gemini-2.5-flash`
- Fonctions migrées : analyze-pdf, analyze-image, chat, scan-meal, scan-fridge, coach-workout, muscle-readiness, recipe-assistant, parse-reminder, scan-exercise
- ⚠️ Ajouter le secret `GEMINI_API_KEY` sur Supabase projet `bcwfvpwxzlmkxobvbtzp` (Edge Functions → Manage secrets)
