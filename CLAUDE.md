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

## Standard premium — direction artistique (validé par Nathan, 17/07/2026)
CORTEX vise à être **le plus beau RPG de progression du fitness**, pas une app de suivi gamifiée.
- **Le Rang est la star** (Titan, Olympien…). Le joueur retient son RANG, jamais son niveau. Le
  Niveau/XP ne fait que raconter le chemin vers le prochain Rang — toujours au service du Rang.
- **Chaque famille de Rang a son illustration officielle**, pas une couleur générée en CSS/SVG.
- **Signature visuelle partagée** : depuis le 21/07/2026, le rang se représente **uniquement** via
  `RankIllustration` (`src/components/rpg/RankIllustration.tsx`), qui sélectionne l'image
  `src/assets/ranks/<clé>.webp` du rang courant. Un seul système, aucune autre façon de représenter un
  rang (plus de Disque/Blason/sigils SVG) — réutiliser `RankIllustration` sur TOUS les écrans premium
  (récompenses, montées de rang, Chroniques, Saisons, Reliques, trophées) pour un univers cohérent.
  `premium/tokens.ts` reste la source des courbes d'animation/durées partagées.
- **RankTheme — garde-fou anti-duplication (validé par Nathan, 22/07/2026)** : toute couleur affichée
  pour un RANG (halo, liseré, glow de texte — `boxShadow`/`textShadow` construits à partir de
  `rank.colors.*`) doit passer par `src/components/rpg/rankTheme.ts` (`rankRingInset`, `rankGlowShadow`,
  `rankSurfaceShadow`, `rankTextGlow`, `rankTierByKey`/`rankThemeByKey`) — **jamais** réassembler une
  chaîne `` `inset 0 0 0 1px ${colors.primary}30, ...` `` à la main dans un composant. Si le helper qui
  manque n'existe pas encore, l'ajouter dans `rankTheme.ts`, pas en inline. Cette règle ne concerne QUE
  le rang par exercice / Titre global (`RANK_TIERS`) — elle ne s'applique jamais aux palettes
  volontairement distinctes (accent utilisateur `lib/accent.ts`, récompense XP, Saison, rareté des
  badges/Légendes `rarityVisuals.ts`) : ce sont des domaines produit séparés, pas des doublons du
  thème de rang, et ils ne doivent pas être migrés vers `rankTheme.ts`.
- **Deux questions avant d'ajouter** : (1) renforce-t-elle la boucle entraîner→progresser→récompenser→
  revenir ? (2) crée-t-elle un vrai effet « Waouh » ? Si non aux deux → pas prioritaire.
- **Test de chaque itération premium** : *« Si un utilisateur ouvrait cet écran pour la première fois,
  aurait-il envie d'en faire une capture d'écran et de la partager ? »* Si non, on continue d'itérer.
  Mieux vaut plusieurs itérations sur un écran exceptionnel qu'un écran « correct ».

## Types Supabase — la base est la source de vérité (validé par Nathan, 17/07/2026)
- **Ne JAMAIS éditer `src/integrations/supabase/types.ts` à la main.** C'est un artefact généré.
- Pour ajouter/modifier une table : écrire une migration → merger (migrate.yml applique) → régénérer
  via `npm run gen:types` → committer les types. La base fait foi, jamais l'inverse.
- La CI **échoue** (sans corriger) si `types.ts` ne correspond plus à la base (`supabase-types.yml`,
  étape finale de `migrate.yml`) + garde-fou `tsc` sur toute PR (`typecheck.yml`).
- Détail : `docs/architecture/supabase-types-source-of-truth.md`.

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
