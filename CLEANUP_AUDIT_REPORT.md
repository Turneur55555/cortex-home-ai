# Audit de nettoyage complet — 2026-07-05

## Complément (même jour) — bug corrigé + nettoyage additionnel

- **Bug confirmé et corrigé** : `signOut()` (`use-auth.tsx`) ne vidait jamais le
  cache react-query. En cas de changement de compte dans le même onglet (sans
  rechargement complet de page), les données du compte précédent (profil,
  séances, nutrition, etc.) restaient visibles jusqu'au premier refetch —
  fuite de données entre comptes. `PROFILE_BASE_QK` avait été exporté dans
  l'intention documentée de "vider les entrées profile au logout", mais rien
  ne l'utilisait jamais. Fix à la racine (plus complet que l'intention
  d'origine) : `queryClient.clear()` dans `signOut()`, qui couvre tout le
  cache et pas seulement le profil. `PROFILE_BASE_QK` reste utilisé en
  interne comme clé de repli mais n'a plus besoin d'être exporté.
- **Nettoyage additionnel** (après re-scan complet via knip) : `RecipeIngredient`
  (`useRecipes.ts`) et `ingredientMacros` (`lib/nutrition/recipes.ts`)
  dé-exportés — utilisés en interne mais leur export n'avait plus aucun
  consommateur externe après la suppression du CRUD recette mort de la
  passe précédente.
- Re-scan complet (knip + vérifications manuelles) : aucun autre élément
  n'a pu être prouvé sûr à supprimer. Tout ce qui restait signalé (fonctions
  SQL sans appelant trouvé, Edge Functions à déclenchement externe,
  `@cloudflare/vite-plugin`/`@tanstack/router-plugin`, boilerplate shadcn,
  fichiers auto-générés, points d'entrée framework) reste dans la catégorie
  "conservé par précaution" détaillée plus bas — utilité incertaine, donc
  non supprimé conformément à la consigne.
- Validé après coup : `tsc --noEmit` (0 erreur), `npm run test` (52/52),
  `npm run build` (build complet OK).

## Méthodologie

Aucune suppression n'a été faite sur simple intuition. Pour chaque candidat :

1. **Frontend** : recherche de l'import/usage exact (chemin de module précis, pas juste le nom de base — les faux positifs par nom générique ont été systématiquement écartés, cf. §3).
2. **Backend / Edge Functions** : liste des fonctions réellement déployées (`supabase/functions/`) croisée avec tous les appels `supabase.functions.invoke(...)` du frontend, les workflows CI, et le contenu des fonctions elles-mêmes (pattern "cron/webhook externe").
3. **SQL** : requêtes directes sur `information_schema`, `pg_proc.prosrc`, `pg_trigger`, `pg_policies`, `pg_views`, `pg_constraint` (clés étrangères), `cron.job` — pas seulement une lecture des migrations.
4. **Appels dynamiques** : recherche explicite des patterns `window.__X__ = {...}` (API de debug exposée en console) avant de conclure qu'un export était mort.
5. Outillage : [knip](https://knip.dev) pour un premier passage exhaustif (fichiers/exports/types/dépendances), puis vérification manuelle systématique de chaque résultat par grep précis + lecture de code, car knip génère des faux positifs sur les points d'entrée de framework, les façades de ré-export et les fonctions utilisées uniquement en interne.
6. À chaque étape : `tsc --noEmit`, `npm run test` (52 tests) et `npm run build` (build complet TanStack Start + Cloudflare) relancés pour vérifier l'absence de régression.

## ⚠️ Contrainte critique respectée

`MEMORY.md` documente qu'un projet **"Contrôle de Paie" totalement séparé** partage cette même base Supabase (`bcwfvpwxzlmkxobvbtzp`). Toutes les tables identifiées comme appartenant à ce périmètre ont été **exclues sans exception**, y compris quand elles semblaient "non référencées" du point de vue de cortex-home-ai — car elles sont utilisées par une application tierce non présente dans ce repo :
`dossiers, contrats, taches, taches_recurrentes, dossier_documents, cp_controles, cp_historique, dsn, echeances, affiliations_mutuelle, historique_imports, imports, regles_analyse, arrets_maladie, ca_praticiens, controle_lignes, silae_sync_logs, stc, profiles, app_settings, activity_log`.

`activity_log` en particulier a été découverte a posteriori comme appartenant à ce périmètre : elle contient 182 lignes actives, alimentées par des triggers (`trg_log_taches`, `trg_log_dossiers`, `trg_log_echeances`, `trg_log_dsn`) tous attachés à des tables du Contrôle de Paie.

---

## 1. Frontend — supprimé

### Fichiers entiers (0 référence prouvée, nulle part)
- `src/ui/` (index.ts + primitives.tsx) — mini design-system entièrement orphelin, aucun import.
- `src/lib/fitness/index.ts` — façade documentée dans MEMORY.md comme "point d'entrée unique du domaine", mais **jamais utilisée** : tous les consommateurs importent directement les sous-modules (`@/lib/fitness/strength`, etc.).
- `src/components/home/HomeDashboard.tsx`, `src/components/reports/ReportSummaryWidget.tsx`
- `src/integrations/supabase/auth-middleware.ts`, `client.server.ts`
- `src/components/fitness/renderers/BodyHighlighterRenderer.tsx` (+ dossier vide supprimé) — ancien renderer, remplacé par `MuscleMap.tsx` ("seul renderer SVG canonique" selon MEMORY.md)
- `src/hooks/useNutritionCalculator.ts`, `src/hooks/useProgress.ts` (ce dernier n'était mentionné que dans un README, jamais importé — le README a été corrigé)
- `src/lib/motion.ts`, `src/utils/fitness/hashing.ts`
- `src/components/fitness/RestTimer.tsx` — superseded par `RestTimerBar.tsx` + `useRestTimer.ts`
- `src/components/fitness/SwipeableExerciseRow.tsx`
- `src/components/recipe/` (dossier entier : MacroProgress, NutritionBadge, NutritionScore, PortionSelector, RecipeMacros) — aucun import `@/components/recipe/*` nulle part
- `src/lib/recipeTypes.ts` + `src/lib/recipeTypes.test.ts` — uniquement consommés par les fichiers `recipe/` ci-dessus et par `useNutritionCalculator.ts`, tous supprimés
- **30 composants shadcn/ui inutilisés**, vérifiés un par un par chemin d'import exact (`@/components/ui/<nom>`), y compris les cas où knip donnait un faux "utilisé" à cause d'une collision de sous-chaîne (ex. `alert` matchait `alert-dialog`) : `accordion, alert, aspect-ratio, avatar, breadcrumb, calendar, carousel, chart, checkbox, collapsible, command, context-menu, dropdown-menu, form, hover-card, input-otp, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, separator, sidebar, slider, table, textarea, toggle-group, toggle, tooltip`
- `src/hooks/use-mobile.tsx` — uniquement utilisé par `sidebar.tsx`, lui-même supprimé

### Exports/fonctions morts à l'intérieur de fichiers par ailleurs utilisés
- `use-fitness.ts` : `useUpdateExerciseMuscles`, `useDeleteExercise` (une **fonction homonyme différente** existe et est utilisée dans `useExerciseCatalog.ts` — vérifié précisément pour ne pas la confondre)
- `useRecipes.ts` : toute la partie CRUD écriture (`useCreateRecipe`, `useReplaceRecipeIngredients`, `useDeleteRecipe`, types `RecipeIngredientInput`/`CreateRecipeInput`) — aucune UI de création/suppression de recette n'existe ; seule la lecture (`useRecipes`, `useRecipe`) est utilisée
- `lib/fitness/progression.ts` : `progressionPct` (0 référence, y compris interne)
- `lib/nutrition/recipes.ts` : `sumMacros` (0 référence, y compris interne)
- `lib/fitness/config.ts` : type `GymName` (0 référence)
- `lib/quotes.ts` : `QUOTES` (commenté "Legacy pool... for backwards compat" dans le code lui-même) et `getSessionQuote` (wrapper redondant de `getContextualQuote`)

### Dépendances npm supprimées (31 + 1 devDependency)
Confirmées inutilisées après suppression des composants ci-dessus :
`@dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities` (aucun usage direct trouvé non plus), tous les `@radix-ui/react-*` correspondant aux composants ui/ supprimés, `cmdk, embla-carousel-react, input-otp, react-day-picker, react-hook-form, react-resizable-panels, vaul`, et en devDependency `@testing-library/react`.

### Vulnérabilités npm corrigées
- `npm audit fix` (sans `--force`) a résolu 9 des 11 vulnérabilités sans changement de version majeure.
- La vulnérabilité critique restante (`vitest <=3.2.5`) nécessitait un saut de version majeure (3→4). Testée explicitement : upgrade vers `vitest@4.1.9` / `@vitest/ui@4.1.9`, suite de tests relancée (52/52 toujours au vert), build complet revalidé. **0 vulnérabilité restante.**

## 2. Frontend — conservé par précaution

- **Points d'entrée framework** (`src/router.tsx`, `src/server.ts`, `src/start.ts`) : non importés nulle part par conception (conventions TanStack Start), confirmé par `vite.config.ts` (`tanstackStart: { server: { entry: "server" } }`).
- `src/lib/error-capture.ts`, `error-page.ts`, `src/integrations/supabase/auth-attacher.ts` : utilisés par `server.ts`/`start.ts` ci-dessus.
- `src/components/fitness/muscles/back.tsx` / `front.tsx`, `src/utils/fitness/formatting.ts` : utilisés par `MuscleMap.tsx` (faux positifs knip dus à des noms trop génériques).
- `src/lib/authDiagnostics.ts` (`getAuthStorageSnapshot`, `getAuthDiagnosticsLog`, `clearAuthDiagnosticsLog`) : **appel dynamique confirmé** — exposées via `window.__ICORTEX_AUTH_DIAGNOSTICS__` pour du debug console manuel (`installAuthDiagnostics()`). Réellement utilisées, juste jamais importées depuis un autre fichier.
- `hooks/useProfile.ts` (`PROFILE_BASE_QK`) : le commentaire du code indique qu'il doit servir à vider le cache profil au logout, mais **aucun code ne le fait actuellement**. Possible bug latent (cache profil jamais invalidé au logout) plutôt que du code mort — signalé, non corrigé (hors périmètre de ce nettoyage).
- Boilerplate shadcn (`CardFooter`, `badgeVariants`, `Sheet*`, `Select*`, `AlertDialog*`, `Dialog*`, `BadgeProps`, `ButtonProps`) et fichier auto-généré `integrations/supabase/types.ts` (`Enums`, `CompositeTypes`, `Constants`) : non supprimés délibérément — ce sont des sous-exports standards de composants/génération de code activement utilisés, pas du code mort applicatif.
- e2e/helpers.ts : utilitaires de test, hors périmètre du nettoyage produit.
- Toutes les autres fonctions/types "unused" détectés par knip mais utilisés **en interne** au même fichier (ex. `setTonnage`, `sets.ts`, `exerciseRanks.ts`, `exerciseXp.ts`, `calories.ts`, `badges.ts`, `appleHealth.ts`, `use-saved-meals.ts`, `loadRecommendation.ts`, `meals.ts`, `reactBodyHighlighter.map.ts`, `error-logger.ts`, `types/weekly-report.ts`) : vérifiés un par un (comptage d'occurrences dans leur propre fichier), tous ont au moins un usage réel local — supprimer l'export aurait cassé le fichier.
- Scripts `scripts/*.mjs` (generate-icons, generate-body-svg, refine-svg, loadtest-alerts-realtime) : outils de développement autonomes (génération d'assets, load-test), pas importés par conception — pas du "code mort" applicatif.
- `@cloudflare/vite-plugin`, `@tanstack/router-plugin` : signalés "inutilisés" par knip (pas d'import direct dans `vite.config.ts`), mais liés à la chaîne de déploiement Cloudflare Workers (prod réelle) et à la génération de `routeTree.gen.ts`. Risque de casse en production trop élevé pour les retirer sans test de déploiement réel impossible dans cet environnement — **conservés par précaution**.
- Toutes les **Edge Functions** (`analyze-*`, `chat`, `coach-workout`, `food-lookup`, `scan-*`, `parse-meal-text`, `nutrition-analysis`, `generate-weekly-report`) : appelées directement depuis le frontend, confirmé.
- `cleanup-pdfs`, `muscle-readiness`, `recipe-assistant`, `scan-fridge`, `scheduled-weekly-report` : **aucun appel frontend trouvé**, mais chacune est explicitement conçue pour un déclenchement externe ("Appelée via webhook externe ou cron Supabase", `CRON_SECRET`, config `verify_jwt=false`) et activement redéployée par `.github/workflows/deploy-functions.yml`. Aucun outil ne permet de supprimer une Edge Function déjà déployée (seulement la déployer) — supprimer le fichier repo laisserait la fonction vivante en prod sans plus pouvoir la maintenir. **Conservées par précaution**, signalées comme nécessitant une vérification côté tableau de bord Supabase (schedules configurés ?) avant toute décision définitive.

## 3. Base de données — supprimé

**6 tables supprimées** (migration `20260705120933_drop_orphaned_unused_tables.sql`, appliquée en production) :

| Table | Lignes | Preuve d'absence d'usage |
|---|---|---|
| `training_programs` | 0 | Feature "Coach IA V2 Programs" : aucun hook/composant restant dans le repo (`usePrograms.ts`, `ProgramSheet.tsx`, `lib/fitness/periodization.ts` — tous absents) |
| `program_weeks` | 0 | idem |
| `program_sessions` | 0 | idem |
| `program_exercises` | 0 | idem |
| `stock_history` | 0 | Feature "Stocks/Maison" : `use-stocks.ts` absent du repo |
| `food_search_history` | 0 | Jamais lue par le frontend ; l'index `idx_food_search_history_food_id` était déjà signalé "unused" par les advisors Supabase performance |

Pour chacune, vérifié explicitement avant suppression :
- 0 référence dans le frontend (aucun `.from("table")`, aucune string littérale)
- 0 référence dans les Edge Functions
- 0 référence dans le corps (`prosrc`) des 40 fonctions PostgreSQL publiques
- 0 trigger attaché
- 0 vue en dépendant
- 0 clé étrangère d'une autre table pointant vers elles
- 0 ligne de données
- 1 seule policy RLS standard par table ("Users manage own X"), nettoyée automatiquement via `CASCADE`

Les types TypeScript (`src/integrations/supabase/types.ts`) ont été régénérés après suppression pour rester synchronisés.

## 4. Base de données — conservé par précaution

- **`home_subcategories`** (54 lignes) : jamais lue par le frontend (`useHomeSubcategories` n'existe plus), mais **activement écrite** par la fonction `seed_default_home_categories()` (déclenchée par trigger). Ce n'est pas du code mort au sens strict — la fonction tourne toujours et génère des lignes à chaque nouvel utilisateur, sans que rien ne les affiche jamais. Signalé pour revue produit plutôt que supprimé unilatéralement (décision produit : soit finir la fonctionnalité, soit désactiver la seed).
- **`data_backups`** : jamais lue par le frontend mais écrite chaque semaine par `run_weekly_backups()` (cron actif, `cron.job` id=1). Conservée — c'est tout l'intérêt de cette table.
- **`food_custom_foods`, `food_favorites`** (0 ligne chacune) : référencées dans `src/lib/health/exportData.ts`, une fonctionnalité active d'export de données (utilisée par `HealthDataPanel.tsx`). Conservées.
- **Fonctions SQL "sans appelant trouvé"** : `ensure_home_categories_for_me`, `compute_fitness_stats`, `cleanup_expired_cache`, `cleanup_old_pdfs`, `rls_auto_enable`. Aucune n'est appelée via RPC frontend, ni par une Edge Function, ni par un trigger, ni par une autre fonction — mais :
  - `compute_fitness_stats` est explicitement listée dans les advisors de sécurité Supabase (exposée en `SECURITY DEFINER` via `/rest/v1/rpc/`) comme point à durcir, pas à supprimer — sa suppression n'était pas l'objectif de cette alerte.
  - `rls_auto_enable` a le profil d'un utilitaire d'administration (exécuté manuellement en SQL editor), pas d'une fonction applicative.
  - `cleanup_old_pdfs`/`cleanup_expired_cache` pourraient être redondantes avec la logique de l'Edge Function `cleanup-pdfs` (à vérifier) ou attendre un déclencheur externe non visible depuis cet environnement.
  - Contrairement aux tables, une fonction inutilisée ne coûte rien en stockage/risque de perte de données — le niveau de preuve exigé avant suppression irréversible n'était pas jugé suffisant. **Signalées, non supprimées.**
- **Toutes les tables/fonctions/triggers du projet "Contrôle de Paie"** (cf. section "Contrainte critique" ci-dessus) : hors périmètre, non évaluées pour suppression.

## 5. Risques résiduels

1. Les 5 fonctions SQL "sans appelant trouvé" (§4) méritent une vérification côté dashboard Supabase (schedules Edge Functions, Postgres Cron externe non visible) avant une éventuelle décision de suppression future.
2. `home_subcategories` continue de grossir sans jamais être lue — coût de stockage mineur mais croissant, à trancher au niveau produit.
3. `PROFILE_BASE_QK` (cache profil non vidé au logout) — bug potentiel signalé, non corrigé (hors périmètre "code mort").
4. `@cloudflare/vite-plugin` / `@tanstack/router-plugin` : gardés bien que non importés directement, faute de pouvoir tester un déploiement Cloudflare Workers réel dans cet environnement. Un `npm run build` + déploiement de test sur une branche serait la vérification ultime avant d'envisager leur retrait.
5. Aucune colonne n'a été supprimée dans cette passe : l'analyse colonne-par-colonne sur 71 tables (hors périmètre paie) representerait un chantier à part entière ; seule l'analyse table-par-table a été menée à son terme complet.
