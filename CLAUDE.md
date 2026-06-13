# Claude Code Rules — cortex-home-ai

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
