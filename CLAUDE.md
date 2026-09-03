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
- Le comportement de la CI **dépend du déclencheur** (`supabase-types.yml`) :
  - **PR vers `main`** touchant `types.ts` → job `check-pr` : **bloquant, aucune correction
    automatique**. C'est à l'auteur de lancer `npm run gen:types` et de committer. Le job se
    retire si la PR modifie aussi `supabase/migrations/**` (la table n'existe pas encore en
    base) : la vérification est alors déléguée à `migrate.yml`, après le merge.
  - **Push direct sur `main`** touchant `types.ts` → job `fix-push` : **auto-correction**. La CI
    régénère depuis la base et committe (`ci: auto-corrige la dérive types.ts …`). Nécessaire car
    Lovable / `gpt-engineer-app[bot]` poussent sans PR. L'auto-heal échoue au lieu de committer
    si la base est injoignable, si une migration locale n'est pas appliquée, ou si la
    régénération casse `tsc` ailleurs.
  - **Push sur `main` avec migrations** → `migrate.yml` applique les migrations puis régénère et
    committe `types.ts` si besoin (étape finale).
- Garde-fou côté code : `tsc` sur toute PR et tout push `main` (`typecheck.yml`).
- Vérification locale : `npm run check:types` (`scripts/check-supabase-types.mjs`) — compare sans
  jamais modifier le dépôt.
- Détail : `docs/architecture/supabase-types-source-of-truth.md`.

## Qualité automatisée — ce que la CI vérifie réellement
- `quality.yml` (toute PR + push `main`) :
  - **`vitest`** — suite Vitest **complète** (`npm test`), plus un garde-fou anti-skip : un test
    désactivé hors des deux fichiers d'intégration env-gated (`src/lib/security/rls.test.ts`,
    `src/lib/nutrition/nutritionMealCheck.test.ts`) fait échouer le job.
  - **`lint`** — `npm run lint` **bloquant** (ESLint + Prettier). Le dépôt est à 0 erreur ; les
    warnings historiques restent affichés, non masqués.
  - **`e2e-offline`** — `e2e/05-offline-sync.spec.ts` (Playwright) : hors ligne → création →
    retour réseau → synchronisation, contre un backend Supabase **simulé**. Les autres specs e2e
    tapent la base de production et restent manuelles (voir `e2e/README.md`).
- Workflows ciblés conservés : `typecheck.yml` (tsc + contrat offline), `rls-tests.yml` (RLS avec
  secrets), `meal-slugs-check.yml`, `supabase-types.yml`, `migrate.yml`,
  `supabase-project-ref.yml`, `audit-migration-drift.yml`, `health-check.yml`,
  `deploy-functions.yml`.

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

## Workflow Git et publication (règle permanente, validée par Nathan, 05/08/2026)
Pour le projet Cortex :
- Travaille directement sur `main` par défaut.
- Avant toute modification : synchronise-toi avec le `main` distant (`git fetch`/`git pull`) et vérifie `git status`.
- Implémente les changements directement sur `main`.
- Une fois les validations réussies (typecheck/lint/tests/build), commit et push sur `main`.
- Ne crée pas de branche de travail ni de Pull Request, sauf si une contrainte technique de la
  plateforme l'impose réellement.
- Si l'environnement force l'utilisation d'une branche (politique plateforme, pas une préférence),
  ne considère pas la tâche comme totalement livrée : indique clairement que la fusion vers `main`
  reste nécessaire.
- Après le push sur `main`, vérifie que la version correspondante est publiée/déployée sur Lovable
  lorsque le projet est configuré pour cette publication.
- Une tâche Cortex n'est considérée comme complètement livrée qu'après : code validé → commit →
  `main` → push → publication Lovable vérifiée.
- Ne prétends jamais avoir poussé, fusionné ou publié si l'action correspondante n'a pas réellement
  été effectuée et vérifiée.

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
