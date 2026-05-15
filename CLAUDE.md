# Claude Code Rules — cortex-home-ai

## Avant chaque modification, lire obligatoirement :
1. MEMORY.md
2. /docs/architecture.md
3. /docs/features.md
4. /docs/bugs.md

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
