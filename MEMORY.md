# Mémoire projet — cortex-home-ai

## Dernière mise à jour
2026-08-31

## Chantier 2 — validation complémentaire + intégration du chantier 1 (2026-08-31)
Demandée par Nathan avant fusion. `main` portait déjà le chantier 1 (`086b84d`) : la compatibilité a
donc été testée pour de vrai, en fusionnant `main` DANS la branche du chantier 2.
- **4 conflits de fusion, tous dans `syncEngine.ts`** (`syncQueue.ts` s'est fusionné tout seul) :
  imports (union), signature `applyOperation` (`"blocked"` du chantier 1 + helper
  `applyServerRowToEntity` du chantier 2), boucle `processSyncQueue`, et `resolveConflict`.
- **Simplification trouvée à la fusion** : la relecture d'opération ajoutée par le chantier 2
  (`getOperation`) était REDONDANTE — `claimOperation()` (chantier 1) relit déjà l'opération de façon
  atomique et renvoie l'état persisté, `baseUpdatedAt` recalé compris. `getOperation` supprimé.
- **`resolveConflict('keep-local')`** combine désormais les deux : `opType` conservé (MAJ-05, un
  `delete` ne ressuscite pas la ligne) ET payload assaini pour un `update`
  (`opType === "delete" ? null : buildUpdatePayload(conflict.localData)`).
- **`rebasePendingOperationsForRecord` durcie pour la machine d'état du chantier 1** : recalage
  restreint à `REBASABLE_STATUSES` (pending/failed/syncing/blocked), relecture dans une transaction
  `readwrite` et écriture du SEUL champ `baseUpdatedAt` — jamais le statut, le payload ni le
  `retryCount`, qui appartiennent à la sync queue. Une opération `blocked` est donc recalée (si
  l'utilisateur la réarme, elle repart de l'état serveur courant) sans être débloquée.
- **Changement de comportement assumé et testé** : tant qu'une opération reste en attente (y compris
  `blocked`) pour un enregistrement, l'entité locale ne repasse plus `synced` et garde sa donnée
  locale. Avant, une synchronisation réussie marquait `synced` même s'il restait une modification
  locale non partie — l'hydratation serveur pouvait alors l'écraser.
- **Faux positif du garde-fou corrigé** : `syncQueueResilience.test.ts` (chantier 1) appelle
  `createOfflineRepository(TABLE)` via une constante. Le contrôle résout désormais les
  `const NOM = "littéral"` du même fichier — il ne doit pas imposer un style d'écriture.
- **Bug corrigé dans MES tests** : l'horloge du faux serveur de `repositoryContract.test.ts` était
  figée au 31/08 10:00 UTC ; passé cette heure, le test `updated_at` échouait selon l'heure
  d'exécution. Horloge désormais amorcée devant l'horloge client à chaque test.
- **Nouveau fichier `src/lib/offline/rebasePendingOperations.test.ts` (17 cas)** : CREATE→UPDATE→sync,
  UPDATE1→sync→UPDATE2, deux UPDATE offline successifs, conflit réel multi-appareils, **conflit
  survenant APRÈS un recalage** (écriture concurrente injectée dans la fenêtre exacte), UPDATE→erreur
  →retry, `blocked` puis `retryBlockedOperation`, `discardBlockedOperation`, coexistence
  `claimOperation`/`syncing` récent/`syncing` orphelin, et tests unitaires directs du recalage
  (`create` jamais recalé, aucune autre ligne touchée, seul `baseUpdatedAt` réécrit).
- **`types.ts` vérifié pour de bon** : régénéré via le générateur officiel (Management API, même
  endpoint que `supabase gen types`) et comparé au fichier du dépôt — `diff` vide, identique octet
  pour octet. Les 3 lignes ajoutées à la main étaient exactes.
- **Base de production** : le schéma porte bien les deux changements (19/19 tables offline conformes,
  19/19 avec trigger `updated_at`), mais les versions `20260831090000`/`20260831091000` ne sont PAS
  encore inscrites dans `supabase_migrations.schema_migrations` — normal, c'est `migrate.yml` qui les
  inscrira au merge en les rejouant (idempotentes). Aucune autre table touchée.
- **Validation** : `npm test` 1550 passed / 60 skipped / 0 échec, `npx tsc --noEmit` 0 erreur,
  `eslint .` 1349 problèmes — chiffre IDENTIQUE à `origin/main`, donc zéro warning ajouté. Aucun test
  du chantier 1 modifié ; seul `offlineSync.test.ts` a changé (16 tests avant/après, uniquement le nom
  de table fictive remplacé par une table réelle).

## Chantier 2 — contrat repository offline ⇄ tables Supabase (2026-08-31, branche `claude/cortex-offline-repository-contract-4dwf9i`)
Audit technique du 30/08 : CRIT-02 (`shopping_list` incompatible avec `createOfflineRepository`),
MAJ-01 (`update()` renvoyait toute la ligne et pouvait écraser des colonnes calculées serveur),
tables offline sans trigger `set_updated_at`, et absence de garde-fou automatisé.

- **Les 19 tables branchées sur `createOfflineRepository`** (source : appels réels dans `src/`) :
  `workouts`, `exercises`, `exercise_sets`, `workout_segments`, `workout_templates`,
  `workout_template_exercises`, `workout_template_segments`, `workout_analyses`, `physical_goals`,
  `nutrition`, `nutrition_favorites`, `food_custom_foods`, `saved_meals`, `supplements`, `recipes`,
  `recipe_ingredients`, `recipe_collections`, `meal_plans`, `shopping_list`.
- **Migration `20260831090000_shopping_list_created_at.sql`** : `shopping_list` était la dernière
  table offline sans `created_at` (constat vérifié en direct sur la base, pas déduit de `types.ts`)
  alors que `create()` en met une dans CHAQUE payload → tous ses `create` échouaient en 400
  PGRST204 et étaient retentés en boucle (même cause racine que `exercises`, migration
  20260829130000). Ajout en 3 temps (colonne nullable → backfill depuis `added_at` → `NOT NULL` +
  `DEFAULT now()`) pour rester réellement idempotente sans faire churner `updated_at` à un rejeu.
  `added_at` (colonne produit, tri de la liste) est conservée telle quelle.
- **Migration `20260831091000_offline_tables_set_updated_at_triggers.sql`** : trigger
  `public.set_updated_at()` ajouté sur `recipes`, `recipe_collections`, `saved_meals`,
  `workout_templates`, `workout_segments` — les 5 tables offline qui avaient la colonne `updated_at`
  mais aucun trigger pour l'avancer. `supplements`/`food_custom_foods` utilisent
  `touch_updated_at()`, strictement équivalent : volontairement non rebranchées.
- **MAJ-01 — `repository.update()` envoie désormais le PATCH, plus l'entité complète.** La ligne
  locale reste complète (les écrans continuent de tout lire), mais l'opération de sync ne porte que
  les colonnes réellement modifiées, débarrassées des colonnes du contrat
  (`buildUpdatePayload` / `OFFLINE_CONTRACT_COLUMNS`). Renommer une séance ne réécrit plus
  `xp_before`/`xp_after`/`level_before`/`level_after` (calculées par `award_xp_on_workout_complete`),
  et `updated_at` n'est plus jamais envoyé par le client — c'est le trigger serveur qui le pose.
  Le payload d'un `create` reste la ligne complète (un INSERT a besoin de toutes les colonnes) et la
  fusion `create` en attente + patch est inchangée (CREATE → UPDATE hors ligne intact).
- **Adaptations minimales du sync engine** (rendues nécessaires par le nouveau format, chantier 1 non
  touché) : `applyServerRowToEntity()` ne réécrit la donnée locale avec la réponse serveur que s'il
  ne reste aucune opération en attente pour cet enregistrement (sinon la réponse est partielle et
  ferait « reculer » l'écran), et `rebasePendingOperationsForRecord()` recale le `baseUpdatedAt` des
  opérations suivantes sur l'état que le serveur vient d'atteindre — sans quoi deux patchs enchaînés
  déclenchaient un FAUX conflit contre notre propre écriture précédente. `processSyncQueue` relit
  chaque opération juste avant de l'envoyer (la liste FIFO est un instantané pris avant la boucle).
  `resolveConflict('keep-local')` passe aussi par `buildUpdatePayload`.
- **Garde-fou automatisé, deux niveaux** : (1) type `OfflineCompatibleTableName` (repository.ts) —
  seules les tables de `types.ts` portant id/user_id/created_at/updated_at (timestamps non-nullables)
  peuvent être passées à `createOfflineRepository` ; une table incompatible ne compile plus, donc
  `typecheck.yml` (toute PR + push main) la bloque ; (2) `scripts/check-offline-repository-contract.mjs`
  (`npm run check:offline-contract`, étape ajoutée à `typecheck.yml`) — dérive la liste des tables
  DEPUIS le code et le schéma DEPUIS `types.ts`, et nomme table + colonne manquante + fichier fautif.
  Aucune seconde source de vérité maintenue à la main.
- **Tests** : `src/lib/offline/repositoryContract.test.ts` (16 cas — simulateur Supabase strict qui
  refuse les colonnes inconnues sur INSERT **et** UPDATE et simule le trigger `set_updated_at`) +
  `scripts/check-offline-repository-contract.test.mjs` (9 cas). Couvre : create shopping_list accepté
  et synchronisé (+ le même create qui échouait avant migration), colonnes du contrat produites par
  `create()`, update partiel, colonnes XP serveur préservées, CREATE→UPDATE avant sync, deux patchs
  enchaînés sans perte ni faux conflit, `updated_at` serveur, table conforme OK / table non conforme
  en échec explicite.
- **Validation** : `npm test` 1512 passed / 60 skipped (106 fichiers, +25 cas vs avant), `npx tsc --noEmit` 0 erreur, `eslint` 0 erreur
  sur les fichiers touchés. Les deux migrations ont été appliquées à la base en direct (MCP Supabase)
  pour que `types.ts` reste conforme et que la CI soit verte sur la branche ; `migrate.yml` les
  rejouera sans effet au merge (idempotentes).
## Sync Queue — machine d'état robuste (récupération, concurrence, conflits DELETE, erreurs visibles) (2026-08-31, branche `claude/sync-queue-security-11zyiu`)
Chantier 1 de l'audit technique du 30/08/2026 (CRIT-01, MAJ-05, MAJ-11, dette
`NON_RETRYABLE_PG_ERROR_CODES`, protection anti-traitement concurrent). Aucun autre chantier de
l'audit traité, aucun module métier modifié.
- **Nouvel état `blocked`** (`types.ts`, `SyncOpStatus` = `pending | syncing | failed | blocked |
  done`) : échec DÉFINITIF identifié (payload/schéma invalide). Plus jamais retenté
  automatiquement (exclu de `listPendingOperations`), mais reste visible avec son erreur et attend
  une action utilisateur. Le cycle de vie complet est documenté en tête de `types.ts`.
- **CRIT-01 — reprise des orphelines** (`syncQueue.ts`) : `STALE_SYNCING_MS = 60 s` (justification du
  seuil dans le code : au plus 2 aller-retours réseau par opération, `lastAttemptAt` réécrit à chaque
  claim, très au-dessus du poll de 4 s de `useOfflineSync`). `reclaimStaleSyncingOperations(userId)`
  remet en `pending` toute opération `syncing` plus vieille que ce seuil (ou sans `lastAttemptAt` —
  écrite par le moteur précédent), en incrémentant `retryCount` et en écrivant un `lastError` lisible
  (« Synchronisation interrompue… »). Appelée en tête de chaque `processSyncQueue`. Rien n'est jamais
  supprimé : une orpheline est REPRISE.
- **Concurrence** : `claimOperation(id)` prend possession de l'opération dans UNE seule transaction
  IndexedDB `readwrite` (get+put), que le navigateur sérialise entre toutes les connexions
  (onglets/PWA) → deux instances ne peuvent pas envoyer la même opération. La seconde reçoit `null`
  (compté dans `SyncResult.skipped`), pas de deadlock, FIFO et idempotence inchangés. `syncingRef`
  du hook reste la protection intra-instance.
- **MAJ-05 — conflits DELETE** : `ConflictRecord.opType` (nouveau champ, optionnel au typage pour les
  conflits déjà persistés = relus comme `update`). `resolveConflict("keep-local")` ré-enfile
  désormais une opération du MÊME type : un conflit né d'un `delete` repart en `delete`
  (payload `null`, tombstone local conservé) — la ligne ne ressuscite plus. `keep-server` inchangé.
- **`NON_RETRYABLE_PG_ERROR_CODES` réellement effectif** (nouveau module pur
  `src/lib/offline/syncErrors.ts` : extraction/format/classification + libellés FR) : les codes
  structurels (42703, 42P10, 23502, 23514, 22P02, PGRST204) passent l'opération en `blocked` dès le
  premier échec. **Nuance importante découverte via les tests existants** : `23503`
  (foreign_key_violation) est le cas NORMAL d'une file FIFO parent→enfant (`workout` → `exercise` →
  `exercise_set`) quand le parent a échoué sur un blip réseau — il reste donc retryable TANT QUE la
  file contient une autre opération (`DEPENDENCY_PG_ERROR_CODES` + `hasOtherQueuedOperations`), et ne
  bloque que lorsqu'il est seul en file (plus rien ne peut créer le parent) : la boucle infinie du
  bug prod « 31 en échec » s'arrête, sans casser la reprise FIFO légitime.
- **MAJ-11 — erreurs visibles** : `SyncOperation.lastErrorCode` (nouveau) + `useOfflineSync` expose
  `operations`, `blockedCount`, `retryOperation`, `discardOperation`. `SyncQueueSheet` liste chaque
  action (bloquées d'abord, puis échecs, puis le reste, 20 max) avec son état explicite — « Action en
  attente / nouvelle tentative automatique », « Échec temporaire / nouvelle tentative prévue »,
  « Action bloquée » + raison réelle (libellé FR du code, sinon message serveur exact — jamais un
  message générique) + détail technique. `SyncStatusIndicator` gagne l'état « Action bloquée ».
- **Actions utilisateur** (`syncEngine.ts`) : `retryBlockedOperation` (remet en `pending`) et
  `discardBlockedOperation` (retire l'opération de la file, confirmation `AlertDialog` côté UI). Le
  discard ne supprime JAMAIS la donnée métier locale : l'entité passe en `syncStatus: "failed"`,
  reste visible et n'est pas écrasée par une hydratation ultérieure.
- **Ré-armement automatique sur correction** : `updateOperationPayload` remet une opération
  `blocked` en `pending` — le verdict portait sur un payload précis, et l'utilisateur vient d'en
  écrire un nouveau (ex. champ obligatoire renseigné). `lastError`/`retryCount` conservés ; une
  seule tentative par correction, donc pas de boucle.
- **Tests** : nouveau `src/lib/offline/syncQueueResilience.test.ts` (21 tests) — syncing récent non
  repris, orpheline reprise, interruption complète, claim concurrent, FIFO préservé, conflit
  UPDATE/DELETE + legacy sans `opType`, erreur réseau retryable, erreur non retryable bloquée et non
  rebouclée, FK retryable puis bloquante, ré-armement sur correction, `lastError` exposé. Suite
  complète : 1508 tests verts, `tsc --noEmit` propre, aucun test offline existant modifié.

## "Proposer des variantes" (module Recettes) — génération IA en 1 appel (2026-08-09, branche `claude/recipe-variants-feature-r88ujt`)
Demande : dans `RecipeDetailSheet`, bouton "✨ Proposer des variantes" → 3 choix (🥛 Sans produits
laitiers [🌱 végétal / 🚫 suppression], 💪 Plus protéiné, ✏️ Demande personnalisée) → génère EXACTEMENT
3 variantes réellement différentes (ingrédients complets, instructions adaptées, macros recalculées)
en UN SEUL appel Gemini, affichées en cartes, avec "Enregistrer comme nouvelle recette" — la recette
originale n'est jamais modifiée. Réutilise le pipeline IA/validation existant, ne touche pas à l'import
Instagram ni à l'offline-first.
- **Migration `20260829090000_recipe_variants.sql`** (appliquée en direct via MCP Supabase, `types.ts`
  régénéré) : `recipes.source_recipe_id uuid REFERENCES recipes(id) ON DELETE SET NULL` (lien variante
  → recette d'origine, purement informatif — aucune dépendance de calcul, chaque recette garde son
  propre snapshot `per_serving_*`) + action de rate-limit `recipe_variants` (15/h) ajoutée à
  `rate_limits_action_check`. Pas de nouvelle colonne pour l'explication/les instructions : réutilise
  `recipes.notes` (explication de la modification) et `recipes.instructions` (déjà présent, legacy,
  jusqu'ici inutilisé par le pipeline IA).
- **Edge function `recipe-variants`** (nouvelle, `supabase/functions/recipe-variants/`) : endpoint
  **stateless** (comme `recipe-assistant`, pas de lecture DB serveur — le client envoie un snapshot de
  la recette déjà chargée). Handler extrait et testable (`_shared/recipe-variants-handler.ts`, même
  pattern que `recipe-import-handler.ts`) : validation entrée → `checkRateLimit` → UN appel Gemini
  (`_shared/recipe-variant-tool.ts`, tool calling forcé `save_recipe_variants`, schéma `minItems:3,
  maxItems:3`, prompt système dédié par type de demande) → validation STRICTE de la sortie
  (`_shared/recipe-variant-engine.ts`, contrairement à `nutrition-engine.ts` qui est best-effort avec
  valeurs par défaut : ici une réponse structurellement invalide — pas 3 variantes, ingrédients/macros
  manquants, 3 variantes identiques — est REJETÉE plutôt que silencieusement complétée). Réutilise
  `safeNum`/`INGREDIENT_CATEGORIES` (`recipe-import.ts`) et `sanitizeCategory` (exportée depuis
  `nutrition-engine.ts` pour l'occasion — auparavant privée).
- **Contrats** : `_shared/recipe-variants.ts` (Deno) miroir de `src/lib/nutrition/recipeVariants/
  types.ts` (frontend), même convention de duplication volontaire que `recipe-import.ts`/
  `recipeImport/types.ts` (pas de bundler partagé entre les deux runtimes).
- **`src/hooks/useRecipeVariants.ts`** : `generateRecipeVariants`/`saveRecipeVariantAsRecipe` — logique
  extraite en fonctions simples (testables directement, même pattern que
  `resolveCustomExerciseMuscles`) puis wrappées par `useGenerateRecipeVariants`/
  `useSaveRecipeVariantAsRecipe` (`useMutation`). **En ligne uniquement** (`getIsOnline()` guard),
  bypass volontaire du repository offline — même famille que `useDuplicateRecipe`/`useReanalyzeRecipe`.
  L'enregistrement d'une variante est un insert direct `recipes`+`recipe_ingredients` (même schéma que
  `useDuplicateRecipe`, `source_url`/`source_kind` restent `null`). `useRecipes.ts` : `RECIPES_KEY`
  exportée (auparavant privée) pour l'invalidation de cache depuis ce nouveau hook.
- **UI** : nouveau `src/components/fitness/RecipeVariantsSheet.tsx` (état choose → custom → loading →
  results → detail), ouvert depuis `RecipeDetailSheet` (nouveau bouton, section actions). Cartes de
  résultat : nom/explication/macros + "Voir la variante" (ingrédients+instructions complets) et
  "Enregistrer comme nouvelle recette".
- **Tests** : `supabase/functions/recipe-variants/recipe-variants.e2e.test.ts` (14 cas, même pattern
  fake-Supabase + fetch mocké que `recipe-import.e2e.test.ts` — endpoint stateless donc fake DB limité
  à `rate_limits`) + `src/hooks/useRecipeVariants.test.ts` (8 cas — recette originale jamais modifiée,
  hors-ligne refusé, 1 seul appel edge function). Suite complète : 1376 passed/32 skipped (inchangé
  hors nouveaux tests), `tsc --noEmit` 0 erreur, `vite build` OK, eslint clean sur les fichiers touchés
  (mêmes avertissements `no-explicit-any` déjà tolérés ailleurs ; le lint global du repo a 1317
  problèmes préexistants, confirmés identiques sur la branche de base avant cette session — hors
  périmètre, non introduits par cette feature).
- **Branche poussée** : `claude/recipe-variants-feature-r88ujt` sur origin, PAS mergée vers `main`
  (contrainte d'environnement, cf. CLAUDE.md "Workflow Git et publication") — fusion manuelle restante
  avant livraison prod/Lovable. La migration, elle, a été appliquée directement sur le projet Supabase
  (base = source de vérité) pour permettre la régénération de `types.ts`.

## Architecture offline-first globale — infra générique + premier module migré (2026-08-08, branche `claude/cortex-offline-first-arch-hhan1x`)
Demande : construire l'architecture OFFLINE-FIRST globale (UI → Repository → IndexedDB → Sync Queue →
Supabase), stratégie de conflits = détection + choix utilisateur explicite (jamais d'écrasement
silencieux), et migrer un premier module (Nutrition/Recettes) dessus.
- **Nouveau dossier `src/lib/offline/`** (logique pure, zéro dépendance React, `idb` comme wrapper
  IndexedDB — ~1kb, ajouté en dépendance) :
  - `db.ts` — base `cortex-offline` (via `idb`), 3 object stores : `entities` (clé composée
    `${table}::${localId}`, index `by-table-user` sur `[table,userId]`, `by-sync-status`),
    `syncQueue`, `conflicts`. `purgeUserOfflineData(userId)` scope TOUJOURS par userId — jamais de
    fuite entre comptes.
  - `types.ts` — `OfflineEntity`, `SyncOperation` (id local stable = idempotence : un `create` retenté
    après coupure fait un upsert Supabase par id, jamais de doublon), `ConflictRecord`.
    `ConflictResolutionStrategy = 'keep-local' | 'keep-server'` avec point d'extension explicite
    `ExtensibleConflictResolutionStrategy` prêt pour un futur `'merge'` (non implémenté).
  - `repository.ts` — `createOfflineRepository<T>(table, supabaseTableName?)` : `list/get/create/
    update/remove` écrivent TOUJOURS IndexedDB d'abord (`syncStatus:'pending'`) puis enfilent une
    opération dans `syncQueue`. Fusionne un `update`/`remove` dans un `create` encore pending plutôt
    que d'empiler une opération séparée (évite d'envoyer un update vers une ligne qui n'existe pas
    encore côté serveur). `hydrateEntitiesFromServer()` fusionne des lignes serveur sans jamais
    écraser une entité locale non synchronisée.
  - `syncQueue.ts` — file FIFO par `createdAt`, `findPendingCreateForRecord`/`updateOperationPayload`
    pour la fusion ci-dessus.
  - `syncEngine.ts` — `processSyncQueue(userId, { respectBackoff? })` pousse la queue vers Supabase
    (seul point de l'infra offline qui parle réseau). Backoff exponentiel simple présent mais
    réservé à un futur scheduler périodique — les déclencheurs actuels (retour réseau, bouton
    "Réessayer") sont ponctuels et retentent immédiatement (`respectBackoff` par défaut `false`).
    `resolveConflict(id, strategy)` : `keep-local` ré-enfile un update forcé, `keep-server` applique
    la version serveur en local sans rien renvoyer.
  - `conflictDetector.ts` — conflit détecté seulement si LE SERVEUR a changé depuis `baseUpdatedAt`
    ET la donnée locale aussi (`syncStatus` pending/failed) — sinon c'est un simple refresh, pas un
    vrai conflit.
  - `networkStatus.ts` — partie pure (`navigator.onLine` + events) ; hook React `useNetworkStatus()`
    dans `src/hooks/`.
- **`src/hooks/useOfflineSync.ts`** — hook central (statut réseau + compteurs queue + conflits, poll
  léger 4s, auto-sync au retour réseau) consommé par l'UI.
- **UI** : `src/components/shared/SyncStatusIndicator.tsx` (badge flottant discret, states En
  ligne/Hors connexion/Synchronisation/Synchronisé/Action en attente/Conflit) + `SyncQueueSheet.tsx`
  (panneau opérations en attente + cartes de résolution de conflit "Garder ma version"/"Garder la
  version serveur"), intégrés dans `src/routes/_authenticated.tsx`.
- **`use-auth.tsx`** : `signOut()` appelle désormais `purgeUserOfflineData(outgoingUserId)` en plus de
  `queryClient.clear()` — même point d'ancrage pour les deux purges (React Query + IndexedDB).
- **Migration SQL `20260826090000_offline_first_updated_at.sql`** (appliquée en prod via MCP Supabase,
  `types.ts` régénéré) : ajoute `updated_at` + trigger `set_updated_at` (réutilise la fonction
  générique existante, pas de doublon) sur `nutrition`, `nutrition_favorites`, `recipe_ingredients`,
  `shopping_list`, `meal_plans` — requis par le conflict detector, absent avant sur ces 5 tables.
- **Module Nutrition/Recettes migré vers le repository offline** (`nutrition_favorites` ET
  `recipes`/`recipe_ingredients`, fonctionnel offline de bout en bout) :
  - `use-nutrition-favorites.ts` : list/create/delete passent par `createOfflineRepository`, aucun
    composant consommateur modifié (`FavoritesSheet`, `FoodLibrarySheet`, `NutritionTab`).
  - `useRecipes.ts` : list/get/update/toggle-favorite/delete passent par le repository. La jointure
    macros `items` (per_100g) n'est disponible qu'en ligne — dégradation gracieuse hors connexion
    (les recettes importées IA restent exactes car `per_serving_*` fait foi, cf. commentaire déjà
    existant). `useDuplicateRecipe`/`useReanalyzeRecipe` restent STRICTEMENT en ligne (edge function
    IA / lecture serveur fraîche) avec message d'erreur clair si utilisées hors connexion — hors du
    périmètre offline par nature, conforme à la consigne "services nécessitant Internet".
- **Reste à migrer** (hors périmètre de cette itération, colonnes `updated_at` déjà en place par
  cohérence) : `nutrition` (journal), `shopping_list`, `meal_plans`, `saved_meals` — et tout le module
  Fitness/Journal, prévu comme second module cible de la même infra générique.
- **Tests** (`src/lib/offline/offlineSync.test.ts`, `fake-indexeddb` + mock du client Supabase, même
  pattern que `strengthEngine.test.ts`) : 13 tests couvrant lecture/création/modification/suppression
  hors connexion, sync au retour réseau, opérations enchaînées avant reconnexion, coupure pendant la
  synchro + retry, idempotence (pas de doublon), conflit détecté + les deux résolutions, purge par
  compte (pas de fuite), généricité sur une table arbitraire. Suite complète : 1219 passed/32 skipped,
  `tsc --noEmit` 0 erreur, `vite build` OK, eslint clean sur tous les fichiers touchés (seuls des
  warnings `no-explicit-any` déjà tolérés ailleurs dans le repo, aucune erreur).
- **Branche non mergée** : `claude/cortex-offline-first-arch-hhan1x` poussée sur origin, PAS mergée
  vers `main` (contrainte d'environnement, cf. CLAUDE.md "Workflow Git et publication") — fusion
  manuelle restante avant que ce soit livré en prod/Lovable.

## Scan code-barres — création de produit quand introuvable (2026-07-28, branche `claude/missing-product-creation-6zzm6o`)
Demande : quand un scan de code-barres ne retourne rien (ni OpenFoodFacts ni USDA ni le catalogue
`foods`), ne plus se contenter d'afficher "Produit introuvable" — proposer à l'utilisateur de créer
le produit lui-même, disponible immédiatement et pour tous ses futurs scans.
- **Aucune nouvelle table `foods_custom` créée** (contrairement à la demande initiale) : le catalogue
  unifié `foods` (source='custom', `user_id`) + la table de liaison `food_barcodes` existaient déjà et
  sont exactement le mécanisme que `food-lookup` (edge function, `type:"barcode"`) interroge en premier
  (`food_barcodes.select("barcode, foods(*)")`) — créer une table séparée aurait dupliqué ce système et
  rendu le produit invisible du pipeline de recherche existant. Conforme à la règle CLAUDE.md "jamais
  de doublons de composants/tables".
- **Migration `20260728120000_custom_food_barcode_creation.sql`** (appliquée en direct via MCP Supabase,
  `types.ts` régénéré) : nouvelle RPC **`create_custom_food_with_barcode`** (SECURITY INVOKER — repose
  sur `foods_insert_own` déjà en place + 2 nouvelles policies INSERT bornées à "un aliment qui m'appartient"
  sur `food_barcodes`/`food_servings`, jusqu'ici lecture seule pour les utilisateurs, écriture réservée au
  service role de l'edge function). Insère atomiquement `foods` (source='custom') + `food_barcodes`
  (unique) + une portion par défaut optionnelle (`food_servings`, si quantité/unité fournies et
  convertibles en grammes). Rejette un code-barres déjà existant (`barcode_exists`).
- **`BarcodeScannerSheet.tsx`** : sur `lookupBarcode()` retournant `null`, nouvel état `notFoundCode`
  remplace l'ancien simple toast d'erreur — affiche un écran dédié (titre/texte/3 boutons : Créer le
  produit / Réessayer le scan / Annuler) puis un formulaire de création (nom*, marque, catégorie,
  quantité+unité g/ml/pièce, calories/lipides/glucides/protéines pour 100 g). Code-barres et auteur
  préremplis automatiquement (jamais saisis). À la création réussie, le produit rejoint directement le
  flux existant (WeightSelector + MealSelect + ajout nutrition) sans re-fetch — même Product shape que
  le retour OpenFoodFacts.
- Nouveau hook `useCreateCustomFoodWithBarcode.ts` (mutation React Query, invalide `custom_foods`).
- Vérifié : `tsc --noEmit` 0 erreur, `vitest run` 441 passed/32 skipped (inchangé, pas de nouveau test
  unitaire ce lot — logique 100% SQL/RPC + formulaire, cohérent avec le reste du catalogue foods), eslint
  clean sur les fichiers touchés (3 erreurs prettier préexistantes dans `BarcodeScannerSheet.tsx`,
  confirmées par diff contre la base avant modification, non liées), `vite build` OK.

## Refactor UX — Bibliothèque des repas unifiée (2026-07-27)
Objectif : supprimer le doublon entre l'écran dédié "Mes repas enregistrés" (`SavedMealsSheet`) et
l'onglet "Repas" de `FoodLibrarySheet` — une seule source de vérité désormais : Nutrition → Mes
aliments → Repas.
- **`SavedMealsSheet.tsx` supprimé.** Le mode "build" (composeur inline) a été extrait en composant
  autonome **`MealEditor.tsx`** (`src/components/fitness/MealEditor.tsx`), qui fonctionne en deux
  modes (`mode="create"` | `"edit"`, prop `meal?: SavedMeal | null` pour le préremplissage). Utilisé à
  la fois pour créer et pour éditer un repas enregistré — aucune deuxième implémentation du builder.
- **`SavedMealsList.tsx`** est maintenant la bibliothèque complète (bouton "Composer un repas" +
  liste + édition) — plus seulement une liste passive. Ajout d'un menu `⋮` (`SavedMealActionMenu`,
  inline dans le fichier, même pattern que `MealActionMenu.tsx`) avec **Modifier / Dupliquer /
  Supprimer**, remplace l'ancienne corbeille directe. "Modifier" ouvre `MealEditor` en mode edit en
  overlay (`FullscreenSheet` empilée, même pattern que `NutritionSheet` dans `FoodLibrarySheet`).
- **DB** : migration `20260727120000_saved_meal_update_duplicate_rpcs.sql` — RPC
  `update_saved_meal(p_id, p_name, p_meal, p_items)` (remplace intégralement les items, delete+
  reinsert, symétrique de `create_saved_meal`) et `duplicate_saved_meal(p_id)` (copie repas + items,
  suffixe " (copie)"), toutes deux ownership-check via `auth.uid()`. Appliquées en prod via MCP
  Supabase, `types.ts` régénéré (la régénération a aussi corrigé une dérive de schéma préexistante
  sur plusieurs tables non liées — DB fait foi).
- **`use-saved-meals.ts`** : `SavedMealItem`/le `select` de `useSavedMeals` étendus avec
  `food_id`/`base_*`/`consumed_*` (nécessaires pour reconstruire le builder en mode edit). Nouveaux
  hooks `useUpdateSavedMeal()`, `useDuplicateSavedMeal()`.
- **Centre de commandes (`NutritionTab.tsx`)** : section "Ajouter" ne garde que "Ajouter un aliment"
  (retrait de "Ajouter une recette" → `RecipeLogSheet` et "Repas enregistrés" → ancien
  `SavedMealsSheet`). Retrait aussi de "Favoris" dans la section "Outils" (doublon avec l'onglet
  Favoris de `FoodLibrarySheet`, cf. règle "un seul point d'entrée"). `RecipeLogSheet.tsx` et
  `FavoritesSheet.tsx` restent dans le repo (non supprimés, juste déréférencés — la demande portait
  sur le Centre de commandes, pas sur la suppression de ces écrans).
- **Test garde-fou** `mealSelectCoverage.test.ts` mis à jour : `SavedMealsSheet.tsx` → `MealEditor.tsx`
  dans la liste des écrans qui doivent rendre `<MealSelect>`.
- `npm run typecheck` / `npx vitest run` / eslint sur les fichiers touchés : tous verts.

## FIX Chroniques > Progression — fiche d'analyse coupée en bas iPhone (2026-07-26)
Diagnostic : « Déséquilibres détectés » est rendu par `ExerciseAnalysisSheet` via `SectionCard`. Le conteneur censé scroller est le `div` interne `flex-1 overflow-y-auto` de la page plein écran. Le paddingBottom existant était bien déclaré, mais un flex child sans `min-h-0` conserve une hauteur minimale basée sur son contenu : le contenu déborde alors dans la page fixe au lieu de créer un vrai espace de fin de scroll. Correction : page `motion.div` en `overflow-hidden`, header `shrink-0`, scroll container `min-h-0 flex-1 overflow-y-auto`, en conservant le padding dynamique `calc(var(--bottom-nav-height, 5.75rem) + env(safe-area-inset-bottom) + 2rem)`. `--bottom-nav-height` reste publié par `BottomNav` via `ResizeObserver` sur `documentElement`; la BottomNav est `z-30`, la fiche plein écran `z-50`, donc elle ne doit pas passer visuellement au-dessus de la fiche.

## Refonte page « Progression RPG » — Journal des promotions + correctif MEMORY erroné (2026-07-25)
Demande : simplifier `/progression`, supprimer le doublon avec la carte de l'accueil, et transformer
« Historique des promotions » en la SEULE chronologie officielle, alimentée automatiquement.
- **Supprimé** : la section « Historique de progression » (ladder statique des 6 Titres
  Mortel→Primordial, doublon exact de l'historique des promotions) et ses imports (`RANK_TIERS`,
  `Lock`, `Check`) dans `progression.tsx`.
- **Nouvelle table `rank_promotions`** (migration `20260725130000_rpg_promotion_history.sql`,
  appliquée en prod via MCP Supabase + `types.ts` régénéré) : `user_id`, `tier_index` (0..29),
  `xp_at_promotion`, `created_at`. RLS lecture seule (`auth.uid() = user_id`), aucune policy
  INSERT/UPDATE/DELETE cliente — écriture exclusivement via un trigger `SECURITY DEFINER`
  (`record_rank_promotions`, `AFTER INSERT OR UPDATE OF xp ON user_stats`) qui compare l'ancien/nouveau
  palier via `compute_tier_index_from_xp()` (copie SQL LECTURE SEULE de `XP_THRESHOLDS`/`tierForXp`,
  garde-fou de parité testé par `titleConfig.sql-parity.test.ts`, même pattern que
  `characterLevel.sql-parity.test.ts`). **Aucun calcul d'XP ni moteur de progression modifié** :
  `titleProgress.ts` reste l'unique source d'affichage, cette table ne fait que dater des
  franchissements déjà décidés ailleurs. Backfill inclus dans la même migration (XP au seuil, pas
  l'XP actuelle, pour les paliers déjà franchis par les joueurs existants).
- **Nouveau code pur** : `src/lib/fitness/rpg/promotionHistory.ts` (`buildPromotionEvents` — projette
  les lignes brutes sur Titre/Grade via `titleConfig.ts`, sans dupliquer les libellés) +
  `useRankPromotions.ts` (hook Supabase) + `PromotionHistoryTimeline.tsx` (cartes trophée pour un
  nouveau Rang / étoile discrète pour un Grade, halo `RankTheme` du rang concerné via les helpers
  existants — aucune couleur inline).
- **Bug préexistant démasqué et corrigé** : `src/integrations/supabase/types.ts` committé était
  drastiquement drift (38 tables au lieu de 92 réellement en base — `xp_events`, `reward_catalog`,
  `achievement_criteria`, etc. manquaient). Régénéré depuis la base (source de vérité, cf. règle
  CLAUDE.md). **⚠️ Correctif de l'entrée MEMORY du 2026-07-24 ci-dessous, qui était FAUSSE** : le
  schéma réel de `foods` est `normalized_name`/`protein_g`/`carbs_g`/`fat_g` (PAS `name_normalized`/
  `proteins`/`carbs`/`fats` comme affirmé le 24/07) — vérifié en direct contre la base de prod le
  25/07. Cette fausse affirmation explique très probablement pourquoi `NutritionSheet.tsx` a été
  « réparé » à l'envers par un commit Lovable ultérieur (09e5200 "Changes") : quelqu'un/Lovable a lu
  cette mémoire et « corrigé » vers les mauvais noms de colonnes. Ré-alignée sur le schéma réel dans
  cette session.
- Vérifié : `npm run typecheck` 0 erreur, `npm run lint` (0 nouvelle erreur — 1322 erreurs
  prettier/console préexistantes dans tout le repo, non liées), `vitest run` 431 passed/32 skipped
  (+5 nouveaux tests), `vite build` OK.

## FIX build Nutrition/Documents — alignement types + migration déversement documents (2026-07-24)
Correction des 2 erreurs TypeScript récurrentes signalées sur `NutritionSheet.tsx` et `use-documents.ts`.
- **NutritionSheet** : la table `foods` utilise le schéma canonique `name_normalized`, `proteins`, `carbs`, `fats` (pas `normalized_name`, `protein_g`, `carbs_g`, `fat_g`). Le code d'upsert d'aliment personnalisé est réaligné sur ces colonnes.
- **Documents** : diagnostic confirmé en base avant correction : `deposit_document_analysis` n'existait pas, `documents.extracted_items` n'existait pas, `documents.analysis` existait encore, et les colonnes `source_document_id` n'étaient pas présentes. La migration repo `20260723160000_document_deposit_pipeline.sql` a été appliquée en direct via Lovable Cloud, puis la fonction `deposit_document_analysis(uuid,jsonb)` a été passée en `SECURITY INVOKER` pour éviter d'ajouter une nouvelle alerte linter liée aux fonctions `SECURITY DEFINER` exécutables par les utilisateurs connectés.
- **Types** : `src/integrations/supabase/types.ts` a été régénéré automatiquement après migration : `documents` expose maintenant `extracted_items`, les tables métier exposent `source_document_id`, et la RPC `deposit_document_analysis` est typée. Les alertes linter restantes après correction (`extension public`, bucket public listable, anciens `SECURITY DEFINER` `get_user_streak_days`/`unlock_user_badge`) sont préexistantes et non liées à ce fix.

## Suppression complète de la progression secondaire — Salle des trophées, Succès, Quêtes (2026-07-23, branche `claude/remove-secondary-progression-bku2m1`)
Demande explicite de Nathan : ne conserver QUE la progression par Niveau/Rang. Suppression totale, front + base, de trois systèmes (aucun ne versait déjà d'XP depuis la migration `20260721130500_rpg_reward_engine_pure_training_economy.sql` — pure couches de prestige/collection/suivi personnel).
- **Salle des trophées / Succès** (système unifié) : suppression de `TrophyRoom.tsx`/`TrophyRoomPreview.tsx`, `BadgeMedallion.tsx`, `BadgeUnlockOverlay.tsx`, `achievementIcons.ts`, `components/profile/shared.tsx` (orphelin après coup), `useAchievements.ts`, `useClaimAchievements.ts`, `useBadgeHighlights.ts`, `useBadgeSystem.ts`, `lib/fitness/badges.ts`, `lib/fitness/rarityVisuals.ts`, tout `src/lib/profile/achievements/**` (moteur des ~165 succès + définitions par catégorie), route `/trophees`. `lib/profile/achievements/muscleVolume.ts` déplacé (pas supprimé) vers `src/lib/profile/muscleVolume.ts` : ce n'était pas de la logique de succès mais l'agrégation d'activité par groupe musculaire utilisée par `ProfileRPGData` pour nourrir `RankAggregator` — toujours nécessaire.
- **Quêtes** (= le système "Goals") : suppression de `GoalsManager.tsx`, `QuestsPanel.tsx`/`QuestsPreview.tsx`, `useGoalsWithProgress.ts`, route `/quetes`. Retiré des consommateurs externes : `useExerciseAnalysis.ts`/`lib/fitness/analysis/profile.ts` (inférence d'objectif ne dépend plus des goals actifs), `CoachSheet.tsx`/`lib/fitness/engines/senseiBriefing.ts` (briefing Sensei sans `activeGoals`). **Ne pas confondre** avec `nutrition_goals` (objectifs caloriques, `GoalsSheet.tsx`) : table et écran totalement différents, non touchés.
- **Écrans hôtes édités** (pas supprimés, TrophyRoom/Quests en étaient un module parmi d'autres) : `profil.tsx` (retire les deux cartes preview), `ProfileRPGData.tsx` (ne calcule plus `achievements`/`legacyBadges`), `ChroniquesPage.tsx`/`ProgressionModule.tsx` (le module « Progression » des Chroniques perd sa section Trophées, garde Hall of Fame/tendances/techniques oubliées/chronologie), `SessionRewardScreen.tsx` (perd le bloc « Badge débloqué », garde XP/niveau/record).
- **Base de données** : nouvelle migration `20260723170000_drop_achievements_quests_trophies.sql` — `DROP TABLE` sur `goals`, `badges_catalog`, `user_badges`, `user_achievements`, `achievement_criteria` (CASCADE, droppe policies/triggers/index propres) + `DROP FUNCTION` sur `claim_achievement`, `unlock_user_badge`, `award_goal_xp`, `award_xp_on_badge`, `award_xp_on_goal_complete`, `award_time_of_day_badges` (+ son trigger sur `workouts`, seule table hors du périmètre CASCADE). **Pas appliquée directement** (conforme au workflow du CLAUDE.md : migration → merge → `migrate.yml` l'applique → `npm run gen:types` régénère `types.ts`) — `types.ts` n'a donc volontairement PAS été touché dans cette session, il reste correct tant que la migration n'est pas mergée.
- **Conservé intact** (vérifié explicitement) : le moteur XP/Niveau/Rang (`rewardSources.ts` — 3 familles restantes : `workout_muscu`/`workout_support`/`streak`, plus `exercise_progress_record`/`exercise_rank_up_*` server-only), `sessionReward.ts` garde les libellés `badge`/`goal` dans `SOURCE_META` (affichage lecture-seule des `xp_events` historiques déjà versés avant P1.7, repli "Bonus" sinon — pas du code mort, juste plus jamais alimenté).
- Vérifié : `tsc --noEmit` 0 erreur nouvelle (2 erreurs préexistantes confirmées par diff contre `HEAD`, non liées : `NutritionSheet.tsx`/`use-documents.ts`), `vitest run` 423 passed/32 skipped (0 échec), `vite build` (SSR + client) OK, `routeTree.gen.ts` régénéré sans `/trophees`/`/quetes`, grep exhaustif confirmant zéro référence restante à `TrophyRoom`/`useAchievements`/`useBadgeSystem`/`useGoalsWithProgress`/`achievements/`/`fitness/badges` dans `src/`.

## LOT RPG-P1.13 « Les 6 illustrations de rang sont livrées » (2026-07-21, branche `claude/rank-card-dynamic-ksk5ia`)
Nathan fournit les 5 illustrations manquantes (Mortel/Héros/Titan/Olympien/Primordial, même DA que `guerrier.webp` — disque forgé + nom incrusté). Fichiers reçus en pièces jointes du chat (WebP déjà, ~1122×1402) mais **sans** être matérialisés sous `/root/.claude/uploads/...` cette fois (pas de référence `@chemin` dans le message) — extraits directement du transcript de session (`~/.claude/projects/.../*.jsonl`, blocs `image`/`base64` du message utilisateur) faute d'autre point d'accès disque.
- **Traitement identique à `guerrier.webp`** pour rester dans le contrat `FORMAT.md` : recadrage centré à 960×1200 exact (4:5), export WebP qualité 78–82 (toutes < 250 Ko : mortel 125 Ko, heros 161 Ko, titan 156 Ko, olympien 206 Ko, primordial 226 Ko). Nommage exact `src/assets/ranks/{mortel,heros,titan,olympien,primordial}.webp` — aucun code touché, `getRankIllustration()`/`import.meta.glob` les détectent automatiquement.
- **Vérifié visuellement** (les 5 fichiers relus après traitement) : bon rang par bon fichier (aucune permutation), texte du titre net et non rogné, aucune déformation liée au recadrage 4:5.
- Vérifié : `tsc --noEmit` 0 erreur, `vitest run` 409 passed/36 skipped (test `index.test.ts` réécrit — il asserait auparavant `null` pour ces 5 rangs, ce qui n'est plus vrai ; nouvelle version vérifie que chaque rang résout SON fichier et jamais celui d'un autre, sans dépendre de l'inventaire de fichiers présents), `vite build` (SSR + client) OK, les 6 `.webp` bundlés avec hash distinct. Eslint : fichiers de cette session propres (le reste du dépôt porte une dette prettier préexistante massive, déjà documentée en P1.11/P1.12, non touchée).
- Le repli « Illustration à venir » (`RankIllustration.tsx`/`placeholder.webp`, ajouté en P1.12) n'a donc plus l'occasion de s'afficher pour aucun rang tant que les 6 fichiers restent en place — toujours actif si un fichier venait à disparaître.

## LOT RPG-P1.12 « Illustrations de rang — retrait du repli inter-rang + format figé » (2026-07-21, branche `claude/rank-card-dynamic-ksk5ia`)
Dernier ajustement avant merge demandé par Nathan sur le LOT RPG-P1.11 ci-dessous : le repli « rang précédent le plus proche » posait un problème produit (un rang sans illustration affichait celle d'un AUTRE rang, ce qui est trompeur) ; il fallait aussi figer le format pour que les 5 illustrations restantes (Mortel/Héros/Titan/Olympien/Primordial) se déposent sans toucher au code.
- **Repli inter-rang supprimé** : `getRankIllustration(key)` (`src/assets/ranks/index.ts`) ne renvoie plus QUE le fichier exact du rang demandé (ou `null`) — retire `RANK_ORDER`/la boucle de repli introduits en P1.11. Nouveau `getPlaceholderIllustration()` lit `assets/ranks/placeholder.webp` s'il existe (même mécanisme `import.meta.glob`, zéro code à ajouter le jour où il est déposé). `RankIllustration.tsx` chaîne les deux : illustration du rang → `placeholder.webp` → carte générique « Illustration à venir » (icône + label + mention, bordure en pointillés) — jamais l'image d'un autre rang. Nouveau test `src/assets/ranks/index.test.ts` verrouille ce contrat (échouera si un futur repli inter-rang est réintroduit par erreur).
- **Format figé pour un dépôt sans adaptation** : `src/assets/ranks/FORMAT.md` (nouveau) documente le contrat que toute illustration doit respecter — ratio exact 4:5 (ex. 1200×1500px), zone de sécurité (6% largeur / 4% hauteur), et surtout **le cadrage en deux bandes fixes identiques sur les 6 rangs** : bande haute 0–80% (le carré exact largeur×largeur, sujet/emblème — SEULE zone garantie visible partout) + bande basse 80–100% (nom du rang incrusté, visible uniquement dans les conteneurs plein ratio 4:5). `RankIllustration` applique désormais un unique `object-position: top` (classe Tailwind `object-top`) sur TOUTES les instances : dans un conteneur exact 4:5 (Hero/RankUpOverlay/ShareSheet) aucun recadrage ne se produit (ratio identique) donc l'image entière + titre s'affichent ; dans un médaillon carré compact (`ExerciseRankBadge`/`MiniRankTile`) `object-fit: cover` ne montre que la bande haute (sujet), coupe la bande basse (titre) — comportement voulu et identique pour tous les rangs, aucune logique conditionnelle par rang. Corrigé au passage : `RankUpOverlay` utilisait un `h-64 w-52` légèrement hors 4:5 (0.8125 au lieu de 0.8) → remplacé par `aspect-[4/5] w-52` (ratio garanti exact, quelle que soit la largeur).
- Vérifié : `tsc --noEmit` 0 erreur, `vite build` (SSR + client) OK, `vitest run` 409 passed/36 skipped (+3 nouveaux tests du contrat de repli), eslint clean sur les fichiers touchés.
- État des assets : seul `guerrier.webp` existe. `mortel`/`heros`/`titan`/`olympien`/`primordial` affichent désormais la carte « Illustration à venir » (plus l'art du Guerrier) tant que leurs fichiers ne sont pas déposés — comportement volontaire de cette session.

## LOT RPG-P1.11 « Illustrations officielles du rang — système graphique unique » (2026-07-21, branche `claude/rank-card-dynamic-ksk5ia`)
Nathan fournit les illustrations officielles par rang (image AI, portrait 4:5, nom du rang déjà incrusté — ex. `guerrier.webp`) et demande qu'elles remplacent **tout** l'ancien système graphique SVG/CSS du RPG ("Disque", "Blason", sigils, particules ambiantes), pour qu'il n'existe plus qu'**une seule façon** de représenter un rang dans toute l'app.
- **Nouveau système, source unique** : `src/assets/ranks/<clé>.webp` (mortel/guerrier/heros/titan/olympien/primordial — seul `guerrier.webp` livré à ce jour). `src/assets/ranks/index.ts` mappe rang → fichier via `import.meta.glob("./*.webp", { eager: true })` (déposer un fichier suffit, **zéro code à modifier**) avec repli automatique sur l'illustration du rang précédent si absente (`getRankIllustration`, ordre dérivé de `RANK_TIERS`, pas de rang codé en dur). `src/components/rpg/RankIllustration.tsx` est **l'unique composant partagé** : `<img object-cover loading="lazy">` + placeholder texte générique si aucune image ; zéro `if`/`switch` par rang.
- **Tous les points d'affichage d'un rang migrés vers `RankIllustration`** : `ProfileHeroCard` (Hero Accueil, illustration plein cadre, pas de titre superposé car déjà incrusté dans l'image), `RankUpOverlay` (cinématique de montée de rang — remplace le `RankDisc` 220px), `ExerciseRankBadge` (médaillon compact réutilisé par `ExerciseRankCard` et `ExerciseRankStrip`/`MiniRankTile` — illustration + pastille niveau romain superposée, seule info absente de l'image), `ExerciseRankShareSheet` (carte de partage 4:5 Instagram/X — l'illustration EST désormais la carte, stats/mastery bar en scrim par-dessus).
- **Suppression complète du code devenu mort** (vérifié zéro référence restante avant suppression) : `RankDisc.tsx`, `RankAmbientParticles.tsx`, `Blason.tsx` (déjà inutilisé avant cette session), `RankSigil.tsx`, `premium/discUniverse.ts`, `premium/rankUniverse.ts`, `lib/fitness/rankVisuals.ts` (`getRankVisual`/`RANK_VISUALS`/`SigilKind`). `ClassCard.tsx` (seul autre consommateur de `getRankVisual`, pour une couleur d'icône cosmétique) bascule sur `rank.colors.secondary` (déjà dans `exerciseRanks.ts`, jamais supprimé). **Conservé intact** : `RANK_TIERS`/`rank.colors` (`exerciseRanks.ts`) — utilisé pour mastery bar/texte/glow, ce n'est pas une représentation graphique du rang mais un token de couleur métier ; `premium/tokens.ts` (EASE_OUT, stagger…) toujours utilisé partout ; toute la logique métier (PS, saisons, grades, progression, moteur de rang par exercice) intouchée.
- Vérifié : `tsc --noEmit` 0 erreur, `vite build` (SSR + client) OK, `vitest run` 406 passed/36 skipped (inchangé), eslint clean sur tous les fichiers touchés (erreurs prettier restantes sur `ExerciseRankCard.tsx`/`ExerciseRankShareSheet.tsx` confirmées préexistantes par diff contre `HEAD`, non introduites par cette session).
- Suite logique possible (non faite, hors périmètre) : livrer `mortel.webp`/`heros.webp`/`titan.webp`/`olympien.webp`/`primordial.webp` (repli sur `guerrier.webp` actif en attendant) ; `docs/architecture/rpg-vision-et-r1-niveau-personnage.md` documente encore l'ancien Disque, à rafraîchir dans une session dédiée aux docs.

## FIX SUP-MRV2ZUZJ-PQPX « Séance créée en UI mais jamais enregistrée en base » (2026-07-21, branche `claude/sup-mrv2zuzj-pqpx-training-save-4o795d`)
Bug critique : `award_character_xp` avait DEUX overloads en base — `(uuid, text, integer, uuid)` (historique) et `(uuid, text, integer, uuid, text)` (ajouté par P1.5, `20260721120000_rpg_reward_catalog_p1_5.sql`, sans retirer l'ancien). Les paramètres 4 et 5 ayant tous deux un `DEFAULT`, tout appel à 4 arguments — exactement celui utilisé par le trigger `award_xp_on_workout_complete()` (AFTER INSERT/UPDATE OF status sur `workouts`) — devenait ambigu pour Postgres : `function ... is not unique`, confirmé en direct dans les logs Postgres du projet (répété à chaque tentative depuis le déploiement de P1.5). Une exception dans un trigger annule toute la transaction, y compris l'écriture de la ligne `workouts` elle-même : toute séance entrant dans l'état `completed` (clôture live via `useFinishWorkout`/`useFinishGenericActiveWorkout`, ou création directe déjà terminée via `useAddWorkout` — `workouts.status` vaut `completed` par défaut) échouait silencieusement côté base, d'où l'impression que "la séance disparaît après actualisation". Le code front (`use-fitness.ts`, `useGenericActiveSession.ts`) a été audité en entier et n'a révélé aucun bug (awaits corrects, aucun catch vide, invalidations React Query cohérentes) — la cause était 100% côté base.
- **Correction** (migration `20260721140000_fix_award_character_xp_ambiguous_overload.sql`, appliquée en direct sur le projet Supabase via MCP) : `DROP FUNCTION` de l'overload à 4 arguments, devenu redondant (le 5-arg couvre le même comportement, `_dedup_key` retombe sur `DEFAULT NULL`). Aucun appelant à modifier.
- **Vérifié en base** : plus qu'un seul overload (`pg_proc` requêté après coup) ; INSERT `workouts` avec `status='completed'` dans une transaction annulée (ROLLBACK volontaire, aucune donnée réelle modifiée) ne lève plus d'erreur, alors qu'avant le fix c'était systématique.

## LOT RPG-P1.10 « Audit classement incohérent — Hero/Progression affichaient le Rang par exercice au lieu du Titre » (2026-07-21, branche `claude/audit-ranking-reward-engine-vppm4n`)
Nathan signale être affiché « Olympien » alors que le recalibrage P1.8 des `XP_THRESHOLDS` aurait dû le faire redescendre. Audit complet demandé avant toute correction.
- **Recalcul indépendant** : XP réelle en base (`user_stats.xp` du compte `turneur555@gmail.com`, le seul avec un historique de séances dans ce projet Supabase) = **2010**. `titleProgressForXp(2010)` (moteur inchangé, seuils `XP_THRESHOLDS` officiels) → **Titre Guerrier, Grade Aspirant**, palier courant 1800→2600, 590 XP restants. Confirmé par les 47 tests `rpg/*` (dont `titleProgress.test.ts`) et un appel direct au moteur — **jamais Olympien**.
- **Cause racine identifiée par bisect git** : le commit `a825686` (P1, même journée) avait bien migré `ProfileHeroCard.tsx`/`RPGProgressionSection.tsx` vers `titleProgressForXp` (XP globale). Un commit UI ultérieur, **`0822e98` (« Finition Profil »), a réintroduit `rankAggregate.best`** (moteur de **Rang par exercice**, `RankAggregator`/`src/lib/fitness/rank/engine.ts` — force relative 1RM/poids de corps, gates Olympien/Primordial, **totalement indépendant de l'XP globale**) comme source d'affichage du Hero et du "Grade actuel", sans que l'auteur du commit s'en aperçoive : les deux moteurs réutilisent délibérément les mêmes 6 libellés/couleurs (`RANK_TIERS`, cf. docstring `titleProgress.ts` : « mêmes noms/couleurs... mais AUCUN lien de calcul »), donc la régression était visuellement invisible. Un commit de suivi (`2603287`) n'a fait que réparer le câblage des props sans détecter le changement de moteur. Cohérent avec l'avertissement du CLAUDE.md sur le dossier Drive désynchronisé/éditions Lovable sur une version obsolète.
- **Correction à la source** (aucun patch local) : `ProfileHeroCard.tsx` et `RPGProgressionSection.tsx` recalculent de nouveau `titleProgressForXp(useUserStats().xp)` en interne (plus de prop `rankAggregate`, retirée des 3 call sites `FusionDashboard.tsx`/`routes/_authenticated/index.tsx`/`routes/_authenticated/progression.tsx` — `ClassCard`/`StatChip "Rang moyen"` continuent légitimement d'utiliser `rankAggregate`, système à part). Aucune autre régression trouvée : `SessionRewardScreen.tsx` utilisait déjà correctement `buildTitleTransition`/`titleProgress` ; aucune colonne DB ne cache un Titre/Grade (toujours dérivé en direct de `user_stats.xp`, jamais stocké) ; le seul cache local (`localStorage cortex:hero-rank-tier`) a été supprimé avec le code qu'il servait.
- Vérifié : vitest 406 passed/36 skipped, tsc 0 erreur, eslint clean (fichiers touchés), `vite build` OK.

## LOT RPG-P1.9 « Reward Engine — validation finale » (2026-07-21, branche `claude/session-a32s21`)
Dernière passe de vérification avant de considérer le Reward Engine terminé (aucun changement de code — les deux vérifications passent sans détecter de déséquilibre).
- **Écart entre profils** : simulation sur 5 fréquences (1/2/3/5/7 séances/semaine), répartition XP par source (séance/streak/records/rang) et temps pour atteindre chaque Titre. Écart net et monotone : Primordial atteint en ~17 ans à 1 séance/sem contre ~2,2 ans à 7/sem (~8×, proportionnel à l'écart de fréquence) ; Titan en ~3,25 ans (1/sem) contre ~0,49 an (7/sem). Aucun chevauchement anormal entre profils.
- **Farming par rotation d'exercices** : comparaison Joueur A (exercices fixes) vs Joueur B (renouvelle systématiquement ses exercices). Un exercice inédit déclenche presque toujours un `exercise_progress_record` (aucun historique à battre) — avantage réel mais **doublement borné** : (1) le rendement décroissant est partagé par SEMAINE tous exercices confondus (au-delà du 4ᵉ événement, plancher 40 % = 12 XP, quel que soit le nombre d'exercices ajoutés) ; (2) `exercise_rank_up` exige un historique RÉEL et soutenu sur le MÊME exercice (fenêtre de consolidation de 8 séances, gates de confirmation Olympien/Primordial à 30-60 jours d'étalement) — un renouvellement systématique interdit à toute exercice de dépasser Mortel/Guerrier, ce qui prive définitivement le Joueur B des paliers `exercise_rank_up` (jusqu'à 350 XP/exercice/Titre), la source la plus généreuse à long terme. Sur plusieurs années, l'avantage de court terme du renouvellement est annulé, voire dépassé, par la perte cumulée de rang. **Aucune correction nécessaire.**
- Vérifié : tsc 0 erreur, vitest 406 passed/36 skipped, aucun fichier modifié (working tree propre avant cette passe).
- **Reward Engine officiellement terminé** (P1 → P1.9). Prochain chantier à la demande de Nathan : Phase 2 (Voies).

## LOT RPG-P1.8 « Recalibrage complet des seuils, à partir de zéro » (2026-07-21, branche `claude/session-a32s21`)
Suite de P1.7 : confirmation du mécanisme `exercise_progress_record` (relu dans le SQL réel — un seul `IF has_progress`/un seul `PERFORM award_diminishing_reward` par exercice et par séance, quel que soit le nombre de métriques battues) + recalibrage intégral des seuils, sans aucun héritage des tables précédentes (consigne explicite de Nathan : « n'essaie pas de conserver les anciens chiffres »).
- **Nouvelle simulation** (script Python jetable, non committé) sur l'économie réduite à 5 familles (P1.7) : Débutant 296→57 640 XP (1sem→5ans), Régulier 454→98 688, Passionné 683→158 292, Extrême 851→202 050.
- **`XP_THRESHOLDS` (`titleConfig.ts`) entièrement remplacés** (30 valeurs recalculées de zéro à partir de cette courbe, plus aucun lien avec les seuils P1/P1.6/P1.7) : Mortel 0→1350, Guerrier 1800→6450, Héros 8000→18500, Titan 22000→43000, Olympien 50000→83700, Primordial 95000→226000.
- **Vérification** : Débutant Olympien II à 5 ans ; Régulier Primordial I ; Passionné Primordial III ; Extrême **Primordial IV** (Grade V toujours hors de portée à 5 ans) — différenciation nette entre profils à chaque horizon, aucun plafonnement, y compris pour le profil le plus assidu.
- Vérifié : vitest 406 passed/36 skipped (inchangé, seuils testés dynamiquement — aucune valeur codée en dur dans les tests), tsc 0 erreur, eslint clean, `vite build` OK.
- **Reward Engine + courbe de progression considérés définitifs par Nathan** à l'issue de cette passe. Prochain chantier à la demande de Nathan : Phase 2 (Voies).

## LOT RPG-P1.7 « Économie d'XP réduite à la seule progression réelle » (2026-07-21, branche `claude/session-a32s21`)
Audit complet (table exhaustive : nom, XP, condition exacte, répétable, fréquence max, calculé où, statut, validé/proposé) ayant révélé plusieurs doublons réels (`pr_muscu` vs `exercise_weight_record` ; Achievements vs Badges sur 5 compteurs partagés — séances, streak, protéines, mensurations, séances/semaine). Décisions de Nathan : une progression réelle = une seule récompense XP ; Badges/Achievements/Goals deviennent des couches de prestige/collection/suivi personnel, plus aucune XP ; le Rang par exercice doit être 100% automatique (jamais d'action manuelle).
- **Migration `20260721130500_rpg_reward_engine_pure_training_economy.sql`** :
  - `pr_muscu` retiré du catalogue (`active=false`, historique `xp_events` préservé) — doublon direct de `exercise_weight_record`, absorbé par lui.
  - Les 4 anciennes sources de record (poids/reps/volume/1RM) désactivées, remplacées par **une source unique `exercise_progress_record`** (30 XP, même rendement décroissant hebdomadaire `exercise_progress`) : le trigger `award_xp_on_workout_complete` calcule toujours les 4 métriques par exercice (utile pour de futures statistiques) mais ne verse plus qu'UNE récompense par exercice et par séance si au moins une métrique progresse — jamais 4.
  - `unlock_user_badge`, `award_goal_xp`, `claim_achievement` : l'appel à `award_character_xp` est retiré des trois fonctions (validation/persistance/idempotence conservées intégralement — badges et achievements restent une vraie collection server-vérifiée, les objectifs un vrai outil de suivi, seul le versement d'XP disparaît). Corrige de facto la faille de farming des Goals signalée en P1.6 (plus d'XP en jeu → plus d'exploit économique possible).
- **Rang par exercice 100% automatique** : nouveau `src/hooks/useVerifyExerciseRanksForSession.ts`, appelé automatiquement dans `useFinishWorkout` (`use-fitness.ts`) pour chaque exercice distinct de la séance qui vient de se clôturer — appelle `verify-exercise-rank` sans aucune action du joueur. `ExerciseRankCard.tsx` ne fait plus AUCUN appel réseau de récompense : la détection locale (`localStorage`) ne sert plus qu'à déclencher l'animation `RankUpOverlay`, la fiche exercice redevient un pur affichage.
- **UI** : retrait des mentions "+XP" désormais mensongères sur les Badges (`TrophyRoom.tsx`) et les Goals (`GoalsManager.tsx`).
- **Économie XP finale : 5 familles seulement** — `workout_muscu`, `workout_support`, `streak`, `exercise_progress_record`, `exercise_rank_up_<6 titres>`. Zéro doublon, zéro déclenchement manuel requis, zéro risque de farming identifié.
- **Seuils `XP_THRESHOLDS` (`titleConfig.ts`) recalibrés** pour la nouvelle économie, bien plus légère (plus de badges/achievements/goals/pr_muscu qui gonflaient artificiellement le total). Nouvelle simulation (4 profils × 6 horizons, script Python jetable non committé) : Débutant (2 séances/sem) atteint Titan IV à 5 ans ; Régulier (3-4/sem) Olympien V à 5 ans ; Passionné (5-6/sem) Olympien I à 2 ans puis Primordial III à 5 ans ; Extrême (quasi quotidien) Olympien III à 2 ans puis **Primordial IV à 5 ans (Grade V encore hors de portée)** — plus aucun profil ne plafonne avant 5 ans, y compris le plus assidu.
- Vérifié : vitest 406 passed/36 skipped (inchangé, pas de nouveau test unitaire — travail 100% SQL/seuils, `validate-supabase.mjs` seul filet côté migrations), tsc 0 erreur, eslint clean (fichiers touchés ; dette prettier pré-existante dans `ExerciseRankCard.tsx`/`GoalsManager.tsx` hors zone touchée, non corrigée), `vite build` OK.
- **Reward Engine considéré définitif par Nathan** à l'issue de cette passe : 5 sources, moteur générique, seuils recalibrés, aucune confiance cliente résiduelle sur l'attribution d'XP. Prochain chantier à la demande de Nathan : Phase 2 (Voies).

## LOT RPG-P1.6 « Reward Engine 100% serveur-autoritaire » (2026-07-21, branche `claude/session-a32s21`)
Fin de toute confiance cliente, même partielle, sur les deux derniers points signalés par Nathan.
- **`exercise_rank_up` recalculé ENTIÈREMENT côté serveur.** Le client n'envoie plus que l'identité de
  l'exercice (nom + `exercise_reference_id` optionnel) — plus aucun Titre, palier ou 1RM calculé côté
  client. Nouvelle Edge Function **`supabase/functions/verify-exercise-rank/`** : reconstruit l'historique
  complet (`exercise_sets`/`exercises`/`workouts` complétés, RLS-scopé à l'utilisateur) + le poids de corps
  (`body_tracking`), recalcule le Rang via **`supabase/functions/_shared/rankEngine.ts`** — une copie
  fidèle et volontaire du VRAI moteur (`src/lib/fitness/rank/engine.ts`+`config.ts`+
  `familyClassification.ts`), les Edge Functions Deno ne pouvant pas importer `src/` (alias `@/` non
  résolvables, cf. commentaire déjà présent dans `analyze-exercise/index.ts`). Verse l'XP via le service
  role (`award_character_xp` étendu, `GRANT ... TO service_role`), un Titre à la fois, jamais deux fois
  (`dedup_key` = `exercise_rank_up:<exerciseKey>:<titreKey>`, une fois pour toutes par exercice+Titre).
  Ancienne RPC cliente `award_exercise_rank_up` (faisait confiance à un `_titre_key` déclaré) **retirée**.
  **Garde-fou anti-dérive réellement exécuté** (pas seulement statique) : nouveau
  `src/lib/fitness/rank/rankEngine.sql-parity.test.ts` — exécute LES DEUX implémentations sur 300 historiques
  synthétiques aléatoires et vérifie un `confirmedTierIndex` identique (même esprit que
  `characterLevel.sql-parity.test.ts`, mais ici les deux côtés tournent réellement en JS/TS, contrairement
  au SQL qui n'est vérifiable qu'à l'exécution en base — indisponible dans cette session).
  `useAwardExerciseRankUp`/`ExerciseRankCard.tsx` appellent désormais l'Edge Function au lieu de l'ancienne RPC.
- **Achievements vérifiés serveur, comme les Badges.** `claim_achievement` ne fait plus confiance au
  montant/à l'éligibilité déclarés par le client : nouvelle table `achievement_criteria` (mappe le PRÉFIXE
  d'un succès à seuil — format `buildMilestoneSeries` : `<prefix>_<tierIndex>_<seuil>`, le seuil est déjà
  dans l'ID — à une statistique calculable serveur) + `compute_achievement_stats` (étend
  `compute_fitness_stats` sans le modifier : ajoute `distinct_months_active`/`total_volume_kg`/
  `total_sets`/`total_reps`/`distinct_exercise_count`/`guided_sessions_count`/`course_sessions_count`).
  **12 familles mappées dans cette passe** (endurance_workouts/streak/months_active, strength_total_volume,
  hyper_sets/reps, exploration_distinct_exercises, nutrition_protein_days, body_measurements,
  guided_sessions, running_sessions, recovery_weekly_target). **Familles non mappées → 0 XP** (pas de
  confiance résiduelle) : `first_steps` (non-tiered), `rpg_*` (nécessiterait le moteur de Rang — candidat
  naturel pour une extension future de `verify-exercise-rank`, qui connaît déjà le Rang réel), `secret_*`,
  `collection_*` (méta), `body_weight_change`, `recovery_weekly_streak`, `hyrox_simulations`, prépas course
  booléennes. **Aucune régression** : ces familles ne versaient déjà aucune XP avant ce chantier.
- Vérifié : vitest **406 passed/36 skipped** (+2, dont la parité exécutée réellement), tsc 0 erreur,
  eslint clean (fichiers touchés ; erreurs prettier pré-existantes dans `ExerciseRankCard.tsx` hors zone
  touchée, non corrigées), `validate-supabase.mjs` ✅, `vite build` OK. Edge Function non testable en
  live dans cet environnement (pas de runtime Deno, pas d'instance Supabase liée) — logique métier
  couverte par le test de parité + revue manuelle attentive de la requête PostgREST embarquée
  (`exercises.select("...,workouts!inner(...)")` + `.eq("workouts.status", ...)`, idiome standard mais
  jamais exécuté ici) ; à valider par Nathan après déploiement.
- **Reward Engine considéré quasiment définitif par Nathan** à l'issue de ce lot (P1 → P1.6) : moteur
  générique, catalogue centralisé, rendement décroissant, records d'exercice, badges/objectifs/succès tous
  server-autoritaires. Prochain chantier RPG à la demande de Nathan : Phase 2 (Voies).

## LOT RPG-P1.5 « Reward Catalog complet — unique source de vérité XP » (2026-07-21, branche `claude/session-a32s21`)
Suite du Reward Engine générique (P1) : audit exhaustif de toutes les actions du joueur (fitness/nutrition/Chroniques/défis/succès/saisons/profil) validé par Nathan, puis implémentation. Décisions actées : **Saisons et Chroniques restent hors économie XP** (Saisons = PS uniquement, jamais d'XP permanent — `docs/architecture/rpg-saisons.md` §9 ; Chroniques = récit de séances déjà récompensées, aucun événement `chronicle_*`) ; **Rang par exercice reste 6 sources distinctes** (pas de fusion), avec **rendement décroissant** plutôt qu'un plafond brutal.
- **Migration `20260721120000_rpg_reward_catalog_p1_5.sql`** :
  - `reward_catalog` gagne `diminishing_group`/`diminishing_curve` (rendement décroissant générique, réutilisable par toute future source) + `award_diminishing_reward()` (100%/80%/60%/40% puis plancher, décompte hebdomadaire par groupe).
  - **Records par exercice** (`exercise_weight_record`/`exercise_reps_record`/`exercise_volume_record`/`exercise_1rm_record`, groupe `exercise_progress`) : détectés 100% serveur dans `award_xp_on_workout_complete` (nouvelle boucle par exercice de la séance, même patron de confiance que `pr_muscu` — aucune valeur cliente, tout recalculé depuis `exercise_sets`/historique complété). Distincts de `pr_muscu` (legacy, niveau séance, inchangé) — chevauchement conscient, non résolu dans cette passe.
  - **`exercise_rank_up_<titre>`** (6 sources, une par famille Mortel→Primordial, XP croissante 20→350) : nouvelle RPC `award_exercise_rank_up(_titre_key, _exercise_reference_id, _exercise_name, _workout_id?)`. Ne reproduit PAS le moteur de classification (`rank/engine.ts`, resté seule source de vérité du Titre — le dupliquer en SQL aurait recréé le risque de dérive qui a déjà causé 3 bugs historiques sur la courbe de Niveau) : exige à la place la preuve qu'un nouveau meilleur 1RM estimé (Epley) a été atteint sur CET exercice, au-delà de tout l'historique complété — le client reste seul juge de QUEL Titre cela représente. `_workout_id` optionnel (résolution auto à la dernière séance complétée contenant l'exercice) car le point de détection existant (`ExerciseRankCard`, ouverture de fiche) ne connaît que le nom de l'exercice.
  - **Badges et objectifs migrés vers `xp_events`** : `unlock_user_badge`/`award_goal_xp` appellent désormais `award_character_xp` (même montants, même idempotence) au lieu d'écrire `user_stats` directement — le ledger est désormais complet pour toutes les sources.
  - **Persistance des Achievements** (`user_achievements` + RPC `claim_achievement`) : les ~196 succès (`src/lib/profile/achievements/`), jusqu'ici recalculés en direct côté client et jamais persistés (`xpReward` seulement affiché, jamais versé), sont désormais réclamables une fois. **Limite assumée** (contrairement aux badges) : les critères ne sont pas revalidés serveur, seuls l'idempotence (contrainte unique) et un plafond dur (1000 XP) protègent — renforcement possible plus tard.
- **Client** : `useClaimAchievements` (nouveau, branché dans `useAchievements.ts`) réclame automatiquement tout succès nouvellement débloqué. `useAwardExerciseRankUp` (nouveau) branché dans `ExerciseRankCard.tsx`, exactement au point de détection existant (comparaison `tierIndex` via `localStorage`). `rewardSources.ts` documente les nouveaux préfixes de sources.
- **Non touché** : moteur Rang/Maîtrise par exercice, Saisons (`sp_events`), classification des succès (100% client, critères inchangés).
- Vérifié : vitest 404 passed/36 skipped (inchangé, pas de nouveau test unitaire ce lot — tout le nouveau code est SQL/RPC, validé par `validate-supabase.mjs` uniquement, pas testable en local sans instance Supabase liée), tsc 0 erreur, eslint clean sur les fichiers touchés (2 warnings `any` volontaires, même pattern que l'existant ; erreurs prettier pré-existantes dans `ExerciseRankCard.tsx` hors zone touchée, non corrigées), `vite build` OK.
- **Différé** : dédupliquer `pr_muscu` vs `exercise_weight_record` (chevauchement conscient) ; renforcer `claim_achievement` avec une revalidation serveur des critères (comme les badges) si l'abus s'avère un problème réel ; câbler d'éventuelles futures sources (nutrition/récupération/habitudes) suivront le même patron catalogue.

## LOT RPG-P1 « Progression principale (Titre/Grade) + Reward Engine générique » (2026-07-21, branche `claude/session-a32s21`)
Refonte validée par Nathan (3 allers-retours de cadrage) : la progression principale affichée au joueur devient **Titre + Grade + XP actuel + XP restant avant le prochain Grade** (plus jamais de "Niveau" numérique ni de pourcentage), pilotée **uniquement par l'XP globale** (`user_stats.xp`) via un moteur **indépendant** du `characterLevel.ts` historique (qui reste en place, uniquement pour compatibilité technique interne, jamais affiché). En parallèle, construction du **Reward Engine générique** : plus aucune RPC par fonctionnalité, une seule plateforme extensible à un nombre illimité de sources d'XP présentes et futures (Chroniques, défis, succès, saisons, rang par exercice, nutrition, récupération...).
- **Nouveau `src/lib/fitness/rpg/titleConfig.ts`** (pur, zéro React) : seule source de vérité de la progression principale — réutilise `RANK_TIERS` (`exerciseRanks.ts`) pour les 6 Titres (Mortel→Primordial, mêmes noms/couleurs que le Rang par exercice, **aucun lien de calcul** avec lui), `GRADE_NAMES_BY_TITLE` (30 Grades nommés, 5 par Titre — remplace les `GRADE_NAMES` génériques de P2 pour cet usage), `XP_THRESHOLDS` (30 seuils XP, **table statique éditable**, pas de formule — rééquilibrer = changer un nombre, jamais le moteur). Seuils calibrés sur des repères de rythme validés par Nathan (Guerrier ~ plusieurs dizaines de séances, Héros ~ plusieurs mois réguliers, Titan ~ investissement lourd, Olympien ~ plusieurs centaines de séances, Primordial ~ plusieurs années).
- **Nouveau `src/lib/fitness/rpg/titleProgress.ts`** (pur, +9 tests) : `titleProgressForXp(xp)` — entrée UNIQUEMENT l'XP globale, sortie `{titre, grade, xpCurrentThreshold, xpNextThreshold, xpToNext, isMax}` ; `nextGradeLabel()`. Aucun import de `characterLevel.ts` (indépendance stricte demandée par Nathan) ni du moteur Rang par exercice (`rank/engine.ts`, non touché).
- **Reward Engine générique (migration `20260721100000_rpg_generic_reward_engine.sql`)** : table `reward_catalog` (source_key, xp_amount, weekly_cap, category, active — LA source de vérité des montants, éditable en SQL, RLS lecture publique) + RPC générique unique `award_reward_event(_source_key, _dedup_key, _workout_id)` (SECURITY DEFINER, le client ne choisit JAMAIS le montant — il déclare un événement whitelisté, le serveur regarde le catalogue et décide, idempotence par `dedup_key` générique). `xp_events` gagne une colonne `dedup_key` + index unique `(source, dedup_key)` généralisant l'idempotence historique `(workout_id, source)`. `award_character_xp` étendu avec un `_dedup_key` optionnel (rétro-compatible). Le trigger `award_xp_on_workout_complete` **ne contient plus de montants codés en dur** : il lit `reward_catalog` pour `workout_muscu`/`workout_support`/`pr_muscu`/`streak` (comportement observable strictement inchangé — mêmes montants, même plafond hebdo soutien). Ajouter une future source (Chronique, défi, succès, saison, rang d'exercice...) = une ligne dans `reward_catalog`, **jamais** une nouvelle RPC ni une modification d'architecture.
- **Nouveau `src/lib/fitness/rpg/rewardSources.ts`** + **`src/hooks/useRewardEvent.ts`** : miroir de typage des clés de sources whitelistées + hook générique `useAwardRewardEvent()` (appelle `award_reward_event` via RPC), réutilisable par toute future source côté client sans nouveau hook.
- **`sessionReward.ts`** : nouveau `buildTitleTransition(xpBefore, xpAfter)` (dérive la transition de Titre/Grade d'une séance depuis `titleProgress`, affichage uniquement) — remplace l'usage de `characterLevelProgress` pour l'écran de récompense.
- **UI** : `ProfileHeroCard.tsx` (Titre/Grade du Hero pilotés par `titleProgressForXp(userStats.xp)` au lieu du meilleur Rang par exercice — corrige l'incohérence historique où le Grade affiché venait du Rang par exercice mais l'XP affichée ailleurs venait de la courbe globale ; prop `rankAggregate` retirée, plus de cache localStorage anti-flicker, obsolète car l'XP a toujours un Titre/Grade défini même à 0 XP) ; `RPGProgressionSection.tsx` simplifié (même source, prop `rankAggregate` retirée) ; `SessionRewardScreen.tsx` (le bloc "Niveau N / NIVEAU +N" est remplacé par Titre/Grade + "NOUVEAU GRADE").
- **Non touché** (conforme aux garde-fous) : moteur Rang/Maîtrise par exercice (`rank/engine.ts`), Saisons (`sp_events`), badges/succès, `characterLevel.ts` (conservé en interne, `level` de `user_stats` toujours dérivé server-side, jamais affiché).
- Vérifié : vitest **404 passed / 36 skipped** (+9 nouveaux tests `titleProgress`), tsc 0 erreur, eslint clean (1 warning `any` volontaire dans `useRewardEvent.ts`, même pattern que `useSessionReward.ts` pour les tables/RPC non typées), `validate-supabase.mjs` ✅ (migration idempotente), `vite build` OK. Build/preview live non exécutables ici — à valider par Nathan sur la preview Lovable (Titre/Grade du Hero, écran de récompense de fin de séance).
- **Différé (Phase 1.x)** : brancher les futures sources sur le Reward Engine (Chroniques, défis, succès, saisons, rang par exercice) — un pattern à répéter par source, aucune nouvelle architecture. Phase 2 (Voies) et Phase 3 (harmonisation finale) non démarrées.

## LOT « LE DISQUE — nouvelle identité visuelle du système de rangs » (2026-07-18, branche `claude/cortex-disc-visual-identity-w276r5`)
Virage d'identité validé par Nathan : **le Disque remplace le Blason** comme symbole officiel de CORTEX. Objectif : une relique unique, aussi iconique que le Triforce / les Estus, qui accompagne le joueur toute sa progression et **absorbe sa puissance** — jamais un autre objet, jamais un blason, jamais une haltère. UNE seule silhouette immuable ; ce qui évolue = diamètre, épaisseur, matière, gravures, cœur, lumière, énergie, environnement. **Aucun chiffre / poids gravé** : le disque ne porte QUE le NOM DU RANG, gravé en creux dans la matière (inscription antique). Rangs inchangés (Mortel→Guerrier→Héros→Titan→Olympien→Primordial).
- **Nouveau `src/components/rpg/premium/discUniverse.ts`** : `DISC_TIERS` (par rang) décrit UNIQUEMENT ce qui évolue — `scale` (le disque grandit 0.84→1.0), `rim` (épaisseur jante), `groove` (profondeur gravures), `spokes`/`runes` (densité texture), `energy` (0.12→1, pilote halo/flottement/cœur/effets), `surface` (`raw`/`forge`/`rune`/`molten`/`divine`/`cosmic`). **Ne duplique aucune couleur** : matières/couleurs restent la source unique de `rankVisuals.ts` (metal/enamel/particleColor) + `exerciseRanks.ts` (colors).
- **Nouveau `src/components/rpg/RankDisc.tsx`** — LE symbole. SVG viewBox 200×200, silhouette CONSTANTE : jante métal biseautée → gorge gravée en creux → champ émaillé → rayons gravés + encoches runiques → **cœur d'énergie** central (puits qui s'allume avec le rang ; étoile divine Olympien / cœur cosmique tournant Primordial) → **nom du rang gravé en arc** (textPath, inscription intaglio 3 couches : lueur interne hauts rangs + arête lumineuse basse + creux sombre → lisible sur TOUTE matière). `SurfaceFX` par rang : fissures de lave (Titan), constellations reliées (Primordial), poussière d'or scintillante (Olympien), étincelles de forge (Guerrier). Halo respirant, anneau conique rotatif, rayons divins (Olympien), reflet spéculaire, basculement 3D + flottement (plus vivant à haut rang), socle lumineux. Diamètre centré via `translate/scale/translate` (le SVG `transform` ignore CSS transform-origin). API `variant="hero"|"emblem"` + `size` + `revealDelay`. **Vérifié visuellement** (screenshot des 6 disques via route temporaire + Playwright) : même relique, nom lisible partout, matière/énergie croissantes.
- **`ProfileHeroCard` SIMPLIFIÉ** (le Hero RACONTE, ne tableau-de-bord plus) : conserve Avatar + Pseudo + pastille Niveau + **RankDisc 170px** + nom de rang monumental + ornement « Rang III » + barre de progression VERS LE PROCHAIN RANG. **Retirés du Hero : Série / Séances / Succès** (+ props `streak`/`totalWorkouts`/`achievements*` supprimées, `StatTile` local retiré). Remplace `Blason` par `RankDisc`.
- **Nouveau `src/components/profile/HeroStatsStrip.tsx`** : les 3 stats déplacées SOUS le Hero (bandeau 3 colonnes). Monté dans `index.tsx` (après le Hero, avant `SeasonTrackCard`) et `FusionDashboard.tsx` (après le Hero).
- **`RankUpOverlay`** : la cinématique de montée de rang affiche désormais le **RankDisc 220px** (au lieu de `ExerciseRankBadge`) — même relique sur l'écran premium. `ExerciseRankBadge` conservé pour les badges compacts par exercice (portent le niveau romain, contexte différent). `Blason.tsx` n'est plus utilisé (laissé en place, non supprimé).
- Vérifié : `tsc` 0 erreur, eslint clean (fichiers touchés ; 1 warning pré-existant `name` inutilisé dans FusionDashboard hors périmètre), `vite build` OK, rendu visuel des 6 disques confirmé par screenshot. À juger « waouh » par Nathan sur la preview Lovable.
- **Itération rendu « relique forgée AAA » (concept validé, rendu à pousser)** : Nathan a validé LE CONCEPT mais voulait passer d'une « icône premium » à un OBJET RÉEL forgé (réf. God of War / Diablo IV / Elden Ring), avec profondeur, relief, métal réaliste, usure, gravures sculptées, jante massive, ombres marquées, lumière cinématographique, cœur crédible — « poids ressenti rien qu'en regardant ». Refonte de `RankDisc.tsx` :
  - **Texture de métal procédurale** : `feTurbulence` (fractalNoise) → `feDiffuseLighting` (relief) → `feComponentTransfer` (recentrage sur gris moyen) → `feBlend mode="overlay"` sur le disque. ⚠️ Piège résolu : `soft-light` + `feSpecularLighting mode="screen"` avec fréquence/`surfaceScale` élevés = « papier alu froissé » qui EFFACE toute structure. La clé = overlay CENTRÉ sur 0.5 (module la surface sans écraser jante/gravure/cœur) + fréquence basse. Paramétré par rang via `rough`/`relief` (nouveaux champs `DiscTier`).
  - **Structure massive** : jante épaisse à chanfrein directionnel (biseau lumière→ombre + reflet vif haut-gauche + marche intérieure sombre), gorge profonde, facettes radiales très subtiles (grain, pas une roue), rivets sculptés. **Usure** : micro-rayures (arcs) + éclats sur le bord (`wear` par rang). **Lumière cinématographique** : key light rasant haut-gauche, vignette forte, rim light bas-droite, **une seule direction de lumière** (`LIGHT_AZ=235`) pour tout l'objet. **Cœur** : puits profond (gradient sombre + ombre interne + lèvre lumineuse) + bloom respirant + foyer incandescent (flicker pour Titan, rayons pour Olympien, orbites pour Primordial). **Fond vivant** sobre : braises (chaud) / poussière (froid) montantes, ombre de contact lourde.
  - Nouveaux champs `DiscTier` : `rough` (fréquence forge), `relief` (profondeur/relief), `wear` (usure). Toujours zéro couleur dupliquée (métal/émail depuis `rankVisuals.ts`).
  - Vérifié par screenshots itératifs (route temporaire `/disc-preview` + Playwright, retirée après) : 3 passes (foil → dompté → AAA affiné). `tsc`/eslint clean, `vite build` OK. Reste ajustable selon retour Nathan (contraste texture, lisibilité du nom sur métal clair).

## AUDIT : Détection automatique des dérives Git ↔ Supabase (2026-07-18, branche `claude/git-supabase-drift-detection-hx04xv`)
Mise en place d'un système d'audit continu pour détecter les **incohérences d'état entre Git et Supabase** — problème identifié lors de l'audit du workflow `migrate.yml` (mutations hors-Git en base).
- **`scripts/audit-migration-drift.mjs`** : script d'audit autonome qui récupère l'état des migrations en base (`supabase migration list --linked --output json`) et le compare aux migrations Git. Détecte 3 types de dérives critiques :
  1. **REMOTE_ONLY** : migration appliquée en Supabase mais absente de Git (orpheline, risque maj divergence)
  2. **DELETED_IN_GIT** : migration supprimée du dépôt mais toujours appliquée en base (impossible rejouer l'historique)
  3. **NOT_APPLIED** : migration dans Git mais non appliquée (normal en dev, critique si oublie sur main)
- **`.github/workflows/audit-migration-drift.yml`** : workflow GitHub déclenché automatiquement (quotidien 08:00 UTC + push sur main + manuel). Produit un résumé GitHub Step Summary avec statut critique/warning. Optionnel dans le job — ne bloque pas le pipeline (utilise `|| true`).
- **Intégration `migrate.yml`** : nouvelle étape post-migration (`Audit - Detect Git ↔ Supabase drift`) qui tourne après chaque push — détecte immédiatement toute dérive créée par la migration.
- **`package.json`** : ajout script `audit:drift` pour exécution locale (`npm run audit:drift`).
- **`docs/architecture/migration-drift-detection.md`** : documentation complète (types de dérives, corrections, workflows intégrés, debug avancé).
- **`scripts/test-audit-migration-drift.mjs`** : tests de base (syntaxe, charge des migrations, etc.). Tests complets avec Supabase (nécessite CLI linké) exécutés en CI.
- **Exit codes** : 0 = sain, 1 = dérive détectée (audit requis), 2 = erreur config/connectivité.
- Vérifié : script parse sans erreur (node --check), 164 migrations loaders, tests de base ✅. Déploiement & test en CI via GitHub Actions.

## Dernière mise à jour (ancienne)
2026-07-17

## DETTE TECHNIQUE RÉSOLUE : « types.ts — la base est la source de vérité » (2026-07-17, branche `claude/cortex-rpg-analysis-h7e4eb`, NON mergé)
Fin des 3 incidents où une régénération Lovable de `src/integrations/supabase/types.ts` effaçait des tables (`workout_analyses`, `xp_events`, `seasons`, `sp_events`, `user_season_progress`) et cassait la prod silencieusement. **Cause racine** : `types.ts` était régénéré par Lovable depuis SA connaissance du schéma (pas la base réelle) → nos tables (créées par `supabase/migrations/*.sql` appliquées hors circuit Lovable) inconnues → effacées ; Lovable pousse direct sur `main` sans PR ; le typecheck CI ne tournait que sur chemins étroits → invisible. **Découverte** : les 161 migrations contiennent TOUT le schéma (source de vérité complète).
- **Architecture validée par Nathan** : base = source de vérité unique ; `types.ts` = artefact **généré officiellement** (`supabase gen types`), jamais édité à la main ; **aucune auto-réparation / auto-commit** ; la CI **échoue** (visible, explicite) si `types.ts` diverge de la base.
- **`scripts/check-supabase-types.mjs`** : génère les types depuis la base (`supabase gen types --project-id bcwfvpwxzlmkxobvbtzp`) et compare au niveau **sémantique** (tables + colonnes, tolérant au formatage) au fichier committé ; échoue en listant précisément tables/colonnes manquantes ou en trop + « npm run gen:types ». Mode fixture `SUPABASE_TYPES_FRESH_FILE=<path>` pour test hors ligne (validé : 41 tables détectées, détection d'écart OK).
- **`package.json`** : `gen:types` (régénère depuis la base) + `check:types` (lance le contrôle).
- **CI** : `typecheck.yml` (tsc sur TOUTE PR + push main — filet côté code) ; `supabase-types.yml` (push main touchant `types.ts` hors migrations → check base⇄types, échoue sur écart ; se retire si des migrations changent, laissé à migrate.yml) ; étape finale ajoutée à `migrate.yml` (après application des migrations, vérifie la conformité). **Pas de check base⇄types sur les PR** (une table de migration non encore appliquée y ferait un faux écart) → couvert par tsc ; conformité base⇄types vérifiée sur `main` après migrations.
- **Doc** `docs/architecture/supabase-types-source-of-truth.md` + règle permanente dans `CLAUDE.md` (« ne jamais éditer types.ts à la main »).
- **Bootstrap** : au 1er passage, si le `types.ts` committé (format Lovable) diffère du générateur officiel, lancer `npm run gen:types` une fois et committer (la base fait foi ensuite). Le check étant sémantique (tables/colonnes), il ne dépend PAS du formatage — pas de faux positif de format.
- Vérifié en local : eslint clean, `node --check` OK, self-test conforme (41 tables), détection d'écart OK, vitest 391/36. Les workflows CI eux-mêmes ne sont pas exécutables hors GitHub — à confirmer au 1er run.

## LOT RPG-P1 (v1, EN COURS DE VALIDATION « waouh ») : « La Fiche de Personnage premium — le Rang redevient le héros » (2026-07-17, branche `claude/cortex-rpg-analysis-h7e4eb`, NON mergé)
Virage direction créative validé par Nathan : viser un vrai effet « Waouh », et **le Rang (Titan, Olympien…) est l'identité du personnage**, pas le Niveau. Correction d'un choix de R1 : le Niveau était le chiffre-roi du Hero → il redevient **subordonné** (pastille « Niveau X »), le RANG devient la pièce maîtresse mise en scène. Méthode de travail actée : cycles courts (j'implémente → Nathan teste la preview Lovable → retour sur ressenti/hiérarchie/émotion → on itère jusqu'au « waouh » → écran suivant). **2 questions-filtres permanentes** (renforce la boucle entraîne→progresse→récompense→revenir ? crée un vrai « waouh » ?) — sinon non prioritaire.
- **Nouveau système de design premium réutilisable** (la « signature CORTEX »), destiné à être réutilisé partout (montées de rang, récompenses, Saisons, Chroniques, Reliques) :
  - `src/components/rpg/premium/tokens.ts` — tokens partagés (courbes `EASE_OUT`/`EASE_IN_OUT`/`EASE_EMBLEM`, `DUR`, `FLOAT`, `HALO_BREATH`, `stagger()`, `SERIF`, `emblemShadow()`). ⚠️ Objets d'animation SANS `as const` (framer refuse les keyframes readonly).
  - `src/components/rpg/RankSigil.tsx` — sigils SVG de rang EXTRAITS de `ExerciseRankBadge` (anti-doublon) ; `ExerciseRankBadge` les importe désormais (comportement identique).
  - `src/components/rpg/Blason.tsx` — **l'emblème de rang premium**, cœur de la signature : élève le badge hexagonal (métal/émail/sigil) en objet « mis en scène » (aura respirante, halo conique rotatif, braises flottantes propres au rang via `visual.particleCount`, socle lumineux, reflet, révélation à l'entrée). Réutilisable via `variant="hero"|"emblem"` + `size`.
- **`ProfileHeroCard` refondu** (Accueil) : ligne d'identité subordonnée (avatar + pseudo + pastille « Niveau X ») → **scène du RANG** (Blason 150px `variant="hero"`, nom de rang « TITAN » en grand serif + glow, ornement « Rang III ») → **progression VERS LE PROCHAIN RANG** (barre = `rank.progress`, libellé « vers Titan IV », ligne « Encore N paliers avant OLYMPIEN » via familles de rang) → stats subordonnées (série/séances/succès). Repli propre si non classé (Mortel en sourdine, « enregistre ta première séance »). Aucune logique métier touchée (lit `rankAggregate`/`useUserStats`).
- Vérifié : vitest **391/36**, eslint clean (fichiers touchés), tsc 0 erreur de mon code (3 pré-existantes hors périmètre : paquets Lovable 403). Build/preview live non exécutables ici → **à juger par Nathan sur la preview Lovable** (c'est le critère de validation de cette passe : le ressenti « waouh », pas le test).
- **Itération v2 (pousser vers l'iconique)** : Blason élevé en **relique légendaire** — métal biseauté (dégradé de biseau lumière→ombre), médaillon **gravé en creux** (filter inner-shadow SVG), **sigil en relief** (copie ombre + copie lumière décalées), léger **basculement 3D** (perspective + rotateX/Y), reflet spéculaire, halo vivant. Nouveau `src/components/rpg/premium/rankUniverse.ts` : **chaque famille de rang = un univers** via une "physique" de particules propre (`PARTICLE_PARAMS` par nature : dust/sparks/motes/embers/rays+faisceaux divins/cosmos ; `RANK_PARTICLE_KIND` par rang) — `RelicParticles` dans Blason. Nom de rang **monumental** dans le Hero (lettrage serif 42px, remplissage **dégradé métallique** via bg-clip-text, halo diffus, **reflet en miroir** masqué). `CLAUDE.md` enrichi d'un **Standard premium** (le Rang est la star ; chaque rang un univers ; signature partagée `src/components/rpg/` ; 2 questions loop+waouh ; **test « screenshot-worthy ? »** à chaque itération). Note : « Colosse » n'est pas une famille de rang actuelle (Mortel→Guerrier→Héros→Titan→Olympien→Primordial) — traitement univers appliqué aux familles existantes ; renommer les familles toucherait le moteur+succès (à part).
- **Prochaines passes premium** (après validation P1) : P2 montée de rang cinématique plein-écran (réutilisera Blason), P3 écran de récompense premium, P4 fin de Saison/chapitre. Chaque écran premium doit réutiliser la signature (Blason, tokens, rankUniverse).

## LOT RPG-Saisons S0 livré : « Le socle des Saisons » (2026-07-17, branche `claude/cortex-rpg-analysis-h7e4eb`)
Après validation de l'architecture complète des Saisons (`docs/architecture/rpg-saisons.md`), livraison du Lot S0 : modèle de données + Saison I authorée + track de progression sur l'Accueil. **Points de Saison (PS) 100 % musculation** (le soutien/la nutrition = 0 PS), deux voies séparées (Niveau permanent R1 vs Palier de Saison temporaire). Serveur-autoritaire (pattern R1). **Ne touche NI le moteur Rang NI l'XP/Niveau** : le trigger PS est SÉPARÉ de celui de l'XP (coexistent).
- **4 piliers directeurs actés (Nathan)** : chaque nouvelle feature doit renforcer au moins un de : revenir aujourd'hui / cette semaine / aller au bout de la saison / enrichir les Chroniques. Sinon non prioritaire. Saisons = **12 semaines** (cycle de transformation réel), architecture à 4 rythmes (Objectifs jour → Quêtes semaine → Événements 1-2 sem → Saison 12 sem). Objectifs quotidiens muscu-centrés (rappels bien-être tolérés mais **0 PS**). Récompenses = **prestige/cosmétique/narratif uniquement** (titres, badges datés, reliques exposables, Chronique de Saison), jamais de puissance.
- **Migration `20260717130000_rpg_seasons_s0.sql`** (additive, idempotente, validée par `validate-supabase.mjs`) : tables `seasons` (catalogue, lecture authentifiée), `sp_events` (ledger PS, RLS lecture seule, idempotence `(workout_id, source)`), `user_season_progress` (ps/tier par user+saison, RLS lecture seule). Fonction courbe `compute_season_tier(ps)` = `floor(ps/100)` plafonné 50 — **PLACEHOLDER calibrable en S0** (constante à ajuster sur données réelles, « ~1 séance muscu = 1 palier »). Verseur central `award_season_points` (SECURITY DEFINER, idempotent, upsert progress + recalcul tier). Trigger SÉPARÉ `trg_award_sp_on_workout_complete` (`AFTER INSERT OR UPDATE OF status`) : verse 100 PS à la clôture d'une séance **muscu uniquement** (`discipline='muscu'`), si une saison est active à la date. Seed **Saison I — L'Ascension** (12 semaines dès le déploiement, `ON CONFLICT (index) DO NOTHING`).
- **`types.ts`** : blocs `seasons`/`sp_events`/`user_season_progress` ajoutés à la main (style généré conservé).
- **Nouveau `src/lib/fitness/rpg/season.ts`** (pur, +12 tests) : `computeSeasonTier` (miroir serveur), `seasonTierProgress` (progression intra-palier), `seasonDaysRemaining`, `seasonTimeProgress`. Constantes `PS_PER_TIER=100`/`MAX_TIER=50` alignées serveur (test d'équivalence).
- **Nouveau `src/hooks/useActiveSeason.ts`** : lit la saison active (`seasons` status=active, fenêtre courante) + `user_season_progress` ; dérive palier/progression/J-restants. Dégrade proprement (pas de saison → `season=null`).
- **Nouveau `src/components/profile/rpg/SeasonTrackCard.tsx`** : carte Accueil (identité « Saison I — L'Ascension », thème, palier, PS, barre vers le palier suivant via `MasteryBar` palette indigo, compte à rebours « J-X »). Se masque s'il n'y a pas de saison active. Branchée dans `index.tsx` juste après le Hero.
- **Différé** (S1→S4) : Objectifs quotidiens + Quêtes hebdo + « Contrat du jour » + streak de saison (S1) ; Chronique de Saison rétrospective + étagère « Saisons » du Livre + Cabinet des Reliques (S3) ; récompenses complètes + réclamation (S2) ; framework d'événements (S4). Sources PS additionnelles (PR, quêtes) et calibrage de la courbe : au fil de S1/S0.
- **Dépendance déploiement** : la carte lit `seasons`/`user_season_progress` (créées par cette migration) — tant que S0 n'est pas mergé+déployé, la carte se masque (pas de saison active côté client). PS versés dès que la séance muscu se clôt en prod. À valider en live par Nathan après merge+deploy.
- Vérifié : vitest **391 passed / 36 skipped** (+12), eslint clean (fichiers de code ; types.ts généré exclu), tsc 0 erreur de mon code (3 pré-existantes hors périmètre : paquets Lovable bloqués en 403), validateur migrations ✅. Build & live non exécutables ici (registre Lovable 403).

## LOT RPG-R2 livré : « L'écran de récompense de fin de séance » (2026-07-17, branche `claude/cortex-rpg-analysis-h7e4eb`)
Suite de R1. Vision Nathan : **un seul écran premium** à la clôture qui récapitule toute la progression RPG de la séance (XP, niveau, PR, badge), animé, fort impact émotionnel — **pas** de succession de toasts/pop-ups. Le moment qui donne envie de revenir demain. Lecture seule (aucun calcul d'économie côté client), règle « donnée absente → section masquée ».
- **Nouveau `src/lib/fitness/rpg/sessionReward.ts`** (pur, +11 tests) : `totalSessionXp`, `buildXpBreakdown` (agrège par source + ordonne selon la hiérarchie muscu-primaire, repli neutre pour source inconnue), `buildLevelTransition` (niveau avant/après via `characterLevel`, `leveledUp`, `levelsGained`, progressions bornées).
- **Nouveau `src/hooks/useSessionReward.ts`** : lit `xp_events?workout_id` (versés par le trigger R1) + `user_stats` ; **déduit l'XP d'avant sans snapshot** (`xpAfter − Σ events de la séance`). `hasXp=false` (ex. migration R1 pas encore déployée) → l'écran reste affichable, section XP masquée (état honnête, 0 XP tant que R1 pas mergé).
- **Nouveau `src/components/fitness/session/SessionRewardScreen.tsx`** : l'écran plein écran premium — hero « +N XP » (`AnimatedNumber`), barre de Niveau (`MasteryBar`, palette « trésor » or/ambre dédiée à l'XP) + flourish « NIVEAU +N » au passage de niveau, détail des sources d'XP (chips animés en cascade), record PR + badge débloqué pendant la séance (si présents), `Confetti` réutilisé, révélation étagée framer-motion. 2 CTA : **Continuer** / **Voir le bilan détaillé**.
- **`SeancesTab`** : nouvel état `analysisRequested` + 2 blocs `muscuPostClose`/`genericPostClose` (récompense d'abord, bilan IA **opt-in** — le `PostWorkoutAnalysisSheet`/générique ne s'ouvre plus automatiquement, plus jamais empilé). Branchés sur les 4 points de montage existants (séance active + vue historique, muscu + générique) sans duplication. `onFinished` réinitialise `analysisRequested`.
- **`types.ts`** : bloc `xp_events` ajouté à la main (Row/Insert/Update/FK vers workouts — même approche chirurgicale que `workout_analyses`, la table vit dans la migration R1). Style généré conservé (fichier non-conforme prettier AVANT, non reformaté).
- **Différé R2.1** : flourish de montée de RANG par exercice (nécessite un snapshot de rang en début de séance — mini-feature à part ; slot prévu dans l'écran) ; deltas de QUÊTES ; versement du bonus XP de montée de rang (+200) une fois la détection de rang de séance en place.
- **Dépendance déploiement** : l'écran lit `xp_events` alimentée par le trigger R1 — tant que R1 n'est pas mergé+déployé, la section XP affiche 0 (honnête) ; PR/badge/niveau s'allument dès que l'XP réelle circule. À valider en live par Nathan après merge+deploy.
- Vérifié : vitest **379 passed / 36 skipped** (+11), eslint clean sur les fichiers de code touchés (types.ts généré exclu, non-conforme avant), tsc 0 erreur sur mon code (3 erreurs pré-existantes hors périmètre : paquets Lovable `html-to-image`/`vite-tanstack-config` bloqués en 403 dans cet env). Build & test live non exécutables ici (registre privé Lovable en 403).

## LOT RPG-R1 livré : « Le Niveau de Personnage — l'XP comme colonne vertébrale » (2026-07-17, branche `claude/cortex-rpg-analysis-h7e4eb`)
Après une analyse complète du module RPG (directeur créatif), Nathan a validé la vision cible : **l'XP devient la colonne vertébrale hiérarchisée de CORTEX**, alimentée par toutes les actions, avec la **musculation comme source primaire et largement dominante**. Les rangs par exercice/spécialité (moteur `lib/fitness/rank/`) restent **indépendants et non touchés**, au-dessus de l'XP. Doc de conception complet (analyse 7 parties + spec R1) : `docs/architecture/rpg-vision-et-r1-niveau-personnage.md`.
- **Économie XP muscu-primaire (validée Nathan), garantie PAR CONSTRUCTION** : séance muscu = 100 XP (non plafonné) ; PR muscu (record de charge strict) = +50 (1×/séance) ; streak (séance muscu + activité la veille) = +15 (1×/séance) ; séance de soutien (HYROX/course/cardio/guidé/autres) = 25 XP, **plafond 75 XP/semaine** ; **nutrition = 0 XP, aucun multiplicateur, aucun bonus caché** (module indépendant, hors économie) ; badges/quêtes inchangés (chemin légué). Invariant béton : plafond soutien (75) < une seule séance muscu (100) ⇒ *muscu-only > soutien-only > nutrition-only*, prouvé sans équilibrage fragile.
- **Migration `20260717120000_rpg_character_xp_backbone.sql`** (additive, ne touche NI le moteur Rang NI les triggers XP existants badge/objectif) : nouvelle table `xp_events(user_id, source, amount, workout_id, created_at)` RLS **lecture seule** client (aucune policy write — seul le verseur SECURITY DEFINER écrit) + index unique `(workout_id, source)` pour l'idempotence + plafond soutien via somme hebdo. Verseur central `award_character_xp(_user_id,_source,_amount,_workout_id)` (SECURITY DEFINER, REVOKE authenticated, idempotent) = écrit `user_stats` + trace `xp_events` + recalcule le niveau via `compute_level_from_xp` **existant** (courbe serveur `sqrt(xp/50)+1` conservée → aucune XP déjà gagnée invalidée). Trigger `trg_award_xp_on_workout_complete` `AFTER INSERT OR UPDATE OF status ON workouts`, ne verse qu'à la **transition `active → completed`** (les séances muscu ET génériques sont insérées `active` au démarrage puis passées `completed` à la clôture — vérifié dans `useFinishWorkout` + `useFinishGenericActiveWorkout`). Validée par `scripts/validate-supabase.mjs` (✅ idempotente). **NON appliquée en prod depuis la session** — déploiement via CI `migrate.yml` au merge sur main.
- **Nouveau `src/lib/fitness/rpg/characterLevel.ts`** (pur, zéro React, +11 tests) : **miroir exact** de la courbe serveur pour l'affichage (`characterLevelForXp`, `xpAtLevelStart/NextLevel`, `characterLevelProgress`) + constantes `CHARACTER_XP` informatives. Réconcilie l'incohérence : `badges.ts:xpForLevel` (formule `level²·100` divergente) est **inutilisé partout** dans le code → laissé tel quel, non réintroduit ; `characterLevel.ts` est la source unique d'affichage du Niveau.
- **`ProfileHeroCard.tsx`** (Accueil) : affiche désormais le **Niveau de Personnage** comme chiffre-roi — pastille « Niv. X » près du pseudo + barre XP vers le niveau suivant (`{xpIntoLevel} / {xpForLevelSpan} XP`) via `useUserStats` + `characterLevelProgress`. Le rang mythologique reste le sous-titre atmosphérique (anti-doublon : le Niveau apparaît une seule fois, dans le Hero). La barre principale passe de la progression de rang à la progression d'XP.
- **Code mort identifié (à retirer dans un lot ultérieur, non fait ici)** : `src/components/profile/rpg/QuestsPanel.tsx` (aucun importeur), tout `src/components/fusion/` (`FusionDashboard.tsx`, aucun importeur). `exerciseDifficulty()` dans `exerciseRanks.ts` probable legacy.
- **Différé** : bonus montée de rang (+200, prévu R2 « RankUp à la clôture ») ; unification des triggers badge/objectif via le verseur central ; journal d'XP visible ; spécialités multi-univers (R4/R5).
- Vérifié : vitest **368 passed / 36 skipped** (+11), eslint clean sur les fichiers touchés, validateur migrations ✅. tsc : 0 erreur sur mes fichiers (3 erreurs pré-existantes hors périmètre dues aux paquets Lovable `html-to-image`/`@lovable.dev/vite-tanstack-config` bloqués en 403 dans cet env — pas mon diff). Build & test live non exécutables dans cet env distant (registre privé Lovable en 403) — à valider par Nathan après merge+deploy : clôture d'une séance muscu → +100 XP visibles sur l'Accueil, niveau qui monte, séance soutien plafonnée.

## LOT C3 livré : « Les Chroniques deviennent le musée vivant de l'athlète » (2026-07-17, branche `claude/chroniques-immersive-module-ognwh2`)
Lot 100 % UX/UI par-dessus le C2 : prestige, collection, immersion. AUCUNE logique métier touchée (moteurs, hooks, mutations, edge, IA, calculs, Forge, Arène, RPG). Règle « donnée absente → carte masquée, jamais inventée » conservée.
- **Nouveaux helpers PURS dans `chronicles.ts` (+3 tests, 13 au total)** : `projectVolumeToRankTier(volumeKg)` → projette un volume sur l'échelle RPG **existante** à 30 paliers (log10, ~1 t = bas de Mortel, ~1000 t ≈ Olympien I) — destiné à `toRankState` (le builder d'affichage du Profil, `useExerciseProgression.ts`), donc AUCUN rang recalculé, juste habillé ; `computeBadgeCollection(workouts)` → salle des trophées à paliers (Force/Volume/Discipline/Régularité/Intensité/Endurance), chaque palier verrouillé/débloqué par re-seuillage des mêmes métriques (série la plus lourde, tonnage carrière, séances, streak, PR/séance, séries) + progression globale. (`computeBadges` C2 conservé, encore testé.)
- **Nouveaux composants UI** : `chronique/livreParts.tsx` (Sheen shimmer, PopIn pop+hover desktop, MasteryGauge animée, RankPill couleurs officielles du rang, BadgeTile débloqué/verrouillé assombri) + `chronique/livreData.ts` (RARITY par niveau de Légende, `legendMasteryPercent`, `specRankFromVolume` — séparés pour react-refresh).
- **`LivreChroniquesPage` enrichie section par section** : Hall of Fame → pièce maîtresse « Plus gros tonnage » avec halo doré animé, éclat conique tournant derrière le trophée, médaille « Record absolu », sheen, compteur ; autres records en cartes verre glow + pop-in + hover. Légendes → cartes de collection (badge de rareté Légendaire/Épique/Rare/Commun, contour évolutif, sheen sur légendaires, jauge de maîtrise vers le niveau sup., médaille de classement #1/2/3). Techniques oubliées → muscle principal + jours d'absence + dernier PR (via `prByName`) + dernière séance. Potentiel caché → niveau d'urgence (Urgent/À surveiller/Léger), « Plateau confirmé », confiance de détection (dérivée de `stalledSessions`), ancienneté. Spécialisations → branches RPG (RankPill « Titan III », barre de maîtrise, %, volume, séries, phrase « Encore X % avant Olympien I »). Galerie des Records → salle des trophées (progression globale, catégories, paliers verrouillés visibles mais assombris + phrase du prochain palier) + **vibration discrète** au déblocage d'un nouveau badge (localStorage `cortex_chronique_seen_badges`, 100 % client, silencieux au 1er chargement). Chronologie inchangée.
- Vérifié : tsc 0 erreur, eslint clean (fichiers touchés ; 1 warning console préexistant `WorkoutCard` hors périmètre), vitest **357 passed / 36 skipped** (+3), build OK. Pas de test live (env distant).

## LOT C2 livré : « Refonte totale des Chroniques — un troisième pilier de CORTEX » (2026-07-17, branche `claude/chroniques-immersive-module-ognwh2`)
Les Chroniques deviennent le 3e univers majeur, au même niveau que « Entrer dans l'arène » et « La Forge ». L'accordénon historique de `SeancesTab` est SUPPRIMÉ ; à sa place une Hero Card qui ouvre une vraie page plein écran. Lecture seule — aucun moteur/hook/mutation/calcul/IA modifié ; toutes les valeurs dérivent de l'historique déjà chargé (`useWorkouts`). Règle « si la donnée n'existe pas, masquer la carte, jamais l'inventer ».
- **Nouveau `src/lib/fitness/chronicles.ts`** (dérivations PURES, zéro React, +10 tests) : `computeHallOfFame` (plus gros tonnage/calories/intensité kg·min⁻¹, série la plus lourde, plus longue série/séance, totaux carrière), `computeLegends` (meilleurs exercices : PR + progression 1re→PR + séances + niveau Légendaire/Maîtrisé/Confirmé), `computeForgotten` (exercices récurrents absents ≥21 j + impact musculaire via `sessionMuscleActivation`), `computePlateaus` (≥3 séances sans dépasser le PR, encore actifs ≤45 j), `computeSpecializations` (6 catégories muscle → volume → étoiles relatives), `computeBadges` (Premier 100 kg, Première tonne, streak jours consécutifs, N PR en une séance, N séries, N séances) + `computeLongestStreak`. `computeRecordsBySession` **déplacé** ici depuis `ChroniquePage.tsx` (comportement identique, plus de duplication — ChroniquePage l'importe).
- **Nouveau `LivreChroniquesCard.tsx`** : Hero Card dorée/cuivrée (icône trophée, kicker « LE LIVRE DES CHRONIQUES », titre serif « Chroniques », halo animé + étincelles), gabarit strictement calqué sur `ChoisirEpreuveCard`/`LaForgeCard` (même poids visuel).
- **Nouveau `LivreChroniquesPage.tsx`** : page plein écran (early-return dans `SeancesTab`, même système qu'`ActiveWorkoutView`, barre Retour) — en-tête avec compteurs carrière **animés** (`AnimatedNumber`, framer `animate` au `useInView`), puis Hall of Fame (grandes `GoldCard` glow) → Légendes (cartes avec image via `exerciseIllustration`/`imageUrls`, niveau, PR, progression) → Techniques oubliées → Potentiel caché → Spécialisations (étoiles) → Galerie des Records (badges emoji, pop au scroll) → **Chronologie** (les `WorkoutCard`/`GenericHistoryCard` existantes, chacune ouvre la Chronique immersive du C1 via `onOpenChronicle`). Chaque section `SectionReveal` (fade+slide), micro-interactions, jamais d'apparition brutale.
- **`SeancesTab`** : accordéon Chroniques (état `historyOpen`, liste compacte, `WorkoutProgressCharts` inline) entièrement retiré ; nouvel état `bookOpen` + 2 early-returns (Livre vérifié AVANT la Chronique pour que « Retour » d'une chronique revienne au Livre, pas aux Séances). `listImageUrls` désormais résolu quand `bookOpen`. Imports morts nettoyés.
- Vérifié : tsc 0 erreur, eslint clean sur les fichiers touchés (1 warning console préexistant `WorkoutCard`, hors périmètre), vitest **354 passed / 36 skipped** (+10), build OK. Pas de test live (env distant sans session Lovable) — à juger par Nathan.

## LOT C1 livré : « Les Chroniques deviennent un module immersif » (2026-07-16, branche `claude/chroniques-immersive-module-ognwh2`, mergé sur main)
Toucher une chronique de MUSCULATION ouvre désormais une page plein écran dédiée (le « journal de l'athlète ») au lieu d'un simple accordéon inline. La page des Chroniques (liste) est INCHANGÉE — seule l'action au clic évolue. Aucune donnée métier / moteur / hook / calcul modifié : lecture seule de `useWorkouts` déjà chargé + helpers PURS existants.
- **Nouveau `src/components/fitness/chronique/ChroniquePage.tsx`** (page, early-return dans `SeancesTab` — même pattern qu'`ActiveWorkoutView`, aucun modal/drawer) : barre « Retour » sticky + prev/next entre chroniques ; sections révélées progressivement (`SectionReveal`) au même langage visuel que La Forge (verre teinté, halos, titres serif italique) : **Hero** (date/titre/badge discipline/muscle dominant + résumé — bilan IA persisté si présent, sinon phrase factuelle construite depuis les chiffres réels, jamais inventée + `StatTileRow`), **Exploits** (PR, nouveaux exercices, meilleure série, plus gros tonnage), **Progression** (réutilise `WorkoutProgressCharts`, ciblé sur les exercices de la séance ayant ≥2 points), **Scan des Titans** (réutilise `BodyMap` mode recovery, alimenté par la sollicitation musculaire de LA séance, tap muscle → détail séries/tonnage), **Déroulé/Timeline** (chronologie des exercices sur un rail, badge record — pas d'horodatage inventé, on n'a pas de timestamp par exercice), **Analyse IA** (cartes courtes depuis `workout_analyses` persisté, rendu seulement si un bilan existe), **Comparaison** (Aujourd'hui vs Moy. 30j vs Meilleure séance : Volume/Calories/Intensité/Records/Temps), **Historique** (chronique précédente/suivante).
- **Nouveau `src/lib/fitness/workoutGrouping.ts`** (logique PURE, zéro React, +6 tests) : `buildGroups`/`expandToSeries`/types EXTRAITS tels quels de `WorkoutCard.tsx` (mêmes conventions legacy colonnes inversées, priorité `exercise_sets`, `identityKey`) — `WorkoutCard` les IMPORTE désormais, plus aucune duplication (comportement strictement identique). Nouveau `sessionMuscleActivation()` : répartit séries + tonnage réels par muscle (mapping `exerciseToMuscles` + filet `muscle_groups` IA), trié par volume — source du Scan de séance. Records par séance : balayage chrono unique (charge max strictement > meilleur passé = PR ; jamais vu = nouvel exercice).
- **Déclencheurs (muscu uniquement — le module est centré muscle/tonnage/PR)** : bouton `BookOpen` « Ouvrir la chronique » dans le header de `WorkoutCard` (prop additive `onOpenChronicle`, aucun comportement existant retiré) + lignes compactes muscu de la liste repliée des Chroniques rendues cliquables. Les disciplines génériques (`GenericHistoryCard`) sont inchangées.
- Vérifié : tsc 0 erreur, eslint clean sur les fichiers touchés (1 warning console préexistant dans `WorkoutCard`, hors périmètre), vitest **344 passed / 36 skipped** (+6), build OK. Pas de test live possible (env distant sans session Lovable authentifiée) — à juger par Nathan en live.

## Phase C — lot V5 livré : « Premium Experience — Marche inclinée » (2026-07-16, branche seule, PAS poussé sur main)
La carte Marche inclinée/Tapis n'est plus un formulaire mais un VOYAGE (UI uniquement — aucun moteur/donnée/backend touché, détection présentation `discipline==="cardio" && /marche|tapis|treadmill/` dans `GenericExerciseCard`) : Km terminés ✓ (lignes compactes célébrées, résumé vitesse·inclinaison, tap pour rouvrir), Km en cours ● en carte héros (nœud pulsant sur un rail vertical, grands cadrans 26px vitesse/inclinaison, bouton « Valider le kilomètre » gradient), Km à venir ○ fantômes ; CTA « Commencer le Km N+1 » devient primaire quand tout est validé ; toast de récompense à chaque km ; méta-ligne narrative (« 2 km au compteur · Km 3 en cours ») ; PAS de minuteur de repos entre kilomètres (effort continu — exception locale au déclenchement V3). Nouveaux composants locaux `KmJourneyBody`/`KmHeroCard` dans `ActiveExerciseCard.tsx` ; helpers de saisie exportés depuis `ActiveSegmentCard.tsx` (`inputUnit`/`metricLabel`/`toDisplayString`/`parseMetricInput`) — zéro duplication. Autres disciplines : rendu V3/V4 inchangé. tsc 0 erreur, eslint clean, vitest 307/307, build OK. Capture avant/après impossible depuis cet env (pas de session Lovable) — à juger par Nathan en live.

## Phase C — lot V4.1 livré : corrections du modèle métier avant push main (2026-07-16)
Retour de Nathan sur V4, corrigé avant tout push main :
- **Tapis/Marche inclinée** : le KILOMÈTRE est l'unité métier — SUPPRESSION de l'estimation durée×vitesse (explicitement refusée) ; la séance démarre sur "Km 1" seul (vitesse/inclinaison pré-remplies), l'utilisateur ajoute les kilomètres suivants. `cardioEngine.buildLiveSegmentsImpl` seed 1 répétition, plus de numérotation `i/n`.
- **"Ajouter une répétition"** (`GenericExerciseCard.handleAddRep`) : cascade muscu complète — copie d'abord la DERNIÈRE répétition de la séance EN COURS (Km 3 reprend vitesse/inclinaison du Km 2), sinon la répétition suivante de la dernière séance passée, sinon vide.
- **Rameur** : intervalle libre (500/750/1000/2000 m) — le 1er bloc reprend la distance choisie au Sensei comme point de départ, jamais un format imposé ; champs métier complets toujours visibles.
- **HYROX** : modèles exacts validés par Nathan — Burpees=[reps] (temps retiré) ; RowErg/Rameur=[distance,temps,allure/500,watts,cadence] séparé de SkiErg=[distance,temps,allure/500,watts] (sans cadence). Testé exhaustivement (`hyroxEngine.test.ts`, +2 tests).
- Vérifié : tsc 0 erreur, eslint clean, vitest **307 passed / 29 skipped**, build OK. Poussé sur `main` à la demande explicite de Nathan (déclenche deploy-functions + sync Lovable).

## Phase C — lot V4 livré : « le modèle métier de la répétition » (2026-07-16, branche `claude/exercise-central-governance-0qvidl`)
Recadrage Nathan après test du V3 : plus de répétitions génériques — chaque discipline doit posséder SA définition de ce qu'est une répétition (le composant reste partagé, le CONTENU devient spécifique). Implémenté via le point d'extension existant des moteurs (aucune nouvelle architecture) :
- **Nouveau contrat moteur optionnel `repMetricKeysFor?(exerciseLabel): string[]`** (`engines/types.ts`) — LE modèle métier de la répétition : les clés de métriques que la carte de saisie propose même quand la répétition est vide. Consommé par `GenericExerciseCard` : `knownKeys = repMetricKeysFor(label) ∪ clés déjà saisies` — un Rameur ajouté au picker expose immédiatement distance/temps/allure/watts/cadence/FC, un Sled Push charge+distance, plus jamais une carte nue.
- **Modèles par moteur** : cardio (`REP_MODELS` par motif de libellé : rameur→6 clés bloc ; marche/tapis→vitesse+inclinaison+FC ; assault→watts/calories ; vélo→résistance/cadence ; escalier→niveau ; défaut distance+durée) ; hyrox (sled/farmer/sandbag→charge+distance+temps ; wall balls→charge+reps ; burpees→reps+temps ; ergs→distance/temps/allure-500/watts ; running→distance+allure ; défaut reps+charge) ; course (défaut distance+allure+FC ; montées→temps+dénivelé+FC) ; guided (lagree/megaformer→durée+reps+résistance ; défaut durée+reps — limite connue : un exercice Lagree au nom libre ne matche pas /lagree/, tombe sur le défaut sans résistance) ; freeform : aucun (texte libre assumé).
- **Seeding par kilomètre** : `courseEngine.continuousLiveSegment` retourne désormais N répétitions "Km i" (`{label} i/n`, 1000 m chacune + dernier partiel ≥200 m, allure cible pré-remplie) pour les 9 types de séance CONTINUS — "Km 1 → 5:20, Km 2 → 5:12", l'accélération se voit. Fractionné/côtes inchangés (modèle déjà juste). `cardioEngine.buildLiveSegmentsImpl` : Marche inclinée/Tapis → une répétition par km estimé (durée×vitesse, plafond 30) avec vitesse/inclinaison pré-remplies ; Rameur et autres → bloc unique conservé (c'est le bon modèle), générique sinon. L'aperçu Sensei (`buildSession`) n'est PAS touché — seul le seed live change.
- **Nouvelles métriques déclarées** (`SEGMENT_METRIC_CONFIG`) : `duration_s` (Temps m:ss, direction min — bloc à distance fixe, distinct de `duration_min` max), `pace_per_500m` (min décimales/500 m, comme pace_min_per_km), `watts`, `stroke_rate_spm`, `heart_rate_bpm` (secondary volontaire : jamais une colonne/record). **`incline_pct` promue primary** (order 3) — donnée de premier plan de la Marche inclinée (seul cardio l'utilise, aucune autre discipline affectée). `INPUT_UNITS` (ActiveSegmentCard) complété.
- **`courseEngine.formatLiveSegmentImpl`** : le fallback des clés inconnues passe par `SEGMENT_METRIC_CONFIG` (libellé+format+miroir numérique) — une FC saisie en live ne s'affiche plus en clé brute et n'est plus perdue du miroir.
- Tests : 3 tests de l'ancienne spec mis à jour (bloc continu unique → per-km ; incline secondary → primary) + 4 nouveaux (cardio per-km, Rameur bloc unique, repMetricKeysFor). **305 passed / 29 skipped**, tsc 0 erreur, eslint clean, build OK. Pas de test live possible (env distant).

## Phase C — lot V3 livré : « la carte Exercice » (2026-07-16, branche `claude/exercise-central-governance-0qvidl`)
Recentrage validé par Nathan après V2 : le cœur du produit est la SÉANCE (ordre de priorité permanent : 1. séance active, 2. résumé de clôture, 3. Chroniques, 4. fiches statistiques — évolutions Chroniques suspendues jusqu'à ce que la séance soit au niveau). Lot V3 = toute l'expérience autour de la carte exercice générique, au niveau muscu (équivalence, pas copie), méthode Caveman (aucun audit/doc, réutilisation stricte de l'existant).
- **`ActiveSegmentCard.tsx` réécrit** au gabarit de la ligne de série muscu (mêmes primitives `ExerciseCardSetIndex`/`ExerciseCardStatField`) : capsule numérotée + flèche de tendance vs la répétition de MÊME RANG de la dernière séance (direction déclarée par `SEGMENT_METRIC_CONFIG` — une allure plus basse = progression ↑) ; les métriques `primary` (max 2, ordonnées) deviennent les grands champs tactiles avec unité courte (`INPUT_UNITS` local, ex. km / min/km / rpm) et placeholder = valeur de la dernière séance ; libellé éditable + métriques secondaires + valeurs texte passent en ligne compacte dessous ; gros bouton de validation rond succès (remplace la checkbox 16px) ; suppression avec confirmation inline ; flèches monter/descendre conservées (aucune capacité retirée). `useEffect` sur `segment.metrics` pour refléter "Reprendre les valeurs précédentes".
- **`GenericExerciseCard` (ActiveExerciseCard.tsx) enrichi** : `lastSession` calculé depuis `useDisciplineSegmentHistory` DÉJÀ chargé pour le badge Record (zéro requête en plus — regroupement par workoutId, plus récente par date) ; badge "Dernière fois" (History + 2 meilleures valeurs primary formatées) à côté du badge Record ; méta-ligne gagne la meilleure valeur du jour ; bouton **"Reprendre les valeurs précédentes"** (RotateCcw, pendant exact du muscu : recopie rang par rang, crée les répétitions manquantes via mutations existantes) ; "Ajouter une répétition" pré-remplit depuis la répétition suivante de la dernière séance (sinon vide, jamais inventé) ; suppression d'exercice au header (Trash2 + `ExerciseCardConfirmDelete`, supprime toutes les répétitions — parité muscu) ; validation d'une répétition → `navigator.vibrate(50)` + **minuteur de repos** (`restTimer.startForExercise(group.key)` — clé stable inter-séances) UNIQUEMENT quand l'exercice a >1 répétitions (fractionné/circuit ; jamais pour un bloc unique type Rameur 2000m).
- **`ActiveGenericSessionView.tsx`** : `<RestTimerBar />` monté (même barre que muscu).
- Vérifié : tsc 0 erreur, eslint clean, vitest 301/301, build OK. Pas de test live possible (env distant) — à vérifier : séance Course fractionné (placeholders/tendances/minuteur), Rameur bloc unique (pas de minuteur), reprise des valeurs.

## Phase C — lot V2 livré : « la récompense qui reste » (2026-07-15, branche `claude/exercise-central-governance-0qvidl`)
Le bilan IA post-séance existe désormais pour les 6 disciplines ET devient une page re-ouvrable des Chroniques (règle §9.1/§9.2 du doc de phase : réutilisation de `workout_analyses`, persisté depuis le 29/06 mais jamais relu).
- **Rendu partagé** : `WorkoutAnalysisContent.tsx` (nouveau) = type `WorkoutAnalysis` + `AnalysisSheetShell` + sections du bilan, extraits de `PostWorkoutAnalysisSheet` (muscu, comportement inchangé — payload/appel Edge identiques). `variant: "muscu" | "generic"` n'ajuste que libellés/icône de la section muscles ("Ce que tu as sollicité" côté générique). UN SEUL contrat JSON pour toutes les disciplines.
- **Bilan générique post-clôture (P0-2)** : `session/GenericPostWorkoutAnalysisSheet.tsx` (nouveau) — payload en vocabulaire de discipline (exercices/répétitions/meilleures valeurs via `SEGMENT_METRIC_CONFIG`, `previous_best` par exercice, 8 dernières séances de la discipline), AUCUN muscle/tonnage/1RM. `ActiveGenericSessionView.onFinished` passe désormais le snapshot (`(finished: ActiveGenericWorkout) => void`) ; `SeancesTab` monte le sheet dans la branche active générique ET la vue historique (même pattern que muscu C2).
- **Edge `analyze-workout`** : branche additive `generic_workout` (validation/sanitisation : strip `\r\n\t<>`, caps longueurs/tableaux, contenu utilisateur isolé dans `<contenu_seance>` avec instruction anti-injection — convention coach-workout). Queue restructurée en `runAnalysis(prompt, generic)` : tool schema UNIQUE (mêmes clés/required — descriptions adaptées par ternaires), même upsert `workout_analyses`, même rate-limit. Chemin muscu strictement inchangé (prompt et descriptions identiques). ⚠️ Déploiement au merge vers `main` (CI deploy-functions.yml) — pas déployé depuis la branche.
- **Relecture depuis les Chroniques (§8.2)** : `useWorkoutAnalyses.ts` (nouveau) — `useWorkoutAnalysisIndex()` (Set des workout_id avec bilan, UNE requête partagée par toutes les cartes) + `useStoredWorkoutAnalysis(workoutId)` (chargé à l'ouverture seulement). `StoredWorkoutAnalysisSheet.tsx` (nouveau) : pure lecture, zéro appel IA. Entrée "Revoir le bilan" (Sparkles) en TÊTE du menu ⋮ de `WorkoutCard` (muscu) et `GenericHistoryCard`, affichée UNIQUEMENT si un bilan existe (jamais d'entrée morte). Les deux sheets post-clôture invalident `WORKOUT_ANALYSES_QUERY_ROOT` après succès.
- **Tuile "Records du jour" (P3-1)** : `countNewRecords()` (segmentStats.ts, +5 tests = 28/28 sur ce fichier) — ne compte que les améliorations STRICTES (jamais une égalité ni un exercice sans historique, contrairement au badge Record des cartes qui s'affiche aussi à égalité — choix documenté en commentaire). 4e tuile de `GenericWorkoutSummaryOverlay` par valeur émotionnelle décroissante : Records > métrique-phare > Discipline.
- **`types.ts`** : bloc `workout_analyses` inséré à la main (la table existait en prod depuis le 29/06 mais pas dans les types générés — même approche chirurgicale que workout_segments/workout_templates).
- Vérifié : tsc 0 erreur projet entier, eslint clean sur les 12 fichiers touchés (1 warning console préexistant WorkoutCard, hors périmètre), vitest **301 passed / 29 skipped**, build OK, syntaxe edge via esbuild (binaire dans `node_modules/vite/node_modules/esbuild/bin/esbuild` — pas de npx esbuild direct dans ce sandbox). Pas de test live possible (env distant sans session Lovable) — à vérifier après merge+deploy : clôture d'une séance Cardio → bilan IA s'ouvre, "Revoir le bilan" sur une séance muscu récente, tuile Records.
- **PORTE DE DÉCISION OUVERTE (fin de V2, conformément au §8.4)** : la Maîtrise par exercice toutes disciplines (§5.8 du doc de phase) attend la décision de Nathan — si validée tôt, elle s'implémente en V6 juste après les fiches.

## Phase C — lot V1 livré (2026-07-15, branche `claude/exercise-central-governance-0qvidl`)
Vision + ordre V1-V10 validés par Nathan, avec 3 règles permanentes ajoutées au doc de phase (§9) : (1) question-filtre "est-ce que ça donne envie de revenir dans ses Chroniques ?" — les Chroniques sont le cœur émotionnel, une séance = un souvenir/une progression/une histoire ; (2) réutilisation avant création — toujours vérifier si l'information existe déjà (ex. bilan IA `workout_analyses`) avant de créer une donnée ; (3) invariants : pas de régression muscu, pas de nouvelle architecture, pas de duplication, pas de dette volontaire.
- **V1.a (P0-1)** : `ActiveGenericSessionView.tsx` transmet désormais `discipline={workout.discipline}` à `SegmentAnalysisSheet` — la fiche exercice ouverte en séance active Cardio/HYROX/Guidé/Autre lit enfin le bon historique (avant : défaut "course" → "Pas encore réalisé" mensonger).
- **V1.b (P1-6)** : nouveau `RepeatLiveConfirmDialog.tsx` (gabarit exact de `WorkoutDeleteDialog`, action primaire `bg-gradient-primary`) remplace les DEUX `window.confirm()` natifs : `SeancesTab.repeatLive` (muscu — état `repeatCandidate` + `confirmRepeatLive`, dialogue monté dans la vue historique, couvre ↻ liste compacte ET menu WorkoutCard via `onRepeatLive`) et `GenericHistoryCard.handleRepeatLive` (état `confirmRepeat` local). Plus aucun `window.confirm` dans `src/` (vérifié par grep).
- **Dette Phase B corrigée au passage (imposée par le hook pre-commit, pas opportuniste)** : 2 erreurs `tsc` PRÉEXISTANTES sur le tip (vérifié par `git stash` : présentes sans mon diff) dans `ActiveExerciseCard.tsx:606` et `GenericHistoryExerciseList.tsx:118` — la signature de `bestMetricValue` (`segmentStats.ts`) était trop étroite (`Record<string, number>`) pour `SegmentInstance.metrics` (`number | string`). Le hook husky lance `tsc` et bloquait TOUT commit. Fix minimal : élargissement du type de paramètre (le filtre runtime `typeof === "number"` écartait déjà les strings — zéro changement de comportement, 23/23 tests segmentStats verts). Le commit `4f7d545` (Phase B addendum 3) avait dû passer en `--no-verify`.
- Vérifié : `npx tsc --noEmit` **0 erreur projet entier**, eslint clean sur les 5 fichiers touchés, vitest **296 passed / 29 skipped** (skips rls préexistants), `npm run build` OK. ⚠️ `package-lock.json` désynchronisé de `package.json` (`@lovable.dev/vite-tanstack-config` 2.7.1 vs ^2.7.3) : `npm ci` échoue, il faut `npm install` puis restaurer le lockfile — drift Lovable préexistant, non touché.
- Pas de test navigateur live dans cette session (environnement distant sans session Lovable authentifiée) — à vérifier au prochain passage : fiche exercice depuis séance active Cardio (bon historique), confirmation "Refaire" au doigt.

## Phase C — conception convergence UX finale (2026-07-15, branche `claude/exercise-central-governance-0qvidl`, AUCUN CODE)
Document de conception unique demandé par Nathan (gouvernance : pas de nouvelle architecture, Musculation = référence produit, équivalence jamais identité, partir de l'expérience jamais des composants) : `docs/architecture/phase-c-convergence-ux-finale.md`. Contenu : problèmes P0→P3, 8 maquettes conceptuelles décrites, plan en 6 lots (C0-C6), ordre exact des 19 développements, 2 portes de décision (schéma modèles multi-disciplines ; Maîtrise par exercice). **Le développement ne commence qu'après validation de ce document — rien n'a été implémenté dans cette session.**
- Constats nouveaux vérifiés dans le code pendant l'audit (au-delà de la §8.6 Phase B) :
  - **P0-1 (bug)** : `ActiveGenericSessionView.tsx` monte `SegmentAnalysisSheet` SANS prop `discipline` → défaut "course" → la fiche exercice ouverte depuis une séance active Cardio/HYROX/Guidé/Autre lit le mauvais historique ("Pas encore réalisé" mensonger). `GenericHistoryExerciseList`/`DisciplineExerciseLibrarySheet` la transmettent, eux, correctement.
  - **P1-2** : la branche `GenericExerciseCard` d'`ActiveExerciseCard.tsx` charge déjà `useDisciplineSegmentHistory` (pour le badge Record) mais n'affiche aucun repère "dernière fois" ni reprise de valeurs — écart de finition pur vs muscu (lastSession/suggestion/restauration).
  - **P1-5** : `GenericSessionReviewSheet` est orphelin depuis la Phase A (tous les moteurs ont `supportsLiveTracking=true` → `handleCoachResult` ne route plus jamais vers `setGenericDraft`) — réutilisable tel quel pour "consigner une séance passée" générique.
  - `window.confirm()` natif utilisé par les DEUX chemins "Refaire en live" (`SeancesTab.repeatLive` muscu + `GenericHistoryCard.handleRepeatLive`) — hors charte, avait bloqué les onglets de test Phase B.
  - Commentaire périmé probable : "récents Course non couverts" (`recentSegmentLabels.ts`) — depuis la Phase A la Course fige aussi `metadata.segments` à la clôture (à re-vérifier au lot C4).
- **Addendum §8 (même jour, après validation du principe par Nathan)** — "épreuve de la vision" : produit imaginé à 2 ans (6 pratiques : Muscu, Lagree, Marche inclinée, Tapis, Rameur, Vélo), 4 piliers d'identité (duel contre soi-même / chronique comme saga / mentor / une seule langue), chaque lot ré-évalué par valeur utilisateur (pas par facilité technique). **L'ordre §8.4 (V1→V10) remplace le §7.** Changements : fiche de cours Lagree remontée (V5), édition rétroactive descendue (V8), ↻ compact + explication Sensei repoussés en polish (V10), décision Maîtrise avancée à la fin de V2.
- **Découverte importante pendant l'exercice de vision** : le bilan IA post-séance muscu est PERSISTÉ en prod (`workout_analyses`, upsert par l'edge `analyze-workout`) mais JAMAIS relu dans l'app (seul `exportData.ts` référence la table) — le bilan est à usage unique même en Musculation. Intégré au lot V2 : le bilan devient une page re-ouvrable de la chronique (toutes disciplines, muscu comprise). Seul point de la phase qui touche la Musculation.

## Nutrition → refonte de la zone haute : cercle remplacé par une barre de progression (2026-07-11)
Refonte UI strictement locale à `src/routes/_authenticated/fitness/NutritionTab.tsx` — aucune logique métier, hook, requête Supabase ou Sheet modifiée.
- **Suppression complète du `CaloriesRing`** (grand cercle de calories) et de son composant local.
- **Nouvelle carte calories** : affichage horizontal premium avec le total consommé `/ objectif`, les calories restantes en surimpression, une grande barre de progression épaisse (`h-3`) avec remplissage animé `bg-gradient-primary`, et le pourcentage atteint.
- **Hiérarchie visuelle** respectée : barre calories → 3 cartes macros (Protéines/Glucides/Lipides) → Repas → Compléments.
- **Design system préservé** : même token `CARD`, même halo `bg-primary/10 blur-3xl`, même courbe d'animation `TRANSITION`/`EASE`, pas de couleur littérale, pas de quatrième carte Calories, pas de redondance.
- Validé : `npx tsc --noEmit` 0 erreur, `eslint --fix` clean, `npm run test` **230/230 verts**, `npm run build` OK. Test navigateur impossible (pas de session active, `LOVABLE_BROWSER_AUTH_STATUS=signed_out`).

## Fix global : la barre de nav flottante / le "+" ne recouvrent plus le contenu (2026-07-10, branche `claude/nutrition-ui-simplify-hr2nop`)
Signalé en testant Nutrition, mais le bug était en réalité dans le layout partagé (`AppShell`/`BottomNav`, utilisés par **toutes** les pages authentifiées) — corrigé au bon niveau plutôt qu'en rustine locale à Nutrition.
- **Cause racine** : `AppShell.tsx` réservait un `padding-bottom` fixe (`5.5rem + safe-area`) en bas de la ScrollView, calé pile sur le `bottom` du FAB (`5.5rem + safe-area` lui aussi, dans `NutritionTab.tsx`/`FormComponents.tsx`) — cela ne couvrait que le bord BAS du bouton, jamais sa hauteur (56px pour le "+" Nutrition) ni la hauteur réelle de `BottomNav` (jamais mesurée, seulement supposée). Sur les appareils avec une safe-area importante (home indicator), la marge résiduelle devenait quasi nulle voire négative → dernière carte/complément partiellement masqués, exactement le symptôme remonté par Nathan.
- **`BottomNav.tsx`** : nouveau `useLayoutEffect` + `ResizeObserver` sur le wrapper `fixed` de la barre — publie sa hauteur *réellement rendue* (safe area déjà incluse, puisque c'est son propre `paddingBottom`) dans une variable CSS globale `--bottom-nav-height`. Mesurée en direct, donc correcte sur Dynamic Island, appareils sans encoche, réglages de police — pas une estimation figée à re-tester par appareil.
- **`AppShell.tsx`** : `padding-bottom` de la ScrollView passe de la classe Tailwind figée à `calc(var(--bottom-nav-height, 5.75rem) + 6rem)` — hauteur réelle de la barre + marge fixe de 96px. Preuve : pour tout `safe-area-inset-bottom ≥ 12px` (tous les iPhone à encoche/Dynamic Island), la marge nette au-dessus du sommet du FAB est indépendante de la safe-area et vaut `hauteur_barre − 64px` (~20-30px de marge réelle avec la barre actuelle) ; pour les appareils sans safe-area (ex. iPhone SE), la marge est encore plus généreuse. Bénéfice : correction valable sur **toutes** les pages (Accueil/Séances/Nutrition/Profil), pas seulement Nutrition, puisque `AppShell`/`BottomNav` sont partagés.
- **`NutritionTab.tsx`** : le FAB "+" remonté de 16px (`bottom: 5.5rem → 6.5rem + safe-area`), demande explicite Nathan — halo, animation, taille et comportement du bouton strictement inchangés, seul le positionnement bouge.
- **Aucune autre page/FAB touché** (ex. `FabAdd` partagé de `FormComponents.tsx`, utilisé ailleurs, hauteur 48px < 56px du FAB Nutrition) — bénéficie automatiquement de la marge élargie sans avoir besoin d'être modifié.
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean, `npm run test` **230/230 verts**, `npm run build` OK. Changement strictement layout/positionnement (aucun hook métier, aucune Sheet, aucune animation de contenu modifiée) — vérification empirique sur vrai appareil impossible dans cette session (pas de compte de test, contrainte déjà documentée), le raisonnement ci-dessus est démontré analytiquement à partir des dimensions réelles du DOM (mesurées, pas estimées).

## Nutrition → échelle typographique unifiée (2026-07-10, branche `claude/nutrition-ui-simplify-hr2nop`, déjà mergée sur `main`)
Quatrième et dernière passe du même jour, cette fois exclusivement typographique — aucune logique, aucun composant, aucune animation touchés (uniquement des classes Tailwind de taille/graisse/interligne + marges directement liées, sur `NutritionTab.tsx` et `nutrition.tsx`).
- **Échelle consolidée** : le fichier utilisait 9 tailles différentes (`text-[9px]` à `text-2xl`, en passant par `text-lg`/`text-xl`) éparpillées sans logique claire. Ramené à une échelle de 5 paliers cohérents : `text-2xl` (24px, **exception** — uniquement le chiffre de calories consommées dans `CaloriesRing`, volontairement inchangé pour rester l'élément le plus grand de la page), `text-base` (16px — "kcal restantes", titres de section "Mes repas"/"Compléments", nom de repas, titre du centre de commandes, greeting `nutrition.tsx`), `text-sm` (14px — valeur des macro-cartes, calories d'un repas, noms d'aliments, titres d'action du centre de commandes), `text-xs` (12px — boutons, descriptions, libellés secondaires), `text-[10px]`/`text-[9px]` (informations les plus secondaires : unités, badges, labels P/G/L). Plus aucun `text-lg`/`text-xl`/`text-[11px]` dans le fichier (vérifié par grep après coup).
- **Hiérarchie corrigée** : le nom du repas (`g.label`) passait de `text-sm` à `text-base font-bold` (il doit dominer sur les valeurs de macros, demande explicite Nathan) ; en contrepartie le total calories d'un repas redescend de `text-base` à `text-sm` pour ne plus rivaliser avec le nom. La valeur en grammes des macro-cartes (`text-xl→text-sm`) et du chip macro d'un repas (`text-[11px]→text-[10px]`) descendent nettement pour rester sous le nom du repas, conformément à l'ordre demandé (repas > macros > aliments).
- **Interligne/espacement associés** : `leading-snug`/`leading-tight` ajoutés sur les paragraphes de description (centre de commandes, alerte dépassement, état vide) ; quelques marges directement adossées aux titres réduits en conséquence (`mb-2.5→mb-2`, `mt-3→mt-2.5`, etc.) — pas de refonte de layout, seulement les espaces immédiatement liés aux textes retaillés.
- **Champs `<input>` volontairement exemptés** (`text-sm`, non touchés) : réduire leur taille sous 16px déclencherait le zoom automatique de Safari iOS au focus — un vrai regression fonctionnelle, hors du périmètre "typographie uniquement" demandé.
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean, `npm run test` **230/230 verts**, `npm run build` OK. Diff strictement composé de classes Tailwind (taille/graisse/interligne/marge) — aucune ligne de JSX structurelle, hook, sheet ou prop d'animation modifiée.

## Nutrition → passe finale "niveau App Store", design system unifié (2026-07-10, branche `claude/nutrition-ui-simplify-hr2nop`)
Troisième et dernière passe de finition demandée par Nathan le même jour (suite directe de l'entrée ci-dessous) — plus aucun changement structurel, uniquement du rendu visuel : logique métier, Supabase, Sheets et composants existants strictement inchangés.
- **Design system partagé** (nouvelles constantes en tête de `NutritionTab.tsx`) : `EASE`/`TRANSITION` (durée 0.28, courbe `[0.16,1,0.3,1]`) réutilisés pour TOUTES les animations d'entrée/expansion/fondu du fichier (carte Calories, macro-cartes, cartes repas, anneau calories, barres de progression, fondu de date, backdrop + sheet du centre de commandes) — un seul rythme au lieu de durées disparates (0.16 à 0.9s) éparpillées avant cette passe. `PRESS_SPRING`/`POP_SPRING` : deux ressorts partagés pour tout rebond tactile (pression bouton / pop d'une confirmation), remplaçant des valeurs ad hoc. `PRESS_LARGE`/`PRESS_SMALL` : deux échelles de pression cohérentes (cartes pleine largeur vs boutons/icônes), appliquées à absolument tous les éléments cliquables du fichier (flèches de date, pilule "Aujourd'hui", CTA objectif, carte repas, boutons ré-ajouter/favori/enregistrer, capsule complément, FAB, items du centre de commandes, boutons de la modale "Copier une journée"). `CARD` : classe Tailwind unique (`rounded-3xl border border-border bg-card shadow-sm`) désormais partagée par la carte Calories, les macro-cartes (ex-`rounded-2xl`), les cartes repas et les items du centre de commandes — même rayon/ombre/fond partout.
- **Hiérarchie visuelle** : le nombre de calories consommées dans l'anneau repasse à `text-2xl` (était `text-xl`) pour rester l'élément le plus fort visuellement de la page, conformément à l'ordre demandé Calories > Macros > Repas > Compléments.
- **Cartes repas** : effet "ripple" discret ajouté sur l'en-tête (overlay `bg-primary/5` qui apparaît/disparaît via variants `rest`/`pressed`, propagé depuis le bouton parent) en plus du rebond d'échelle déjà présent — sans toucher au contenu (miniature, nom, macros alignées en grille fixe, calories, chevron) ni à la logique d'expansion.
- **Centre de commandes** : icônes agrandies (`h-11 w-11→h-14 w-14`, `h-5→h-6`), padding généreux (`p-3→p-4`), fond `bg-surface/60→bg-card` (même famille que les autres cartes), même ripple discret que les cartes repas. Chaque catégorie gagne un petit badge rond (emoji dans un cercle `bg-primary/10`) + un séparateur (`border-t`) entre catégories pour être "facilement identifiable", espacement inter-catégories généreux (`mt-6→mt-7 + pt-6`).
- **Aucune régression de fonctionnalité** : les 13 actions, tous les hooks (`useCopyNutritionDay`, `useSupplements`, etc.) et toutes les Sheets sont strictement identiques — seuls la classe CSS, la variante d'animation ou le wrapper `motion.button` ont changé sur les éléments déjà interactifs.
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean (0 nouvelle erreur), `npm run test` **230/230 verts**, `npm run build` OK. Toujours pas de test navigateur manuel possible (même contrainte que les deux passes précédentes de ce jour — pas de compte de test, `vite dev` redirige vers `/login`).

## Nutrition → passe de finition premium, "+" devient un Centre de commandes plein écran (2026-07-10, branche `claude/nutrition-ui-simplify-hr2nop`)
Suite immédiate de la simplification "une action = un seul emplacement" (entrée ci-dessous, même branche, même jour) — Nathan a demandé un polish visuel poussé sans toucher à la logique métier/Supabase/Sheets existantes.
- **`NutritionCommandCenter`** (remplace `SpeedDialFab`, même fichier `NutritionTab.tsx`) : le "+" ouvre désormais un vrai bottom sheet (`max-h-[80vh]`, backdrop `bg-black/60 backdrop-blur-sm`, anim 250ms `[0.16,1,0.3,1]`) au lieu d'un petit menu 2 colonnes. Fermeture par swipe (drag sur la poignée uniquement via `useDragControls`/`dragListener={false}` — le contenu scrollable n'hérite pas du drag), clic sur le backdrop, ou bouton "✕". Les 13 actions (inchangées dans leur logique — mêmes hooks/sheets qu'avant) sont regroupées en 3 catégories avec emoji/titre/description (`COMMAND_SECTIONS`) : 🍽 Ajouter (aliment, recette, repas enregistrés), 📷 Scanner (repas, code-barres, vocal), 🧠 Outils (analyse IA, historique, planning, copier hier/une journée, objectifs, favoris) — chaque carte a icône + titre + description courte + `whileTap`.
- **Carte Calories** : re-compactée (`p-5→p-4`, anneau `h-28→h-24`, `gap-5→gap-4`, barre `h-2→h-1.5`) ; la ligne "Objectif quotidien" (déjà retirée dans l'itération précédente) reste absente.
- **Cartes repas** : macros P/G/L désormais dans une grille 3 colonnes de largeur fixe (`MacroChip`, ex-`MacroInline`) toujours visible et alignée — suppression du double rendu responsive `xs:block`/`xs:hidden` (mockup hérité, un seul rendu maintenant, donc plus de doublon). Miniature agrandie (`h-14 w-14`, `shadow-sm ring-1 ring-white/10`), `whileTap` sur l'en-tête, animation d'ouverture enrichie d'un `scale` en plus du `height`/`opacity` déjà présent.
- **Compléments** : capsules resserrées (`w-24→w-20`, `p-3→p-2.5`), ajout d'un label textuel explicite "Pris"/"À prendre" (pastille colorée) en plus du check animé déjà existant — répond à la demande explicite d'état textuel visible.
- **Header** (`nutrition.tsx`) : padding page `pt-8/pb-8→pt-6/pb-6`, `h1` `text-2xl→text-xl`, badge streak `h-9→h-8` — toujours pas de bouton "..." (retiré à l'itération précédente, resté supprimé).
- **Micro-animations** : crossfade `AnimatePresence mode="wait"` sur le libellé de date lors du changement de jour ; les animations déjà existantes (anneau calories, barres macros, check complément, hauteur repas) sont conservées et légèrement enrichies plutôt que dupliquées.
- **Aucune logique supprimée** : tous les hooks (`useNutrition`, `useCopyNutritionDay`, `useSupplements`, etc.), toutes les Sheets (`NutritionSheet`, `GoalsSheet`, `MealPlanSheet`, etc.) et tous les composants existants (`MealActionMenu`, `SwipeableNutritionItem`, `PortionEditModal`, `WorkoutDeleteDialog`) sont réutilisés tels quels — seul l'habillage visuel/l'UX ont changé.
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean (mêmes erreurs prettier pré-existantes ailleurs dans le fichier corrigées au passage par `eslint --fix`, aucune régression), `npm run test` **230/230 verts**, `npm run build` OK. Toujours pas de test navigateur manuel possible (pas de compte de test disponible, `vite dev` redirige vers `/login` — contrainte documentée à plusieurs reprises dans ce fichier).

## Nutrition → simplification "une action = un seul emplacement" (2026-07-10, branche `claude/nutrition-ui-simplify-hr2nop`)
Suite du redesign Nutrition livré via Lovable le même jour (commit `7669e0c` "Redesigné module Nutrition") — Nathan a testé et demandé d'aller plus loin : toutes les actions doivent être regroupées derrière le bouton "+", l'écran principal ne doit garder que header/calories/macros/repas/compléments.
- **`NutritionTab.tsx`** : section "Actions rapides" (grille 2×4 de `QuickAction`) et barre de filtres "Tous/Favoris/Enregistrés/Historique/Plan" (`TabChip`) supprimées entièrement — ces deux composants locaux sont retirés du fichier (plus aucun appelant). L'état `activeTab`/`handleTab` ne servait qu'à ces deux blocs (le regroupement `grouped` des repas n'a jamais été filtré par `activeTab` — vérifié avant de supprimer, donc aucune régression d'affichage).
- **`SpeedDialFab`** (le bouton "+") devient le seul point d'entrée : `SpeedDialAction` passe de 7 à 13 valeurs — ajout de `analysis`/`history`/`plan`/`copy-yesterday`/`copy-day`/`goals` à côté des actions déjà câblées (`manual`/`scan`/`barcode`/`voice`/`recipe`/`favorites`/`saved`). Chaque action rouvre un sheet/hook déjà existant (`NutritionAnalysisSheet`, `NutritionHistorySheet`, `MealPlanSheet`, `GoalsSheet`, `useCopyNutritionDay`) — aucune nouvelle logique métier, uniquement le point d'entrée qui change. Le panneau du speed dial passe en `max-h-[65vh] overflow-y-auto` pour rester utilisable sur petit écran avec 13 entrées.
- **"Copier une journée"** (ex-bouton "Copier…" + input date affiché inline sur la page) devient une petite modale overlay (`fixed inset-0 bg-black/50`, même style que `WorkoutDeleteDialog`) ouverte depuis le "+", au lieu d'un bloc toujours présent dans l'arbre de la page — même hook `useCopyNutritionDay`/état `copyOpen`/`copyFrom`, seule la présentation change.
- **Carte Calories** : ligne "Objectif quotidien : XXXX kcal" retirée (l'objectif est déjà visible dans le cercle `CaloriesRing` et dans "sur {target}").
- **`nutrition.tsx`** : bouton "…" du header (`MoreHorizontal`) supprimé — il n'avait aucun `onClick`/contenu, donc rien à reporter dans le "+".
- Aucune fonctionnalité perdue : Scan repas/Vocal/Code-barres/Analyse IA/Objectifs/Copier hier/Copier une journée/Recettes/Favoris/Enregistrés/Historique/Planning/Ajouter un aliment sont toutes accessibles depuis le "+", chacune à un seul endroit.
- Validé : `npx tsc --noEmit` 0 erreur, `npm run test` **230/230 verts** (0 régression), `npm run build` OK. `eslint` : mêmes 13 erreurs prettier déjà présentes avant cette session (vérifié par comparaison `git stash`), aucune nouvelle introduite par le diff. Pas de test navigateur manuel possible (pas de compte de test disponible, contrainte déjà documentée à plusieurs reprises dans ce fichier) — le serveur `vite dev` démarre et sert la page, mais redirige vers `/login`.

## Sensei live-tracking générique — pilote Course à pied (2026-07-10)
Objectif : généraliser à terme l'édition/suivi live des séances proposées par Sensei à toutes les disciplines (pas seulement muscu), sans dupliquer le module Exercice. Nathan a scopé cette phase : (1) nouvelle table relationnelle dédiée (pas jsonb-only) pour que les segments soient des entités de 1re classe éditables/analysables ; (2) édition/suivi uniquement — Rank/Mastery/Badges/recommandations de surcharge progressive = phase 2, mais la DB/l'archi doivent déjà l'accommoder sans refonte ; (3) pilote Course à pied uniquement, ne pas étendre aux autres disciplines tant qu'il n'est pas pleinement validé.
- **Migration `20260709220000_generic_workout_segments.sql`** — nouvelle table `workout_segments` (id, workout_id FK→workouts, user_id FK→auth.users, position, label, metric_key nullable, metrics jsonb, completed, timestamps). RLS `auth.uid() = user_id`, 3 index (dont user_id+label prévu pour les futures requêtes de progression). C'est le pendant générique de `exercises`/`exercise_sets`, réservé aux disciplines non-muscu — le flux muscu → `feedsRankEngine` n'est pas touché. Appliquée en prod via MCP Supabase.
- **`lib/fitness/engines/types.ts`** — ajout strictement additif : types `LiveSegmentSeed`/`LiveSegmentRow`/`LiveSegmentMetricValue`, flag `EngineDescriptor.supportsLiveTracking?`, méthodes optionnelles `WorkoutEngine.buildLiveSegments?()`/`formatLiveSegment?()`. Tous les moteurs existants (strength/cardio/hyrox/guided/freeform) compilent sans modification.
- **`lib/fitness/engines/courseEngine.ts`** — 1er moteur avec `supportsLiveTracking: true`. Réutilise les mêmes constantes/tables d'allure que l'affichage existant (EASY_PACE/TEMPO_PACE/THRESHOLD_PACE/FAST_PACE, byLevel, clamp, distanceForDuration — zéro logique numérique dupliquée) pour générer des segments structurés (distance_m, pace_min_per_km, zone, elevation_m). 6 nouveaux tests (18/18 verts sur le fichier).
- **`hooks/useGenericActiveSession.ts`** (nouveau) — pendant générique des hooks muscu (`useActiveWorkout`/`useStartWorkout`/etc., react-query optimiste) : `useActiveGenericWorkout`, `useStartGenericActiveWorkout`, `useAddGenericSegment`, `useUpdateGenericSegment`, `useDeleteGenericSegment`, `useReorderGenericSegment` (boutons haut/bas — **pas de drag-and-drop**, dnd-kit retiré du projet le 5 juillet), `useFinishGenericActiveWorkout` (fige les segments formatés dans `workouts.metadata.segments` via `entry.formatLiveSegment()`), `useCancelGenericActiveWorkout`.
- **`components/fitness/session/ActiveSegmentCard.tsx` + `ActiveGenericSessionView.tsx`** (nouveaux) — pendant générique de `ActiveExerciseCard`/`ActiveWorkoutView` pour les disciplines non-muscu.
- **`hooks/use-fitness.ts`** — `useActiveWorkout()` filtre désormais `.eq("discipline", "muscu")` pour ne pas capter une séance active d'une autre discipline (les lignes existantes ont déjà `discipline='muscu'` par défaut → pas de régression constatée).
- **`routes/_authenticated/fitness/SeancesTab.tsx`** — `handleCoachResult` bascule vers le flux live générique quand `entry.supportsLiveTracking` est vrai (Course à pied uniquement pour l'instant), sinon comportement inchangé (musculation → flux existant, autres disciplines non pilotées → ancien flux review-sheet).
- **`integrations/supabase/types.ts`** — insertion chirurgicale du seul bloc `workout_segments` (pas de régénération complète : un drift préexistant non lié existe sur 5 tables/fonctions entre le repo et la prod, volontairement non touché pour ne pas élargir le risque).
- Testé en live sur https://cortex-home-ai.lovable.app : Sensei Course à pied → segments live générés → édition distance/allure → coché "réalisé" → segment custom ajouté → réordonné → séance terminée → historique correctement formaté, aucune erreur console. Non-régression muscu vérifiée (nouvelle séance vide muscu créée puis annulée pour le test — comportement identique à avant).
- **Ne pas étendre à d'autres disciplines (cardio, HYROX, mobilité, récupération…) tant que Course à pied n'est pas jugé pleinement validé par Nathan.** Phase 2 (Rank/Mastery/Badges/surcharge progressive sur les segments) non démarrée — le `metric_key` et son index existent déjà pour la supporter sans nouvelle migration.

## Harmonisation UX séances sauvegardées ↔ séance active (2026-07-08, branche `claude/saved-sessions-ux-align-iambyf`)
Demande Nathan : l'éditeur de modèle de séance (`TemplateEditorSheet`) utilisait une interface totalement différente de l'écran de séance active (`ActiveWorkoutView`/`ActiveExerciseCard`) — formulaire brut avec `datalist` HTML pour choisir un exercice, une seule ligne par exercice avec 3 champs numériques inline. Objectif : même identité visuelle/interactions, sans dupliquer les composants, en ne gardant que les différences fonctionnelles nécessaires (un modèle n'a jamais été « joué » : pas de PR/historique/récupération/coche de validation).
- **Nouvelles primitives partagées `src/components/fitness/exerciseCard/ExerciseCardPrimitives.tsx`** : `ExerciseCardContainer`, `ExerciseCardHeader` (photo + titre repliable + badges + actions), `ExercisePhotoTile` (photo + upload caméra), `ExerciseCardIconButton`, `ExerciseCardPillButton`, `ExerciseCardSetRow`/`ExerciseCardSetIndex`/`ExerciseCardStatField` (ligne de série + capsule numéro + champ chiffré kg/reps), `ExerciseCardConfirmDelete`, `AddExerciseButton` — seule source de vérité visuelle pour les deux écrans.
- **`ActiveExerciseCard.tsx` refactorée pour consommer ces primitives** (comportement strictement inchangé : PR, badge dernière séance, muscles fatigués, 1RM live, tendance, suggestion de charge modulée par récupération, restauration des charges précédentes, ajout/suppression de série et d'exercice avec confirmation) — plus aucun markup dupliqué avec le nouveau composant modèle. `ActiveWorkoutView.tsx` : le bouton « Ajouter un exercice » utilise désormais `AddExerciseButton`.
- **Nouveau `src/components/fitness/templates/TemplateExerciseCard.tsx`** : même carte que `ActiveExerciseCard` (photo avec upload caméra persistant par nom d'exercice — `useUpsertExercisePhoto`/`useUserExercisePhotos`, réutilisés tels quels —, titre + repli/dépli, ligne de série avec capsule + champs kg/reps). Différences fonctionnelles volontaires : pas de badges PR/historique/récupération, pas de bouton statistiques, pas de coche de validation ; réordonnancement haut/bas (nécessaire, un modèle n'a pas d'ordre chronologique) et notes (spécifique au modèle) conservés. Les N lignes de série d'un exercice de modèle partagent volontairement le même couple reps/charge (`default_reps`/`default_weight`) — le schéma ne stocke qu'une seule valeur par exercice, pas par série ; documenté en commentaire pour ne pas être « corrigé » par erreur plus tard.
- **`TemplateEditorSheet.tsx` réécrit** : le champ texte + `datalist` pour ajouter un exercice est remplacé par le même bouton pointillé « Ajouter un exercice » (`AddExerciseButton`) ouvrant le **même** `ExercisePickerSheet` qu'en séance active (recherche, catalogue complet, scan caméra, création d'exercice personnalisé) — plus aucune duplication de sélecteur. Nom/icône/couleur (métadonnées propres au modèle, sans équivalent en séance active) inchangés.
- **Nouveau `src/lib/fitness/recentExercises.ts`** (domaine pur, testé — 5 tests) : `computeRecentExercises()` extrait de l'ancien calcul inline d'`ActiveWorkoutView` (dédup par nom normalisé depuis l'historique) — désormais partagé par `ActiveWorkoutView` (séance active) et `TemplateEditorSheet` (le picker de modèle propose aussi les exercices récents avec leurs dernières valeurs, utilisées comme valeurs de départ du modèle). `ExerciseExplorerSheet.tsx` : le type `RecentExercise` déplacé dans ce fichier lib, ré-exporté pour compatibilité (aucun autre changement dans ce fichier, diff volontairement minimal — 23 erreurs prettier préexistantes dans ce fichier non touchées, hors périmètre).
- Validé : `npx tsc --noEmit` 0 erreur, `npm run test` **216/216 verts** (+5 nouveaux), `npm run build` OK. `eslint` clean sur tous les fichiers touchés à l'exception d'un `no-empty` déjà présent sur `main` avant cette session (`ActiveExerciseCard.tsx`, `try { navigator.vibrate?.(50); } catch {}`, hors périmètre). Pas de test navigateur manuel possible (pas de compte de test disponible ; `npm run dev` reste cassé par le binding IPv6 déjà documenté, mais `npx vite dev --host 127.0.0.1` fonctionne et sert bien l'app — seul l'accès à l'écran séances derrière l'auth Supabase n'a pas pu être vérifié visuellement dans cette session).

## Historique séances → « Enregistrer comme séance sauvegardée » dans le menu ⋮ (2026-07-08 suite 4, branche `claude/sensei-level-objective-equipment-uh6gpe`, MODULE 2 uniquement)
Ajout demandé par Nathan après le Module 2 (ci-dessous) : le menu ⋮ d'une séance passée (`WorkoutCard.tsx`) contenait 🔄 Refaire en live / 💾 Enregistrer comme séance passée / 🗑️ Supprimer la séance. Nouvelle action **📋 Enregistrer comme séance sauvegardée** insérée entre les deux premières — l'ordre final voulu : Refaire en live / Enregistrer comme séance sauvegardée / Enregistrer comme séance passée / Supprimer la séance.
- **`onOpenFromTemplate` (= « Enregistrer comme séance passée », saisie rétroactive via `WorkoutSheet`) et `onRepeatLive` (« Refaire en live ») ne sont pas touchés** — nouvelle prop `onSaveAsTemplate` ajoutée à côté, sans rien modifier d'existant.
- **`src/lib/fitness/workoutTemplates.ts`** : nouvelle fonction pure `workoutToTemplateSeed()` (+ types `PastWorkoutExerciseLike`/`TemplateSeedExercise`) — regroupe les lignes `exercises` d'une séance passée par nom normalisé (insensible aux accents/casse, propre fonction locale, pas de dépendance à `exerciseCatalog.normalize` pour rester totalement autonome), compte les séries réellement effectuées (`default_sets`), retient la charge max (`default_weight`) et les reps de la dernière série (`default_reps`) comme valeurs de départ — de simples placeholders ajustables avant création, jamais utilisés pour modifier la séance d'origine. 5 nouveaux tests.
- **`TemplateEditorSheet.tsx`** : nouvelles props optionnelles `seedName`/`seedExercises`, utilisées uniquement quand `template` est absent (le flux reste une CRÉATION — `useCreateWorkoutTemplate()`, jamais `useUpdateWorkoutTemplate()`). Nouvelle fonction locale `toEditableFromSeed()` à côté de `toEditable()` (existante, pour l'édition d'un modèle déjà persisté) — les deux chemins restent distincts.
- **`SeancesTab.tsx`** : nouvel état `templateSeed` + handler `saveAsTemplate(w)` qui appelle `workoutToTemplateSeed(w.exercises ?? [])` et ouvre `TemplateEditorSheet` (déjà développé pour le Module 2) en mode création, pré-rempli. Totalement séparé de `template`/`open` (le flux « Enregistrer comme séance passée » existant).
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean sur les 5 fichiers touchés (warnings/erreurs restants dans le lint global sont préexistants, hors périmètre), `npm run test` **211/211 verts** (+5 nouveaux), `npm run build` OK. Aucune régression possible sur « Refaire en live »/« Enregistrer comme séance passée » : leurs props/handlers ne sont pas modifiés, seule une nouvelle branche est ajoutée dans le menu.

## Nouvelle séance → modèles de séance sauvegardés (2026-07-08 suite 3, branche `claude/sensei-level-objective-equipment-uh6gpe`, MODULE 2 uniquement — NOUVELLE FEATURE, SANS LIEN AVEC SENSEI)
Second module de la même demande, **volontairement traité et commité séparément** du Module 1 (Sensei, entrée précédente) — Nathan a explicitement demandé que les deux ne soient pas mélangés. Ce module concerne uniquement le parcours de démarrage manuel d'une séance ("Choisir une épreuve"), pas le moteur d'IA.
- **Nouveau parcours** : `ChoisirEpreuveCard` ouvre désormais `NewSessionChoiceSheet` (nouveau) au lieu d'ouvrir directement `StartWorkoutSheet` — choix entre "✨ Démarrer une séance vide" (route inchangée vers `StartWorkoutSheet`) et "📋 Utiliser une séance sauvegardée" (`SavedTemplatesSheet`, nouveau).
- **Schéma** (migration `20260708130000_workout_templates.sql`) : nouvelles tables `workout_templates` (name/icon/color) et `workout_template_exercises` (name/position/superset_group/default_sets/default_reps/default_weight/notes), RLS standard "propriétaire uniquement". Colonne additive `exercises.superset_group` (nullable) pour reporter le regroupement du modèle sur la séance réellement créée.
  - ⚠️ **Pas de colonne `position`/ordre ajoutée sur `exercises`** (décision délibérée) : la table n'en a jamais eu, et `useWorkouts()`/`useActiveWorkout()` ne trient pas explicitement la relation imbriquée (déjà comme ça avant cette session, cf. tout le reste de l'app qui s'appuie déjà sur l'ordre d'insertion implicite — `useStartWorkoutFromTemplate` "Refaire en live" fait pareil). Ajouter un tri explicite aurait un rayon d'impact large (écran de séance active partagé par tout le monde) pour un bénéfice incertain ; le nouveau hook insère dans le bon ordre en un seul `insert()` et s'appuie sur la même convention déjà éprouvée.
  - ⚠️ **Pas de rendu visuel des supersets dans `ActiveWorkoutView`/`ActiveExerciseCard`** (décision de scope délibérée, à documenter clairement à Nathan) : aucun concept de superset n'existait nulle part dans l'app (UI ni schéma) avant cette session. La DONNÉE est fidèlement reportée (`exercises.superset_group` peuplé au démarrage depuis le modèle), mais `useActiveWorkout()` ne sélectionne même pas cette colonne (select explicite, pas `*`) donc rien n'est affiché groupé pour l'instant — zéro régression sur cet écran très sollicité, mais l'affichage groupé reste un fast-follow si souhaité.
- **`src/integrations/supabase/types.ts`** : les 2 nouvelles tables ajoutées à la main (le MCP Supabase était déconnecté, impossible de régénérer) + `superset_group` sur `exercises`. À re-régénérer proprement une fois la migration appliquée en prod.
- **Hooks** (`src/hooks/useWorkoutTemplates.ts`, nouveau fichier) : `useWorkoutTemplates()` (liste), `useCreateWorkoutTemplate()`, `useUpdateWorkoutTemplate()` (remplace tous les exercices du modèle — approche "delete + reinsert", plus simple et fiable que du diff fin pour un réordonnancement), `useDeleteWorkoutTemplate()`, `useDuplicateWorkoutTemplate()`, et **`useStartWorkoutFromSavedTemplate()`** — bien distinct de `useStartWorkoutFromTemplate()` (use-fitness.ts, "Refaire en live" = rejoue une séance PASSÉE par son id, jamais touché ni renommé). Insère les `exercises` par NOM exactement comme un ajout manuel (`useAddExerciseToActiveWorkout`) : **toute l'intelligence déjà existante (reprise des charges précédentes, charge suggérée, PR, recommandations) est keyée par nom normalisé et s'applique donc automatiquement**, aucun câblage supplémentaire nécessaire — vérifié en lisant `ActiveExerciseCard.tsx`/`computePRs()`/`recommendLoad()` (tous keyés par `normalize(name)`, indépendants de la provenance de l'exercice).
- **Domaine pur** : `src/lib/fitness/workoutTemplates.ts` (`computeSupersetGroups`, testé — 6 tests) extrait de l'éditeur pour rester testable sans React, même principe de séparation des couches que le reste du projet.
- **UI** (`src/components/fitness/templates/`) : `templateVisuals.tsx` (résolveur icône, même principe que `DisciplineIcon.tsx` — 12 icônes curées ; palette de 8 couleurs curées, même principe que `RARITY_COLORS` dans `lib/fitness/badges.ts`, pas de sélecteur libre), `NewSessionChoiceSheet.tsx`, `SavedTemplatesSheet.tsx` (liste + créer/modifier/dupliquer/supprimer avec confirmation inline), `TemplateEditorSheet.tsx` (nom, icône, couleur, liste d'exercices avec suggestion `<datalist>` depuis `EXERCISE_CATALOG`, séries/reps/charge par défaut, notes, réordonnancement par flèches haut/bas — pas de drag-and-drop, `dnd-kit` a été retiré du projet le 2026-07-05 et ne doit pas être réintroduit —, case "superset avec l'exercice précédent" pour grouper deux exercices consécutifs). Nombre de modèles illimité (pas de limite côté schéma ni UI).
- Validé : `npx tsc --noEmit` 0 erreur, `eslint --fix` clean, `npm run test` **206/206 verts** (+6 nouveaux), `npm run build` OK, `node scripts/validate-supabase.mjs` migrations valides et idempotentes. **Aucun fichier de l'écran de séance active touché** (`ActiveWorkoutView.tsx`, `ActiveExerciseCard.tsx`, `use-fitness.ts` absents du diff) — non-régression garantie structurellement, pas seulement testée. Pas de test navigateur manuel possible dans cette session (contrainte d'environnement déjà documentée ailleurs dans ce fichier) ; migration pas appliquée en prod (MCP Supabase déconnecté, sera gérée par la CI `migrate.yml` au merge).

## Sensei musculation → mémoire à long terme, fatigue, points faibles, explication (2026-07-08 suite 3, branche `claude/sensei-level-objective-equipment-uh6gpe`, MODULE 1 uniquement)
Nathan a demandé une évolution en 2 modules **explicitement séparés, non mélangés** avant merge sur `main`. Cette entrée couvre le MODULE 1 (Sensei) — le MODULE 2 (séances sauvegardées/modèles, sans lien avec Sensei) est documenté séparément plus bas.
- **`senseiAutoProfile.ts`** (toujours mêmes exports publics + nouveaux) :
  - **Mémoire à long terme** (recalculée à chaque appel depuis tout l'historique — pas un état stocké séparément, "apprendre" = analyser plus de données au fil du temps, cohérent avec le principe déjà acté "Sensei reste le moteur d'intelligence qui analyse l'historique") : `bestProgressingExercises` (triés par rythme hebdo réel, borné à 3), `chronicStagnationExercises` (stagnation ≥4 semaines), `abandonedExercises` (pratiqué ≥3 fois puis plus revu depuis ≥6 semaines alors que l'utilisateur continue à s'entraîner), `mostFrequentExercises`, `bestVariants` (groupes d'exercices ciblant EXACTEMENT les mêmes muscles — seul regroupement fiable sans référentiel externe de "familles de mouvement" — avec la meilleure tendance actuelle parmi eux).
  - **Fatigue systémique** (`fatigue: {level, reasons}`) : score sur volume des 2 dernières semaines vs habituel (+2 si >1.3x), fréquence des 7 derniers jours vs habituelle (+2 si ≥4 séances et >1.4x), part d'exercices suivis en régression simultanée (+1 à +2). Seuils : ≥3→élevée, ≥1→modérée, sinon faible. **Volontairement complémentaire, pas dupliqué**, de la récupération PAR MUSCLE déjà calculée ailleurs (recovery map, `buildMuscuSenseiContext`) — la fatigue ici est un signal global (volume/fréquence/régression), la récupération reste par muscle ; les deux sont transmis ensemble à l'edge.
  - **`weakPoints`** : union des muscles négligés/sous-entraînés (statut volume déjà existant) ET des muscles dont la majorité des exercices suivis ne progressent pas (nouveau calcul par agrégation muscle← exercices), bornée à 4 — un signal de priorisation progressive, jamais un remplacement brutal.
  - **`buildSenseiExplanation(profile, generatedExerciseNames)`** (nouvelle fonction exportée) : explication concise (≤4 phrases) basée UNIQUEMENT sur les données réelles déjà calculées — compare les noms d'exercices réellement retenus par l'IA aux signaux du profil (fatigue élevée, charge augmentée sur un exercice en progression repris, variante changée sur un exercice en stagnation chronique absent du résultat, exercice ajouté depuis `neverDoneExercises`). Jamais un texte libre inventé par l'IA.
  - Testé : 47 tests au total dans `senseiAutoProfile.test.ts` (+27 nouveaux vs la session précédente).
- **`strengthEngine.ts`** : `training_profile` envoyé à l'edge gagne `bestProgressingExercises`/`chronicStagnationExercises`/`abandonedExercises`/`bestVariants`/`fatigue`/`weakPoints`. Après réception de la réponse IA, `generate()` appelle `buildSenseiExplanation()` et attache le résultat à `template.explanation` (nouveau champ optionnel sur `WorkoutTemplate`, `types.ts` — additif, les autres moteurs ne le renseignent pas).
- **`coach-workout` edge function** : `parseTrainingProfile()` valide/borne tous les nouveaux champs (mêmes règles de sécurité que le reste — muscles contre liste blanche, textes assainis). Prompt : bloc fatigue en tête (⚠️ instructions fermes de réduction volume/intensité/exercices moins exigeants si "élevée", prudence si "modérée"), et lignes informatives pour points faibles/mémoire/variantes.
- **`CoachSheet.tsx`** : le toast de succès affiche désormais `template.explanation` en description (uniquement s'il existe — absent pour les autres disciplines, comportement inchangé pour elles).
- **Performance vérifiée concrètement** : `inferSenseiAutoProfile()` sur un historique synthétique de 500 séances (le plafond réel de `useSenseiTrainingHistory`) s'exécute en **~23ms/appel** (mesuré, 20 itérations) — négligeable face à la latence réseau/IA (appel Gemini, largement >1s). Aucune requête réseau supplémentaire ajoutée : tout le nouveau calcul est client-side, dans le même appel existant.
- Validé : `npx tsc --noEmit` 0 erreur, `eslint --fix` clean, `npm run test` **200/200 verts** (+11 vs la session précédente), `npm run build` OK. Syntaxe edge vérifiée via esbuild (comme les sessions précédentes).

## Sensei musculation → historique complet, anti-répétition, valeurs concrètes (2026-07-08 suite 2, branche `claude/sensei-level-objective-equipment-uh6gpe`)
Avant merge sur `main`, Nathan a demandé d'aller plus loin sur le moteur d'analyse livré dans la session précédente. Toujours la même branche, même jour.

- **Historique COMPLET, pas seulement 60 séances** : nouveau hook `src/hooks/useSenseiTrainingHistory.ts` (`workouts` + `exercises` + `exercise_sets`, borné à 500 séances — même convention "requête large" que `computeBroadActivity(limit=500)` côté Profil). Délibérément **séparé** de `useWorkouts()` (`use-fitness.ts`), qui reste inchangé et borné à 60 pour tout le reste de l'app (Chroniques complètes, WorkoutCard, MuscleMap...) — aucune régression possible ailleurs. `CoachSheet.tsx` : le panneau de briefing informatif garde `useWorkouts()` (60), seul `runtimeInputs.workouts` passé au moteur muscu utilise désormais `useSenseiTrainingHistory()`.
- **`senseiAutoProfile.ts` très enrichi** (toujours mêmes exports publics) :
  - Tendance par exercice recalculée en **fenêtre récente vs fenêtre antérieure immédiate** (jusqu'à 3 séances de chaque côté) au lieu de premier-vs-dernier sur tout l'historique — plus fiable avec un historique long où une charge d'il y a 2 ans ne doit pas dicter le diagnostic d'aujourd'hui. Nouveau champ `pace` ("rapide"/"normale", uniquement en progression) et `stagnantWeeks` (uniquement en stagnation, nombre de semaines depuis la dernière vraie hausse >2%).
  - **`suggestedWeight`/`suggestedSets` par exercice** : charge de départ et nombre de séries concrets, calculés depuis l'historique réel (jamais une valeur générique) — légère hausse en progression (plus marquée si rapide), léger deload (-5%) après ≥3 semaines de stagnation franche, charge stable en régression/nouveau.
  - **Statut relatif par groupe musculaire** (`neglige`/`sous-entraine`/`equilibre`/`surentraine`) : comparaison à la MÉDIANE des propres muscles entraînés par l'utilisateur (jamais inter-utilisateurs), seulement si ≥3 muscles distincts pour avoir un référentiel fiable. `muscleVolume` couvre désormais TOUJOURS les 14 muscles (0 pour un muscle jamais travaillé) au lieu de filtrer les zéros. Nouveau champ `overTrainedMuscles`.
  - **`optimalWeeklyVolume`** : tonnage hebdomadaire total observé dans les semaines qui ont précédé un nouveau record personnel chez CET utilisateur (médiane, ≥2 semaines qualifiantes sinon `null` — jamais une norme externe inventée).
  - **`progressionCyclesCompleted`** : nombre de blocs d'au moins 3 semaines consécutives de hausse de tonnage déjà vécus par l'utilisateur.
  - **`neverDoneExercises`** : candidats de `EXERCISE_CATALOG` jamais pratiqués (identité par `normalize()`, cohérent avec `computePRs`/`useExerciseSetHistory`), triés pour prioriser les muscles négligés/sous-entraînés, bornés à 12 — puis **filtrés par muscles réellement sélectionnés pour LA séance en cours** dans `buildMuscuSenseiContext` (`MuscleQuestionField.tsx`, borné à 5), pas par le moteur générique (qui reste agnostique de la sélection en cours, même principe que `recovery`).
  - **`recentSessions`** (3 dernières séances, la plus récente en premier, noms d'exercices + reps moyens) : sert uniquement à ce que le prompt IA évite de reproduire la même séance.
  - **Compatibilité anciennes données** : repli sur les colonnes résumé `exercises.reps/weight/sets` quand `exercise_sets` est vide (séances antérieures au 13/06/2026, avant le set-by-set) — même convention que le "repli 4bis" de `useExerciseSetHistory.ts`. Testé explicitement (workouts sans `exercise_sets` du tout, mélange ancien/récent, séance sans aucune donnée exploitable → aucun throw).
  - **Bug de tri découvert et corrigé PENDANT cette session** : `weekKey()` ne zero-paddait pas le numéro de semaine (`"2026-W9"` vs `"2026-W10"`) — un `.sort()` lexical plaçait les semaines à 2 chiffres AVANT les semaines à 1 chiffre, cassant l'ordre chronologique dont dépendent `progressionCyclesCompleted` et la tendance de tonnage récente/ancienne. Passait inaperçu avec un historique court (<10 semaines) mais devenait systématique avec l'historique complet (jusqu'à 500 séances, largement >9 semaines pour un utilisateur actif). Corrigé (zero-pad à 2 chiffres) + test de régression dédié qui échoue sans le correctif (vérifié à la main en désactivant temporairement le fix).
- **`strengthEngine.ts`** : le payload `training_profile` envoyé à `coach-workout` gagne `optimalWeeklyVolume`, `progressionCyclesCompleted`, `overTrainedMuscles`, `neverDoneExercises`, `recentSessions` en plus des champs déjà présents.
- **`coach-workout` edge function** : `parseTrainingProfile()` valide/borne tous les nouveaux champs (muscles contre liste blanche, `pace`/`trend` contre enum, nombres clampés, noms d'exercices des séances récentes et des candidats "jamais pratiqués" assainis comme `activityRaw`). Nouvelles instructions de prompt : reprendre `suggestedWeight`/`suggestedSets` tels quels (jamais de valeur générique quand ils existent), varier la plage de reps/l'ordre des exercices/l'intensité par rapport aux `recentSessions` listées (vraie périodisation plutôt qu'une simple répétition), piocher dans `neverDoneExercises` pour les muscles négligés, ne pas ajouter de volume superflu sur `overTrainedMuscles`.
- **Vérification de non-régression** : `npx tsc --noEmit` 0 erreur, `npm run test` **189/189 verts** (+21 nouveaux tests sur cette suite, dont le fix `weekKey` et les scénarios de compatibilité anciennes données), `npm run build` OK. Nouveau test `MuscleQuestionField.test.ts` (5 tests) pour couvrir le filtrage `neverDoneExercises` par sélection de séance, jusqu'ici non testé. Aucun autre fichier du module Séance modifié (hyroxEngine/courseEngine/cardioEngine/guidedEngine intouchés, `useWorkouts()` intouché dans son comportement pour les 16 autres appelants).
- ⚠️ **Pas de vérification possible contre la vraie base de données prod** dans cette session (MCP Supabase déconnecté) — la compatibilité "anciennes données" repose sur les tests unitaires + la même convention de repli déjà validée en prod par `useExerciseSetHistory.ts`, pas sur un test live.
- **Déploiement** : toujours pas fait depuis cette session (CI `.github/workflows/deploy-functions.yml` se déclenche au push vers `main`) — code prêt et poussé sur la branche, en attente du merge.

## Sensei musculation → vrai moteur d'analyse + fix muscleMapping + profil masqué (2026-07-08 suite, branche `claude/sensei-level-objective-equipment-uh6gpe`)
Suite immédiate de la session précédente (même jour, même branche). Nathan a demandé 3 choses de plus : (1) ne plus AFFICHER le "Profil détecté" (le calcul continue en arrière-plan) ; (2) remplacer le simple choix de catégorie par un vrai moteur d'analyse ; (3) corriger le bug `muscleMapping.ts` identifié (mais pas corrigé) dans la session précédente.

- **`muscleMapping.ts` corrigé** : les patterns restent écrits avec leurs accents (lisibilité du vocabulaire français), mais sont désormais compilés via `stripDiacritics()` (nouvelle fonction, réutilisée aussi pour désaccentuer le nom d'exercice entrant) avant d'être transformés en `RegExp` — les deux côtés de la comparaison sont donc systématiquement désaccentués. Corrige "développé couché", "développé militaire", "soulevé de terre", "élévation latérale/frontale" (jusqu'ici toujours `[]`). `muscleMapping.test.ts` : le test qui codifiait le bug ("retourne [] pour développé couché") est remplacé par des tests positifs (accents) pour les 4 patterns ci-dessus.
- **`senseiAutoProfile.ts` réécrit en profondeur** (même fichier, même exports `inferSenseiAutoProfile`/`SenseiAutoProfile` pour ne pas casser les appelants) : `level`/`goal` restent exposés comme résumé compact, mais l'essentiel est maintenant une vraie structure de profil —
  - `exerciseProgress` : progression **individuelle par exercice** (pas une moyenne globale) — `trend` ("progression"/"stagnation"/"regression"/"nouveau" selon dernière charge vs première charge suivie), `lastWeight`, `personalRecord`, `sessionsTracked`, `muscles` (via `exerciseToMuscles`, désormais fiable). Trié par nombre de séances suivies, borné à 8.
  - `muscleVolume` : volume hebdomadaire moyen (tonnage) par groupe musculaire réel (`MuscleId`), calculé sur les semaines réellement entraînées. `mostTrainedMuscles`/`leastTrainedMuscles` (top/bottom 3, les muscles jamais touchés priment sur les muscles à faible volume dans `leastTrainedMuscles`).
  - `avgSessionDurationMinutes` (moyenne de `workouts.duration_minutes` quand renseigné) et `avgRestSeconds` (moyenne de `exercise_sets.rest_seconds` quand renseigné) — `null` si la donnée n'existe jamais, jamais inventée.
  - Plus de seuil binaire "assez/pas assez de séances" (l'ancien `MIN_SESSIONS = 3` est supprimé) : le profil se construit dès la 1ère séance et se précise progressivement (ex: `exerciseProgress[i].trend` reste "nouveau" tant qu'un exercice n'a qu'une seule séance suivie, pas de tentative de deviner). Seul un historique totalement vide (0 séance muscu, ou 0 série validée) retombe sur un profil vide par défaut (intermédiaire/hypertrophie, tableaux vides).
  - Testé : `senseiAutoProfile.test.ts` réécrit (20 tests) — cas limites, objectif, progression/stagnation/régression/nouveau par exercice, bornage à 8, volume par muscle, durée/repos moyens, niveau.
- **`use-fitness.ts`** : `useWorkouts()` sélectionne désormais aussi `rest_seconds` sur `exercise_sets` (additif, aucun consommateur existant cassé).
- **`src/integrations/supabase/types.ts` corrigé à la main sur le bloc `exercise_sets`** (drift déjà documenté dans ce fichier) : `rpe`/`updated_at` retirés (n'existent pas en prod, vérifié via `execute_sql` sur `information_schema.columns` dans la session précédente), `notes`/`tempo`/`rest_seconds` ajoutés (existent en prod depuis les migrations `20260613172120`/`20260615192004` mais jamais inclus dans les types générés). Sans ce correctif, le `select` incluant `rest_seconds` échouait en typecheck (`SelectQueryError`) dans 4 fichiers consommateurs de `useWorkouts()`/`exercises`.
- **`strengthEngine.ts`** : le payload envoyé à `coach-workout` gagne `training_profile` (sessionsConsidered, weeklyFrequency, avgSessionDurationMinutes, avgRestSeconds, mostTrainedMuscles, leastTrainedMuscles, exerciseProgress) en plus de `level`/`goal` déjà présents. `FALLBACK_AUTO_PROFILE` mis à jour avec les nouveaux champs.
- **`coach-workout` edge function** : nouveau `parseTrainingProfile()` valide/borne intégralement le payload côté serveur (jamais fait confiance tel quel — muscles contre une liste blanche de 14 slugs, trend contre enum, nombres bornés/clampés, noms d'exercices assainis comme `activityRaw` — mêmes règles de sécurité). `buildTrainingProfileBlock()` traduit le profil validé en section de prompt : les noms d'exercices (texte libre utilisateur) sont isolés dans des balises `<historique_exercices>` avec instruction explicite de ne jamais les traiter comme des instructions (même précaution que `<user_activity>` existant). Nouvelles règles de prompt : reprendre la dernière charge connue d'un exercice suivi plutôt que d'en inventer une, ajuster selon la tendance (hausse si progression, stable/variante si stagnation/régression — jamais de hausse aveugle), prioriser un peu plus de volume sur les muscles les moins travaillés, viser la durée moyenne habituelle si aucune contrainte plus forte.
- **`CoachSheet.tsx`** : la ligne "Profil détecté (muscu) : Niveau X · objectif Y" est retirée du panneau de briefing (plus aucun affichage) — `SenseiBriefingPanel` reperd son prop `autoProfile`/`AUTO_LEVEL_LABELS`/`AUTO_GOAL_LABELS`. Le calcul continue néanmoins en arrière-plan à chaque génération, via `buildMuscuSenseiContext` (inchangé dans son principe, seul le call site d'affichage est supprimé).
- **Déploiement de `coach-workout`** : ce repo a une CI dédiée (`.github/workflows/deploy-functions.yml`) qui déploie automatiquement toutes les edge functions (dont `coach-workout`) sur push vers `main` (ou `workflow_dispatch` manuel) via `supabase functions deploy`. Le code de cette session est prêt et commité mais **pas déployé** : le déploiement se fera automatiquement au merge de cette branche vers `main`. Le MCP Supabase était déconnecté pendant cette session (impossible de déployer manuellement même si souhaité).
- Validé : `npx tsc --noEmit` 0 erreur, `eslint --fix` clean sur tous les fichiers touchés (types.ts généré a une dette prettier préexistante non liée à cette session, non traitée — diff massif hors périmètre), `npm run test` 168/168 verts (+15 nouveaux vs la session précédente, 0 régression), `npm run build` OK. Syntaxe de `coach-workout/index.ts` vérifiée via esbuild (pas de tsc/deno check disponible pour `supabase/functions/**`, hors du tsconfig principal). Pas de test navigateur manuel possible dans cette session.

## Sensei musculation → auto-profil (niveau/objectif) + matériel simplifié (2026-07-08, branche `claude/sensei-level-objective-equipment-uh6gpe`)
Demande Nathan : ne plus demander "Niveau" et "Objectif" dans le dialogue Sensei (musculation uniquement — HYROX/Course/Guidé gardent leur propre `levelQuestion` partagée, non touchée) et réduire le choix de matériel à 3 options.
- **Nouveau `src/lib/fitness/engines/senseiAutoProfile.ts`** (domaine pur, testé — `senseiAutoProfile.test.ts`, 8 tests) : `inferSenseiAutoProfile(workouts)` déduit `level` (débutant/intermédiaire/avancé) et `goal` (force/hypertrophie/endurance/perte de poids) à partir de l'historique réel (séries validées uniquement) — charges, séries, reps, volume/séance, volume hebdomadaire agrégé par groupe musculaire (`exerciseToMuscles`), surcharge progressive et records récents par exercice (suivi sur ≥3 séances), fréquence hebdomadaire, tendance de tonnage hebdo. Sous 3 séances musculation exploitables (ou 0 série validée), retombe sur les valeurs par défaut historiques (intermédiaire/hypertrophie) plutôt que deviner sans signal.
  - ⚠️ **RIR volontairement absent du calcul** : la colonne `exercise_sets.rpe` a été supprimée en prod le 02/07/2026 (migration `20260702100030_seances_status_completed_drop_rpe.sql`, décision Nathan "pas de RPE dans l'app", confirmé 0 valeur non nulle). `src/integrations/supabase/types.ts` référence encore `rpe`/`updated_at` sur `exercise_sets` — types generés non resynchronisés avec le schéma prod actuel (vérifié en direct via `execute_sql` sur `information_schema.columns` : colonnes réelles = id, exercise_id, user_id, set_number, reps, weight, notes, created_at, tempo, rest_seconds, completed). À signaler si un jour un vrai audit de types est refait (cf. le drift migrations déjà documenté plus bas).
  - **Bug latent découvert (non corrigé, hors périmètre)** dans `src/lib/fitness/muscleMapping.ts` : plusieurs patterns regex contiennent des caractères accentués (`/développé.?couché/i`, `/développé.?militaire/i`, `/élévation.?latérale/i`, `/soulevé.?de.?terre/i`, etc.) alors que `exerciseToMuscles()` teste ces patterns contre un nom **dé-accentué** (`normalize("NFD").replace(diacritics)`) — ces patterns ne matchent donc jamais. Seuls les synonymes anglais/sans-accent de la même règle (ex: "bench press", "overhead press", "deadlift") fonctionnent. Impact réel : la récupération musculaire et le nouveau volume-par-groupe de `senseiAutoProfile.ts` sous-estiment les muscles sollicités par les exercices nommés en français avec accent dans leur variante muscu principale. À corriger dans une session dédiée si validé par Nathan (retirer les accents des patterns ou dé-accentuer le pattern source avant `.test()`).
- **`strengthEngine.ts`** : `QUESTIONS` perd `levelQuestion` (import retiré, le fragment partagé reste utilisé par hyrox/course/guided) et la question inline `goal` — matériel réduit à 3 options (`maison` / `salle avec poulies` / `salle complète`, emoji dans les labels). `generate()` lit désormais `context.autoProfile.level`/`.goal` (repli défensif `FALLBACK_AUTO_PROFILE` si le contexte manquait) au lieu de `answers.level`/`answers.goal` — payload envoyé à l'edge `coach-workout` inchangé dans sa forme (toujours `level`/`goal`/`equipment` en string).
- **Plomberie du contexte** : `buildMuscuSenseiContext()` (`MuscleQuestionField.tsx`) prend un 3ᵉ paramètre `workouts` et retourne `{ recovery, autoProfile }` au lieu de `{ recovery }` seul. `SenseiRuntimeInputs` (`senseiCustomRenderers.tsx`) gagne un champ additif optionnel `workouts` (l'historique déjà chargé par le briefing Sensei, pas de refetch). `CoachSheet.tsx` passe `workouts: briefingWorkouts` dans `runtimeInputs` et calcule aussi `autoProfile` en direct pour l'affichage (lecture seule) : le panneau "Sensei briefing" (étape choix de discipline) affiche désormais une ligne "Profil détecté (muscu) : Niveau X · objectif Y" quand ≥3 séances sont exploitables — même philosophie Phase 8 que le reste du panneau (informatif, ne pré-remplit jamais rien).
- **`coach-workout` edge function** : `ALLOWED_EQUIPMENT` réduit aux 3 nouvelles valeurs ; nouveau dictionnaire `EQUIPMENT_PROMPT` traduit chaque valeur en description plus riche pour le prompt IA (ex: "salle avec poulies" → "en salle équipée de poulies et machines guidées (type Keep Cool)...") au lieu d'interpoler la valeur brute. **Fichier modifié mais NON déployé** depuis cette session (nécessite un déploiement Supabase explicite, volontairement laissé à Nathan/CI — voir note similaire du 2026-07-05 sur `analyze-exercise`).
- Validé : `npx tsc --noEmit` 0 erreur, `eslint --fix` clean, `npm run test` 153/153 verts (+8 nouveaux, 0 régression), `npm run build` OK. Pas de test navigateur manuel dans cette session (contrainte d'environnement déjà documentée ailleurs dans ce fichier).

## Séances → suppression des traits verticaux entre sections (2026-07-07, branche `claude/sessions-hero-refinement-568s1k`)
Finition UI demandée par Nathan une fois l'architecture Séances validée (aucun moteur/hook/calcul/RPG/composant métier/animation existante/thème touché). Les traits verticaux (`SectionLink`, un `div` `h-6 w-px` en dégradé) entre les sections donnaient l'impression d'une timeline à trous car l'un des deux était rendu conditionnellement (`{data && !isLoading && data.length > 0 && <SectionLink />}`) et aucun autre trait n'existait entre les autres cartes — incohérence visuelle, pas un vrai design.
- **`SeancesTab.tsx`** : les 2 appels `<SectionLink />` (entre "Choisir une épreuve"/"La Forge" et entre le bloc erreur-chargement/"Chroniques complètes") et la fonction `SectionLink` elle-même sont supprimés — plus aucun séparateur vertical dans la page. Le conteneur racine était déjà `flex flex-col gap-5` : sans les traits, l'espacement redevient automatiquement uniforme entre **toutes** les cartes rendues (Citation → Sensei → Choisir une épreuve → La Forge → Chroniques complètes → Scan des Titans), aucun changement de classe nécessaire pour "équilibrer" les marges. Diff purement soustractif (16 lignes retirées, 0 ajoutée).
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean, `npm run test` 145/145 verts (0 régression), `npm run build` OK.

## Séances → passe de finition Hero (2026-07-07, branche `claude/sessions-hero-refinement-568s1k`)
Nouvelle passe UX demandée par Nathan, strictement le Hero (aucun moteur/hook/Supabase/Edge Function/calcul touché) — changement de philosophie : le Hero n'est plus un point d'entrée, juste une respiration visuelle entre la nav et Sensei^IA, qui redevient le vrai point d'entrée de la page.
- **`SeancesHero.tsx` réécrit à l'os** : hauteur réduite d'environ 40% supplémentaires (`min-h-[72px]`→`44px`, `py-3`→`py-2`, `rounded-[22px]`→`rounded-2xl`). Suppression totale de la sensation de carte : filet métallique haut, bordure inset (`boxShadow` ring) et vignette réactive au hover retirés — plus aucun `whileHover`/`whileTap`, la citation flotte sans jamais inviter au tap. **Découplage complet du rang de l'utilisateur** : `RankAggregator`/`topExercises`/`getRankVisual` retirés du composant (n'était utilisé que pour une couleur d'ambiance cosmétique) — remplacés par une ambiance fixe autonome (fond dégradé sombre `#150808→#070303`, un seul halo rouge très léger en respiration extrêmement lente 16s, 4 braises discrètes faites main avec durées 17-23s). `SeancesHero` ne prend donc plus de props ; l'appel dans `SeancesTab.tsx` passe de `<SeancesHero topExercises={topExercises} />` à `<SeancesHero />` (`topExercises` reste utilisé ailleurs dans le fichier, non supprimé).
- **`LaForgeCard.tsx`** : suppression complète de l'icône marteau (`Hammer` de lucide-react, affichée en exposant) — plus aucune icône, comme demandé. La carte n'a désormais plus aucune différence structurelle avec `SenseiIACard.tsx` hormis titre/texte/action.
- Commentaire de section stale corrigé dans `SeancesTab.tsx` (`{/* HERO — LA FORGE */}` → `{/* Hero — respiration d'ambiance */}`, la Forge étant désormais une carte séparée plus bas, ce libellé prêtait à confusion).
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean sur les 3 fichiers touchés, `npm run test` 145/145 verts (0 régression), `npm run build` OK.
- ⚠️ Test navigateur manuel impossible dans cette session (pas d'environnement de preview) — à vérifier par Nathan sur le déploiement Lovable/preview.

## Séances → refonte finale : RPG et Performances retirés, La Forge alignée sur Sensei (2026-07-07, branche `claude/seances-page-redesign-jfi73t`)
Dernière passe UX demandée par Nathan, strictement UI (aucun moteur/hook/Supabase/Edge Function/calcul touché) :
- **`SeancesHero.tsx`** : réduction d'environ 50% supplémentaire par rapport à la session précédente (`min-h-[150px]`→`72px`, `py-8`→`py-3`, `rounded-[28px]`→`[22px]`, texte `19px`→`13px`, `leading-[1.6]`→`1.45`). Particules/braises/halos/centrage intouchés — le Hero n'est plus qu'une ambiance d'introduction, ne rivalise plus visuellement avec Sensei.
- **Progression RPG entièrement retirée de Séances** (doublon avec Profil, refusé explicitement par Nathan) : suppression de la section "Progression RPG" dans `SeancesTab.tsx` (`ProfileRPGData`+`SeancesProgressionCard`+bouton "Voir toutes les maîtrises"). **Fichiers supprimés** : `src/components/fitness/SeancesProgressionCard.tsx` (n'était utilisé que là) et la route `src/routes/_authenticated/maitrises.tsx` (écran "Toutes les maîtrises", seul point d'entrée était ce bouton désormais supprimé — devenu orphelin, donc supprimé plutôt que laissé mort). `ExerciseRankStrip.tsx` conservé : toujours utilisé par `src/routes/_authenticated/progression.tsx` (Profil), son prop `layout="grid"` ajouté pour l'écran maîtrises n'a plus qu'un seul call site (`"carousel"` par défaut, non cassant).
- **Section "Les Performances" entièrement supprimée** (Ardeur/Cycle en cours/Temps forgé — jugée inutile pour préparer une séance) : retrait du bloc dans `SeancesTab.tsx` + suppression du hook `useFitnessStreak` (devenu inutilisé dans ce fichier — toujours utilisé ailleurs, ex. `ActiveWorkoutView`, non touché) + suppression de la fonction locale `PerfTile` et du calcul `weekDurationMinutes` (dead code après coup).
- **`LaForgeCard.tsx` refondue pour partager l'identité visuelle exacte de `SenseiIACard.tsx`** : même matériau (fond radial doré `rgba(234,179,8,…)`, plus l'ancien dégradé ambré/orange propre), même filet lumineux haut, même halo au hover, même structure typographique (titre serif 26px + glyphe en exposant, sous-titre 13px, footer caption uppercase). Seule différence conforme à la demande : le glyphe (icône `Hammer` en exposant à la place de "IA"), le titre ("La Forge") et le contenu (sous-titre + "Toucher pour forger"). Icône-plaque et chevron de l'ancienne version supprimés (n'existaient pas chez Sensei).
- **Hiérarchie finale de `SeancesTab.tsx`** : Hero → Sensei^IA → Choisir une épreuve → La Forge → Chroniques complètes → Scan des Titans. Les titres de section redondants avec le contenu qu'ils enveloppaient ont été retirés : "Le Palmarès" (n'enveloppait plus que "Chroniques complètes" une fois RPG/Performances partis — la fonction `PalmaresSection` est supprimée, plus de wrapper) et "État du corps" (le composant `BodyMap` mode `recovery` affiche déjà son propre titre "Scan des Titans" en interne depuis la session précédente — doublon retiré). La fonction locale `SectionTitle` est donc devenue inutilisée et supprimée.
- Validé : `npx tsc --noEmit` 0 erreur, `eslint --fix` clean sur les 3 fichiers touchés, `npm run test` 145/145 verts (0 régression), `npm run build` OK (régénère `routeTree.gen.ts` sans la route `/maitrises`, purement soustractif).
- ⚠️ **Test navigateur manuel impossible dans cette session** (même contrainte IPv6/`EAFNOSUPPORT` que les sessions précédentes — `npm run dev` reste codé en dur sur `host: "::"` par `@lovable.dev/vite-tanstack-config`) — à vérifier par Nathan sur le déploiement Lovable/preview.

## Séances → Hero réduit + Progression RPG immersive (2026-07-07, branche `claude/seances-ux-refinement-j6xhcp`)
Nouvelle passe de finition UX demandée par Nathan, uniquement UI (aucun moteur/hook/Edge Function/migration/calcul de statistiques touché) :
- **`SeancesHero.tsx`** : la carte-citation ne monopolise plus l'écran — hauteur réduite d'environ 37% (`min-h-[240px]`→`150px`, `py-14`→`py-8`), typographie réduite (`26px`→`19px`, `leading-[1.85]`→`1.6`). Particules/braises/halos/centrage intouchés, la citation reste l'unique contenu.
- **Progression RPG repensée** : l'ancien carousel horizontal `ExerciseRankStrip` en tête de page (swiper des dizaines de cartes, jugé peu motivant) est remplacé par une seule carte immersive **`SeancesProgressionCard.tsx`** (nouveau, `src/components/fitness/`) inspirée de la hiérarchie du Profil mais avec une identité propre à Séances (médaillon `ExerciseRankBadge` en tête plutôt qu'un avatar, cadre unique plutôt qu'un empilement de blocs nus). Affiche : rang actuel + `MasteryBar` animée vers le rang suivant, l'exercice le plus proche du niveau suivant (argmax de `rank.progress` parmi `rankAggregate.reports` hors rangs maximés), la dernière progression importante (PR récent), la prochaine récompense (`achievements.nextObjective`), un conseil personnalisé (`nextRankHint`), puis un bouton **"Voir toutes les maîtrises"**.
- **Écran dédié `/maitrises`** (nouvelle route `src/routes/_authenticated/maitrises.tsx`) : liste TOUTES les techniques pratiquées ≥2 fois en grille (pas de swipe) — réutilise `ExerciseRankStrip` telle quelle avec un nouveau prop `layout?: "carousel" | "grid"` (défaut `"carousel"`, non cassant pour l'usage existant dans `progression.tsx`) et `computeBroadActivity` (déjà existant, utilisé par Profil) appelé avec une limite large (500) au lieu de la limite vitrine (8) — aucun nouveau calcul, juste un paramètre différent au point d'appel. Retour vers `/seances` (pas `/profil`).
- **Réutilisation stricte de l'existant, zéro duplication** : `SeancesTab.tsx` cable `<ProfileRPGData>` (déjà conçu pour être consommé par plusieurs écrans) pour obtenir `rankAggregate`/`achievements` sans reconstruire le câblage `RankAggregator`+`useAchievements`+`useBadgeSystem`. La fonction `useRecentPRs` (dupliquée en interne de `RPGProgressionSection.tsx`) a été extraite en fonction pure **`computeRecentPRs`** dans `src/utils/fitness/exercise-stats.ts` (à côté de `computePRs`), réutilisée par `RPGProgressionSection.tsx` (Profil, comportement strictement inchangé) et `SeancesProgressionCard.tsx` (Séances).
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean sur tous les fichiers touchés (2 erreurs prettier préexistantes dans `exercise-stats.ts` sur des lignes non touchées, confirmées présentes aussi sur `main` avant cette session — non corrigées pour rester dans le périmètre de la demande), `npm run test` 145/145 verts (0 régression), `npm run build` OK (régénère `routeTree.gen.ts` avec la nouvelle route `/maitrises`, purement additif).
- ⚠️ Test navigateur manuel impossible dans cette session (même contrainte IPv6/EAFNOSUPPORT que la session précédente, voir entrée du 2026-07-07 "refonte La Forge" ci-dessous) — à vérifier par Nathan sur le déploiement Lovable/preview.

## Séances → passe de finition finale (2026-07-07, branche `claude/séances-page-polish-l7pl5u`)
Dernière passe UX demandée par Nathan sur le module Séances, architecture déjà validée. Aucun moteur/hook/Supabase/RPG touché.
- **`SeancesHero.tsx`** : contenu réduit à l'os — suppression de l'eyebrow "La Forge" et du bandeau bas "Séances", il ne reste que la citation "Chaque légende est forgée une répétition à la fois.", centrée horizontalement ET verticalement (`flex items-center justify-center`, `min-h-[240px]`, `text-center`), interligne augmenté (`leading-[1.85]`) et padding vertical élargi (`py-14`). Braises/particules/halos (`RankAmbientParticles`, halos respirants) intouchés, restent en pure ambiance.
- **`BodyMap.tsx`** (mode `recovery`, "Scan des Titans") : suppression du sous-texte "basé sur tes séances" — le titre suffit désormais, header simplifié (plus de `justify-between`).
- **Nouveau composant `LaForgeCard.tsx`** : remplace l'ancien bouton minimaliste "Catalogue d'exercices" dans `SeancesTab.tsx`. Même matériau que `SenseiIACard`/`ChoisirEpreuveCard` (fond radial ambré multi-couches, filet lumineux haut, halo qui respire et s'intensifie au toucher, icône `Hammer` sur plaque en relief). Sous-titre : « Choisis les techniques qui forgeront ta prochaine épreuve. » Ouvre toujours le même `ExerciseCatalogSheet` (`setCatalogOpen(true)`), aucune logique changée.
- **Historique unifié** : suppression complète de `WeekSessions`/`WeekSessionDetail` ("Séances de la semaine", devenu redondant avec "Chroniques complètes"). "Chroniques complètes" est désormais la seule source de vérité : vue compacte (carte repliée) affiche les 5 dernières séances (`recentWorkouts = data.slice(0,5)`, nom + jour + bouton "Refaire" réutilisant `repeatLive`), vue détaillée (dépliée) inchangée (graphes `WorkoutProgressCharts` + liste complète `WorkoutCard`/`GenericHistoryCard`). Nettoyage du code mort associé : `workoutMuscleLabels`, imports `formatTonnage`/`workoutTonnage`/`exerciseToMuscles`/`MUSCLE_META`/`adaptWorkoutRow`/`BookOpen` supprimés (plus utilisés).
- Validé : `npx tsc --noEmit` 0 erreur, `eslint` clean sur les fichiers touchés, `npm run test` 145/145 verts (0 régression), `npm run build` OK.

## Séances → refonte "La Forge" (2026-07-07, branche `claude/séances-reliquary-redesign-15ojom`)
Passe UX/UI pure demandée par Nathan : le module Séances devient un vrai lieu de l'univers Reliquary. Aucun moteur, hook, Supabase ni logique métier touché — uniquement composants React/styles/hiérarchie. Une session précédente avait déjà posé les fondations (`SeancesHero`="La Forge", `SenseiIACard`, `ChoisirEpreuveCard`, palette `rankVisuals.ts`/`RankAmbientParticles`) ; cette passe termine le chantier :
- **`seances.tsx`** (route) : suppression de l'eyebrow "Module" + du `<h1>Séances</h1>` dans le contenu (le Hero "La Forge" est désormais la seule identité visible ; l'onglet de nav garde son nom "Séances", le `<title>` de page aussi — non touchés).
- **`SeancesHero.tsx`** : la Forge devient un lieu vivant plutôt qu'un simple bandeau — 2 couches de particules (proche net + lointaine floutée `blur-[1px] scale-110`, réutilise `RankAmbientParticles` avec un `seed` différent), halo "cœur du brasier" et halo lointain en respiration continue (`framer-motion animate` loop infini), vignette qui s'illumine au survol/tap (`whileHover`/`whileTap` + `group-hover`). Aucun `onClick` ajouté — explicitement pas un bouton, juste une ambiance réactive au toucher.
- **Hiérarchie réordonnée** dans `SeancesTab.tsx` : La Forge → Sensei IA → Choisir une épreuve → **Progression RPG** (remontée, ex-embarquée en bas dans "Performances") → Catalogue d'exercices (redevient outil secondaire) → Le Palmarès → État du corps → Les Performances. Nouveau composant `SectionLink` (petit trait vertical dégradé) entre les grandes zones pour suggérer un même lieu traversé plutôt que des cartes indépendantes.
- **`ExerciseRankStrip.tsx`** : header interne dupliqué ("Progression RPG" + sous-titre) supprimé — la page fournit désormais le `SectionTitle` externe. Conteneur reskinné en carte glass Reliquary (`bg-gradient-to-b from-white/[0.04] to-white/[0.01]`, `rounded-3xl`, `backdrop-blur-xl`) au lieu du style `bg-card` générique. Toujours utilisé uniquement dans `SeancesTab.tsx`.
- **Nouveaux composants génériques réutilisables** : `SectionReveal.tsx` (fondu + légère élévation au scroll via `whileInView`, `once:true`, perf-safe) et `AnimatedNumber.tsx` (compteur animé via `useMotionValue`+`animate`+`useMotionValueEvent` de framer-motion — pattern officiel pour animer du texte, pas de nouvelle dépendance). Appliqués aux sections Progression RPG/Catalogue/Palmarès/État du corps/Performances et aux 3 tuiles de `PerfTile`.
- **`PerfTile`** (dans `SeancesTab.tsx`) : accepte désormais `value: number` (+`decimals`/`suffix`) au lieu d'une string pré-formatée, affichage via `AnimatedNumber`. Reskin "plaque" (badge icône circulaire avec halo radial de la couleur d'accent). Libellés reflavorés vocabulaire Reliquary sans changer la donnée : "Série"→**"Ardeur"**, "Cette semaine"→**"Cycle en cours"**, "Durée 7j"→**"Temps forgé"** (sous-titres inchangés, restent compréhensibles).
- **`BodyMap.tsx`** — **uniquement le mode `"recovery"`** (seul mode utilisé par Séances ; le mode `"measurement"` de `CorpsTab` est intouché, `ModelViews` reçoit juste 3 nouveaux props optionnels à défauts identiques à l'existant → zéro régression Corps) :
  - `ModelViews` gagne `bodyColor`, `maxWidthPx` (défaut 400, inchangé pour Measurement), `labelClassName`.
  - `RecoveryBodyMap` reskinné en "scanner divin" : fond dégradé profond cyan/violet, trame grille fine façon scanner, balayage lumineux animé (`motion.div` translateY en boucle), 4 réticules d'angle décoratifs, titre renommé "Scan des Titans" (mystique, la donnée/légende reste identique). Hauteur réduite (~30%) via `maxWidthPx={290}` (vs 400) + paddings/marges resserrés (`p-4→p-3`, `mt-4→mt-2`, `gap-y-1.5→gap-y-1`) — conserve toutes les infos (2 vues + légende complète), plus de scroll.
  - Dans `SeancesTab.tsx`, le wrapper `<div className="p-2 rounded-3xl border...">` autour de `<BodyMap>` a été supprimé (double-boîtage avec la carte que `RecoveryBodyMap` dessine déjà elle-même) — gain de hauteur supplémentaire.
- Validé : `npx tsc --noEmit` 0 erreur, `npm run build` OK, `npm run test` 145/145 verts (0 régression), `eslint --fix` clean sur tous les fichiers touchés.
- ⚠️ **Test navigateur manuel impossible dans cette session** : le serveur dev (`npm run dev`) est codé en dur sur `host: "::", port: 8080, strictPort: true` par `@lovable.dev/vite-tanstack-config` (pensé pour le sandbox Lovable qui supporte IPv6) — l'environnement d'exécution Claude Code Remote de cette session ne supporte pas le bind IPv6 (`EAFNOSUPPORT`). Aucun `.env` avec credentials Supabase réels non plus. À vérifier par Nathan sur le déploiement Lovable/preview.

## Refonte finale Profil → hub RPG (2026-07-06, branche `claude/profile-redesign-hub-85vgk2`)
Dernière passe demandée par Nathan : le Profil devient un vrai hub personnage qui renvoie vers ses modules au lieu de les copier en place. Aucun moteur (Rang/Maîtrise, Badges, Succès), hook métier, Supabase ni Edge Function touché — uniquement architecture/composants/navigation React.
- **`ProfileHeroCard.tsx`** : le rang global (`rankAggregate.best`) n'apparaît plus qu'à UN seul endroit (sous-titre sous le pseudo) — suppression de la pastille "Rang global" dupliquée et du bloc "Niveau X / XP" (`useUserStats`, système de niveau compte séparé de la Maîtrise par exercice, source de la confusion "le niveau apparaît deux fois"). `MasteryBar` gagne une prop `showLabel` (défaut `true`, non cassant) pour masquer la pastille de pourcentage flottante dans le Hero ("suppression définitive du 0%"). La ligne de stats devient une `grid-cols-3` fixe (série/séances/succès débloqués) — plus de scroll horizontal, plus de statistique coupée.
- **Nouveau concept "Classe principale"** : `src/lib/profile/characterClass.ts` (pur) agrège le volume déjà loggé par `ExerciseFamily` (réutilise `classifyExerciseFamily()` du moteur Rang existant, aucune nouvelle règle) et mappe la famille dominante vers un nom RPG (`CHARACTER_CLASS_LABELS` : Maître des Tirages/Poussées/Fondations/Hanches/Préhension/Polyvalent — `developpe_couche`+`developpe_militaire` fusionnés sous "Poussées"). `src/components/profile/ClassCard.tsx` : carte épurée (icône + nom, rien d'autre) → tap ouvre un `AppSheet` expliquant pourquoi (part de volume, exercice principal, meilleur rang dans la famille) et comment évoluer, à partir des données déjà calculées.
- **Progression RPG trimmée** (`RPGProgressionSection.tsx`) : ne montre plus QUE 5 informations (progression globale vers le prochain rang, prochain rang, prochaine récompense, progression récente, conseil = `nextRankHint` relabellisé) — suppression du gros badge "Meilleur rang obtenu" (doublon avec le Hero), des stat chips "Rang global"/"Exercice principal"/"Catégorie dominante", de `ExerciseRankStrip` et des embeds `TrophyRoom`/`QuestsPanel` (déplacés).
- **Salle des trophées et Quêtes** : ne sont plus embarquées en entier dans Profil. Nouveaux aperçus compacts `TrophyRoomPreview.tsx` (total/%, répartition par rareté, 2-3 succès proches, 1 secret) et `QuestsPreview.tsx` (quête principale, défi du jour) sur le Profil, avec lien "Voir tout" vers deux nouvelles routes dédiées `/trophees` (héberge `<TrophyRoom>` complet inchangé) et `/quetes` (héberge `<GoalsManager>` complet inchangé). Nouvelle route `/progression` héberge le détail complet (stat chips avancées + `ExerciseRankStrip`) retiré du hub.
- **Déduplication** : `src/lib/profile/achievements/collection.ts` (nouveau, pur) extrait la fusion succès+badges historiques (`buildAchievementCollection`) hors de `TrophyRoom.tsx` — réutilisée par `TrophyRoomPreview` et le Hero (compteur "succès débloqués"). `src/components/profile/rpg/ProfileRPGData.tsx` (nouveau) extrait tout le câblage `useWorkouts→computePRs→useBadgeSystem→RankAggregator→useAchievements` (ex-`ProfilPage`/`ProfilRPGBlock`) en composant render-prop réutilisé par le hub Profil, `/progression` et `/trophees` — plus de triple câblage dupliqué. `src/components/profile/achievementIcons.ts` centralise la table icône lucide (ex-`ICON_MAP` dupliquée).
- **Documents** : `DocumentsSummaryCard.tsx` gagne un bouton "Importer" distinct de "Voir tous", qui navigue vers `/documents?upload=1` ; `documents.tsx` gagne un `validateSearch` zod (`{ upload?: boolean }`) qui pré-ouvre le `Sheet` d'upload existant — aucune duplication de l'UI d'upload.
- Validé : `npm run build` OK, `tsc --noEmit` 0 erreur, `npm run test` 66/66 verts (0 régression), `eslint` clean sur tous les fichiers touchés.
- `package-lock.json` : `html-to-image` manquait du lockfile (déjà dans `package.json`) — resynchronisé au passage via `npm install`, sans lien avec cette feature.

## Audit des branches + moteur Rang/Maîtrise + fusion analyse (2026-07-05, session Claude Cowork)
- **Audit complet des branches `claude/*`** : 7 branches confirmées fusionnées/supersedées (contenu déjà présent dans `main`, vérifié fichier par fichier, pas juste par historique Git — plusieurs avaient un historique disjoint suite à des pushs GitHub web antérieurs) → suppression **demandée à l'utilisateur** (le token de cette session n'a pas les droits de suppression de branche distante, `git push --delete` → 403). `claude/rls-regression-fix-j7iksz` (fix CI bun.lock/validate-supabase.mjs) reste **non fusionnée, à traiter séparément**. `claude/daily-reminder-migration-xDd8V` gardée temporairement : contient une feature "suppléments comme rappels" jamais retrouvée dans `main`, à décider si on la recrée proprement (branche elle-même trop divergente pour un merge direct).
- **Nouveau moteur de Rang/Maîtrise** — remplace intégralement l'ancien système d'XP cumulative (`lib/fitness/exerciseXp.ts`, **supprimé**) par `src/lib/fitness/rank/` (`types.ts`, `config.ts`, `familyClassification.ts`, `engine.ts`, `engine.test.ts`) :
  - **Rang** = niveau réel actuel (force relative 1RM estimé/poids de corps par famille d'exercice, + modificateurs volume/qualité de reps bornés), calculable dès la 1ère séance pour Mortel→Titan.
  - **Maîtrise** (0-100%, remplace le terme "XP" dans toute l'UI) = consolidation + progression vers le rang suivant (surcharge, reps, tonnage, fréquence, régularité, PR récents, expérience).
  - **Olympien et Primordial exigent une confirmation dans la durée** (`ConfirmationGate` en cascade, Primordial le plus strict : 5 séances qualifiantes étalées sur ≥60j + 15 séances d'expérience minimum ; Olympien : 3 séances/≥30j/10 séances). En dessous, une seule séance suffit. Aucune comparaison inter-utilisateurs (rejetée explicitement par Nathan).
  - Décroissance d'inactivité bornée à **1 seul palier maximum**, jamais plus, quelle que soit la durée d'arrêt (bug de cumul avec la confirmation trouvé et corrigé pendant la simulation — la confirmation ne doit regarder que les séances récentes par **nombre**, jamais re-filtrer par date par rapport à `now`, sinon elle se recombine avec la décroissance et fait chuter de plusieurs paliers).
  - Entièrement configurable (`DEFAULT_RANK_ENGINE_CONFIG`) : aucune pondération/seuil codé en dur dans `engine.ts`. Barèmes par famille (squat/presse-jambes, deadlift/tirage-hanche, développé couché, développé militaire, tirage/traction dos, isolation, poids de corps) proposés et validés par simulation sur 9 profils représentatifs avant intégration — pas de tables de force externes publiées utilisées telles quelles, seuils construits et testés dans `engine.test.ts`.
  - Branché dans `useExerciseProgression.ts` (retravaillé : lit aussi `body_tracking.weight` via `useBodyMeasurements`, poids de corps par défaut 75kg si non renseigné + avertissement UI). `ExerciseRankCard.tsx` affiche désormais "Maîtrise" (plus "XP"), un message unique vers le rang suivant (plus de liste d'objectifs, plus de statut "en cours de confirmation" visible).
  - `exerciseRanks.ts` : `xpForTier`/`rankFromXp` supprimés (dead code après le remplacement) ; `RANK_TIERS`/`exerciseDifficulty`/`DIFFICULTY_RULES` conservés (toujours utilisés par `lib/fitness/analysis/`).
- **Fusion de `claude/exercise-analysis-engine-2p9viu` dans cette branche** (cherry-pick propre, base identique à `main` au moment du merge, zéro conflit) : `ExerciseAnalysisSheet.tsx` remplace **partout** `ExerciseStatsSheet.tsx` (désormais supprimé) — `ActiveWorkoutView.tsx`, `WorkoutCard.tsx` **et** `ExerciseRankStrip.tsx` (ce 3ᵉ point d'usage n'était pas couvert par la branche d'origine, corrigé ici). Voir la section "Moteur d'analyse par exercice" ci-dessous pour le détail de cette feature — son texte y est conservé tel quel mais la mention "XP" au sujet d'`ExerciseRankCard` y est obsolète, remplacée par la Maîtrise décrite ci-dessus.
- Validé par `tsc --noEmit` (0 erreur), `npm run test` (66 tests verts dont les 25 de `lib/fitness/analysis`), `npm run build` (build prod OK). Pas de test manuel navigateur possible dans cette session (pas d'accès à un compte Supabase réel) — à vérifier par Nathan sur le déploiement Lovable.
- Déploiement edge `analyze-exercise` **non fait** depuis cette session (nécessite MCP Supabase avec droits déploiement) — le fichier repo est prêt mais pas encore poussé en prod.

## Moteur d'analyse par exercice (2026-07-05) — NOUVELLE FEATURE
Transforme chaque exercice de l'historique en fiche d'analyse intelligente. Décisions actées avec Nathan : (1) IA rédactionnelle **hybride à la demande** — moteur déterministe par défaut + bouton « Analyse IA approfondie » optionnel ; (2) objectif utilisateur **inféré + réglage explicite optionnel** ; (3) **fiche unifiée remplaçante** ; (4) livraison en une passe.

### Domaine pur — `src/lib/fitness/analysis/` (zéro React, testé)
- `types.ts` — types + labels (TrainingObjective, MuscleRole, PhysicalTrait, ExerciseAnalysis, etc.).
- `muscleRoles.ts` — `resolveMuscleRoles()` : décompose un exercice en principal/secondaire/stabilisateur. Repli 1 = `exerciseToMuscles` (mapping plat existant), repli 2 = muscles résolus par l'IA (`muscle_groups`), repli 3 = **modèle biomécanique générique** (jamais vide, `isGeneric:true`).
- `physicalImpact.ts` — vecteur largeur/épaisseur/force/hypertrophie/explosivité/stabilité/posture/mobilité, pondéré par mouvement + plage de reps réelle + objectif.
- `profile.ts` — `inferObjective()`/`buildProfileContext()` : priorité objectif explicite > signaux Corps (body_fat/muscle_mass trend) + goals > plage de reps. Utilise `body_tracking`.
- `comparison.ts` — évolution charge/reps/volume/1RM dernière séance vs précédente + PR + état (progression/stagnation/régression/nouveau) + explication. Réutilise `sets.ts`.
- `recommendations.ts` — moteur de recommandations (charge/reps/série/amplitude/excentrique/technique/fréquence/récup) selon état + reps + récup + objectif.
- `imbalance.ts` — déséquilibres déduits de la **recovery map** (aucune requête sup.) : push/pull, haut/bas, muscle négligé, récup incomplète, progression insuffisante.
- `relevance.ts` — score ★1-5 + label (essentiel/recommandé/secondaire/peu pertinent) + raisons, selon profil+objectif.
- `narrative.ts` — textes déterministes (analyse rédigée + résumé intelligent), repli par défaut instantané/offline.
- `engine.ts` — `analyzeExercise(input)` agrège tout. `index.ts` = façade publique.
- `engine.test.ts` — 25 tests (vitest). ⚠️ vitest non installable ici (registre privé Lovable `europe-west4-npm.pkg.dev` bloqué 403 par la policy réseau) → tests lancés avec un vitest isolé depuis registry.npmjs.org : **55/55 verts**. tsc du moteur pur : clean.

### Hooks — `src/hooks/`
- `useExerciseAnalysis.ts` — assemble les entrées depuis les caches existants (`useExerciseSetHistory`, `useWorkouts`→`useRecoveryMap`, `useBodyMeasurements`, `useGoals`, `useTrainingObjective`), mémoïse `analyzeExercise`. **Zéro requête supplémentaire.**
- `useDeepExerciseAI.ts` — IA à la demande via `useQuery` `enabled:false` + `refetch()`, cache `staleTime:Infinity` (pas de re-appel en rouvrant la fiche). Appelle l'edge `analyze-exercise`.
- `useTrainingObjective.ts` — objectif explicite stocké dans `user_preferences.ai_preferences` (JSON, **aucune migration** — choix délibéré vu le drift migrations documenté).

### UI — `src/components/fitness/ExerciseAnalysisSheet.tsx`
Fiche unifiée (drop-in, mêmes props qu'`ExerciseStatsSheet`) : résumé intelligent + pertinence ★, `ExerciseRankCard` (rang RPG/XP/progression réutilisé tel quel), analyse rédigée + bouton IA + sélecteur d'objectif, graphes poids/volume/1RM (repris d'ExerciseStatsSheet), comparaison, muscles par rôle (barre sollicitation + pastille récup), impact physique, recommandations, déséquilibres, détail des séries. **Branchée** dans `WorkoutCard.tsx` et `ActiveWorkoutView.tsx` (imports repointés). `ExerciseStatsSheet.tsx` conservé mais **superseded** (plus référencé en render — supprimable plus tard sur validation).

### Edge — `supabase/functions/analyze-exercise/`
Gemini 2.5 Flash, prose FR 4-6 phrases, CORS/auth/rate-limit (`analyze_exercise`, 20/h). Retourne `{ text }`. Nécessite le secret `GEMINI_API_KEY` (déjà présent). Le bouton se dégrade proprement si l'edge est indisponible (texte déterministe conservé).
- **Fichier auto-contenu (choix délibéré, source de vérité = repo)** : contrairement aux fonctions sœurs qui importent `../_shared/rate-limit.ts`, `analyze-exercise/index.ts` **inline** le rate-limit. Raison : le bundler du déploiement MCP place l'entrypoint sous `source/` et ne peut pas résoudre un import remontant `../_shared`. En gardant la logique inline, le fichier du **dépôt peut être déployé BYTE-POUR-BYTE identique** → aucune divergence repo/prod possible (demande explicite de Nathan, 2026-07-05). Le NB en tête du fichier documente ce choix.
- État déploiement : projet `bcwfvpwxzlmkxobvbtzp`, **v2 ACTIVE**, verify_jwt. `index.ts` déployé = **byte-pour-byte identique** au fichier du dépôt (vérifié via `get_edge_function` ; sha256 repo = `2c49495c…`, 7352 o). deno.json déployé = import map minimal (`@supabase/supabase-js@2.49.4`) équivalent au `functions/deno.json` partagé du repo (les compilerOptions y sont des hints de types locaux, sans effet runtime).
- ⚠️ Piège MCP rencontré : un redéploiement échoue avec `import map path does not exist … source/file:///…` si on ne passe pas `import_map_path` explicitement — **toujours fournir `import_map_path: "deno.json"`** lors d'un redéploiement de fonction existante via MCP. MCP aussi instable par moments (déconnexions).

## Nettoyage complet du code mort (2026-07-05)
- Rapport détaillé : `CLEANUP_AUDIT_REPORT.md` (racine du repo).
- Frontend : `src/ui/` supprimé, `src/lib/fitness/index.ts` (façade jamais utilisée) supprimé, `src/components/recipe/` entier supprimé (feature création de recette jamais construite — seule la lecture `useRecipes`/`useRecipe` survit), 30 composants shadcn/ui inutilisés supprimés, `RestTimer.tsx` (remplacé par `RestTimerBar.tsx`+`useRestTimer`), `BodyHighlighterRenderer.tsx` (remplacé par `MuscleMap.tsx`), `HomeDashboard.tsx`, `ReportSummaryWidget.tsx`, `useNutritionCalculator.ts`, `useProgress.ts`, `use-mobile.tsx`, `motion.ts`, `hashing.ts`, `SwipeableExerciseRow.tsx`, `recipeTypes.ts` + son test, `auth-middleware.ts`, `client.server.ts`.
- npm : 31 dépendances + 1 devDependency supprimées (radix-ui inutilisés, dnd-kit, cmdk, embla-carousel-react, react-hook-form, react-day-picker, input-otp, vaul, react-resizable-panels, @testing-library/react). `vitest` monté en v4 (faille critique corrigée, tests toujours verts). 0 vulnérabilité npm restante.
- ⚠️ **Rappel projet** : `dossiers, contrats, taches, taches_recurrentes, dossier_documents, cp_*, dsn, echeances, affiliations_mutuelle, historique_imports, imports, regles_analyse, arrets_maladie, ca_praticiens, controle_lignes, silae_sync_logs, stc, profiles, app_settings, activity_log` appartiennent au projet **Contrôle de Paie séparé** qui partage cette base — ne jamais les toucher depuis une session cortex-home-ai. `activity_log` en particulier alimentée par des triggers sur les tables paie (182 lignes), découvert pendant cet audit.
- DB : 6 tables mortes supprimées (migration `20260705120933_drop_orphaned_unused_tables`) : `training_programs`, `program_weeks`, `program_sessions`, `program_exercises` (ancienne feature "Coach IA V2 Programs", hooks déjà absents du repo), `stock_history` (feature Stocks/Maison, `use-stocks.ts` absent), `food_search_history` (jamais lue, index déjà signalé unused). Types Supabase régénérés.
- Conservé par précaution (voir rapport pour détails) : `home_subcategories` (54 lignes, écrite par un trigger mais jamais lue — à trancher côté produit), `data_backups`/`compute_fitness_stats`/`rls_auto_enable`/`cleanup_old_pdfs`/`cleanup_expired_cache`/`ensure_home_categories_for_me` (fonctions sans appelant trouvé mais profil admin/cron/sécurité, pas assez de certitude pour supprimer), 5 Edge Functions sans appel frontend mais conçues pour déclenchement externe (cron/webhook), `@cloudflare/vite-plugin`/`@tanstack/router-plugin` (liés au build Cloudflare Workers, non testables ici).
- **Bug `PROFILE_BASE_QK` confirmé et corrigé (même jour)** : `signOut()` (`use-auth.tsx`) ne vidait aucun cache react-query → fuite de données entre comptes si changement de compte sans rechargement complet. Fix : `queryClient.clear()` dans `signOut()`. `PROFILE_BASE_QK` reste utilisé en interne (clé de repli) mais n'est plus exporté.

## Audit + reconstruction complète des migrations (2026-07-05)
- Rapport détaillé : `MIGRATION_AUDIT_REPORT.md` (racine du repo).
- `supabase/migrations/` passe de 82 à **141 fichiers** : 58 migrations manquantes reconstruites verbatim depuis `supabase_migrations.schema_migrations.statements` (le SQL exact exécuté en prod, pas une approximation), 2 fichiers renommés à leur vrai timestamp prod, 1 snapshot non-historique ajouté pour 3 tables (`activity_log`, `dossier_documents`, `taches_recurrentes`) dont l'origine est introuvable.
- **120/120 migrations prod désormais présentes dans le repo avec version+nom identiques.** Aucune modification du schéma de production.
- ⚠️ Restent non résolus (voir rapport §6) : 20 migrations locales jamais trackées en prod (au moins 5 confirmées jamais appliquées : `calendar_tokens`, `daily_activity`, `compute_level_from_xp`, `award_xp_on_goal_complete`, `award_time_of_day_badges`) ; anomalie `reminders` (dropped par une migration non trackée le 19 juin mais toujours vivante avec son schéma enrichi — origine de la recréation introuvable) ; rejeu complet des 141 migrations jamais testé (pas de Docker/Supabase CLI disponibles dans cette session).

## ⚠️ IMPORTANT — Origine des IDs "SUP-XXXX-XXXX"
Ces IDs ne viennent PAS de Supabase (dashboard/support) : ils sont générés par notre propre logger client `src/lib/error-logger.ts` (`generateSupportId()`) et stockés dans la table `public.error_logs` (colonne `support_id`). Pour investiguer un "SUP-...", toujours commencer par :
```sql
select * from public.error_logs where support_id = 'SUP-...';
```
Ne PAS supposer que c'est lié à un log Postgres/Storage/Edge Function juste parce que le timing coïncide (erreur commise le 2026-07-05, corrigée ensuite).

## Fix CI storage bucket pdfs (2026-07-05, sans rapport avec les IDs SUP-)
- `.github/workflows/migrate.yml` step "Ensure storage bucket pdfs" faisait un `POST /storage/v1/bucket` à chaque run CI touchant `supabase/migrations/**`, même bucket déjà existant → `ERROR: duplicate key value violates unique constraint "buckets_pkey"` côté Postgres (bruit, sans impact utilisateur).
- Fix : `GET /storage/v1/bucket/pdfs` préalable, POST seulement si absent.

## Fix bruit hydratation React sur "/" (2026-07-05) — cause réelle des SUP-MR7LCKN4-61KC, SUP-MR7LYHIW-87MD, SUP-MR7MJHXQ-3OJ5 et consorts
- Route `/` = `src/routes/_authenticated/index.tsx`, sous `_authenticated.tsx` qui a `ssr: false` (décision actée juin 12, chantier persistance de session). Le root `__root.tsx` enrobe `<Outlet/>` dans un `<Suspense fallback={<LoadingScreen/>}>`.
- Conséquence connue et non-fatale de `ssr:false` + Suspense root : React jette parfois en prod "Minified React error #418" (mismatch hydratation) ou "#422" (Suspense boundary hydration → bascule client-side). React se rétablit tout seul en re-rendant côté client ; aucune casse fonctionnelle observée.
- `error-logger.ts` avait déjà un filtre `/hydrat/i` avec le commentaire "hydration mismatch warnings" — mais il ne matchait jamais le texte minifié de prod (`"Minified React error #418..."` ne contient pas "hydrat"). Résultat : ces erreurs bénignes généraient un `support_id`, un toast "Une erreur s'est produite" visible utilisateur, et une ligne `error_logs` à chaque occurrence (plusieurs fois par jour depuis au moins le 16 juin).
- Fix : ajout d'un pattern `/react\.dev\/errors\/4(18|19|21|22|23|25)\b/` dans `NOISE_PATTERNS` (tous les codes d'erreur React liés à l'hydratation/Suspense). Complète l'intention déjà présente du filtre `/hydrat/i`, ne change rien au comportement fonctionnel.
- Si ce bruit doit un jour être éliminé à la racine (pas juste filtré), regarder l'interaction `ssr:false` sur `_authenticated` + `<Suspense>` racine dans `__root.tsx`.

## Fix race condition exercise_sets (2026-07-05) — cause de SUP-MR1OQX7K-Y8B5, SUP-MR4KR2Y8-WMLB (duplicate key exercise_sets_exercise_id_set_number_key, /seances)
- `ActiveExerciseCard.tsx` : les boutons « Ajouter une série » et « Reprendre les charges précédentes » n'étaient gardés que par `addSet.isPending`/`updateSet.isPending`. Or `handleRestoreLastSession` boucle sur plusieurs `await addSet.mutateAsync(...)` séquentiels : `isPending` retombe à `false` entre deux itérations, ré-activant brièvement les deux boutons. Un clic pendant cette fenêtre calculait `nextNumber` depuis un `sortedSets` pas encore à jour → même `set_number` que celui en cours de création par la boucle → violation UNIQUE.
- Fix : état local `isBusy` qui couvre toute la durée de l'opération (boucle de restauration incluse), remplace les deux `disabled=` séparés.
- Défense en profondeur : `useAddExerciseSet` (`use-fitness.ts`) retry maintenant une fois sur conflit Postgres `23505` en relisant le `max(set_number)` serveur, au lieu de laisser échouer l'ajout de série (couvre aussi le cas multi-onglets/multi-appareils).

## Deux bugs déjà corrigés en direct sur la BDD prod, jamais commités en migration (2026-07-05)
- `SUP-MQZAWMJ6-3VU7` (StorageApiError "new row violates row-level security policy", /seances, 29 juin) : upload photo exercice sur chemin `user-exercise/<user_id>/...` — l'ancienne policy générique checkait `(storage.foldername(name))[1] = auth.uid()` (attendu pour un chemin plat `<user_id>/fichier`), donc toujours fausse pour ce chemin imbriqué. Une policy dédiée `exercise-images user subfolder {upload,select,delete}` (`[2] = auth.uid()`) existe **déjà en prod** et couvre le cas (RLS = OR des policies) → plus d'occurrence depuis. Migration jamais retrouvée dans le repo.
- `nutrition_meal_check` (2 occurrences, 16 juin, /fitness) : le slug `"petit-dej"` utilisé partout dans l'app (`lib/nutrition/meals.ts`) violait la contrainte CHECK de `public.nutrition.meal` qui n'acceptait que `'petit-dejeuner'`. **Déjà corrigé en prod** (`ALTER ... CHECK (meal = ANY (ARRAY['petit-dej','petit-dejeuner',...]))`) — confirmé par 34 lignes `meal='petit-dej'` en base et aucune récidive depuis. Le repo contient bien une entrée `20260616143452_fix_nutrition_meal_check_petit_dej` dans l'historique **remote** des migrations (`list_migrations`), mais **aucun fichier .sql correspondant n'existe dans `supabase/migrations/`**.

## ⚠️ DRIFT MAJEUR migrations repo vs prod (découvert 2026-07-05)
- `list_migrations` (MCP Supabase) recense **120 migrations appliquées** sur le projet `bcwfvpwxzlmkxobvbtzp`. Le dossier `supabase/migrations/` du repo n'en contient que **82**. **58 migrations existent en prod sans fichier .sql correspondant dans GitHub** (dont les deux ci-dessus), notamment tout un bloc juin 21 → juillet 3 (RLS/perf hardening, exercise_sets, coach IA v2, nutrition v2, catalogue foods, saved_meals, weekly_reports, backups...).
- Conséquence : rejouer les migrations du repo sur une base fraîche (nouvelle branche Supabase, restauration, onboarding dev) **ne reproduirait pas l'état réel de prod** et réintroduirait des bugs déjà corrigés (ex. les deux ci-dessus).
- Pas traité dans cette session (hors périmètre de la demande initiale) — nécessite un audit dédié : `supabase db diff` / comparaison migration par migration pour reconstituer les .sql manquants avant de les committer.

## ⚠️ Règle : mettre ce fichier à jour à la fin de chaque session
Toujours mettre à jour ce fichier avec les nouveaux composants, hooks, migrations, features découverts.

## Mise à jour du jour (2026-06-28) — Différentiateurs + Refactor God Hook

### Différentiateurs Séances
- `WorkoutTimer.tsx` (NOUVEAU) : composant isolé avec son propre `setInterval`. Seul lui re-render chaque seconde, plus l'arbre entier de `ActiveWorkoutView` (perf 🔴 corrigé).
- `ActiveWorkoutView.tsx` : streak badge 🔥 dans le header via `useFitnessStreak`. Prop `recoveryMap` ajoutée et passée à chaque `ActiveExerciseCard`.
- `ActiveExerciseCard.tsx` : badges ⚠ "muscle fatigué" (status="fatigued" via recoveryMap + `exerciseToMuscles`). Chip "Suggéré : X kg × N reps · RPE 7" via `recommendLoad()` (Epley inverse modulé récupération).
- `SeancesTab.tsx` : `recoveryMap` transmis à `ActiveWorkoutView`.

### Refactor God Hook use-fitness.ts (🔴 corrigé)
- `hooks/useNutritionGoals.ts` (NOUVEAU) : `NutritionGoals` type + 2 hooks
- `hooks/useBodyTracking.ts` (NOUVEAU) : 3 hooks body tracking
- `hooks/useNutritionData.ts` (NOUVEAU) : 6 hooks nutrition journalière
- `use-fitness.ts` : re-exports rétro-compat, réduit ~1013 → ~650 lignes, zéro import cassé

## Mise à jour du jour (2026-06-28) — 10 quick wins Séances
- `src/lib/fitness/config.ts` : **nouveau fichier**, constante `GYMS` partagée (`["Keep Cool", "On Air"]`). Import dans StartWorkoutSheet + WorkoutSheet.
- `seances.tsx` (route) : suppression du doublon bouton Coach IA + `ProgramSheet` (le Coach IA est déjà dans `SeancesTab.tsx`).
- `StartWorkoutSheet.tsx` : nom de séance auto-rempli (`getDefaultName()` → "Séance du Lundi soir"). Import GYMS depuis config.
- `WorkoutSheet.tsx` : suppression du `RestTimer` (inutile dans le flux rétroactif). Import GYMS depuis config. Suppression `restTimerOpen` state et import `Timer`.
- `ActiveExerciseCard.tsx` : haptic feedback `navigator.vibrate(50)` à la validation de série. Placeholder numériques remplis avec valeurs réelles (plus de "—" incompatible avec type=number). Zone de tap Trash élargie `w-5 → w-11`.
- `ActiveWorkoutView.tsx` : chronomètre séance `text-sm → text-2xl font-bold`. "Salle inconnue" cachée en UI.

## Mise à jour précédente (2026-06-25)
- SéancesTab : bloc "Séances de la semaine" rendu repliable (comme l'Historique complet), avec le bouton "Détails" conservé et le chevron d'expansion.
- CorpsTab : suppression totale de la carte IMC, du calcul BMI et des imports liés (`Scale`, `useUserPreferences`, `height_cm`).
- BDD : migration ajoutant la colonne `completed` sur `exercise_sets` pour la validation set-by-set.
- Hook `use-fitness.ts` : cast temporaire `as any` sur le payload de `useUpdateExerciseSet` le temps de régénérer les types Supabase.
- Build production OK.

---

## Ce que fait cette app
App **ICORTEX** (nom officiel dans les titres de pages) : assistant personnel multi-domaine (fitness, nutrition, maison, paie, rappels, documents). Interface premium mobile. Usage post-séance ou quotidien.

## Stack
- React + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase (auth + BDD + Storage)
- TanStack Query (react-query)
- Lovable pour la génération UI
- Claude Code pour la logique domaine
- Déploiement : Cloudflare Workers (wrangler.jsonc)

---

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

---

## Routes existantes
- `/` → index (home avec catégories)
- `/login` → connexion (email/password + Google OAuth)
- `/reset-password` → réinitialisation mot de passe (nouveau — juin 12)
- `/_authenticated/index` → accueil connecté
- `/_authenticated/fitness` → page fitness (onglets : Séances, Corps, Nutrition)
  - `CoachSheet` → sheet IA coach
  - `CorpsTab` → MuscleMap + récupération
  - `SeancesTab` → liste séances
  - `NutritionTab` → macros du jour
- `/_authenticated/profil` → profil redesigné (mai 23)
- `/_authenticated/stocks` → inventaire maison
- `/_authenticated/rappels` → rappels (kanban + calendrier)
- `/_authenticated/documents` → PDFs utilisateur
- `/_authenticated/preferences-alimentaires` → préférences alimentaires

---

## Domaines / Features

### Fitness (Sprints 1+2+3+4)
- Séances d'entraînement + WorkoutSheet + SwipeableExerciseRow
- MuscleMap SVG récupération par muscle
- ExercisePickerSheet, ExerciseStatsSheet, WorkoutProgressCharts
- Historique exercices (migration exercise_history mai 15)
- Lieu d'entraînement sur les workouts (migration add_gym_location_to_workouts juin 9)
- Badges fitness (lib/fitness/badges.ts + useUserBadges + useBadgeSystem)
- Objectifs (useGoals, GoalsSheet)
- Streak + activité (useStreak, useUserActivity, ActivityTimeline)

### Fitness — V1 Sprint 4 (juin 13)
- `lib/fitness/strength.ts` — estimate1RM (Epley), setTonnage, workoutTonnage, formatTonnage (créé par Lovable, validé)
- `hooks/useFitnessStreak.ts` — streak ISO-week ≥ N séances/semaine (créé par Lovable, validé)
- `components/fitness/RestTimer.tsx` — composant overlay : countdown ring SVG, son (Web Audio API), vibration, presets 60/90/120/180s
- `components/fitness/WorkoutSheet.tsx` — ajout bouton "Démarrer le repos" par exercice + intégration RestTimer + gym_location conservé
- `components/fitness/WorkoutCard.tsx` — 1RM estimé par exercice (Epley, affiché dans header groupe), tuile "Tonnage" utilise formatTonnage (remplace "Volume" + formatVolume local)
- WorkoutCard local était une version obsolète — remplacé par la version GitHub premium (buildGroups, ExerciseGroup, StatTile)
- ⚠️ Fichiers locaux (Google Drive) désynchronisés vs GitHub — workflow : lire sur GitHub raw avant toute modification

### Fitness — V1 set-by-set + RPE (juin 13) — TERMINÉ
- Table exercise_sets (id, exercise_id FK, user_id, set_number, reps, weight, rpe 0-10, notes, created_at). RLS, UNIQUE(exercise_id, set_number).
- lib/fitness/sets.ts (WorkingSet, setsTonnage, bestEstimated1RM, topSet, totalReps, averageRpe, summarizeSets), hooks/useExerciseSets.ts, use-fitness.ts useAddWorkout étendu (setDetails), WorkoutSheet éditeur série-par-série.

### Nutrition
- Macros quotidiennes (NutritionSheet, PortionEditModal)
- Scan repas IA (MealScanSheet) + Scan code-barres (BarcodeScannerSheet)
- Recherche aliments via **USDA FoodData Central + catalogue Supabase** (edge `food-lookup` → `services/foodCatalog.ts`). ⚠️ Open Food Facts retiré ; `services/openFoodFacts.ts` n'est plus qu'un shim de type (ré-exporte `FoodResult` via foodCatalog). Résidus à nettoyer (commentaires, libellé visible NutritionTab L273).
- Recettes (components/recipe/ : MacroProgress, NutritionBadge, PortionSelector, RecipeMacros)
- Portions en BDD (migration nutrition_portions)
- Préférences alimentaires (route dédiée)
- useNutritionCalculator

### Maison
- Stocks / inventaire (use-stocks, historique via stock_history)
- Rooms + compartiments (lib/maison/rooms.ts, rooms_compartments_refactor)
- Home catégories + sous-catégories (useHomeCategories, useHomeSubcategories, components/home/)
- Pantry (use-pantry.ts — hook présent, route non visible)
- Transfer feature (src/features/transfer/ : TransferPanel, useTransfer, transferService, detectContent)

### Rappels
- Table reminders (priorité, statut, récurrence, favoris)
- Vues : KanbanView, CalendarView, ReminderCard, ReminderSheet, SmartInput
- Hooks : useReminders, useReminderNotifications, useReminderShortcuts
- Temps réel via Supabase realtime

### Documents / PDFs
- Upload et stockage (use-documents, use-user-pdfs)
- Storage RLS policies (migration mai 20)

### Profil
- Redesign complet (migration profile_redesign_complete mai 23)
- ProfileHeader, EditPseudoSheet, ProgressSheet, ProgressionCard, StreakSheet, AppSheet, PersonalizationPanel
- useProfile, useProgress, useUserStats
- Synchronisation pseudo profil ↔ accueil (règle CLAUDE.md)

### Préférences utilisateur (nouveau — juin 12)
- Table user_preferences créée aujourd'hui
- useUserPreferences : theme (dark/light), accent_color, units (metric/imperial), animations, notifications, ai_preferences
- Valeurs par défaut : dark, #6c63ff, metric

### Auth — Persistance de session (gros chantier juin 12)
- **Problème résolu** : sessions perdues après reload / nouveau contexte / multi-onglets
- `lib/authDiagnostics.ts`, `lib/authSession.ts` (restoreAuthSession, refreshAuthSession), client.ts persistentStorage + PKCE, use-auth.tsx scheduleRefresh, _authenticated.tsx ssr:false, routes/reset-password.tsx, e2e/auth-persistence.spec.ts

### Contrôle de Paie
- ⚠️ Projet SÉPARÉ, sans lien avec Icortex — ne pas intégrer dans cette app

### Sécurité & Perf (juin 5 + juin 12)
- Audit RLS complet (sec1-sec6), révocation accès anon, indexes manquants, optimize_rls_policies_initplan, optimize_realtime_messages_policy

---

## Règles UX importantes
- Interface fluide, design premium
- Animations légères
- Pas de popup inutile
- Responsive parfait mobile obligatoire

---

## Renderer SVG canonique
- BodyMap.tsx = seul renderer SVG actif (mode "recovery" + mode "measurement")
- Importé dans SeancesTab.tsx et CorpsTab.tsx

## Points de vigilance
- use-pantry.ts existe sans route visible → feature en cours ou à connecter
- Contrôle de Paie = projet SÉPARÉ, sans lien avec Icortex

---

## Fitness — Coach IA V2 (juin 14)
- Tables Supabase : training_programs, program_weeks (périodisation), program_sessions, program_exercises. RLS auth.uid()=user_id, index, cascades. Migrations additives appliquées en prod.
- Domaine pur : lib/fitness/periodization.ts (generateProgramWeeks, modèles linear/undulating/block, deload, phaseLabel) + lib/fitness/loadRecommendation.ts (recommendLoad : auto-régulation RPE = reps en réserve via Epley inverse, modulée par la récupération).
- hooks/usePrograms.ts : usePrograms, useProgramWeeks, useCreateProgram (peuple program_weeks via la périodisation pure), useUpdateProgram, useDeleteProgram. Cast `supabase as any` (types.ts non régénéré).
- components/fitness/ProgramSheet.tsx : création + aperçu live périodisation + liste/détail. Branché via bouton « Coach IA » dans routes/_authenticated/fitness/index.tsx (en-tête).
- 30 tests unitaires des fonctions pures : OK.

## Nutrition — V2 (juin 14)
- Tables Supabase : recipes, recipe_ingredients (FK items pour macros via *_per_100g), meal_plans. Réutilise items et shopping_list. RLS + index. Migrations additives en prod.
- Domaine pur : lib/nutrition/recipes.ts (recipeMacros, perServing, scaleServings, sumMacros) + lib/nutrition/shoppingList.ts (aggregateNeeds, buildShoppingList = besoins moins stock).
- hooks/useRecipes.ts (CRUD recettes + macros calculées) ; hooks/useMealPlan.ts (planning hebdo + useGenerateShoppingList + useSaveShoppingList vers shopping_list).
- components/fitness/MealPlanSheet.tsx : planning semaine + génération liste de courses. Branché via bouton « Planning de la semaine » dans NutritionTab.tsx.

## Process (juin 14)
- Après chaque change : tester sur le site déployé (Cloudflare Workers, worker tanstack-start-app) et indiquer le résultat à Nathan.

## V3 — Coach recovery-aware (juin 14)
- lib/fitness/recoveryAdvice.ts (pur, + recoveryAdvice.test.ts) : MUSCLE_AI_NAME (MuscleId→nom edge minuscule), worstStatus, selectionRecovery, readyAlternatives, buildAiRecoveryContext.
- CoachSheet.tsx : prop recoveryMap → pastilles de récup par muscle + avertissement muscles fatigués + suggestions muscles prêts ; envoie `recovery` à l'edge. Fix : noms de muscles passés en minuscules (aiMuscleNames) car l'edge valide en minuscules (génération muscu était cassée avant).
- SeancesTab.tsx : passe recoveryMap (déjà calculé) à CoachSheet.
- Edge supabase/functions/coach-workout : déployée v7 via MCP Supabase (normalizeMuscle + buildRecoverySection à partir de body.recovery). ⚠️ La version déployée fait foi et DIVERGE du repo (le repo n'a pas _shared/ai.ts). Modifier l'edge = redéployer via MCP, pas via GitHub. Le Publish Lovable n'écrase pas le runtime edge.
- Hébergement réel : Lovable (cortex-home-ai.lovable.app). Déploiement = Publish/Update dans le projet Lovable après commit GitHub.

## Refonte Fitness UX/UI premium (en cours — 2026-06-17)
**Décisions actées avec Nathan :**
- Nouvelle **navigation globale** = 5 modules : Accueil · Séances · Corps · Nutrition · Profil (même ordre mobile/desktop). Les onglets internes de `/fitness` (Corps/Séances/Nutrition) deviennent des routes top-level `/seances`, `/corps`, `/nutrition`. L'ancienne page `/fitness` redirige.
- **Maison (`/stocks`) et Rappels (`/rappels`) → sections dans Profil** (retirés du bottom-nav, features conservées).
- **Accueil** = dashboard fitness premium (récup, objectifs, dernières séances, stats hebdo, calories in/out, poids, badges, succès, raccourci création séance).
- **Corps** : `body_tracking` contient déjà toutes les mensurations (weight, body_fat, muscle_mass, chest, waist, hips, left/right_arm, left/right_thigh) → aucune migration, juste l'UI. IMC = poids+taille. Galerie photos avant/après **reportée**.
- **Coach IA** conservé dans Séances.
- **Design** : polir/uniformiser sans changement radical (glassmorphism léger déjà présent).
- **Déploiement** : code direct GitHub poussé via Claude in Chrome (autonomie Nathan, pas de token manuel) → Publish Lovable → test live.
- **Ordre des travaux** : Nav → Accueil → Séances → Corps → Nutrition (+nettoyage OFF) → Profil → passe design.
- ⚠️ e2e/02-navigation.spec.ts à mettre à jour (testids nav-stocks/nav-documents supprimés du bottom-nav).

## Nutrition — Saisie vocale (2026-06-28)
- **Edge function `supabase/functions/parse-meal-text/index.ts`** (déployée ACTIVE sur projet `bcwfvpwxzlmkxobvbtzp`)
  - Reçoit `{ text: string }` (3–2000 chars), parse via Gemini 2.5 Flash (tool calling `save_meal`)
  - Retourne `{ items[], meal?, confidence?, details? }` — un item par aliment identifié avec kcal/P/G/L
  - Rate limit : 30 appels/heure (action `parse_meal_text`) via `_shared/rate-limit.ts`
  - Toujours HTTP 200, erreurs dans `{ error: "..." }`
- **Composant `src/components/fitness/VoiceLogSheet.tsx`** (nouveau)
  - Push-to-talk via `onPointerDown`/`onPointerUp`/`onPointerCancel` (iOS-safe)
  - `SpeechRecognition` / `webkitSpeechRecognition`, lang `fr-FR`, continuous: false
  - Guard `hasSpeechRecognition` — masque le micro si API indisponible
  - Auto-parse au résultat final de speech
  - Textarea fallback toujours visible (séparateur "ou tape")
  - Panel de révision : modifier inline (name + 4 macros), supprimer, totaux, sélecteur repas
  - Confirmation via `useAddNutritionBatch` (batch insert)
  - Imports : `Loader2, Mic, MicOff, Plus, Sparkles, Trash2` from lucide-react
- **`NutritionTab.tsx`** : bouton « Vocal » (icône Mic) ajouté dans la rangée d'actions, `voiceOpen` state, render conditionnel `<VoiceLogSheet>`

## Nutrition — Audit complet + corrections (2026-07-03, session Claude Cowork)
Rapport : `AUDIT_NUTRITION.md` (dossier Drive). Note avant : 64/100.
- **Bug B1 corrigé (corruption)** : `SavedMealsSheet` stockait `base_*` scalés au lieu de /100 g → réédition faussait les macros. Convention documentée : `base_*` = valeurs /100 g quand `consumed_unit` = g/ml, sinon « par portion ». 6 lignes corrompues réparées en prod (whey ×5 nutrition + 1 saved_meal_item).
- **Autres fixes** : B2 cache recherche empoisonné (useFoodSearch guard abort), B3 recette ×N (consumed_quantity), B4 virgule FR (parseDecimal + editDraft dans MealScan/Voice/Favorites), B5/B6 parseISO, B7 suppression immédiate + undo par ré-insertion, B8 consumed_grams_per_unit dans saved_meal_items + RPCs, B9 clampMacroSet avant insert IA.
- **Nouveau module** : `src/lib/nutrition/meals.ts` (MEAL_SLUGS/LABELS/isMealSlug/scalePer100/clampMacroSet) — utilisé par 7 fichiers, plus de duplication.
- **Hooks typés** : types.ts complété à la main (7 tables V2 + 3 RPC) ; use-saved-meals, use-nutrition-favorites, useMealPlan, useRecipes, useFrequentFoods sans `as any`/loose client.
- **Perf** : RPC `frequent_foods` (remplace 300 lignes client), staleTime useNutrition 30s / goals 5min, edge `food-lookup` v5 (upserts USDA parallèles + rate-limit 150/h) → recherche froide ~4s → ~2,3s (vérifié logs).
- **DB (4 migrations, appliquées prod + repo)** : 20260702202410 rattrapage saved_meals/saved_meal_items/nutrition_favorites+policies, ...202431 grams_per_unit+RPCs, ...202446 frequent_foods, ...202452 drop index dupliqués (foods, nutrition_goals) + policies recipes par action.
- **GoalsSheet** : TDEE avec objectif sèche(−300)/maintien/prise(+300), plancher 1200 kcal.
- Push : 7 commits via GitHub web upload (36c7da6→596bf5b). ⚠️ tsc a ~100 erreurs préexistantes (framer-motion types, auth wrapper Lovable) non liées.
- Reste à faire (audit) : fibres persistées, courbe poids/calories, préférences alimentaires → recipe-assistant, leaked password protection (dashboard), refactor NutritionTab (687 l.).

## Nutrition — Incident "Goûter" + hardening anti-dérive (2026-07-16, session Claude Cowork)
- **Root cause** : la migration `20260716124014_fb1c66b5-...sql` (ajout de `gouter` à `nutrition_meal_check`) existait dans le repo mais n'avait **jamais été appliquée en production** — le frontend proposait déjà « Goûter » → insertion refusée (code Postgres 23514). Migration appliquée manuellement via MCP Supabase, historique `supabase_migrations.schema_migrations` réconcilié avec le nom de fichier du repo.
- **Dérive secondaire trouvée** : `scan-meal` et `parse-meal-text` avaient chacun leur propre liste hardcodée de 4 slugs (sans `gouter`, y compris dans l'**enum du tool-calling IA** — donc l'IA ne pouvait littéralement pas choisir « gouter » même après le fix DB). `analyze-image`/`analyze-pdf` référençaient encore le slug legacy `petit-dejeuner` dans leurs prompts.
- **Architecture anti-dérive (source unique)** : `supabase/functions/_shared/meals.ts` est désormais LA définition canonique de `MEAL_SLUGS`/`MealSlug`/`isMealSlug`. `src/lib/nutrition/meals.ts` ne les définit plus — il les **réexporte** via un import relatif inter-dossiers (`../../../supabase/functions/_shared/meals.ts`, permis par `allowImportingTsExtensions`) et n'ajoute que les libellés FR/helpers UI. Toutes les Edge Functions IA (scan-meal, parse-meal-text, analyze-image, analyze-pdf) importent `../_shared/meals.ts` au lieu de listes locales. Détails/procédure : `docs/architecture/nutrition-meal-slugs.md`.
- **Garde-fous ajoutés** :
  - `src/lib/nutrition/meals.test.ts` — unitaire (chaque slug valide/invalide).
  - `src/lib/nutrition/meals.sync.test.ts` — échoue si frontend≠Edge Functions, si `MEAL_SLUGS` contient une valeur non couverte par la dernière migration `nutrition_meal_check`, ou si une liste dupliquée réapparaît ailleurs dans le repo (vérifié empiriquement : catch une vraie régression injectée en test).
  - `src/lib/nutrition/nutritionMealCheck.test.ts` — intégration DB réelle (env-gated comme `rls.test.ts`) : insert par slug valide, rejet 23514 sur valeur invalide, déplacement entre chaque paire de repas.
  - `.github/workflows/meal-slugs-check.yml` (nouveau) + step ajouté à `.husky/pre-commit`.
  - Bug CI trouvé et corrigé : `parse-meal-text` était absent de la liste `supabase functions deploy` dans `.github/workflows/deploy-functions.yml` (la saisie vocale n'était donc jamais redéployée automatiquement). D'autres fonctions (analyze-exercise, analyze-workout, food-lookup, nutrition-analysis, scan-exercise…) sont dans le même cas mais hors périmètre de cette session.
- Déployées en prod via MCP (hors CI, ce jour) : `scan-meal` v15, `parse-meal-text` v2, `analyze-image` v11, `analyze-pdf` v13.

## Types Supabase — régression `types.ts` + auto-heal CI (2026-07-23, session Claude Cowork, PR #15)
- **Faux diagnostic initial** : Lovable a signalé `deposit_document_analysis` "jamais déployée" et
  `NutritionSheet.tsx` utilisant les mauvais noms de colonnes. **Les deux étaient faux** : la
  migration `20260723160000_document_deposit_pipeline.sql` était bien appliquée (migrate.yml
  #30023657621, succès, vérifié en direct via MCP Supabase : `deposit_document_analysis` existe,
  `foods.normalized_name`/`protein_g`/`carbs_g`/`fat_g` et `documents.extracted_items` existent) et
  `NutritionSheet.tsx` était déjà correct. Parité migrations confirmée 173/173 (`supabase/migrations/`
  ↔ `list_migrations`), aucune migration manquante.
- **Cause racine réelle** : commit `238a9db` (23/07 21:10 UTC, auteur `gpt-engineer-app[bot]` =
  bot Lovable, poussé **directement sur `main` sans PR**) a écrasé `types.ts` (3766→1627 lignes)
  avec une version antérieure à ~40 migrations — sandbox Lovable avec un checkout obsolète du repo.
  `supabase-types.yml` a bien détecté la dérive le jour même (run 21:11 UTC) mais l'échec, purement
  informatif, n'a été vu/corrigé par personne : 5 commits Lovable suivants ont continué par-dessus
  le fichier cassé.
- **Fix PR #15** : régénération `types.ts` depuis la base (78 tables, `check-supabase-types.mjs`
  conforme) + `use-documents.ts` — cast `p_modules: depositPayload as unknown as Json` (démasqué
  uniquement par la régénération, car le nom du RPC n'était pas reconnu avant donc son 2e argument
  n'était jamais type-checké). `npm run typecheck` : 0 erreur.
- **Hardening CI (même PR)** : `supabase-types.yml` scindé en 2 jobs — `check-pr` (PR vers `main`,
  bloquant, aucun commit auto) et `fix-push` (push direct `main`, auto-régénère + committe
  `ci: auto-corrige la dérive types.ts…`, même logique que l'auto-commit d'idempotence déjà présent
  dans `migrate.yml`). `migrate.yml` étape 4b alignée pareil (auto-commit post-migration au lieu de
  simple échec). Doc mise à jour : `docs/architecture/supabase-types-source-of-truth.md` (4ème
  incident + nouveau tableau des garde-fous).
- **Limite structurelle non résolue par la CI** : Lovable pousse directement sur `main`, hors PR —
  aucun outil MCP disponible en session pour poser une branch protection GitHub (bloquerait de
  toute façon ce mode de push direct de Lovable, à valider avec l'utilisateur avant d'y toucher).
  L'auto-heal `fix-push` referme la fenêtre de risque sans ce changement de workflow.

## Intégration dataset externe `hasaneyldrm/exercises-dataset` (2026-07-28, session Claude Cowork)
Doc complète : `docs/architecture/exercises-dataset-integration.md`. **Infrastructure posée, import réel PAS exécuté** (nécessite décision explicite de Nathan + secrets prod, voir runbook §8 de la doc).
- **Principe** : `exercise_reference` reste l'unique référentiel d'identité (conforme à
  `exercise-central-architecture.md`) — le dataset externe n'introduit jamais de 2e table
  d'identité. Il enrichit des lignes existantes (colonnes `description`/`media`/`config`/`aliases`,
  déjà présentes et réservées à cet usage) ou en crée de nouvelles, jamais ne supprime/recrée.
- **Moteur de correspondance** (`supabase/functions/_shared/exerciseDatasetMatching.ts`, réexporté
  côté client dans `src/lib/fitness/exerciseDatasetMatching.ts` — même pattern que `_shared/meals.ts`)
  : score nom (Dice sur tokens, poids 0.85) + muscle/catégorie (poids 0.15, insuffisant seul pour
  fusionner). Seuils : ≥0.82 fusion auto, ≤0.35 création, entre les deux → file de revue
  `exercise_dataset_candidates` (nouvelle table, RLS service_role only, pas de fusion automatique).
  Limite documentée du dataset : le nom d'exercice n'existe qu'en anglais (seules les instructions
  sont traduites en FR) → beaucoup de paires partiront en revue plutôt qu'en fusion auto, c'est le
  comportement voulu (priorité absolue à la non-fusion en cas de doute).
- **Migration** `20260728123000_exercises_dataset_enrichment.sql` : colonnes `dataset_source`/
  `dataset_exercise_id`/`dataset_synced_at` sur `exercise_reference` (nullable, index unique
  partiel anti-doublon d'import) + table `exercise_dataset_candidates`. Aucune autre table touchée.
- **Edge function** `import-exercises-dataset` (auth `CRON_SECRET`/service role, même pattern que
  `cleanup-pdfs`) : `dry_run: true` par défaut, jamais d'écriture sans `{"dry_run": false}` explicite.
  Enrichissement additif strict (ne remplit que les champs NULL, relit avant écriture).
- **Recherche** : `CatalogExercise.aliases?` (additif) + `searchExercises` cherche aussi dans les
  aliases ; `DbCatalogRow`/`dbRowsToCatalog` propagent `aliases` si présents. Permettra à terme
  "lat pulldown"/"traction poulie" de retrouver le même exercice une fois les aliases peuplés.
- **Tests** : `exerciseDatasetMatching.test.ts` (12 cas, scoring/seuils/aliases). Suite complète
  (454 tests) + `tsc --noEmit` + eslint : 0 erreur après cette session.
- **Reste à faire (hors périmètre session, voir doc §8)** : exécution réelle du dry-run puis de
  l'import contre la prod (décision Nathan), revue manuelle de la file d'attente, éventuel système
  de rôle admin pour une UI de revue, cache Storage + conversion WebP des médias (différé, médias
  servis en lien direct pour l'instant).

## Renforcement moteur de correspondance dataset — couche de traduction EN<->FR (2026-07-28, même session, v2)
Demande de Nathan : le dataset externe n'expose les noms qu'en anglais, l'appli est 100% FR — il
fallait une couche de traduction/alias pour maximiser les fusions automatiques sûres et minimiser
les doublons. Toujours infrastructure only, import réel non exécuté.
- **Nouveau module `supabase/functions/_shared/exerciseTranslations.ts`** (réexporté
  `src/lib/fitness/exerciseTranslations.ts`) : dictionnaire exact EN->FR haute précision (~90
  exercices, inclut les exemples de Nathan : Bench Press→Développé couché, Lat Pulldown→Tirage
  vertical, Seated Cable Row→Tirage horizontal assis, Face Pull, Romanian Deadlift→Soulevé de terre
  roumain), dictionnaire phrase best-effort (repli), dictionnaires muscle/équipement EN->FR,
  heuristique inverse `extractEquipmentFromFrenchLabel` (déduit l'équipement implicite d'un nom
  Cortex existant, ex. "Développé couché barre" → "barre", puisqu'il n'y a pas de colonne équipement
  dédiée). `normalizeForMatch` extrait dans `_shared/textNormalize.ts` pour casser la dépendance
  circulaire entre ce module et le moteur de scoring.
- **Moteur de scoring passé de 2 à 5 signaux** (`exerciseDatasetMatching.ts`) : nom (0.55, 1 si
  exact — candidats = nom FR fourni + traduction exacte + traduction phrase + nom EN + alias
  existants), muscle principal (0.20), muscles secondaires (0.10, actif seulement si l'existant a
  déjà été enrichi une fois), équipement (0.10, via `config.equipment` ou heuristique), catégorie
  (0.05). **Garde-fou vérifié par test** : les 4 signaux d'appoint combinés plafonnent à 0.45,
  toujours < `AUTO_MERGE_THRESHOLD` (0.82) — aucune fusion automatique possible sans un minimum de
  correspondance de nom, même avec accord parfait muscle/équipement/catégorie.
- **`buildAliasesForDatasetRecord`** — génère alias FR+EN dédupliqués (exclut le nom canonique),
  **réellement persistés** par l'edge function sur `exercise_reference.aliases` (union, jamais de
  remplacement) pour `auto_merge` et `create_new` ; proposés (non appliqués) dans `match_reasons`
  pour `needs_review`. C'est ce qui rend la recherche bilingue effective une fois l'import exécuté.
  `config` stocke désormais les valeurs FR traduites comme clés primaires (`muscle_group`,
  `secondary_muscles`, `equipment`) + `*_en` pour audit. Le nom canonique d'un exercice nouvellement
  créé est maintenant le nom FR traduit, jamais le nom EN brut du dataset.
- **Tests** : +11 (`exerciseTranslations.test.ts`) et +11 (`exerciseDatasetMatching.test.ts`,
  23 au total) — dont le garde-fou anti-fusion-sans-nom et un test qui vérifie que "Lat Pulldown"
  fusionne avec "Tirage vertical" via la seule traduction exacte, sans alias préexistant. Suite
  complète 472 tests + `tsc --noEmit` + eslint : 0 erreur.
- Doc mise à jour : `docs/architecture/exercises-dataset-integration.md` §3/§3bis (nouvelle
  section)/§5/§6/§7/§9.

## Rapport de dry-run + sauvegarde/restauration import dataset (2026-07-29, même session, v3)
Demande de Nathan avant tout import réel : (1) rapport complet du dry-run avec liste intégrale des
correspondances ambiguës et décomposition par signal, (2) sauvegarde complète réversible avant la
première écriture réelle, (3) aucune écriture sans validation explicite de sa part. Toujours
infrastructure only — import réel non exécuté.
- **`scoreCandidate` expose désormais un `breakdown`** (`MatchBreakdown` : nom/muscle
  principal/muscles secondaires/équipement/catégorie, 0..1 chacun), calculé pour toutes les paires
  y compris en cas de nom exact (utile pour le rapport même si non déterminant du score final dans
  ce cas).
- **Nouveau module `supabase/functions/_shared/exerciseDatasetReport.ts`** (réexporté
  `src/lib/fitness/exerciseDatasetReport.ts`) : `buildDryRunReport(counts, ambiguousMatches, dryRun)`
  génère un texte avec compteurs globaux + liste COMPLÈTE (jamais tronquée) des correspondances
  `needs_review`, au format exact demandé par Nathan ("Nom : 86 %", "Muscle principal : 100 %",
  etc., "Score global : X %", "Décision : Validation manuelle"). `import-exercises-dataset` retourne
  désormais `report` (texte) + `ambiguousMatches` (array structuré) dans sa réponse, en dry-run
  comme en run réel.
- **`dry_run: true` (par défaut) ne fait plus AUCUNE écriture, même pas une sauvegarde** — seul un
  `select` en lecture seule + calcul du rapport. Aucune fusion/création/mise en revue n'a lieu tant
  que `dry_run:false` n'est pas explicitement demandé.
- **Sauvegarde/restauration** (`supabase/migrations/20260729120000_exercises_dataset_import_snapshot.sql`,
  additive) : 3 nouvelles tables — `exercise_reference_import_runs` (une ligne par run réel, jamais
  par dry-run), `exercise_reference_import_backup` (copie JSON complète de CHAQUE ligne
  `exercise_reference` de la discipline muscu avant la moindre écriture — pas seulement celles
  touchées), `exercise_reference_import_created` (journal des lignes créées, pour suppression au
  rollback). Fonction SQL `restore_exercise_reference_import(run_id)` (SECURITY DEFINER,
  service_role only) : supprime les lignes créées par ce run (FK `ON DELETE SET NULL` déjà en place,
  aucune perte de séance/série/répétition/charge) puis restaure l'état exact des lignes enrichies.
  Nouvelle edge function `restore-exercises-dataset-import` (même auth CRON_SECRET/service role)
  expose cette fonction via RPC. Le run réel écrit le `run_id` (UUID généré côté edge function) dans
  la réponse — à conserver pour un rollback éventuel.
- Choix documenté (doc §12) : snapshot ciblé transactionnel plutôt qu'un `pg_dump` externe (pas
  d'accès shell depuis une edge function ; plus précis, ne touche que ce que l'import a modifié) ;
  PITR/backups Supabase mentionnés comme filet complémentaire optionnel, non requis.
- Limite assumée : si l'utilisateur journalise une séance sur un exercice nouvellement créé avant un
  rollback, restaurer supprime la ligne créée (FK → NULL, aucune perte de données utilisateur, mais
  perte du lien d'identité précis) — rollback à faire au plus tôt après un import réel.
- **Tests** : +7 (`exerciseDatasetReport.test.ts`). Suite complète 480 tests + `tsc --noEmit` +
  eslint + `validate-supabase.mjs` : 0 erreur.
- Doc mise à jour : `docs/architecture/exercises-dataset-integration.md` §5/§6/§7/§8 (runbook étapes
  3/6/7/8)/§9/§11 (nouvelle section)/§12 (nouvelle section).

## Premier vrai dry-run + analyse des causes d'ambiguïté + renforcement dictionnaire (2026-07-30, même session, v4)
Nathan a demandé d'exécuter réellement le dry-run (lecture seule, contre la prod bcwfvpwxzlmkxobvbtzp)
puis, voyant seulement 37/167 fusions automatiques, une phase d'analyse pour améliorer la qualité du
matching SANS baisser les seuils. Toujours aucune écriture, aucun import réel.
- **Premier dry-run réel** : lecture SQL de `exercise_reference` (167 lignes muscu, colonnes dataset_*
  pas encore déployées en prod — confirmé au passage) + téléchargement réel du dataset (1324 records)
  + exécution du moteur via nouveau script `scripts/dry-run-exercises-dataset.ts` (réutilise les
  modules `_shared`, aucun déploiement d'edge function nécessaire). Résultat : 37 fusions auto, 537
  créations, 750 revues, 167→704 après import. Rapport interactif publié en artifact (750 lignes
  filtrables/triables, tableau avec décomposition par signal) :
  https://claude.ai/code/artifact/ac5c768e-8f36-46d2-8a18-ee9a04ade097
- **Analyse des 750 ambiguïtés** (classification par pattern de `breakdown`) : ~30% "score bas proche
  du seuil de création" (candidats qui devraient probablement être `create_new`), ~30% "granularité du
  catalogue" (Cortex n'a qu'UNE ligne générique par mouvement de base — ex. une seule "Squat barre" —
  quand le dataset détaille des dizaines de variantes nommées partageant la même catégorie/muscle sans
  être le même exercice), ~14% "variante technique nommée" (hack/zercher/sumo/jump squat — nécessite un
  jugement humain alias-vs-nouveau, pas un manque de dictionnaire), ~1.5% vrai manque de traduction
  résiduel, ~24% cas mixtes.
- **Exploitation des données Cortex existantes** (lecture seule) : `exercises`/`workout_template_exercises`
  — **constat négatif honnête** : aucune variance de libellé exploitable (tout est déjà canonicalisé par
  `ExerciseResolutionService` depuis la Phase 3, pas de réservoir de synonymes caché). `exercise_history`
  (write-only) est la SEULE source avec une vraie variance (échappe à la résolution), mais concerne des
  blocs Pilates/échauffement sans équivalent dataset. `exercises.muscle_groups` (IA, exercices custom) :
  piste réelle mais petit volume (<10 lignes `category` null concernées) — documentée comme amélioration
  possible future, non appliquée (aurait été une écriture, hors périmètre analyse). Pas de table
  favoris pour les exercices (seulement nutrition) — absence constatée, pas supposée.
- **Améliorations dictionnaire appliquées** (`exerciseTranslations.ts`, aucun seuil/poids touché) :
  correction d'un mauvais rapprochement ("barbell sumo deadlift" partait vers "roumain barre" au lieu
  de "Soulevé de terre sumo" qui existe pourtant — ajout d'une entrée exacte) ; "lever"/"sled"→"machine"
  (préfixes ExerciseDB génériques, 72+13 occurrences réelles comptées dans le dataset) ; "kneeling"/
  "rear"/"twist" ; muscles "spine"→"dos" (19x), "cardivascular system"→"cardio" (29x, relie enfin les
  exercices cardio dataset à la catégorie Cardio Cortex), "serratus anterior"/"levator scapulae"→
  "épaules" ; équipements "sled machine"/"assisted"/"roller"/"bosu ball" (comptages réels vérifiés via
  `collections.Counter` sur les 1324 records, pas des suppositions). 2 synonymes exacts supplémentaires
  ("barbell full squat", "cable kneeling crunch").
- **Régression détectée ET corrigée avant livraison** : "front"→"avant" cassait 2 fusions existantes
  ("Barre au front" = skull crusher) car "front" est aussi un mot FRANÇAIS déjà produit par une autre
  règle — la substitution en cascade repassait dessus et le corrompait en "barre au avant". Retiré,
  test de non-régression ajouté (`exerciseTranslations.test.ts`). Leçon documentée en commentaire :
  toute nouvelle entrée EN->FR doit être vérifiée contre les sorties FR déjà produites.
- **Renormalisation du scoring envisagée puis écartée** : traiter un signal manquant comme "neutre"
  plutôt que "0" aurait pu, dans certaines configs, laisser un seul signal faible compter comme si
  tous étaient présents — cassant l'invariant garde-fou. Décision : gain uniquement par le vocabulaire,
  jamais par la mécanique de score.
- **Second dry-run réel (après améliorations)** : 48 fusions auto (+11, +30%), 522 créations (-15),
  754 revues (+4, hausse attendue — des exercices auparavant `create_new` par manque total de signal
  ont maintenant un score juste suffisant pour `needs_review`, comportement voulu), **0 régression
  vérifiée empiriquement** (comparaison ligne à ligne des 37 fusions initiales, toutes encore présentes
  + 11 nouvelles). Rapport v2 republié à la même URL (avant/après, causes filtrable par catégorie).
- **Conclusion transmise à Nathan** : la limite résiduelle vient à ~44% de la granularité du catalogue
  Cortex (une ligne générique par famille vs dataset très détaillé) — nécessite un choix éditorial
  (nouvel exercice vs alias, famille par famille), pas un problème d'algorithme ni de données non
  exploitées. Recommandation : ne pas pousser plus loin par l'algorithme, traiter les ~104 "variantes
  techniques nommées" comme un travail de curation de contenu si souhaité.
- **Tests** : +7 (`exerciseTranslations.test.ts`, 18 au total). Suite complète 487 tests + `tsc --noEmit`
  + eslint : 0 erreur.
- Doc mise à jour : `docs/architecture/exercises-dataset-integration.md` §5/§7/§13 (nouvelle section
  complète : méthode, causes, améliorations, résultats mesurés, réponse structurée sur la limite du
  taux de fusion).

## Bibliothèque d'exercices — changement de stratégie, multi-média, fusion manuelle, admin UI (2026-07-31, v5)
Nathan a demandé un changement de principe fondamental : Cortex reste TOUJOURS la source de vérité,
le dataset n'enrichit jamais automatiquement — **plus aucune fusion automatique, quel que soit le
score**. Chaque enregistrement du dataset devient une fiche `exercise_reference` indépendante (hors
doublons techniques évidents), et toute fusion avec l'existant devient une décision manuelle depuis
une interface d'administration. Migration écrite mais volontairement **non appliquée à la
production** (vérifié : colonnes/tables absentes en base) ; import réel jamais exécuté.
- **Nouveau schéma** (`20260731120000_exercise_library_admin.sql`, additif) : `exercise_families`
  (regroupement d'affichage type "Développé couché" → barre/haltères/incliné..., jamais une identité
  — `exercise_reference.family_id` nullable) ; `exercise_reference.archived_at`/`merged_into_id`
  (soft-delete + traçabilité fusion) ; `exercise_media` (photos/GIF/vidéos multiples, un seul
  "principal" par type via index unique partiel, `source` cortex/dataset, la colonne `media` jsonb
  existante reste un résumé legacy non touché) ; `exercise_similarity_pairs` (suggestions
  exercice↔exercice, `status` suggested/dismissed/merged, jamais appliquées automatiquement) ;
  `exercise_merge_log` (état exact avant fusion + IDs précis de toutes les lignes déplacées —
  permet une annulation exacte, pas approximative).
- **4 fonctions SQL SECURITY DEFINER** (service_role only) : `merge_exercise_references` (repointe
  toutes les références vers la ligne conservée — contrairement au rollback d'import qui met à NULL,
  ici on repointe pour que l'historique de l'exercice archivé continue de compter ; enrichissement
  additif ; archive jamais ne supprime), `undo_exercise_merge` (restauration exacte via le journal),
  `archive_exercise_reference`/`restore_exercise_reference` (réversibles), et
  `delete_exercise_reference_if_unused` (suppression physique uniquement si non référencé nulle
  part, sinon retourne false — ne supprime jamais une donnée utilisateur).
- **Import réécrit** (`import-exercises-dataset`) : ne calcule plus de score vs l'existant. Filtre
  seulement les doublons techniques évidents (`_shared/exerciseDatasetDedup.ts` — même exercice
  répété avec juste un marqueur de démo différent : pov caméra, "v. 2", genre du modèle), puis crée
  CHAQUE enregistrement restant comme fiche indépendante + entrées `exercise_media`. Collision de
  nom FR → désambiguïsation en ajoutant le nom EN entre parenthèses (jamais de fusion silencieuse).
  `dry_run: true` par défaut inchangé.
- **Nouveau job `detect-exercise-similarities`** : réutilise le moteur à 5 signaux existant SANS
  dupliquer la logique — nouvelle fonction `scoreExercisePair(a, b)` dans
  `exerciseDatasetMatching.ts` adapte un exercice Cortex en pseudo-enregistrement dataset pour
  réappeler `scoreCandidate` tel quel. Calcule O(n²) sur tous les exercices actifs (~1500 après
  import complet → ~1,1M paires, documenté comme acceptable pour un job ponctuel), stocke les paires
  au-dessus d'un seuil en `status='suggested'`, ne réécrit jamais une paire déjà tranchée
  manuellement (dismissed/merged).
- **Nouvelle edge function `admin-exercise-actions`** (merge/undo_merge/archive/restore/delete/
  dismiss_pair) : PAS le pattern CRON_SECRET des jobs batch — auth via `_shared/adminAuth.ts`
  (`requireAdminUser`) qui vérifie que le JWT Supabase Auth de l'utilisateur correspond à
  `ADMIN_EMAIL` (secret, Turneur555@gmail.com — changé le 2026-07-29, était attal.nathan@gmail.com).
  **Limite assumée** : pas de vrai système de rôle
  côté Cortex (déjà documenté ailleurs) — allow-list par email suffisante pour une app à propriétaire
  unique, à remplacer si Cortex accueille plusieurs comptes.
- **Interface d'administration** : nouvelle route `/admin/exercises` (3 onglets — Recherche & fusion
  avec comparaison côte à côte et score calculé côté client via `compareExercises`/
  `scoreExercisePair` ; Suggestions de similarité ; Fusions récentes avec annulation). Toutes les
  mutations passent par l'edge function, jamais un accès écriture direct (RLS service_role only sur
  les nouvelles tables). Gate applicatif côté UI (email) + vrai gate côté serveur (edge function).
- **Non construit dans cette passe** (fondations posées, UI à ajouter ensuite) : gestion fine des
  médias (réorganiser/choisir principal/supprimer un par un — `exercise_media` + `useExerciseMedia`
  prêts), assignation de famille depuis l'UI (`exercise_families` prêt, pas d'écran dédié).
- **Note types.ts** : les hooks (`useExerciseAdmin.ts`) interrogent des tables pas encore dans
  `types.ts` (migration non appliquée) — passent par un cast `as any` documenté en commentaire,
  à retirer après application de la migration + `npm run gen:types`.
- **Vérifications** : `npm run build` (vite) exécuté avec succès — régénère `routeTree.gen.ts` avec
  la nouvelle route `/admin/exercises` (fichier généré, committé comme d'habitude dans ce projet).
  Suite de tests complète + `tsc --noEmit` + eslint + `validate:supabase` : tous verts. +12 tests
  (`exerciseDatasetDedup.test.ts` 8 cas + 4 cas `scoreExercisePair` dans
  `exerciseDatasetMatching.test.ts`).
- Doc mise à jour : `docs/architecture/exercises-dataset-integration.md` §14 (nouvelle section
  complète : principe, schéma, import réécrit, détection de similarité, admin UI, auth, limites,
  tests, runbook à jour).

## Vérification pré-merge + déploiement 100% automatisé (2026-07-31, même session)
Nathan a demandé confirmation que le merge sur `main` rend la fonctionnalité bibliothèque
d'exercices entièrement opérationnelle sans étape manuelle (sauf l'import du dataset, qui doit
rester manuel). Vérification faite sur les vrais workflows CI, pas une supposition :
- **Correction de compréhension importante** : `migrate.yml` applique la migration AUTOMATIQUEMENT
  au merge (job `migrate`, condition push sur main hors PR, `supabase db push --include-all`) — ce
  n'est pas une étape en attente, c'est le merge lui-même qui déclenche l'application. Migration
  re-vérifiée strictement additive (aucun DROP/TRUNCATE, seuls DELETE dans
  `delete_exercise_reference_if_unused`, exécuté seulement sur appel explicite UI).
- **2 vrais gaps trouvés et corrigés** : (1) `deploy-functions.yml` a une liste explicite de
  fonctions déployées qui n'incluait aucune des 4 nouvelles (import-exercises-dataset,
  restore-exercises-dataset-import, detect-exercise-similarities, admin-exercise-actions) — ajoutées
  à la liste ; (2) `admin-exercise-actions` dépendait d'un secret `ADMIN_EMAIL` jamais posé (aurait
  donné 500 systématique après un déploiement pourtant réussi) — corrigé en mettant l'email en dur
  (`DEFAULT_ADMIN_EMAIL` dans `_shared/adminAuth.ts`) avec repli sur le secret s'il est posé plus
  tard, zéro configuration manuelle requise.
- Confirmé : rien ne déclenche automatiquement l'import réel du dataset (`dry_run: true` reste le
  défaut, aucun cron/trigger ne l'appelle) — reste 100% manuel comme voulu.
- Re-vérifié après corrections : `tsc --noEmit`, 499 tests, eslint, `validate:supabase`, validité
  YAML du workflow modifié — tous verts.
- Doc mise à jour : `docs/architecture/exercises-dataset-integration.md` §14.4/§14.7/§15 (nouvelle
  section de vérification pré-merge).

## Rang par exercice — migration des illustrations + renommage Titan→Colosse, Primordial→Titan (2026-08-01)
- **Assets** : les 6 illustrations officielles (`src/assets/ranks/*.webp`) remplacées par de nouveaux
  exports (fist émergeant de gravats, style "Reliquary"). Les fichiers reçus n'étaient PAS conformes
  au format attendu (carrés 1:1, fond blanc opaque avec parfois un checkerboard de fausse
  transparence baké dans les pixels, y compris dans des poches enclavées non connectées au bord —
  ex. le triangle entre l'avant-bras et les deux têtes d'haltère). Traitement automatisé appliqué
  (script `process_rank.py`, non versionné — un-shot) : détourage par composantes connexes
  (near-white + faible saturation, `scipy.ndimage.label`), retrait de tout composant touchant le
  bord OU dépassant une aire minimale (capture les poches enclavées), décontamination couleur
  (dé-multiplication alpha en supposant fond blanc, évite les liserés blancs sur fond sombre),
  recadrage sur le bbox du sujet puis composition centrée sur un canevas 960×1200 (4:5 exact,
  multiple du format `FORMAT.md`), export WebP avec alpha réelle, qualité ajustée par fichier pour
  rester sous 250 Ko.
- **Renommage de taxonomie** (RankKey) — MÊME position de tier, MÊMES couleurs/motif/XP, seuls la
  clé et le libellé changent :
  - `titan` (tiers 15-19, motif flame/lave) → **`colosse`**
  - `primordial` (tiers 25-29, motif cosmos/argent) → **`titan`**
  - Nouvel ordre : Mortel → Guerrier → Héros → **Colosse** → Olympien → **Titan**.
  - Fichiers modifiés : `exerciseRanks.ts` (RANK_TIERS/RankKey), `rpg/grade.ts` et
    `rpg/titleConfig.ts` (GRADE_NAMES par clé), `rpg/rankTheme.ts` (RANK_AMBIANCE + commentaires),
    `RankUpOverlay.tsx` (confettis sur `olympien`/`titan`), miroir serveur
    `supabase/functions/_shared/rankEngine.ts` (RANK_KEYS), tests associés
    (`rankTheme.test.ts`, `assets/ranks/index.test.ts`, `titleProgress.test.ts`,
    `rank/engine.test.ts`), commentaires narratifs dans `rank/{config,engine,types}.ts` et
    `docs/architecture/rpg-vision-et-r1-niveau-personnage.md`.
  - **Supabase** : migration `20260801120000_rank_titan_colosse_rename.sql` renomme les
    `source_key` du `reward_catalog` (`exercise_rank_up_titan` → `exercise_rank_up_colosse`,
    `exercise_rank_up_primordial` → `exercise_rank_up_titan`) sans toucher `xp_events` (l'historique
    déjà versé garde son ancien libellé, comme tout journal — pas de réécriture rétroactive).
    `award_exercise_rank_up` construit son `source_key` dynamiquement (`'exercise_rank_up_' ||
    _titre_key`), donc aucun changement de fonction SQL nécessaire.
  - Non touché (hors périmètre) : "Scan des Titans" (BodyMap, nom de feature sans lien avec
    RankKey) et `rarityVisuals.ts` (palette de rareté des badges/Légendes — domaine produit séparé,
    règle CLAUDE.md).
- **Bibliothèque d'exercices v6 — enrichissement de l'interface admin** (2026-07-29, suite au
  premier retour utilisateur post-merge PR #24) :
  - **`src/lib/fitness/muscleGroupInference.ts`** (nouveau, pure logique, testé) : garantit qu'un
    groupe musculaire est TOUJOURS affiché (plus jamais de badge vide). `resolveMuscleGroup(row,
    name)` : `category` existante → `config.muscle_group` → déduction depuis le nom (réutilise
    `exerciseToMuscles`/`MUSCLE_META` de `muscleMapping.ts`, zéro duplication de règles) → repli
    neutre `"Non catégorisé"`. Deux angles morts corrigés localement (sans toucher
    `muscleMapping.ts`, utilisé par le calcul de récupération) : rotations d'épaule anciennement
    happées par la règle générique "oblique|rotation" (→ Épaules), "développé" non qualifié (→
    Pectoraux) ; plus deux buckets neutres pour les mouvements sans muscle dominant (Échauffement,
    Récupération, Polyarticulaire pour les mouvements combinés/full body).
  - **Migration `20260802120000_backfill_exercise_category.sql`** : backfill un par un (60 UPDATE
    `WHERE category IS NULL AND name = '...'`, idempotent) des 60 exercices Cortex existants sans
    catégorie (essentiellement des blocs extraits de PDF de programmes) — vérifié ligne à ligne
    contre `resolveMuscleGroup`, jamais une règle générique appliquée en aveugle. Portée strictement
    `category` (métadonnée de catalogue) — aucune séance/série/répétition/charge/record touchée.
  - **`useExerciseUsageStats`** (nouveau, `useExerciseAdmin.ts`) : nombre de séances distinctes +
    utilisations totales + "a déjà été fusionné" par exercice, via une nouvelle action edge function
    `usage_stats` (service_role) sur `admin-exercise-actions` — nécessaire car `exercises` est en
    RLS "propriétaire uniquement" (un accès client direct n'agrégerait que les séances de la
    personne connectée, pas l'usage réel de tout Cortex).
  - **`useExerciseMediaSummary`** (nouveau) : présence photo/GIF/vidéo par exercice — requête
    directe côté client (`exercise_media` est lisible par tout le monde, pas besoin de service_role).
  - **`deriveExerciseOrigin`** (nouveau) : Cortex / Dataset / Fusionné — "Fusionné" si l'exercice a
    déjà reçu une fusion non annulée (`exercise_merge_log.kept_exercise_id`), sinon Dataset si
    `dataset_source` est renseigné, sinon Cortex. **Mise à jour 2026-07-29** : remplacé par la
    colonne `exercise_reference.merged_at` (migration `20260803120000`, posée par
    `merge_exercise_references`/restaurée par `undo_exercise_merge`) — lisible par tous, permet un
    filtrage/comptage 100% côté client sans passer par `exercise_merge_log` (service_role).
- **Bibliothèque d'exercices v7 — bibliothèque unique + import depuis l'UI** (2026-07-29) :
  - `/admin/exercises` gère désormais TOUTE la bibliothèque (Cortex + Dataset + Fusionnés), pas
    seulement Cortex : 5 filtres (Tous par défaut/Cortex/Dataset/Fusionnés/Archivés, tous appliqués
    server-side via `merged_at`/`dataset_source`/`is_active` — scalable, pas de filtrage post-fetch
    limité aux 100 lignes), bandeau `useLibraryStats` (5 `count: 'exact', head: true`, sans limite).
  - **`requireAdminOrCron`** (`_shared/adminAuth.ts`) : passerelle ajoutée devant
    `import-exercises-dataset` et `detect-exercise-similarities` (jusqu'ici CRON_SECRET/service_role
    uniquement) — essaie le secret partagé, retombe sur `requireAdminUser` (JWT navigateur), sans
    rien casser côté appel batch existant.
  - Nouvel onglet **"Import du dataset"** : résumé honnête pré-import (Cortex actuel, dataset à
    importer, doublons techniques ignorés — tous calculés par le dry-run réel) ; **"Fusions
    potentielles"/"à valider" ne sont volontairement PAS estimés avant import** (l'import ne fait
    plus de scoring depuis la refonte "bibliothèque complète" §14.2 — seule la détection de
    similarité post-import, déclenchable en un clic juste après, les calcule). Boutons Dry-run /
    Importer le dataset (confirmation obligatoire) / Lancer la détection de similarité.
  - **Liste de recherche** (`exercises.tsx`) enrichie par ligne : badge groupe musculaire (jamais
    vide), badge provenance, badges médias (Photo/GIF/Vidéo si présents), compteur "X séances · Y
    utilisations".
  - **`CompareCard`** repensé en véritable comparaison avant fusion : nom + provenance de chaque
    fiche, compteurs de médias par type, groupe musculaire/muscles secondaires/équipement/
    catégorie/instructions/alias/variantes (même famille) côte à côte, **et** un bandeau dynamique
    "si « X » est conservée, les champs suivants seront complétés depuis « Y »" recalculé à chaque
    changement de sélection — reflète exactement la logique additive de `merge_exercise_references`
    (coalesce sur les champs NULL uniquement, jamais un remplacement).
- **Premier import réel — incident et correctifs (2026-07-29, voir doc §18)** : run interrompu à
  774/1324 (timeout probable, aucune donnée utilisateur touchée — vérifié). 3 bugs réels trouvés et
  corrigés dans `import-exercises-dataset/index.ts` : (1) URLs de médias relatives jamais préfixées
  (`toAbsoluteDatasetUrl`, base `raw.githubusercontent.com/.../main/`) ; (2) `category` construite
  depuis le champ dataset trop grossier (`category`/`body_part`, ex. "bras" pour 240 fiches) au lieu
  du plus précis `muscle_group`/`target` déjà utilisé par `config.muscle_group`, jamais capitalisée
  (`capitalizeFirst`, jamais `toUpperCase()`/`initcap()` qui casserait "Avant-bras") ; (3) import non
  résumable — reprise sûre ajoutée (exclut les `dataset_exercise_id` déjà liés à `dataset_source`
  avant traitement, nouveau champ résumé `alreadyImportedSkipped`). Les 774 fiches déjà en base ont
  été réparées rétroactivement (catégorie recalculée depuis `config.muscle_group`, déjà correct) via
  SQL ciblé en production (pas une migration — aucune modification de schéma). Dictionnaire
  `MUSCLE_TRANSLATIONS_EN_TO_FR` complété (ankles/rotator cuff/wrist(s)/rhomboids/hands/soleus).
  **Les 509 enregistrements restants n'ont pas été insérés depuis cette session** (coût de contexte
  disproportionné pour transiter les données manuellement) — l'edge function corrigée et reprenable
  termine l'import au prochain clic sur "Importer le dataset", en ignorant automatiquement les 774
  déjà présents.
- **`computeCompleteness`** (nouveau, `useExerciseAdmin.ts`) : score 0-100 + liste des informations
  manquantes (photo/GIF/vidéo/groupe musculaire/muscles secondaires/équipement/instructions/alias/
  variantes), affiché en badge sur chaque ligne de la liste de recherche.
- **Refonte « Santé nutritionnelle » — Phase 1 (2026-07-31)** : `sante-nutritionnelle.tsx` était
  100% mock (`SCORE`/`PILLARS`/`MACROS`/`MICRONUTRIENTS`/`INSIGHTS` en constantes statiques, aucun
  hook) ; accès/route/emplacement dans le menu Profil inchangés. Transformée en tableau de bord réel
  à 6 sections (Métabolisme, Corps, Nutrition, Activité, Santé, Analyse IA), chaque indicateur non
  encore disponible affichant un état « À venir » propre plutôt qu'une valeur inventée.
  - **`src/lib/fitness/metabolism.ts`** (nouveau, pur, + tests) : `computeBMR` (Mifflin-St Jeor),
    `computeTDEE`, `computeBMI`, `bmiCategory`, `ACTIVITY_LEVELS`, `GOAL_DELTAS` — extrait de la
    logique jusque-là dupliquée en dur dans `GoalsSheet.tsx` (calculateur TDEE de la sheet Objectifs
    nutrition). `GoalsSheet.tsx` refactorée pour consommer ces fonctions au lieu de sa propre copie.
  - **`src/lib/fitness/activitySummary.ts`** (nouveau, pur, + tests) : `computeWeeklyActivitySummary`
    — nombre de séances + calories brûlées estimées sur les 7 derniers jours, réutilise
    `workoutTonnage` (`strength.ts`) et `estimateWorkoutCalories` (`calories.ts`, déjà responsable de
    l'estimation affichée par séance dans `WorkoutCard`) plutôt que de dupliquer le calcul.
  - **`src/hooks/useDailyActivity.ts`** (nouveau) : `useLatestActivity()` lit le dernier relevé de la
    table existante `daily_activity` (steps/active_calories/avg_hr/resting_hr, alimentée par l'import
    Apple Health — `HealthDataPanel`) ; jusqu'ici cette table n'était consommée par aucun hook.
  - **`src/components/fitness/ComingSoonTile.tsx`** / **`ComingSoonCard.tsx`** (nouveaux) : variantes
    « à venir » de `StatTile` (tuile, même gabarit, bordure pointillée) et d'une grande carte premium
    (Analyse IA) — réutilisables partout où un indicateur n'est pas encore implémenté.
  - **Données réelles reconnectées** : poids/IMC (`useBodyMeasurements` + `computeBMI`, nouveau —
    aucun IMC n'existait avant dans le code), macros/calories du jour + objectifs
    (`useNutrition`+`useNutritionGoals`+`useNutritionTotals`, déjà existants), séances/calories
    brûlées 7j (`useWorkouts` + `computeWeeklyActivitySummary`), pas/FC (`useLatestActivity`).
  - **TDEE** affiché = `nutrition_goals.calories` (réutilisation directe, pas de nouveau calcul) ;
    état « à définir » avec lien vers `/nutrition` si absent.
  - **BMR décision clé** : aucune donnée d'âge/sexe/niveau d'activité n'existe nulle part dans le
    schéma (poids → `body_tracking`, taille → `user_preferences.height_cm` seulement) ; les stocker
    demanderait une nouvelle table **consommée** par le frontend, ce que le garde-fou CI
    `supabase-types.yml` (PR bloquante si `types.ts` dérive de la base, table pas encore appliquée
    tant que la migration n'est pas mergée sur `main`) empêche de faire en toute sécurité dans une
    seule PR. Migration `20260805090000_metabolic_profile_foundation.sql` créée (table
    `metabolic_profile`, RLS propriétaire, trigger `updated_at` réutilisant
    `set_nutrition_goals_updated_at`) mais **volontairement non consommée** par le frontend dans
    cette phase — fondation prête pour une phase ultérieure une fois `types.ts` régénéré après
    merge. BMR affiche donc « À venir » en V1.
  - **Objectif de poids** : aucune fonctionnalité de ce type n'existait déjà dans Cortex (recherché
    `target_weight`/`weight_goal` — aucun résultat ; la table `goals` avec `goal_type = 'weight_loss'`
    existe mais n'est lue par aucun hook, origine/statut incertains) → affiché « à venir » plutôt que
    de brancher sur une table orpheline non confirmée.
  - Hydratation, sommeil, HRV, récupération, stress, NEAT/EAT/TEF/dépense adaptative/adaptation
    métabolique, masse grasse/musculaire, tour de taille, analyse corporelle IA, temps actif :
    aucune donnée nulle part dans le schéma → « À venir » partout, sections prêtes à accueillir ces
    données sans reprise de layout.
- **Phase 2A — Profil métabolique + BMR réel (2026-08-05)** :
  - **Découverte préalable (étape 0)** : `types.ts` committé ne listait que 42 tables alors que la
    base en expose 83 — dérive préexistante sans rapport avec cette phase, scénario documenté dans
    `docs/architecture/supabase-types-source-of-truth.md` (régénération Lovable qui écrase les
    tables créées par nos migrations, dont `metabolic_profile`). Régénéré depuis la base via le MCP
    Supabase (jamais édité à la main), `tsc`/tests passent sans régression sur le fichier régénéré,
    `scripts/check-supabase-types.mjs` confirme la conformité. **Root cause probable de l'auto-heal
    CI resté silencieux depuis le 23/07** : hypothèse à vérifier par Nathan côté secrets CI
    (`SUPABASE_ACCESS_TOKEN`/`SUPABASE_PROJECT_REF`), la garantie 4 (tsc doit passer après
    régénération) n'expliquait pas le blocage ici — tsc passait bien sur le fichier régénéré.
  - **`src/hooks/useMetabolicProfile.ts`** (nouveau) : `useMetabolicProfile()` (lecture
    sexe/âge/activity_level, RLS + `.eq("user_id", user.id)` en défense en profondeur) +
    `useUpsertMetabolicProfile()` (écriture âge+sexe uniquement — `activity_level` non demandé en
    V1, réservé à une phase TDEE future). Poids/taille jamais dupliqués dans cette table : réutilisés
    depuis `body_tracking` (`useBodyMeasurements`/`useLatestBodyWeight`) et
    `user_preferences.height_cm` (`useUserPreferences`).
  - **`src/components/fitness/MetabolicProfileSheet.tsx`** (nouveau) : sheet cohérente avec le
    Design System (`Sheet`/`Field`/`SubmitButton` de `FormComponents.tsx`, même famille que
    `GoalsSheet`), ouverte depuis Santé nutritionnelle — ne demande que âge + sexe biologique,
    validation `isValidMetabolicAge` (miroir du `CHECK` SQL) avant soumission.
  - **`isBiologicalSex`/`isValidMetabolicAge`** (nouveau, `lib/fitness/metabolism.ts`) : guards purs
    réutilisés par le hook (normalisation de la colonne `sex: string | null`) et la sheet
    (validation avant écriture) — aucune duplication de règle entre les deux.
  - **Santé nutritionnelle → Métabolisme** : tuile BMR réelle (`computeBMR`, réutilisé tel quel,
    aucune formule dupliquée dans le composant) dès que sexe+âge+poids+taille sont tous disponibles ;
    sinon bandeau discret « Profil métabolique incomplet » + action « Compléter mon profil
    métabolique » ouvrant la sheet. Le BMR se recalcule automatiquement à chaque changement de poids/
    taille/âge/sexe car dérivé directement des données réactives (React Query), aucun cache propre.
  - **Hors scope (conforme à la consigne)** : NEAT/EAT/TEF/TDEE réel/TDEE adaptatif/adaptation
    métabolique/prédictions/coach IA restent « À venir » — aucun de ces éléments touché.
- **Correctif CI — lockfile désynchronisé (2026-08-01)** : `npm ci` échouait depuis fin juillet sur
  `typecheck.yml` + `supabase-types.yml` (`package-lock.json` pointait vers
  `@lovable.dev/vite-tanstack-config@2.7.7`/`vite-plugin-hmr-gate@1.1.4`, `package.json` exigeait déjà
  `2.8.4`/`^1.3.3`) — **cause racine identifiée** du drift `types.ts` de la Phase 2A (l'étape
  régénération de `migrate.yml` était `skip`, jamais atteinte, faute d'install réussie). Régénéré via
  `npm install` (aucune dépendance changée intentionnellement, `package.json` intact, `bun.lock` déjà
  correct). `typecheck.yml` re-vérifié vert sur `main` après le fix.
- **Phase 2B — EAT réel (2026-08-01)** :
  - **`src/lib/fitness/eat.ts`** (nouveau, pur, testé) : `estimateSessionCalories` (par séance, toute
    discipline confondue) + `computeDailyEAT` (somme du jour donné, `sessionCount`, jamais d'activité
    inventée — 0 séance ⇒ 0 kcal). Priorité de calcul par séance : (1) estimation déjà produite par le
    moteur de la discipline si présente dans `workouts.metadata` (`caloriesEstimate`/`calories_estimate`,
    ex. Guided — jamais recalculée) ; (2) muscu : `estimateWorkoutCalories` + `workoutTonnage` existants,
    comportement inchangé de `WorkoutCard` ; (3) autres disciplines (cardio/course/HYROX/freeform) : même
    formule MET × poids × durée mais intensité `"moderate"` explicite — corrige le biais de l'ancien
    appel direct qui, faute de tonnage, retombait à tort sur l'intensité `"light"` pour un effort
    cardio/course pourtant significatif.
  - **`computeWeeklyActivitySummary`** (`activitySummary.ts`, Phase 1) refactorée pour appeler
    `estimateSessionCalories` au lieu de dupliquer l'appel `workoutTonnage`+`estimateWorkoutCalories` —
    un seul estimateur par séance pour toute la page (carte "Activité (7j)" et tuile EAT), plus de
    logique concurrente. Corrige au passage le même biais d'intensité pour la carte 7 jours.
  - **`StatTile`** (`components/fitness/StatTile.tsx`) : nouvelle prop optionnelle `caption` (texte
    discret sous le libellé, ex. "Estimation") — non-breaking, réutilisée pour la tuile EAT afin de
    préparer l'affichage futur d'un niveau de confiance sans construire de scoring maintenant.
  - **Architecture "sources futures"** (Apple Health/Watch, Garmin, Whoop, Fitbit) : `CalorieEstimate`
    porte déjà `source: "computed" | "device"` — seul `"computed"` existe aujourd'hui ; aucune
    intégration développée, juste l'emplacement de type prêt pour qu'un futur moteur de sélection de
    source (priorité device > computed, anti double-comptage) s'y branche sans casser l'existant.
  - **Découverte discipline par défaut** : `workouts.discipline` vaut `"muscu"` (pas `"musculation"`) en
    base — vérifié dans les migrations, aligné sur la convention déjà utilisée par `WorkoutCard.tsx`
    (`(w.discipline ?? "muscu") === "muscu"`).
  - **Pas de nouvelle table** : EAT recalculé à la volée depuis `useWorkouts()` (déjà chargé) +
    poids (`body_tracking`/`useLatestBodyWeight`) — aucune donnée calculable persistée.
  - **Hors scope (conforme à la consigne)** : NEAT/TEF/TDEE réel/TDEE adaptatif/adaptation
    métabolique/balance énergétique/prédictions/coach IA — tous inchangés, toujours « À venir ».
- **Phase 2C — TEF réel estimé (2026-08-01)** :
  - **`src/lib/fitness/tef.ts`** (nouveau, pur, testé) : `computeTEF({ proteins, carbs, fats })` —
    grammes réellement consommés (jamais les objectifs) → kcal via Atwater (P×4, G×4, L×9) × un
    coefficient thermique par macro (`TEF_COEFFICIENTS`, seul point de vérité, doc dans le code) :
    protéines 25 %, glucides 7.5 %, lipides 2.5 %. Chaque sous-total (`proteinTEF`/`carbsTEF`/
    `fatTEF`) est arrondi individuellement puis `totalKcal` = somme des sous-totaux déjà arrondis
    (jamais un arrondi séparé du total) — garantit par construction que le détail correspond
    toujours exactement au total, sans tolérance de test nécessaire.
  - **Aucune date interne à la fonction** : `computeTEF` est agnostique du jour — elle opère sur des
    totaux déjà agrégés pour LA journée demandée par l'appelant (`useNutrition(date)` est déjà
    filtré côté serveur par date, `useNutritionTotals` réduit ensuite ces lignes) ; fonctionne donc
    pour n'importe quel jour sans code supplémentaire.
  - **Distinction "consommation nulle" vs "donnée absente"** : `useNutrition(date)` renvoie `[]`
    (jamais `null`) dès que la requête a chargé, même sans repas loggé ce jour-là — `totals` (le
    `reduce` dans `useNutritionTotals`) vaut alors `{0,0,0,0}`, ce qui EST le TEF réel (rien à
    digérer). Le seul état distinct est le chargement (`nutritionLoading`), géré côté composant par
    le `Skeleton` déjà utilisé pour le reste de la section Nutrition — pas une préoccupation de la
    fonction pure.
  - **Écart calories totales ≠ macros×coefficients (fibres/alcool/arrondis/données incomplètes,
    §5)** : assumé et documenté dans le code, jamais réattribué artificiellement à un macronutriment
    — le TEF ne porte que sur les grammes de protéines/glucides/lipides réellement connus.
  - **Santé nutritionnelle → Métabolisme** : tuile TEF réelle (`caption="Estimation"`, même mécanisme
    que la tuile EAT de la Phase 2B), gérée par `nutritionLoading` (skeleton pendant le chargement,
    jamais un flash "0 kcal" trompeur). BMR et EAT non modifiés. Pas de double comptage : TEF reste
    totalement indépendant de BMR/EAT/NEAT/objectif calorique (le futur TDEE les agrégera).
  - **Pas de nouvelle table** : calculé à la volée depuis `useNutrition`/`useNutritionTotals` déjà
    chargés par la page — aucune donnée calculable persistée.
- **Phase 2D — NEAT réel estimé (2026-08-01)** :
  - **Audit préalable (`src/lib/health/appleHealth.ts`)** — réponse à la question posée par
    Nathan : **`daily_activity.active_calories` PEUT inclure les calories des entraînements.** C'est
    la somme de tous les échantillons HealthKit `HKQuantityTypeIdentifierActiveEnergyBurned` du
    jour, et Apple ne sépare pas "exercice structuré" du reste de l'activité active dans cette
    quantité — une séance suivie par l'Apple Watch contribue à `active_calories` au même titre que
    la marche. `daily_activity.steps` est de la même façon une vraie somme journalière de tous les
    échantillons `StepCount` (pas un relevé instantané, jamais à re-sommer). `"apple_health"` est
    aujourd'hui la SEULE source de `daily_activity` (aucune autre intégration existante) — hypothèse
    documentée dans le code, à réviser si une source future a une sémantique différente.
  - **`src/lib/fitness/neat.ts`** (nouveau, pur, testé — 23 tests) : `computeNEAT({activeCalories,
    steps, weightKg, heightCm, eatKcal})`, priorité stricte à une seule méthode :
    (A) `active_calories` moins l'EAT du même jour (`Math.max(0, activeCalories - eat)` — anti
    double-comptage EAT/NEAT, jamais négatif) ; (B) sinon `estimateStepsCalories` (pas × poids,
    modèle MET × poids × durée identique à `calories.ts` — MET marche 3.0, vitesse 4.8 km/h,
    foulée = taille × 0.0041 si connue sinon 0.75 m par défaut) ; (C) sinon `insufficient_data`
    (`kcal: null`) — **jamais** de fallback `BMR × coefficient d'activité` dans cette phase.
  - **`useActivityForDate(date)`** (nouveau, `hooks/useDailyActivity.ts`) : contrairement à
    `useLatestActivity()` (dernier relevé connu, PAS nécessairement aujourd'hui — piège identifié
    par l'audit), interroge `daily_activity WHERE date = date demandée`. `useLatestActivity`
    inchangée (toujours utilisée telle quelle pour "Pas (dernier relevé)"/FC dans les sections
    Activité/Santé, dont le libellé assume déjà "dernier relevé").
  - **`InsufficientDataTile`** (nouveau, `components/fitness/InsufficientDataTile.tsx`) : distincte
    de `ComingSoonTile` — la fonctionnalité existe, seule la donnée manque. Jamais un "0 kcal" qui
    laisserait croire à une mesure réelle quand aucune donnée objective n'est disponible (Niveau C).
  - **BMR/EAT/TEF non modifiés** : `computeDailyEAT` réutilisé tel quel (juste appelé, `.kcal` passé
    en paramètre à `computeNEAT`) — aucun refactor de `eat.ts`/`tef.ts`/`metabolism.ts` nécessaire.
  - **Pas de nouvelle table** : NEAT calculé à la volée depuis `daily_activity` (déjà existante,
    Phase 1) + EAT/poids/taille déjà chargés par la page.
- **Correction Phase 2D — indépendance Cortex (2026-08-01)** : règle produit permanente posée par
  Nathan — BMR/EAT/TEF/NEAT/futur TDEE doivent fonctionner sans AUCUNE source externe (Apple Health,
  montres connectées…), qui restent des améliorations facultatives, jamais un prérequis. La V1 du
  NEAT (ci-dessus) priorisait `daily_activity.active_calories`/`steps`, alimentés uniquement par
  l'import Apple Health — corrigé.
  - **Nouvelle méthode principale « Cortex-native »** (`estimateNeatFromActivityLevel`,
    `lib/fitness/neat.ts`) : `NEAT = BMR × niveau d'activité quotidienne HORS SPORT`. Fonctionne
    avec le seul profil Cortex (âge/sexe/poids/taille/niveau déclaré), zéro donnée externe.
  - **`NEAT_ACTIVITY_LEVELS`** (nouveau, 4 niveaux : Très sédentaire 0.15 / Peu actif 0.25 / Actif
    0.35 / Très actif 0.5) — coefficients volontairement DISTINCTS des multiplicateurs TDEE
    classiques (`metabolism.ts` ACTIVITY_LEVELS 1.2–1.9, qui incluent déjà l'exercice et compteraient
    le sport deux fois avec l'EAT). Valeurs inspirées de la littérature NEAT (Levine et al., part du
    NEAT dans la dépense journalière ~15–50 % selon le niveau d'activité occupationnelle), appliquées
    au BMR plutôt qu'au TDEE total pour rester conservateur et simple. Réutilise la colonne
    `metabolic_profile.activity_level` existante (contrainte `CHECK (activity_level > 0)` déjà
    compatible, aucune migration nécessaire) — sémantique redéfinie proprement (ce n'est plus un
    multiplicateur TDEE classique) plutôt que réutilisée aveuglément comme demandé.
  - **Nouvelle priorité `computeNEAT`** : (1) Cortex-native — toujours tenté en premier ; (2) repli
    optionnel `active_calories − EAT` (wearable) ; (3) repli optionnel pas × poids ; (4) données
    insuffisantes. L'EAT n'entre JAMAIS dans le calcul Cortex-native (testé explicitement : le NEAT
    est strictement identique quel que soit le nombre de séances loggées le même jour).
  - **`MetabolicProfileSheet`** étendue : sélecteur du niveau d'activité hors sport (4 choix,
    libellés + descriptions reprenant `NEAT_ACTIVITY_LEVELS`), toujours la même sheet réutilisée
    (aucune nouvelle page). Nouveau bandeau « Niveau d'activité non renseigné » dans Métabolisme,
    distinct du bandeau BMR existant (évite un message trompeur si âge/sexe sont déjà complets).
  - **Confirmation indépendance** : un utilisateur peut installer Cortex, renseigner profil/poids/
    nutrition/séances, sans connecter aucun service externe, et obtenir BMR + EAT + TEF + NEAT.
    Testé explicitement (`neat.test.ts`, describe "Apple Health independence").
- **Correctif structurel Phase 2D — catégories métier au lieu de coefficients (2026-08-01)** :
  `metabolic_profile.activity_level` stockait directement les coefficients numériques (0.15/0.25/
  0.35/0.50) — trop couplé à l'algorithme (modifier un coefficient aurait exigé de migrer tous les
  profils). Corrigé.
  - **Migration `20260806090000_metabolic_profile_activity_level_category.sql`** : convertit la
    colonne `numeric` → `text`, backfill `CASE` des coefficients existants vers les catégories
    (`0.15→very_sedentary`, `0.25→lightly_active`, `0.35→active`, `0.50→very_active`, guard
    idempotent sur `data_type='numeric'`), puis `CHECK (activity_level IN (...))` sur les 4
    catégories exactes. Table vide au moment de la migration (0 ligne, vérifié) — aucune perte de
    donnée possible, mais le backfill reste écrit pour être sûr si des lignes existaient. Appliquée
    directement via Supabase MCP (`execute_sql`, SQL identique au fichier de migration, pas
    `apply_migration` — évite tout écart de version d'historique avec le fichier git ; `migrate.yml`
    ré-exécutera cette même SQL au merge, idempotente, et enregistrera proprement la version).
    `types.ts` régénéré et vérifié conforme (`check-supabase-types.mjs`, 83 tables).
  - **`lib/fitness/neat.ts`** : `NeatActivityLevel` (type `"very_sedentary"|"lightly_active"|
    "active"|"very_active"`, seule source de vérité du type) ; `NEAT_ACTIVITY_COEFFICIENTS` (Record
    catégorie→coefficient, SEUL point de vérité des coefficients, jamais persistés) ;
    `NEAT_ACTIVITY_LEVEL_OPTIONS` (libellés/descriptions UI, testé synchronisé avec les clés de
    `NEAT_ACTIVITY_COEFFICIENTS`) ; `isNeatActivityLevel`/`estimateNeatFromActivityLevel` acceptent
    désormais une chaîne de catégorie, plus un nombre.
  - **`useMetabolicProfile`/`MetabolicProfileSheet`** mis à jour en conséquence (upsert/lecture de
    catégories, sélecteur UI inchangé visuellement, valeurs stockées changées) — `BMR`/`EAT`/`TEF`
    et `sante-nutritionnelle.tsx` **non touchés** (compatibles sans modification, structurellement).
- **Phase 2E — moteur TDEE (2026-08-01, branche `claude/phase2e-tdee-engine`, NON mergée dans
  `main`)** : premier TDEE Cortex, formule stricte `TDEE = BMR + NEAT + EAT + TEF`, aucune autre
  composante (pas d'objectif calorique, pas de déficit/surplus voulu, pas de prédiction, pas
  d'adaptation métabolique — ce sera un futur "TDEE adaptatif" distinct).
  - **`lib/fitness/tdee.ts`** (logique pure, zéro React/Supabase) : `computeDailyTDEE(input)` agrège
    des composantes déjà calculées par l'appelant (ne connaît aucune date, fonctionne pour n'importe
    quel jour). `TDEEInput.neat` accepte `{ kcal, method }` — le sous-ensemble du résultat de
    `computeNEAT`. `status: "complete" | "incomplete"` — **complete** seulement si BMR ET NEAT sont
    tous deux disponibles ; EAT/TEF sont TOUJOURS des nombres réels (0 = vraie valeur — pas de séance
    /pas de macro consommé aujourd'hui — jamais "inconnu"). Si BMR ou NEAT manque → `totalKcal:
    null`, jamais un total partiel silencieusement calculé sur les composantes disponibles (testé
    explicitement sur l'exemple du brief : BMR=1650, EAT=300, TEF=200, NEAT=inconnu ne doit jamais
    afficher "2150"). `confidence: "high"|"medium"|"low"` dérivée de la méthode NEAT retenue
    (`wearable_active_calories→high`, `cortex_native→medium` par défaut, `steps_estimate→low`) —
    documenté comme indicateur RELATIF de qualité des données, jamais un pourcentage scientifique ;
    `null` uniquement quand `status==="incomplete"`. `safeNonNegative` ramène négatif/NaN/Infinity à
    `null` (composante manquante) ou borne à 0 pour EAT/TEF — robustesse sans jamais fausser le total.
  - **`computeCalorieGoalGap(tdeeTotalKcal, calorieGoalKcal)`** : écart cible = objectif − TDEE
    (`null` si TDEE incomplet ou objectif absent/non fini). Moteur prêt, UI **reportée** (non
    affichée cette phase, comme autorisé) — si affichée un jour, nommer explicitement "Déficit
    cible"/"Écart cible", jamais "Déficit réel" (ne pas confondre avec le déficit réellement consommé).
  - **`sante-nutritionnelle.tsx`** : tuile `TDEE` (section Métabolisme) remplace l'ancien
    `ComingSoonTile` — affiche la valeur réelle (`StatTile`, caption "Estimation") quand
    `dailyTDEE.status === "complete"`, sinon `InsufficientDataTile` (données déjà couvertes par les
    bandeaux BMR/niveau d'activité existants). Aucun nouveau graphique — la tuile TDEE cohabite avec
    les tuiles BMR/NEAT/EAT/TEF déjà affichées, qui restent la décomposition visible du total.
  - **Autonomie confirmée** : testé explicitement (`tdee.test.ts`, describe "autonomie Cortex-native")
    — profil complet + séances/nutrition Cortex, sans Apple Health/Garmin/Whoop/Fitbit, TDEE calculable.
  - **Tests** (`tdee.test.ts`, 23 tests) : agrégation (exemple du brief, jour sans séance, décimales/
    arrondi), données manquantes (BMR absent, NEAT absent, EAT=0 réel, TEF=0 réel, plusieurs
    composantes absentes, non-conversion silencieuse en 0), robustesse (négatif, NaN, Infinity),
    autonomie, cohérence (`total === bmr+neat+eat+tef`), confiance (les 3 niveaux), `computeCalorieGoalGap`.
  - `npx tsc --noEmit` / `npx eslint` / `npx vitest run` (623 passed) / `npm run build` : tous verts.
  - Pas de nouvelle table d'historique : le moteur recalcule à la demande à partir des données
    existantes, rien n'est persisté. Limite connue : TDEE "modélisé" uniquement (pas d'évolution du
    poids, pas de régression multi-semaines, pas de correction automatique) — volontairement hors
    scope de cette phase.
- **Phase 3A — fondation du TDEE observé/adaptatif (2026-08-01, branche
  `claude/phase3a-adaptive-tdee-foundation`, NON mergée dans `main`)** : second moteur, distinct du
  TDEE modélisé (`BMR+NEAT+EAT+TEF`), qui estime statistiquement la dépense compatible avec les
  calories réellement loggées et l'évolution réelle du poids. Observe et compare uniquement — ne
  corrige RIEN automatiquement (ni le TDEE modélisé affiché, ni les objectifs, ni les macros) ; la
  fusion intelligente des deux TDEE est explicitement reportée à une Phase 3B distincte.
  - **`lib/fitness/adaptiveTdee.ts`** (logique pure) : `computeAdaptiveTdee(input)`.
    - **Source poids** : `body_tracking` (déjà exposée par `useBodyMeasurements`, `limit(180)`,
      aucune nouvelle table). Pas de contrainte d'unicité (user, date) en base → dédoublonnage
      déterministe par jour : dernière pesée du jour par `created_at` (§14, testé explicitement).
      Bornes physiologiques défensives (20–500 kg, alignées sur le `CHECK` de la table) : seul
      l'impossible (NaN/Infinity/hors bornes) est ignoré, jamais une valeur réelle mais inhabituelle.
    - **Source calories** : nouveau hook `useNutritionRange(start, end)` (`hooks/useNutritionData.ts`)
      sur la table `nutrition` existante — un jour sans AUCUNE ligne n'est jamais traité comme 0 kcal
      (exclu de la moyenne et du compte de couverture, jamais confondu avec un jeûne).
    - **Lissage retenu** : moyenne glissante 7 jours (réutilise `movingAverage` de `lib/fitness/body.ts`,
      déjà utilisée ailleurs dans Cortex) sur une série journalière (jours sans pesée = `null`, jamais
      interpolés), PUIS régression linéaire sur les points lissés à FENÊTRE PLEINE uniquement (les
      premiers jours d'une moyenne glissante ont une fenêtre partielle dont le "centre" statistique
      diffère et biaiserait la pente — détecté via les tests sur données synthétiques 14/21/28j, corrigé
      en excluant ces points quand assez de points à fenêtre pleine existent). `weeklyTrendKg =
      pente_jour × 7`. Choix documenté : pas de modèle plus complexe (Kalman, EWMA multi-paramètres) —
      injustifié vu la densité de données Cortex réelle.
    - **Fenêtre d'analyse** : `ANALYSIS_WINDOW_DAYS = 28` jours glissants max ; la fenêtre réelle
      retenue va de la pesée exploitable la plus ancienne (dans ces 28j) jusqu'à aujourd'hui — reflète
      la couverture réelle plutôt qu'une fenêtre fixe artificielle.
    - **Seuils centralisés** `ADAPTIVE_TDEE_THRESHOLDS` (calendarDays/measurementCount/densité
      pesées/couverture nutritionnelle) : `EARLY` (7j, 4 pesées, densité 0.3, couverture 40 %) et
      `ESTABLISHED` (14j, 8 pesées, densité 0.4, couverture 60 %) → `insufficient_data` /
      `early_estimate` / `established`. La densité (mesures/jour de fenêtre) attrape le cas "14 jours
      mais 2 pesées" indépendamment du nombre de jours calendaires.
    - **Coefficient énergétique** `KCAL_PER_KG = 7700`, centralisé, documenté comme approximation (PAS
      une constante physiologique exacte) — appliqué UNIQUEMENT à la tendance lissée, jamais à une
      variation brute 24-48h.
    - **Formule** : `energyEquivalentKcalPerDay = weeklyTrendKg × 7700 / 7` ;
      `observedTdeeKcal = averageCalories − energyEquivalentKcalPerDay` (perte de poids → équivalent
      négatif → TDEE observé > apports ; prise de poids → équivalent positif → TDEE observé <
      apports). Exemple du brief vérifié par test : 2200 kcal/j, -0,30 kg/semaine → ≈2530 kcal/j.
    - **Confiance** `low|medium|high` : `low` en `early_estimate` ; `established` → `high` si
      calendarDays/mesures ≥ 2× seuil établi ET couverture ≥ 80 %, sinon `medium`.
    - **Comparaison** avec le TDEE modélisé (`deltaKcal`/`deltaPercent`) : purement informative,
      jamais utilisée pour corriger quoi que ce soit dans cette phase.
    - **Protection anti-eau explicitement testée** (demande Nathan) : une pesée isolée +1 kg (rétention
      d'eau) sur une série par ailleurs stable ne fait dévier le TDEE observé que de quelques dizaines
      de kcal (test dédié, seuil <150 kcal) — jamais des ~1000 kcal qu'une lecture brute donnerait.
  - **`sante-nutritionnelle.tsx`** : tuile "Dépense adaptative" (ComingSoonTile) remplacée par "TDEE
    observé" — `InsufficientDataTile` si `insufficient_data`, sinon `StatTile` (valeur préfixée `~` et
    caption "Estimation précoce" si `early_estimate`, caption "Basé sur tes données" si `established`).
    Aucune refonte de l'écran, tuile réutilisant le même gabarit que les autres.
  - **Tests** (`adaptiveTdee.test.ts`, 28 tests) : insuffisance (0 donnée, historique court, trop peu
    de pesées, densité insuffisante, nutrition trop incomplète), poids stable, perte (-0,30 kg/sem),
    prise (+0,20 kg/sem), qualité des données (jours non loggés jamais comptés 0, doublons de pesée
    même jour, dates irrégulières, décimales, outliers physiologiques, NaN/Infinity, calories
    négatives, protection anti-eau), comparaison au TDEE modélisé (>, <, ≈, absent), 3 jeux de données
    synthétiques longs (14/21/28j) vérifiant la convergence vers une tendance connue, confiance.
  - `npx tsc --noEmit` / `npx eslint` / `npx vitest run` (651 passed) / `npm run build` : tous verts.
  - **Limites scientifiques connues** : `KCAL_PER_KG=7700` est une approximation historique (ignore la
    composition réelle du tissu perdu/gagné — eau/muscle/gras) ; la régression sur moyenne glissante
    reste un modèle simple (pas de détection d'outlier statistique, pas de pondération par qualité de
    mesure) ; aucune fusion avec le TDEE modélisé n'est effectuée (Phase 3B).
- **Régression `types.ts`/lockfile sur `main` corrigée hors phase (2026-08-01)** : entre la fusion
  Phase 2E et la reprise du travail Phase 3A, un push direct non-Claude (`Changes`/`Work in progress`/
  `Corrigé garde-fou Supabase`) a écrasé `src/integrations/supabase/types.ts` (121→42 tables
  committées) et contourné les erreurs TypeScript résultantes avec des `(supabase as any)` dans
  `useMetabolicProfile.ts` au lieu de régénérer — violation directe de la règle CLAUDE.md "la base
  Supabase fait foi, jamais de correctif de contournement". Le même push a aussi bumpé
  `@lovable.dev/vite-tanstack-config` dans `package.json` (2.8.4→2.8.5) sans régénérer
  `package-lock.json`, cassant `npm ci` en CI (même classe de bug déjà rencontrée et documentée plus
  tôt dans le projet). CI était rouge sur `main` (Typecheck + Supabase Types Sync en échec).
  Corrigé en deux commits directs sur `main` (validés utilisateur avant action) : régénération de
  `types.ts` depuis la base live via Supabase MCP (vérifié conforme, 83 tables via
  `check-supabase-types.mjs`) + retrait des `as any` devenus inutiles ; puis `npm install` pour
  resynchroniser `package-lock.json`, vérifié par un `npm ci` propre depuis `node_modules` vidé. CI
  repassée au vert avant de reprendre la synchronisation Phase 3A.
- **Phase 3B — calibration du TDEE adaptatif (2026-08-01, branche
  `claude/phase3b-adaptive-tdee-calibration`, NON mergée dans `main`)** : troisième niveau de TDEE,
  combinaison PRUDENTE du TDEE modélisé et du TDEE observé (Phase 3A) — jamais un remplacement brutal
  de l'un par l'autre, même à confiance maximale.
  - **`lib/fitness/adaptiveTdeeCalibration.ts`** (logique pure) : `computeAdaptiveTdeeCalibration(input)`.
    - **Entrées** : `modeledTdeeKcal`, `observedTdeeKcal`, `observedStatus`, `observedConfidence` — ces
      deux derniers réutilisent directement les types `AdaptiveTdeeStatus`/`AdaptiveTdeeConfidence` de
      la Phase 3A (aucune deuxième notion de confiance recréée).
    - **Formule** : `adaptiveTdee = modeled + appliedCorrection`, où
      `appliedCorrection = clamp(rawDelta × weight, ±maxCorrection)`, `rawDelta = observed − modeled`.
      Équivalent à `modeled × (1−weight) + observed × weight`.
    - **Poids centralisés** `ADAPTIVE_TDEE_CALIBRATION_WEIGHTS[status][confidence]`, tous **strictement
      < 1** : `insufficient_data`→0 ; `early_estimate`→0.15 (toutes confiances) ; `established`→0.3
      (low, cas défensif)/0.35 (medium)/**0.5 (high)**. Coefficients conservateurs choisis par défaut,
      pas ceux suggérés à titre d'exemple dans le brief.
    - **États** : `model_only` (observé indisponible/insuffisant OU modélisé invalide → adaptatif =
      modélisé, correction = 0) ; `calibrating` (`early_estimate`) ; `adapted` (`established`).
    - **Garde-fou double** : plafond absolu `MAX_CORRECTION_KCAL=400` ET relatif
      `MAX_CORRECTION_PERCENT=15 %` (le plus conservateur des deux) — une correction ne peut jamais
      dépasser ce plafond, quel que soit l'écart brut. Second garde-fou en amont : si
      `|rawDelta|/modeled > DIVERGENCE_SUSPECT_PERCENT (25 %)`, le poids est amorti (`×
      DIVERGENCE_DAMPING_FACTOR=0.5`) AVANT même le plafond — un signal très divergent (ex. observé
      3800 vs modélisé 2500) ne fait donc jamais dériver le résultat près de l'observation brute
      (testé explicitement, `divergenceSuspected: true` exposé dans le résultat, jamais nommé
      "adaptation métabolique" — juste "écart important, signal traité avec prudence").
    - **Aucune correction automatique** de `nutrition_goals.calories`, macros, ni diagnostic
      d'adaptation métabolique — purement informatif/estimatif.
    - **Résultat structuré** : `state`, `adaptiveTdeeKcal` (`null` uniquement si `modeledTdeeKcal`
      indisponible — aucune ancre), `modeledTdeeKcal`, `observedTdeeKcal`, `observedWeight`,
      `rawDeltaKcal`, `appliedCorrectionKcal`, `divergenceSuspected`, `confidence` (pass-through 3A),
      `reason` (explicable, ex. "correction de -70 kcal appliquée au modèle (poids observé 50 %)").
  - **`sante-nutritionnelle.tsx`** : nouvelle tuile "TDEE adaptatif" juste après "TDEE observé"
    (section Métabolisme — les trois niveaux TDEE modélisé/observé/adaptatif sont désormais côte à
    côte). Caption "Modèle initial" (`model_only`) / "Calibration en cours" (`calibrating`) / "Basé
    sur ton historique" (`adapted`). `ComingSoonTile` seulement si le TDEE modélisé lui-même est
    indisponible (pas d'ancre) — sinon toujours une valeur réelle, jamais 0 fabriqué.
  - **Tests** (`adaptiveTdeeCalibration.test.ts`, 31 tests) : `model_only` (observé absent, données
    insuffisantes), `calibrating` (petit delta +/-, confiance faible), `adapted` (medium/high, observé
    </>/= modélisé), garde-fous (divergence aberrante 2500 vs 3800 — testé conforme à l'exemple du
    brief, NaN/Infinity/négatif/nul côté observé ET modélisé, correction max toujours respectée, poids
    toujours < 1 sur toute la matrice status×confidence), cohérence (`adaptive = modeled + correction`,
    signe de la correction, non-mutation des entrées), 4 scénarios synthétiques (stable, sur/sous-
    estimé, aberrant), et vérification qu'aucune clé objectif/macro n'apparaît dans le résultat.
    L'exemple d'explicabilité du brief (modèle 2620, observé 2480 → correction -70, adaptatif 2550)
    passe exactement avec les coefficients retenus.
  - `npx tsc --noEmit` / `npx eslint` / `npx vitest run` (682 passed) / `npm run build` : tous verts.
  - **Limites connues** : les seuils/poids sont des choix conservateurs raisonnés, pas calibrés sur des
    données réelles d'utilisateurs Cortex ; pas de stabilisation temporelle inter-jours (chaque appel
    recalcule indépendamment à partir de l'état du jour — aucune persistance de snapshot ajoutée,
    volontairement reporté plutôt que sur-ingénieré) ; le "signal suspect" n'identifie pas la cause
    (tracking incomplet / eau / poids erroné) — juste qu'il existe.
- **Phase 3C — explicabilité du moteur métabolique (2026-08-01, branche
  `claude/phase3c-metabolic-explainability`, NON mergée dans `main`)** : couche de transparence pour
  les 3 niveaux de TDEE (modélisé/observé/adaptatif) — aucun algorithme métabolique modifié, uniquement
  présentation/explication.
  - **`lib/fitness/metabolicAnalysis.ts`** (logique pure de présentation, zéro React) :
    `buildMetabolicAnalysis(input)` assemble un `MetabolicAnalysisViewModel` unique à partir des
    résultats déjà calculés (`DailyTDEE` Phase 2E, `AdaptiveTdeeResult` Phase 3A,
    `AdaptiveTdeeCalibrationResult` Phase 3B) — aucune formule recalculée, uniquement formatage/
    libellés/agrégation d'affichage. Un seul objet passé au composant (pas 25 props indépendantes).
    - Libellés centralisés : `CONFIDENCE_COPY` (Faible/Moyenne/Élevée + description qualitative,
      jamais un pourcentage — "95 % fiable" explicitement interdit), `CALIBRATION_STATE_COPY`
      (`model_only`→"Modèle initial", `calibrating`→"Calibration en cours", `adapted`→"Calibré" —
      réutilise les états 3B, aucun système parallèle), `MODELED_COMPONENT_LABELS` (BMR→"Métabolisme
      de base", NEAT→"Activité quotidienne", EAT→"Entraînement", TEF→"Digestion", avec l'acronyme en
      info secondaire).
    - **Données insuffisantes** (`observed.available === false`) : `buildCalibrationProgress` expose
      des CRITÈRES de progression (pesées actuel/requis, couverture nutritionnelle %, jours) calqués
      sur les seuils `ESTABLISHED` de la Phase 3A (8 pesées/60 %/14 j) — jamais un nombre de jours
      restants fabriqué, uniquement l'écart entre l'état actuel et le seuil visé.
    - Explication de la correction non-totale (`CALIBRATION_PARTIAL_CORRECTION_EXPLANATION`) vs.
      explication de divergence suspecte (`DIVERGENCE_SUSPECTED_EXPLANATION`, testée pour ne contenir
      AUCUN diagnostic de cause — "métabolisme ralenti"/"adaptation métabolique"/"mauvais tracking"/
      "rétention d'eau" explicitement absents).
  - **`components/fitness/MetabolicAnalysisSheet.tsx`** : Sheet bottom-sheet (réutilise `Sheet` de
    `shared/FormComponents.tsx`, même pattern que `MetabolicProfileSheet`, pas de nouvelle page/
    composant générique créé). Sections : TDEE adaptatif en tête, bloc "Écart inhabituel détecté" si
    `divergenceSuspected`, calcul détaillé (modélisé → observé → écart brut → correction → adaptatif),
    composition du TDEE modélisé (4 lignes + total), TDEE observé (période/pesées/couverture/apport
    moyen/tendance/confiance) ou état d'attente avec critères de progression, objectif calorique
    affiché séparément avec rappel explicite "distinct de la dépense estimée", et un `<details>`
    "Comment Cortex calcule ces valeurs ?" pour l'explicabilité (§16) sans surcharger la vue par défaut.
  - **`sante-nutritionnelle.tsx`** : la fiche principale n'est PAS transformée en tableau — un simple
    CTA "Voir l'analyse" (même pattern que les bandeaux "Compléter mon profil métabolique" existants)
    ouvre la nouvelle Sheet ; `metabolicAnalysis` construit une seule fois via `buildMetabolicAnalysis`
    à partir des résultats déjà en mémoire (`dailyTDEE`, `adaptiveTdee`, `adaptiveTdeeCalibration`,
    `calorieGoal`).
  - **Tests** (`metabolicAnalysis.test.ts`, 21 tests) : composition modélisée (complete/incomplete),
    observé disponible (established) avec toutes les métriques, observé indisponible avec critères de
    progression réels (pas de date fabriquée), early_estimate partiel, les 3 états de calibration
    (`model_only`/`calibrating`/`adapted`), correction positive/négative/nulle, explication standard vs.
    divergence suspecte (vérifie l'absence de mots de diagnostic), séparation objectif calorique/
    dépense, robustesse (aucune exception sur un input complet).
  - `npx tsc --noEmit` / `npx eslint` / `npx vitest run` (703 passed) / `npm run build` : tous verts.
  - **Vérification visuelle mobile NON effectuée** : tentative de lancer `vite dev` (avec/sans
    `--host`/`HOST` env) échoue systématiquement dans ce sandbox avec
    `EAFNOSUPPORT: address family not supported :::8080` (le serveur dev tente un bind IPv6 dual-stack
    non supporté par l'environnement) — limitation d'environnement, pas du code. Non simulée/prétendue.
  - **Limites connues** : le contenu du `<details>` explicatif est statique (pas encore contextualisé
    selon les données manquantes précises de l'utilisateur) ; aucun composant de progression visuelle
    (barre) pour les critères de calibration en attente — affichés en valeurs `actuel / requis` textuelles
    uniquement, jugé suffisant pour cette phase (pas de sur-ingénierie).
- **Phase 4A — moteur de stratégie calorique (2026-08-01, branche
  `claude/phase4a-calorie-strategy`, NON mergée dans `main`)** : première recommandation calorique
  Cortex-native, déterministe, explicable. Ne modifie JAMAIS `nutrition_goals.calories` — le bouton
  "Appliquer" reste désactivé (§13/§19 du brief), aucune écriture automatique.
  - **Audit préalable (ancien système)** : `lib/fitness/metabolism.ts` contient un système LÉGACY
    distinct, toujours utilisé par `GoalsSheet.tsx` (calculateur repliable "Calculer mes besoins
    (TDEE)" dans la Sheet "Mes objectifs quotidiens") : `computeTDEE(bmr, activityLevel)` (multiplicateur
    Harris-Benedict classique 1.2–1.9, PAS le TDEE Cortex-native BMR+NEAT+EAT+TEF), `GOAL_DELTAS`
    (sèche/maintien/prise à -300/0/+300 kcal FIXES, pas relatifs au poids), `computeCalorieTarget`
    (`Math.max(1200, tdee+delta)`, floor sans justification documentée). C'est le SEUL écrivain de
    `nutrition_goals.calories` (`useUpsertNutritionGoals`), via un flux déjà manuel (Calculer → Appliquer
    → Enregistrer). **Non modifié/supprimé en Phase 4A** (fonctionnel, hors scope strict) — signalé comme
    doublon candidat pour une consolidation future (Phase 4B+ : soit migrer ce calculateur vers le
    nouveau moteur Cortex-native, soit les garder délibérément distincts). Aucun `goal_type`/rythme/poids
    cible n'existe dans le schéma `nutrition_goals` actuel (`user_id, calories, proteins, carbs, fats,
    created_at, updated_at` uniquement) — confirmé par audit direct des migrations.
  - **`lib/fitness/energyConstants.ts`** (nouveau) : extraction de `KCAL_PER_KG_BODY_MASS = 7700` en
    point de vérité unique, réutilisé par `adaptiveTdee.ts` (Phase 3A, refactoré pour l'importer au lieu
    de dupliquer la valeur) ET `calorieStrategy.ts` (Phase 4A) — zéro duplication.
  - **`lib/fitness/calorieStrategy.ts`** (logique pure) : `computeCalorieStrategy(input)`.
    - **Source TDEE** : `pickReferenceTdee` — priorité au TDEE ADAPTATIF (Phase 3B,
      `calibration.state !== "model_only"`), repli sur le TDEE MODÉLISÉ sinon ; `referenceSource:
      "adaptive"|"modeled"` exposé. Un nouvel utilisateur (aucune donnée observée, `model_only`) reçoit
      donc une recommandation dès que son profil métabolique est complet, sans attendre le TDEE observé.
    - **3 objectifs** (chaînes NEUVES, délibérément non mélangées aux legacy `seche/maintien/prise`) :
      `fat_loss`/`maintenance`/`muscle_gain`. UI FR : "Perte de graisse"/"Maintien"/"Prise de masse".
    - **Rythmes centralisés** `CALORIE_STRATEGY_RATES`, exprimés en % du poids corporel/semaine (pas en
      kcal fixes) : perte `slow` 0.25 %, `moderate` 0.5 %, `fast` 0.75 % ; prise `slow` 0.125 %,
      `moderate` 0.25 % (volontairement ~moitié des rythmes de perte — surplus progressif, pas de bulk
      agressif par défaut).
    - **Maintien** : `recommendedCalories = referenceTdeeKcal` exactement (pas d'arrondi au pas de 25 —
      la valeur est déjà un entier produit en amont), `dailyDeltaKcal = 0` toujours.
    - **Perte/prise** : `magnitude = poids × %/semaine × KCAL_PER_KG_BODY_MASS / 7` ; signe négatif pour
      `fat_loss`, positif pour `muscle_gain` ; puis garde-fous puis arrondi au pas de 25 kcal
      (`CALORIE_STRATEGY_ROUNDING_STEP_KCAL`) pour éviter une pseudo-précision (ex. "2 137 kcal").
    - **Garde-fous centralisés** `CALORIE_STRATEGY_GUARDRAILS` : `MAX_DEFICIT_KCAL=1000`,
      `MAX_SURPLUS_KCAL=500` (plafonnent le delta AVANT arrondi), `ABSOLUTE_MIN_FLOOR_KCAL=1200` —
      **audité** : c'était le floor legacy de `computeCalorieTarget` (`Math.max(1200,...)`), sans
      justification individuelle (sexe/taille/état de santé) dans le code d'origine. Conservé
      uniquement comme garde-fou de dernier recours contre une valeur absurde, **toujours accompagné**
      de `limited:true` + `limitReasons` explicite plutôt que présenté comme un minimum médical
      personnalisé — jamais un `recommendationLimited` silencieux.
    - **Convention de signe unique** : `dailyDeltaKcal = recommendedCalories − referenceTdeeKcal`,
      recalculée APRÈS arrondi/plafonds pour garantir la cohérence `recommendedCalories =
      referenceTdeeKcal + dailyDeltaKcal` en toute circonstance (testé explicitement).
    - **Résultat structuré** : `goal`, `referenceTdeeKcal`, `referenceSource`, `recommendedCalories`
      (`null` si non calculable — jamais fabriqué), `dailyDeltaKcal`, `targetRate` (`null` en
      maintenance), `estimatedWeeklyWeightChangeKg/Percent` (dérivés du delta RÉELLEMENT appliqué, donc
      honnêtes même après plafonnement), `limited`, `limitReasons`.
    - **Données insuffisantes** : poids manquant/invalide pour perte/prise → `recommendedCalories:null`
      + raison explicite ; aucun TDEE exploitable → idem, quel que soit l'objectif.
    - `compareCalorieGoal(current, recommended)` : fonction pure séparée, `differenceKcal =
      recommended − current` (`null` si l'un des deux manque) — prépare le futur bouton "Appliquer" sans
      jamais écrire en base cette phase.
    - **Architecture manual/automatic** documentée en tête de fichier (type `CalorieStrategyMode =
      "manual"|"automatic"`, non consommé en 4A) : emplacement recommandé pour la préférence en 4B —
      étendre `nutrition_goals` (déjà 1 ligne/utilisateur) avec `goal`, `target_rate`,
      `calorie_strategy_mode`, `last_auto_adjustment_at` (pour le délai minimal entre ajustements
      automatiques) — pas de nouvelle table anticipée, aucune migration créée en 4A (mode non actif).
  - **`sante-nutritionnelle.tsx`** : nouvelle section "Stratégie calorique" (sélecteur d'objectif 3
    boutons + sélecteur de rythme conditionnel), carte compacte TDEE de référence/apport recommandé/
    rythme estimé, comparaison objectif actuel vs recommandation, bouton "Appliquer" **visuellement
    présent mais désactivé** (`disabled`, `cursor-not-allowed`, tooltip explicite "bientôt disponible")
    — aucune écriture, juste l'emplacement préparé comme autorisé par le brief. Pas de recalcul
    automatique des macros.
  - **Tests** (`calorieStrategy.test.ts`, 38 tests) : perte (rythmes croissants, poids/TDEE variés,
    signe, garde-fou, arrondi), maintien (source modeled/adaptive, delta=0, pas d'arrondi parasite),
    prise (symétrique), source TDEE (adaptive/modeled/indisponible), comparaison objectif (<, >, =,
    absent), robustesse (NaN/Infinity/négatif/nul/poids ou rythme manquant/objectif ou rythme inconnu/
    valeurs extrêmes/jamais négatif/protection contre recommandation extrême), autonomie Cortex-native,
    cohérence des rythmes centralisés.
  - `npx tsc --noEmit` / `npx eslint` / `npx vitest run` (741 passed) / `npm run build` : tous verts.
  - **Vérification visuelle mobile NON effectuée** — même limitation d'environnement que Phase 3C
    (`EAFNOSUPPORT` sur bind IPv6 `:::8080`), retestée et reconfirmée, non simulée.
  - **Limites connues** : les seuils de rythme/garde-fous sont des choix conservateurs raisonnés, non
    calibrés sur des données réelles ; le calculateur legacy de `GoalsSheet.tsx` reste actif en
    parallèle du nouveau moteur (doublon fonctionnel non résolu, signalé pour 4B) ; aucune persistance
    de l'objectif/rythme choisi par l'utilisateur (state React local, remis à `maintenance`/`moderate`
    à chaque ouverture de page — attendu tant que `calorie_strategy_mode`/`goal`/`target_rate` ne sont
    pas persistés en 4B).
- **Phase 4B — stratégie calorique manuel/automatique (2026-08-01, branche
  `claude/phase4b-calorie-strategy-manual-automatic`, NON mergée dans `main`)** : persistance de la
  stratégie, bouton "Appliquer" devenu fonctionnel, mode automatique contrôlé par garde-fous,
  historique traçable, suppression du double moteur calorique legacy.
  - **Audit découverte majeure** : en auditant `nutrition_goals` avant migration, trouvé un
    **troisième moteur calorique**, entièrement côté base (`compute_nutrition_targets(p_objective)`,
    migration `20260618102110_nutrition_food_logs_and_goals.sql`) — kcal/kg de poids par objectif
    (bulk=38/cut=26/recomp=31/maintenance=33), poids par défaut 75 kg si inconnu, écrit directement
    `nutrition_goals` (`calories, proteins, carbs, fats, fiber_g, objective, weight_kg`). **Confirmé
    mort côté frontend** (`grep compute_nutrition_targets src/` → 0 résultat) — jamais appelé par
    l'app. **Non supprimé** (dropper une fonction/des colonnes DB dépasse le scope explicite de cette
    phase, qui ne nommait que le legacy TS `metabolism.ts`/`GoalsSheet.tsx`) — signalé ici pour
    nettoyage futur. Les colonnes `objective`/`weight_kg`/`activity_factor`/`fiber_g` restent
    présentes en base (inertes, non lues/écrites par le frontend).
  - **Legacy TS supprimé** (audit complet, 0 appelant restant vérifié par grep) : `computeTDEE`,
    `computeCalorieTarget`, `GOAL_DELTAS`, `ACTIVITY_LEVELS` retirés de `metabolism.ts` ; calculateur
    "Calculer mes besoins (TDEE)" retiré de `GoalsSheet.tsx` (imports/state/handlers associés
    supprimés) — `GoalsSheet` reste l'éditeur MANUEL calories/macros, distinct de la recommandation
    Cortex. Test de non-régression ajouté (`metabolism.test.ts`) : échoue si ces exports étaient
    réintroduits. `lib/fitness/calorieStrategy.ts` est désormais la SEULE source de vérité pour la
    recommandation calorique.
  - **Migration `20260807090000_calorie_strategy_manual_automatic.sql`** : étend `nutrition_goals`
    (`goal` catégorie stable fat_loss/maintenance/muscle_gain, `target_rate` catégorie stable
    slow/moderate/fast avec CHECK combiné goal+target_rate empêchant les combinaisons invalides —
    ex. muscle_gain+fast interdit —, `calorie_strategy_mode` manual/automatic NOT NULL DEFAULT
    'manual', `last_auto_adjustment_at` timestamptz nullable) ; nouvelle table
    `calorie_goal_adjustments` (historique append-only, RLS `auth.uid()=user_id`, index sur
    `(user_id, created_at DESC)`) ; RPC transactionnelle `apply_calorie_goal_adjustment` (SECURITY
    DEFINER + scoping manuel `auth.uid()`, même convention que `award_reward_event`) qui met à jour
    `nutrition_goals.calories` ET insère l'historique en une seule opération logique — ne touche
    JAMAIS proteins/carbs/fats. Aucune perte de données existantes (`ADD COLUMN IF NOT EXISTS`
    uniquement). Appliquée via Supabase MCP `execute_sql` (évite le mismatch de version d'historique
    de migration). Types régénérés et vérifiés conformes (`check-supabase-types.mjs`, 84 tables).
  - **`lib/fitness/calorieStrategy.ts`** (extension) : `evaluateAutoCalorieAdjustment(input)` — pure,
    déterministe, `now` fourni par l'appelant (jamais `Date.now()` interne). Raisons de refus :
    `manual_mode`/`recommendation_unavailable`/`current_goal_unavailable`/`within_tolerance`/
    `cooldown_active`, sinon `eligible`. `MIN_AUTO_ADJUSTMENT_KCAL=50` (2× le pas d'arrondi 25 kcal —
    nettement au-dessus du bruit d'arrondi). `MAX_AUTO_STEP_KCAL` dépend de l'état de calibration
    Phase 3B : `model_only=50` (le plus prudent — l'utilisateur a activé l'automatique mais Cortex n'a
    encore aucune observation), `calibrating=100`, `adapted=150`. `AUTO_ADJUSTMENT_COOLDOWN_DAYS=7`
    (aligné sur `ADAPTIVE_TDEE_THRESHOLDS.EARLY.MIN_CALENDAR_DAYS` — le plus petit grain temporel que
    le moteur observé distingue du bruit) — ne s'applique qu'aux ajustements AUTOMATIQUES précédents ;
    `lastAutoAdjustmentAt=null` (premier ajustement) n'est jamais bloqué par le cooldown, seulement
    par le plafond d'amplitude. Le proposé se déplace toujours vers la recommandation sans jamais la
    dépasser (`proposed = current + clamp(diff, -maxStep, +maxStep)`, validé sur les deux exemples
    exacts du brief : 2000→2300 step100→2100 ; 2200→1900 step100→2100), puis arrondi à 25 kcal (même
    point de vérité que Phase 4A).
  - **Hooks** (`useNutritionGoals.ts`, réécrit) : `useNutritionGoals()` retourne désormais aussi
    `goal/targetRate/calorieStrategyMode/lastAutoAdjustmentAt` (rétrocompatible, champs ajoutés) ;
    `useUpdateCalorieStrategyPreference` (sauvegarde SEULEMENT la préférence mode/objectif/rythme,
    jamais de calories — upsert partiel, ne touche pas les colonnes non fournies) ; `useApplyCalorieGoal`
    (appelle la RPC transactionnelle, invalide `nutrition_goals` + `calorie_goal_adjustments`) ;
    `useLastCalorieGoalAdjustment` (dernier ajustement, pour l'affichage compact).
  - **`sante-nutritionnelle.tsx`** : sélecteurs objectif/rythme persistent désormais immédiatement
    (plus de state local perdu au rechargement) ; nouveau sélecteur "Mode de gestion" (Manuel/
    Automatique) avec confirmation explicite (§40) à la première activation d'automatique (checklist :
    Cortex peut modifier l'objectif / ajustements plafonnés / espacés / retour manuel possible /
    macros jamais touchées) ; bouton "Appliquer" fonctionnel en mode manuel (désactivé + message
    "déjà aligné" si `differenceKcal===0`) ; bloc "Mode automatique actif" avec message de cooldown
    si applicable ; bloc compact "Dernier ajustement" (`previous → applied kcal`, mode, date) si un
    historique existe. Évaluation automatique via `useEffect` déclenché au chargement de la page
    (jamais un faux scheduler — PWA, voir §32 du brief), protégé contre les écritures répétées par un
    `useRef` (guard synchrone) + le cooldown lui-même (après un ajustement, `lastAutoAdjustmentAt` se
    rafraîchit via l'invalidation React Query, ce qui fait naturellement retomber `eligible` à false
    à la prochaine évaluation).
  - **Tests** (`calorieStrategy.test.ts` +19, `metabolism.test.ts` +1) : mode manuel/automatique,
    recommandation/objectif absents, sous/au-dessus du seuil, cooldown actif/terminé/à la limite/premier
    ajustement (jamais bloqué), amplitude par état de calibration (croissante model_only<calibrating<
    adapted), hausse/baisse/divergence énorme (jamais un saut direct), jamais au-delà de la
    recommandation, arrondi 25 kcal, non-réintroduction du legacy (grep des exports).
  - `npx tsc --noEmit` / `npx eslint` / `npx vitest run` (758 passed) / `npm run build` : tous verts.
    Migration appliquée et vérifiée ; types.ts conforme (84 tables) ; aucun `as any` introduit ; diff
    `types.ts` propre (+70 lignes, nouvelle table + nouvelles colonnes + nouvelle fonction RPC
    uniquement, aucune troncature).
  - **Vérification visuelle mobile NON effectuée** — même limitation d'environnement que Phases 3C/4A
    (`EAFNOSUPPORT` sur bind IPv6 `:::8080`), retestée une troisième fois, non simulée.
  - **Limites connues** : le troisième moteur calorique DB-side (`compute_nutrition_targets`) reste en
    base, inerte mais non supprimé (hors scope, documenté ci-dessus) ; pas de test d'intégration
    Supabase réel de la RPC transactionnelle (logique pure `evaluateAutoCalorieAdjustment` testée
    exhaustivement, mais l'exécution effective de `apply_calorie_goal_adjustment` contre la base n'a
    été vérifiée que par inspection de schéma/contraintes, pas par un appel RPC réel depuis un test) ;
    l'auto-ajustement ne s'évalue qu'au chargement de Santé nutritionnelle (pas d'autre point d'entrée
    pertinent identifié cette phase).
- **Phase 5A — moteur de stratégie des macronutriments (2026-08-01, mergée dans `main` le 2026-08-01,
  SHA de merge `73f8f9f`)** : première recommandation macros
  Cortex-native, déterministe, explicable. Ne modifie JAMAIS `nutrition_goals.proteins/carbs/fats`.
  - **Audit préalable** : re-confirmé `compute_nutrition_targets` (RPC DB découverte en Phase 4B)
    toujours 0 appelant frontend — inerte, non supprimé (hors scope). Découverte : le formulaire
    manuel `GoalsSheet.tsx` a son propre pré-remplissage 35/32/33 % (`computeMacrosFromCalories`) —
    **volontairement conservé** (documenté/renommé en commentaire, pas remplacé) : c'est un "vite
    fait" pour un formulaire d'édition manuelle, pas une recommandation Cortex compétitrice —
    distinction explicite ajoutée en commentaire pour lever toute ambiguïté future, plutôt qu'un
    rewire risqué (poids/objectif non disponibles dans ce petit composant) pour une phase déjà large.
  - **`lib/fitness/macroStrategy.ts`** (logique pure) : `computeMacroStrategy(input)`.
    - **Entrées** : `calories` (objectif ACTIF `nutrition_goals.calories`, jamais une recommandation
      Cortex pas encore appliquée — §2 du brief), `bodyWeightKg`, `goal`. Simuler une autre enveloppe
      = rappeler la même fonction avec un autre `calories` (pas de fonction séparée nécessaire).
    - **Protéines** : g/kg de poids TOTAL par objectif (`fat_loss`=2.2, `muscle_gain`=2.0,
      `maintenance`=1.8 — `PROTEIN_G_PER_KG`), jamais un % des calories (testé explicitement : même
      poids/objectif, calories 2000→2500, protéines identiques). Poids plafonné à
      `BODYWEIGHT_CAP_KG=120` pour ce calcul uniquement (§5 : `body_tracking.body_fat` optionnel/non
      fiable pour tous → le moteur n'en dépend JAMAIS, garde-fou sur le poids total à la place).
    - **Lipides** : cible = max(poids×`FAT_G_PER_KG_MIN`(0.8), calories×`FAT_MIN_PERCENT_OF_CALORIES`
      (20%)/9) — protection à la fois absolue et relative à l'enveloppe.
    - **Glucides** : calories restantes après protéines+lipides / 4, jamais négatif.
    - **Enveloppe contrainte** : priorité protéines > lipides > glucides. Si protéines+lipides
      dépassent l'enveloppe → lipides réduits au maximum compatible, glucides à 0, `limited:true` +
      raison explicite (jamais silencieux). Cas extrême (protéines seules dépassent déjà) → toute
      l'enveloppe en protéines, reste à 0. Testé sur l'exemple exact du brief (1200 kcal, ~200g
      protéines + ~73g lipides visés → jamais de glucides négatifs).
    - **Arrondi** : pas de 5g (`ROUNDING_STEP_G`) sur les 3 macros.
    - **Cohérence énergétique** : `macroCalories` recalculé sur les valeurs ARRONDIES via
      `calculateCaloriesFromMacros` (réutilisé depuis `lib/nutrition/macros.ts` — "seule source de
      vérité" déjà documentée dans ce fichier pour la règle d'Atwater P×4+C×4+L×9, jamais dupliquée).
      Tolérance `CALORIE_TOLERANCE_KCAL=50` : au-delà, UN SEUL nudge des glucides (variable la plus
      flexible) rapproche le total, jamais de boucle, jamais caché (`calorieDifference` toujours
      exposé).
    - **Résultat structuré** : `goal`, `calorieTarget`, `bodyWeightKg`, `proteinsG/fatsG/carbsG`
      (`null` uniquement si non calculable — jamais fabriqué), `proteinTargetGPerKg`/`fatTargetGPerKg`
      (coefficients réellement utilisés, pour l'explicabilité), `macroCalories`, `calorieDifference`,
      `limited`, `limitReasons`.
    - **Préparation des futurs verrous** (§21, PAS implémenté) : pipeline séquentiel
      protéines→lipides→glucides documenté comme conçu pour qu'un futur paramètre `locks` remplace une
      étape calculée par une valeur imposée, sans réécrire la logique.
    - `compareMacros(current, recommended)` : fonction pure séparée, `differenceG = recommended −
      current` par macro (`null` si l'un des deux manque) — prépare un futur bouton "Appliquer" sans
      jamais écrire en base cette phase (aucun mode manual/automatic touché, règle absolue Phase 5A).
  - **`sante-nutritionnelle.tsx`** : nouvelle section "Répartition recommandée" (carte compacte
    calories actives → P/G/L, comparaison actuel→recommandé par macro, explication courte, raisons de
    contrainte si `limited`) — read-only, aucun bouton "Appliquer" fonctionnel pour les macros (hors
    scope 5A). Se recalcule automatiquement si l'objectif calorique actif change (dépend directement
    de `nutritionGoals.calories`), sans écriture automatique des macros.
  - **Tests** (`macroStrategy.test.ts`, 37 tests) : protéines (par objectif, par poids, stabilité vs
    calories, plafond poids élevé, poids faible, invalide), lipides (plancher, poids/objectifs variés,
    enveloppe confortable/contrainte), glucides (calcul du restant, jamais négatif, enveloppes
    extrêmes, arrondi), enveloppe impossible (exemple exact du brief + cas extrême), cohérence
    calorique + tolérance, changement de calories à poids/objectif fixes, comparaison (4 cas),
    robustesse (NaN/Infinity/négatif/nul/objectif invalide/enveloppes extrêmes), autonomie
    Cortex-native, simulation d'une autre enveloppe.
  - `npx tsc --noEmit` / `npx eslint` / `npx vitest run` (795 passed) / `npm run build` : tous verts.
  - **Vérification visuelle mobile NON effectuée** — même limitation d'environnement que les phases
    précédentes (`EAFNOSUPPORT` sur bind IPv6 `:::8080`), retestée une 4e fois, non simulée.
  - **Limites connues** : coefficients g/kg raisonnés mais non individualisés (pas de body fat/masse
    maigre par design, §5) ; le pré-remplissage 35/32/33 % de `GoalsSheet` reste un doublon fonctionnel
    mineur assumé (documenté, pas un moteur de recommandation) ; pas encore de verrous macros ni
    d'écriture automatique (Phase 5B).
- **Phase 5B — application des macros, automatisation et verrous individuels (2026-08-01, branche
  `claude/phase5b-macro-application-locks`, NON mergée dans `main`)** : rend la recommandation Phase 5A
  réellement applicable (bouton "Appliquer" + mode automatique), avec verrous individuels par macro et
  atomicité calories+macros.
  - **Audit préalable** : `nutrition_goals`/`calorie_strategy_mode`/`apply_calorie_goal_adjustment`/
    `calorie_goal_adjustments`/`macroStrategy.ts`/`GoalsSheet`/`useNutritionGoals` relus ; confirmé
    `compute_nutrition_targets` (RPC DB legacy) toujours DROP (migration 20260619080840), jamais
    réactivé ; `computeMacrosFromCalories` (pré-remplissage 35/32/33 % de `GoalsSheet`) laissé tel
    quel — rôle distinct déjà documenté en Phase 5A, toujours pas une recommandation concurrente.
  - **Migration `20260808090000_macro_strategy_locks_and_history.sql`** : étend `nutrition_goals`
    avec `macro_strategy_mode` (manual/automatic, NOT NULL DEFAULT 'manual' — préférence INDÉPENDANTE
    de `calorie_strategy_mode`, jamais activée automatiquement par la migration), `protein_locked`/
    `carbs_locked`/`fat_locked` (boolean NOT NULL DEFAULT false — un verrou ne stocke PAS de valeur
    dédiée, c'est la valeur ACTIVE `nutrition_goals.proteins/carbs/fats` au moment de l'activation qui
    fait foi). Nouvelle table `macro_goal_adjustments` (historique dédié — sens temporel distinct de
    `calorie_goal_adjustments`, RLS `auth.uid() = user_id`, index `(user_id, created_at DESC)`).
    Nouvelle RPC `apply_macro_goal_adjustment` (macros SEULES, ne touche jamais `calories`).
    `apply_calorie_goal_adjustment` (Phase 4B) étendue avec 10 paramètres macros optionnels (tous
    `DEFAULT NULL`, rétrocompatibles) : lorsque les trois `_applied_proteins/carbs/fats` sont fournis,
    met AUSSI à jour les macros et journalise `macro_goal_adjustments` dans la MÊME transaction — seul
    moyen d'éviter l'état durable "calories mises à jour, macros encore alignées sur l'ancien objectif"
    quand Calories automatique ET Macros automatique se déclenchent ensemble (§22 du brief). Comme
    `CREATE OR REPLACE FUNCTION` ne remplace réellement une fonction que si la liste de TYPES de
    paramètres est identique, l'ancienne signature à 8 paramètres a été explicitement `DROP FUNCTION`
    avant recréation (sinon un second overload ambigu aurait coexisté). Appliquée via `execute_sql`
    MCP (même méthode que Phases 3C/4A/4B). Vérifié post-migration : 86 tables (85 + `macro_goal_
    adjustments`), un seul overload `apply_calorie_goal_adjustment` à 18 paramètres (pas d'ambiguïté),
    toutes les colonnes attendues présentes sur `nutrition_goals`. `types.ts` régénéré — diff propre
    (+102 lignes, additions uniquement, `git diff --stat` sans suppression).
  - **`lib/fitness/macroStrategy.ts`** — verrous ajoutés à `computeMacroStrategy` (Phase 5A conservée
    intacte : le chemin SANS verrou reste le code original inchangé, `computeMacroStrategyLocked`
    n'est appelé que si ≥1 verrou actif — garantit zéro régression, vérifié par un test qui compare
    bit-à-bit un appel sans verrou vs avec `locked*: null`).
    - Pipeline verrous : calories réservées par les macros verrouillées (`lockedCalories`) ; si les
      trois sont verrouillées → `allMacrosLocked:true`, valeurs retournées telles quelles, jamais
      recalculées (juste signalé si incohérent avec l'enveloppe) ; si `lockedCalories > calorieTarget`
      → `locksIncompatible:true`, verrous JAMAIS réduits, macros non verrouillées à 0, `limited:true`
      + raison explicite ; sinon pipeline protéines→lipides→glucides Phase 5A généralisé sur le budget
      restant (`calorieTarget - lockedCalories`), chaque étape verrouillée consommant 0 budget
      supplémentaire (déjà réservée). Nudge de tolérance final n'ajuste jamais des glucides verrouillés
      (signale l'impossibilité plutôt que de casser le verrou).
    - Nouveaux champs `MacroStrategyResult.allMacrosLocked`/`locksIncompatible` (booléens structurés,
      pas de string-matching côté appelant).
    - `evaluateAutoMacroAdjustment` (mode automatique) : **aucun cooldown** (décision volontaire,
      §26 — le cooldown calorique de 7 jours protège une DÉCISION, les macros n'en sont qu'une
      CONSÉQUENCE ; si les calories changent aujourd'hui, les macros se réalignent aujourd'hui).
      Éligibilité bloquée si `all_macros_locked`/`locks_incompatible`/déjà aligné (comparaison
      arrondie au gramme, §27 — aucune écriture pour un écart nul) ; sinon `eligible:true` avec les
      valeurs recommandées (déjà verrou-conscientes) à proposer.
  - **Migration & atomicité calories+macros côté page** (`sante-nutritionnelle.tsx`) : deux `useEffect`
    séparés + deux `useRef` (`autoAppliedRef` existant, nouveau `autoMacroAppliedRef`) implémentent les
    4 combinaisons indépendantes manuel/automatique × calories/macros :
    - **Calories auto + Macros auto** : UN SEUL appel `applyCalorieGoal.mutate` avec les 10 champs
      macros optionnels renseignés (calculés à la calorie PROPOSÉE, pas l'actuelle) → une seule RPC
      transactionnelle, jamais de fenêtre intermédiaire "calories neuves, macros anciennes". Le second
      `useEffect` (macros seules) est explicitement empêché de se redéclencher (`autoMacroAppliedRef`
      posé dans le premier effet dans ce cas).
    - **Calories auto + Macros manuel** : uniquement l'effet calories se déclenche (macroAuto=false car
      `macroStrategyMode!=='automatic'`) — macros jamais touchées automatiquement, UI affiche l'écart.
    - **Calories manuel + Macros auto** : uniquement l'effet macros (RPC `apply_macro_goal_adjustment`,
      ne touche jamais `calories`) — se déclenche indépendamment du mode calorique.
    - **Calories manuel + Macros manuel** : aucun effet ne se déclenche, boutons "Appliquer" manuels
      des deux sections gouvernent tout.
  - **UI** : section "Répartition recommandée" étendue avec sélecteur Manuel/Automatique dédié aux
    macros (dialogue de confirmation à la première activation, texte explicite sur les verrous jamais
    cassés et l'absence de délai artificiel), icône verrou/déverrou par macro (bascule
    `useUpdateMacroStrategyPreference`, verrouille la valeur ACTIVE affichée), bouton "Appliquer"
    manuel (masqué si déjà aligné ou si `allMacrosLocked`), message dédié si `locksIncompatible`,
    bloc "Dernier ajustement macros" compact (P/G/L avant→après, mode, date).
  - **Tests** (`macroStrategy.test.ts`, +27 → 64 tests au total) : non-régression stricte (0 verrou ≡
    Phase 5A via `toEqual`), verrou unique ×3, verrous combinés ×3 (P+G, P+L, G+L), 3 verrous (aligné
    et incohérent), locks compatibles/incompatibles (exemples exacts §14/§15 du brief : 1800/1500 kcal,
    P🔒200g+L🔒100g), valeur verrouillée à 0g, valeur verrouillée invalide (négatif/NaN/Infinity →
    traitée comme non verrouillée), exemples exacts §11/§38 (protéines verrouillées stables après
    hausse calorique 2000→2200), jamais négatif, cohérence énergétique. `evaluateAutoMacroAdjustment` :
    mode manuel, recommandation indisponible, tous verrous, locks incompatibles, déjà aligné, écart
    réel éligible, verrous individuels + hausse calorique (protéines/glucides+lipides strictement
    stables dans la proposition), indépendance vis-à-vis de `calorie_strategy_mode` (absent de l'input
    par construction).
  - `npx tsc --noEmit` / `npx eslint` (fichiers modifiés) / `npx vitest run` (822 passed) / `npm run
    build` : tous verts. `node scripts/validate-supabase.mjs` : migrations idempotentes, aucun
    problème. Aucun `as any` introduit (grep vérifié sur tous les fichiers modifiés).
  - **Vérification visuelle mobile PARTIELLE** — fait exceptionnel cette phase : `vite dev --host
    127.0.0.1 --port 8080` a démarré avec succès dans ce sandbox (contrairement aux 4 phases
    précédentes, `EAFNOSUPPORT` non reproduit cette fois). Playwright (Chromium pré-installé) a pu
    charger l'app sans crash JS lié à cette phase, mais la route `/sante-nutritionnelle` étant protégée
    par authentification, la navigation redirige vers `/login` sans session Supabase disponible dans ce
    sandbox — l'écran réel avec la nouvelle UI verrous/mode macros n'a **pas** pu être capturé
    visuellement. Un warning d'hydratation React est apparu sur `/login`, mais il concerne
    exclusivement `AppShell`/`loading-screen.tsx` (pré-existant, sans rapport avec les fichiers touchés
    cette phase).
  - **Limites connues** : pas de test d'intégration Supabase réel de bout en bout de la RPC
    transactionnelle combinée calories+macros (logique pure testée exhaustivement côté
    `macroStrategy.ts`, mais l'exécution effective d'`apply_calorie_goal_adjustment` avec les 10
    paramètres macros optionnels n'a été vérifiée que par inspection de schéma après application, pas
    par un appel RPC réel depuis un test) ; les verrous s'évaluent seulement au chargement/re-render de
    Santé nutritionnelle (mêmes points d'entrée que Phase 4B, pas de nouveau déclencheur ajouté) ;
    UI verrous/mode macros non vérifiée visuellement (authentification requise, voir ci-dessus).
  - Phase 5B mergée dans `main` le 2026-08-01, SHA de merge `65e1e58`. CI complète verte (Typecheck,
    Supabase Migrations, Supabase Types Sync, RLS Regression Tests, Audit Git↔Supabase Drift, Meal
    Slugs Sync Check, Supabase project ref). Test authentifié de la RPC combinée
    `apply_calorie_goal_adjustment` (Calories Auto + Macros Auto) tenté en toute sécurité via une
    transaction SQL `BEGIN...ROLLBACK` (jamais commit) avant Phase 6A : **bloqué par un bug
    pré-existant, sans rapport avec cette phase** — le trigger `on_auth_user_created_home_categories`
    sur `auth.users` référence encore `public.home_categories`, une table supprimée (migration
    `20260619080840_drop_health_data_imports.sql`-adjacente ou postérieure) — toute insertion de test
    dans `auth.users` échoue avec `relation "public.home_categories" does not exist`, et le rôle
    utilisé par le MCP Supabase n'a pas les droits pour désactiver ce trigger (`must be owner of table
    users`). **⚠️ Ce bug casserait potentiellement TOUT nouveau signup utilisateur réel en
    production** — hors scope Phase 5B/6A (élargissement de scope non autorisé), signalé explicitement
    ici pour action séparée. Le reste de la vérification RPC (schéma, contraintes, `DROP FUNCTION`
    propre de l'ancienne signature à 8 paramètres, absence d'overload ambigu) a été fait par inspection
    statique — logique jugée correcte mais jamais exécutée par un appel authentifié réel.
- **Correctif critique — signup cassé (2026-08-01, branche `claude/fix-signup-home-categories-trigger`,
  migration `20260810090000_fix_signup_broken_home_categories_trigger.sql`, mergé dans `main` SHA
  `ef54adf`)** : tout nouveau signup échouait en production.
  - **Cause exacte** : le trigger `on_auth_user_created_home_categories` sur `auth.users` (AFTER
    INSERT) appelle `public.seed_default_home_categories()`, qui appelle
    `public._seed_home_categories_for_user(uuid)`, laquelle `INSERT INTO public.home_categories` —
    table supprimée par `20260714145745_ae103805-61da-4ed3-8d66-58d07c94cdf4.sql` (nettoyage de
    l'ancienne fonctionnalité "Home" : `items`, `home_subcategories`, `home_categories`). Cette
    migration a supprimé les tables + `ensure_home_categories_for_me()` mais a OUBLIÉ le trigger et ses
    deux fonctions — laissées orphelines, cassant tout `INSERT INTO auth.users` avec
    `relation "public.home_categories" does not exist`.
  - **Audit** : `home_categories`/`home_subcategories`/`items` confirmés absents en base (`information_
    schema.tables`). `_seed_home_categories_for_user` n'a qu'un seul appelant
    (`seed_default_home_categories`), lui-même appelé uniquement par ce trigger — chaîne isolée, aucune
    autre fonction/trigger/frontend n'y fait référence (grep `src/` : uniquement l'artefact généré dans
    `types.ts`, pas un appelant réel). **Classification : A — totalement obsolète**, aucune architecture
    de remplacement. Les DEUX triggers de `auth.users` ont été audités : `on_auth_user_created` (→
    `handle_new_user`, écrit dans `public.profiles`, table existante et saine) laissé strictement
    intact — aucun autre bug de ce type détecté sur `auth.users`.
  - **Correction** : `DROP TRIGGER on_auth_user_created_home_categories` + `DROP FUNCTION
    seed_default_home_categories()` + `DROP FUNCTION _seed_home_categories_for_user(uuid)` — solution
    minimale, aucune donnée perdue (aucune table de données touchée, uniquement du code mort).
  - **Test signup réel (transaction `BEGIN...ROLLBACK`, jamais commit)** : `INSERT INTO auth.users`
    isolé → `handle_new_user` se déclenche correctement, `public.profiles` reçoit la ligne attendue
    (id/email/full_name/role par défaut) — confirmé par `SELECT` avant tout changement de rôle simulé.
    (Une vérification ultérieure sous rôle `authenticated` simulé montrait `profile_created: 0` — pas
    un nouveau bug, juste RLS sur `profiles` bloquant ce rôle simulé pour ce SELECT diagnostique,
    sans rapport avec la création réelle déjà prouvée en amont.)
  - **Retest RPC combinée Phase 5B** (`apply_calorie_goal_adjustment`, Calories Auto + Macros Auto,
    transaction rollbackée) : **succès complet** — `nutrition_goals` (calories 2000→2100,
    proteins/carbs/fats 150/200/65→160/220/65, `last_auto_adjustment_at` renseigné),
    `calorie_goal_adjustments` (previous_calories=2000, applied_calories=2100),
    `macro_goal_adjustments` (previous/applied cohérents) — tout écrit atomiquement dans le même appel
    RPC, confirmé par `ROLLBACK` sans effet persistant. La limitation documentée en Phase 5B est levée.
  - `npx tsc`/`eslint`/`vitest` (822 passed, baseline pré-6A)/`build` : tous verts.
    `validate-supabase.mjs` : idempotent OK. CI complète verte sur `main` (7/7 : Typecheck, Supabase
    Migrations, Supabase Types Sync, RLS Regression Tests, Audit Git↔Supabase Drift, Meal Slugs Sync
    Check, Supabase project ref). **Note technique** : entre ce merge et celui de Phase 6A, un job CI
    (`ci: auto-corrige la dérive types.ts après migration`) a détecté et rattaché à `main` les colonnes
    `body_fat_method`/`body_fat_min_percent`/`body_fat_max_percent` en avance sur leur migration —
    conséquence de la restauration temporaire de ces colonnes en base avant de fusionner Phase 6A juste
    après (même migration, donc résolu par ce merge lui-même, jamais une incohérence durable).
- **Phase 6A — fondation composition corporelle (2026-08-01, branche `claude/phase6a-body-fat-foundation`,
  NON mergée dans `main`)** : Body Fat avec provenance/confiance + masse grasse/masse maigre dérivées.
  - **Déviation consciente vs. le brief reçu** : le brief supposait une section "Corps" DANS
    `sante-nutritionnelle.tsx` ("Profil → Santé nutritionnelle → section Corps"). Audit : ce n'est plus
    la structure réelle depuis la refonte nav de juin 2026 — `/corps` est un onglet top-level séparé
    (`CorpsTab.tsx`), sibling de `/sante-nutritionnelle` et `/nutrition`, pas une sous-section de
    celle-ci. Décision : intégrer dans le VRAI emplacement existant (`/corps`) plutôt que de forcer un
    emplacement obsolète — respecte l'intention explicite ("pas de nouvelle entrée de navigation",
    "réutiliser l'existant") mieux qu'une correspondance littérale avec un texte de brief écrit avant
    la refonte nav. Pas un "conflit fonctionnel ambigu" bloquant : l'intention était claire, seul le
    chemin précis était stale.
  - **Audit préalable (déterminant)** : `body_tracking` est DÉJÀ la table "mesure corporelle datée"
    (weight/body_fat/muscle_mass/mensurations sur la MÊME ligne, RLS `auth.uid()=user_id` déjà
    correcte, hooks CRUD déjà génériques `useAddBodyMeasurement`/`useUpdateBodyMeasurement`/
    `useDeleteBodyMeasurement` via `TablesInsert`/`TablesUpdate` — aucun changement de hook nécessaire,
    les nouvelles colonnes nullable traversent automatiquement). `body_fat`/`muscle_mass` ne sont PAS
    des colonnes mortes : déjà lues/écrites par `CorpsTab.tsx` (`BodyMeasurementSheet`,
    `QuickMeasurementSheet`), `BodyHistorySheet.tsx` (édition), `lib/fitness/body.ts#computeFormScore`,
    `lib/fitness/analysis/profile.ts` (inférence d'objectif), et le pipeline de dépôt de documents
    (`20260723160000_document_deposit_pipeline.sql`). `compute_nutrition_targets` reste inerte
    (hors scope, déjà documenté). **Décision : ÉTENDRE `body_tracking`, PAS de nouvelle table** (§2 du
    brief) — le "snapshot poids↔BF" (§12/§13) est déjà résolu structurellement puisque `weight` et
    `body_fat` sont sur la MÊME ligne : aucune colonne `weight_kg_at_measurement` nécessaire, une ligne
    avec `body_fat` renseigné mais `weight` NULL donne simplement des masses indisponibles (§33),
    jamais un poids fabriqué depuis une autre date.
  - **Migration `20260809090000_body_composition_foundation.sql`** : `body_tracking` +
    `body_fat_method` (text nullable, CHECK IN manual/dexa/bioimpedance/measurements/photo_estimate),
    `body_fat_min_percent`/`body_fat_max_percent` (double precision nullable, mêmes bornes 1-70 que le
    CHECK existant `body_tracking_body_fat_check`, CHECK min≤max). **La CONFIANCE n'est PAS stockée**
    — mapping centralisé côté TS (`BODY_FAT_METHOD_CONFIDENCE`), jamais figée en base pour rester
    ajustable sans migration (§8 du brief). RLS déjà correcte, s'applique automatiquement aux nouvelles
    colonnes. Appliquée via `execute_sql` MCP. Vérifié : 86 tables (inchangé, confirmant qu'aucune
    nouvelle table n'a été créée), colonnes présentes. `types.ts` régénéré, diff propre (+9 lignes,
    additions uniquement).
  - **`lib/fitness/bodyComposition.ts`** (nouveau, logique pure) :
    - `BODY_FAT_METHODS` (5 méthodes) / `BODY_FAT_DIRECT_ENTRY_METHODS` (3 saisissables en 6A :
      manual/dexa/bioimpedance — measurements/photo_estimate préparées dans le schéma et le mapping,
      sans moteur actif ni UI, §4 du brief).
    - `BODY_FAT_METHOD_CONFIDENCE` : mapping centralisé dexa→high, bioimpedance/measurements→medium,
      photo_estimate/manual→low. `manual` délibérément bas (Cortex ignore la vraie provenance du
      chiffre saisi, §8 — jamais une confiance élevée par défaut). `getBodyFatConfidence(method)`
      gère `method:null` (mesure historique) → `low`, jamais devinée à la hausse.
    - `computeFatMass(weightKg, bodyFatPercent)` = weight×BF/100 ; `computeLeanMass` = weight−fatMass.
      **`leanMassKg` explicitement documenté comme n'étant PAS `muscleMassKg`** (§11) — jamais
      labellisé "Masse musculaire" côté UI à partir de ce calcul.
    - `computeBodyCompositionSnapshot(measurement)` : enrichit une mesure brute (poids/BF/méthode)
      avec confiance + masses dérivées, à LA LECTURE (rien stocké, §14). `null` honnête partout si
      donnée insuffisante — jamais 0 fabriqué.
    - `areBodyFatMethodsComparable(a,b)` : `true` UNIQUEMENT si méthodes identiques ET connues (deux
      `null` ⇒ non comparable — provenance inconnue des deux côtés n'implique pas une comparaison
      fiable). `computeBodyCompositionTrend(rows)` : compare les deux mesures les plus RÉCENTES avec
      BF renseigné ; si méthodes différentes → `comparable:false` + raison explicite, jamais une
      tendance présentée comme fiable entre DEXA et impédancemètre (§18/§19). Historique brut
      uniquement — aucun lissage (§20, volontairement reporté).
    - `bodyFatRangeMidpoint` préparé pour les estimations par intervalle (Phases 6B/6C), non utilisé
      dans l'UI 6A (§5/§34 : ne pas complexifier si non nécessaire, mais ne pas bloquer l'évolution).
  - **UI (`CorpsTab.tsx`)** : nouvelle carte "Composition corporelle" (poids, MG %, masse grasse
    estimée en kg, masse maigre en kg, méthode + confiance affichées sous la valeur) insérée après le
    Score forme existant. État vide explicite ("Composition corporelle non renseignée" + CTA), jamais
    un `0 %` fabriqué (§32). Sélecteur de méthode (pills Manuel/DEXA/Impédancemètre) ajouté au
    formulaire complet ET au `QuickMeasurementSheet` dédié au Body Fat, avec préremplissage du poids
    depuis la dernière pesée connue (visible, éditable — §27, jamais une resaisie forcée ni une valeur
    cachée). `BodyHistorySheet.tsx` : méthode affichée par entrée dans l'historique + éditable dans le
    formulaire de modification. Modification/suppression déjà supportées nativement (hooks génériques
    existants, §30 satisfait sans changement).
  - **Confirmation §37/§38/§39** : `macroStrategy.ts`/`calorieStrategy.ts`/`tdee.ts`/`neat.ts`/
    `metabolism.ts` non touchés cette phase (seule référence à `body_fat` dans ces fichiers = le
    commentaire Phase 5A pré-existant expliquant pourquoi `macroStrategy.ts` l'ignore délibérément).
    Aucune écriture automatique de `nutrition_goals.calories/proteins/carbs/fats` déclenchée par une
    mesure Body Fat.
  - **Préparation 6B/6C** : `body_fat_min_percent`/`body_fat_max_percent` + méthodes
    `measurements`/`photo_estimate` déjà dans le modèle (schéma + mapping confiance + labels) sans
    formule ni analyse implémentée — les futures phases n'auront qu'à brancher un moteur, jamais de
    migration supplémentaire pour la provenance elle-même.
  - **Tests** (`bodyComposition.test.ts`, 36 tests) : calculs de base (80kg/20%→16kg/64kg, décimales,
    poids/BF faibles/élevés, invalides/NaN/Infinity/négatifs), bornes 1-70, midpoint d'intervalle,
    mapping confiance (aucun pourcentage inventé, toutes méthodes couvertes), validation méthode,
    snapshot (BF+poids, BF sans poids → masses indisponibles, sans BF, intervalle, méthode inconnue),
    comparabilité (même méthode/méthodes différentes/inconnues), tendance (aucune mesure, une seule,
    plusieurs même méthode, méthodes différentes signalées, ordre chronologique avec lignes sans BF
    ignorées, poids manquant sur une mesure). 858 tests au total (858 = 822 + 36).
  - `npx tsc --noEmit` / `npx eslint` (fichiers modifiés) / `npx vitest run` (858 passed) / `npm run
    build` : tous verts. `node scripts/validate-supabase.mjs` : migrations idempotentes OK. Aucun
    `as any` introduit.
  - **Vérification visuelle mobile NON effectuée** — `vite dev` a de nouveau démarré avec succès dans
    ce sandbox, mais `/corps` étant protégée par authentification, la navigation redirige vers
    `/login` sans session Supabase disponible ; l'écran réel avec la nouvelle carte "Composition
    corporelle" n'a pas pu être capturé. Même warning d'hydratation pré-existant sur `/login`
    (`AppShell`/`loading-screen.tsx`), sans rapport avec les fichiers de cette phase.
  - **Limites connues** : le bug pré-existant `on_auth_user_created_home_categories` (voir note Phase
    5B ci-dessus) casse toute création d'utilisateur de test — signalé, non corrigé (hors scope) ;
    "Masse gr." dans les Stat cards existantes de `CorpsTab.tsx` affiche en réalité `muscle_mass` avec
    un libellé trompeur ("Masse grasse" au clic) — bug PRÉ-EXISTANT, non lié à cette phase, non corrigé
    (scope creep évité), signalé ici pour visibilité ; UI composition corporelle non vérifiée
    visuellement (authentification requise) ; pas de lissage/estimation robuste du Body Fat (assumé,
    §20) ; pas de normalisation inter-méthodes (assumé, §18/§19, préparé architecturalement).
  - Fusionnée dans `main` le 2026-08-01, SHA de merge `4232871`, après synchronisation avec le
    correctif signup (`ef54adf`) via un merge de `origin/main` dans la branche (conflit `MEMORY.md`
    résolu manuellement — sections concaténées dans l'ordre chronologique, `types.ts` auto-mergé
    proprement par git). CI complète verte (Typecheck, Supabase Migrations, RLS Regression Tests,
    Audit Git↔Supabase Drift, Supabase project ref, Meal Slugs Sync Check — Types Sync non re-déclenché
    sur ce commit précis, déjà validé sur le commit parent identique en contenu).
- **Phase 6B — estimation Body Fat par mensurations (2026-08-01, branche
  `claude/phase6b-body-fat-measurements`, NON mergée dans `main`)** : première méthode indirecte
  (`measurements`) rendue réellement utilisable, au-dessus de la fondation Phase 6A.
  - **Audit préalable** : `body_tracking` a déjà `waist`/`hips` (pré-6A) et `body_fat`/`body_fat_
    method`/`body_fat_min_percent`/`body_fat_max_percent` (Phase 6A) — il manquait uniquement `neck`
    (obligatoire pour la méthode Navy) et de quoi conserver la provenance EXACTE d'une estimation
    (formule + snapshot taille/sexe). `metabolic_profile.sex` (`"homme"|"femme"`, `lib/fitness/
    metabolism.ts#BiologicalSex`) et `user_preferences.height_cm` déjà disponibles et réutilisés tels
    quels (`useMetabolicProfile()`/`useUserPreferences()`) — aucune resaisie demandée à l'utilisateur.
    Aucune contrainte `UNIQUE(user_id, date)` sur `body_tracking` (seule la PK sur `id`) : plusieurs
    mesures/jour déjà supportées structurellement, donc une estimation par mensurations crée
    naturellement sa PROPRE ligne sans jamais écraser une mesure DEXA/bio-impédance du même jour (§15
    du brief) — aucun mécanisme supplémentaire nécessaire, `useAddBodyMeasurement` (INSERT simple,
    jamais un upsert par date) suffisait déjà.
  - **Formule retenue et documentée** : U.S. Navy Circumference Method (Hodgdon, J.A., & Beckett, M.B.,
    1984, Naval Health Research Center — rapports 84-11 hommes / 84-29 femmes, codifiée depuis dans les
    standards de composition corporelle de l'armée américaine, AR 600-9). Formule EXACTE (calibrée en
    POUCES — conversion cm→inches explicite en interne, jamais les coefficients appliqués directement
    à des centimètres, §3 du brief) :
    - Homme : `495 / (1.0324 − 0.19077·log10(waist_in − neck_in) + 0.15456·log10(height_in)) − 450`
    - Femme : `495 / (1.29579 − 0.35004·log10(waist_in + hip_in − neck_in) + 0.221·log10(height_in)) − 450`
    - Mensurations requises : taille + tour de taille + tour de cou (homme) ; + tour de hanches
      (femme) — jamais une donnée demandée sans nécessité pour le calcul (§4/§18 du brief).
  - **Migration `20260811090000_body_fat_measurements_formula.sql`** : `body_tracking` + `neck`
    (double precision, CHECK 15-60 cm), `body_fat_formula` (text, CHECK IN `('navy_v1')` — identifiant
    STABLE distinct de `body_fat_method='measurements'`, §8 du brief : jamais perdre la formule exacte
    derrière la seule catégorie), `body_fat_height_cm`/`body_fat_sex` (snapshot de la taille/sexe
    RÉELLEMENT utilisés pour CETTE estimation — jamais recalculés avec un profil futur modifié, §7/§28
    du brief). RLS déjà correcte, s'applique automatiquement. Appliquée via `execute_sql` MCP. Vérifié
    post-migration : 86 tables (inchangé, aucune nouvelle table). `types.ts` régénéré, diff propre
    (+12 lignes, additions uniquement).
  - **`lib/fitness/bodyFatMeasurements.ts`** (nouveau, logique pure) : `estimateBodyFatFromMeasurements`
    — validation en 2 temps (données manquantes → `missing_data` ; géométrie invalide `waist ≤ neck`
    (homme) ou `waist+hip ≤ neck` (femme) → `invalid_measurements`, JAMAIS un NaN silencieux, §10 du
    brief) puis calcul + arrondi centralisé à 1 décimale (§12) + vérification finale que le résultat
    reste dans la plage plausible existante (`isValidBodyFatPercent`, 1-70 %, réutilisée depuis Phase
    6A — pas une seconde définition). `confidence` réutilise EXCLUSIVEMENT `getBodyFatConfidence(
    "measurements")` du mapping centralisé Phase 6A (`medium`) — aucun second système créé (§13).
    `computeFatMass`/`computeLeanMass` de Phase 6A réutilisées telles quelles pour la prévisualisation
    (§23) — masse maigre toujours distincte de masse musculaire (§24, règle inchangée).
  - **UI** : nouveau composant `EstimateBodyFatSheet.tsx`, déclenché depuis la carte "Composition
    corporelle" existante de `/corps` (état vide ET état rempli, §17 du brief) — pas de nouvelle page.
    Affiche taille/sexe "déjà connus" en lecture seule ; si l'un des deux manque, bloque avec un
    message explicite renvoyant au profil métabolique (pas de mini-formulaire dupliqué). Champs
    dynamiques selon le sexe (§18 : tour de hanches affiché uniquement pour "femme"), instructions de
    mesure courtes et spécifiques à la méthode Navy pour chaque tour (§21), poids préremplis depuis la
    dernière pesée connue (visible/éditable, même pattern que Phase 6A). Preview live avant
    enregistrement (Body Fat ≈ X %, méthode, confiance, masse grasse/maigre si poids disponible, §19),
    explication courte sans jargon (§20). Bouton "Enregistrer" désactivé tant que `status !== "ok"`.
  - **Confirmation §32** : aucune écriture automatique de `nutrition_goals`/aucune modification de
    `macroStrategy.ts`/`calorieStrategy.ts`/`tdee.ts`/`neat.ts`/`metabolism.ts` cette phase (`git diff
    --stat origin/main` sur ces fichiers : vide, confirmé).
  - **Tests** (`bodyFatMeasurements.test.ts`, 25 tests) : formule homme (cas nominal calculé et
    vérifié à la main avec `toBeCloseTo`, décimales, conversion d'unités croisée cm↔inches explicite,
    waist proche de neck, waist≤neck invalide, NaN/Infinity/négatif/zéro), formule femme (cas nominal,
    décimales, hanches manquantes, géométrie invalide, valeurs invalides), invariants (§27 : hausse
    taille→BF↑, hausse cou→BF↓, hausse taille corporelle→BF↓, hausse hanches (femme)→BF↑), données
    manquantes (sexe/taille/taille-tour/cou absents), précision (toujours 1 décimale), méthode/
    confiance (reprend le mapping centralisé, jamais un second système). 883 tests au total (858+25).
  - `npx tsc --noEmit` / `npx eslint` (fichiers modifiés) / `npx vitest run` (883 passed) / `npm run
    build` : tous verts. `node scripts/validate-supabase.mjs` : migrations idempotentes OK. Aucun
    `as any` introduit.
  - **Vérification visuelle mobile NON effectuée** — `vite dev` a redémarré avec succès, mais `/corps`
    étant protégée par authentification, la navigation redirige vers `/login` sans session Supabase
    disponible dans ce sandbox ; aucune erreur JS liée à cette phase détectée (hors le warning
    d'hydratation pré-existant sur `/login`, sans rapport).
  - **Limites connues** : le tour de cou n'est saisissable QUE via la nouvelle sheet d'estimation, pas
    via le formulaire de mensurations principal ni `BodyHistorySheet` (hors scope explicite de ce
    brief, qui ne demandait que le flux d'estimation — pourrait être ajouté en historique/édition dans
    une phase future si souhaité) ; pas de normalisation entre `measurements` et les autres méthodes
    (assumé, hérité de Phase 6A) ; aucune donnée de test réelle (mensurations physiques) disponible
    pour valider empiriquement la formule contre une DEXA réelle — seule la cohérence mathématique de
    l'implémentation vs. la formule publiée a été vérifiée.

## Estimation Body Fat par photos — Phase 6C (2026-08-12, même session)
- **Phase 6B mergée dans `main`** avant ce travail (merge + CI vérifiée verte : migration appliquée,
  colonnes/types conformes, RLS intacte, aucun `as any`) — condition préalable du brief remplie avant
  toute ouverture de Phase 6C.
- **Audit préalable obligatoire (§14 du brief, condition d'arrêt spéciale)** : avant d'écrire la moindre
  ligne d'estimation, audit dédié de l'architecture photo existante ET du moteur de vision disponible.
  Résultat : Gemini 2.5 Flash (+ GPT-4o `OPENAI_API_KEY` en fallback) est DÉJÀ en production pour
  l'analyse d'image via `scan-meal`/`analyze-pdf` (endpoint OpenAI-compatible
  `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, `GEMINI_API_KEY`, image
  passée en `data:{mime};base64,{b64}`, `tool_choice` forcé pour un JSON strict). Décision : RÉUTILISER
  ce pattern exact (même provider, même modèle, même style d'appel) — aucun nouveau fournisseur externe
  ajouté, donc aucune décision d'architecture/confidentialité nouvelle à faire valider. Si ce moteur
  n'avait pas existé, la phase se serait arrêtée à l'architecture seule (upload/modèle/UI/contrat/tests)
  sans jamais brancher un fournisseur non approuvé — conformément à l'instruction explicite du brief.
- **Bucket Storage dédié `body-composition-photos`** (migration `20260812090000_body_fat_photo_
  estimation.sql`) : **privé** (`public = false`), limite 10 Mo, `allowed_mime_types = ARRAY['image/
  jpeg']` uniquement. 4 policies RLS Storage (`select`/`insert`/`update`/`delete`, `TO authenticated`),
  prédicat `bucket_id = 'body-composition-photos' AND auth.uid()::text = (storage.foldername(name))[1]`
  — convention de chemin `{user_id}/{analysis_id}/{vue}.jpg`, segment[1] = propriétaire, vérifié
  manuellement pour éviter le bug historique connu de `exercise-images` (segment décalé → 403 silencieux
  après coup). Aucune URL publique, aucun chemin prévisible permettant de contourner la RLS.
- **Table `body_photo_analyses`** (nouvelle) : `id`, `user_id` (FK CASCADE), `body_tracking_id` (FK
  CASCADE, NOT NULL — une analyse photo est toujours rattachée à UNE mesure `body_tracking`), `status`
  (CHECK `'success'`), `front_path`/`side_path` (NOT NULL), `back_path` (nullable, vue optionnelle),
  `min_percent`/`max_percent`/`reference_percent` (double precision, CHECK 1-70, `min ≤ reference ≤
  max`), `engine_version` (CHECK IN `('photo_body_fat_v1')` — identifiant STABLE distinct de
  `body_fat_method`, même discipline que Phase 6B `body_fat_formula`), `warnings` (text[]). RLS `FOR ALL
  USING/WITH CHECK (auth.uid() = user_id)`. Extension `body_tracking_body_fat_formula_check` (+
  `'photo_body_fat_v1'`) et `rate_limits_action_check` (+ `'estimate_body_fat_photo'`). Table 87/87
  (86→87, vérifié). Aucune image stockée en base — uniquement les chemins Storage (§ jamais l'image
  elle-même dans Postgres).
- **Edge function `estimate-body-fat-photo`** (déployée, ACTIVE) : adaptée directement de `scan-meal`
  (même squelette CORS/auth/rate-limit/fallback Gemini→OpenAI). `checkRateLimit(..., "estimate_body_
  fat_photo", 6)` — 6 appels/fenêtre, plus restrictif que `scan-meal` car l'analyse corporelle est plus
  sensible. Schéma JSON forcé (`tool_choice` obligatoire) : uniquement `status` (`success` |
  `insufficient_quality` | `failed`), `minPercent`/`maxPercent` (jamais un point unique), `warnings`.
  Prompt système avec 5 règles absolues : TOUJOURS une fourchette (jamais un nombre précis), largeur
  minimale de 3 points imposée dans le prompt ET re-vérifiée côté domaine (double garde-fou), aucun
  langage de diagnostic médical, aucune tentative d'identification/reconnaissance faciale, chemin
  explicite `insufficient_quality` si les photos ne permettent pas une analyse fiable. Toujours HTTP 200
  même en échec (`{error}` dans le corps), convention identique à toutes les autres fonctions IA du
  projet. `front`/`side` obligatoires (validation taille/longueur), `back` optionnel.
- **`lib/fitness/bodyFatPhotoEstimate.ts`** (logique pure, zéro import React/Supabase) :
  `PHOTO_BODY_FAT_ENGINE_VERSION = "photo_body_fat_v1"`, `PHOTO_ESTIMATE_MIN_RANGE_WIDTH_PERCENT = 3`
  (règle produit prudente documentée — PAS une certitude scientifique — élargie symétriquement autour
  du point milieu si le modèle renvoie une fourchette trop étroite), `normalizePhotoEstimateResponse`
  (adaptateur unique : le JSON brut du provider `RawPhotoEstimateResponse` n'est JAMAIS vu par l'UI/les
  hooks, uniquement le type domaine `PhotoBodyFatEstimate` normalisé) — `referencePercent` est TOUJOURS
  le point milieu déterministe recalculé, jamais une valeur indépendante fournie par le modèle.
  `confidence` réutilise EXCLUSIVEMENT `getBodyFatConfidence("photo_estimate")` du mapping centralisé
  Phase 6A (`low`) — aucun second système de confiance, jamais un pourcentage de confiance affiché
  (l'UI affiche "Estimation indicative", jamais un chiffre). `computeFatMassRange`/
  `computeLeanMassRange` (nouvelles, fourchette kg à partir de la fourchette % + poids, avec vérification
  explicite d'inversion des bornes) — distinctes des fonctions point-unique de Phase 6A, pas de
  duplication car le contrat d'entrée diffère (plage vs. valeur).
- **UI `EstimatePhotoBodyFatSheet.tsx`** : déclenchée depuis une 3e action "Estimer avec des photos" sur
  la carte "Composition corporelle" de `/corps` (état vide ET rempli). Flux : sélection face+profil
  obligatoires / dos optionnel (upload `<input type="file" accept="image/*">` + `capture="environment"`
  pour la caméra, 100 % PWA-compatible, aucune dépendance native) → **consentement explicite** via le
  bouton "Analyser mes photos" (jamais d'analyse automatique dès qu'une photo est choisie) → preview de
  la fourchette (+ masse grasse/maigre en kg si poids renseigné) AVANT tout enregistrement → "Enregistrer"
  (upload Storage + création `body_tracking`/`body_photo_analyses`) ou "Recommencer" (efface tout,
  aucun appel serveur). Compression réutilisée via `fileToBase64Compressed` (`lib/nutrition/utils.ts`,
  déjà existante — pas de nouvelle dépendance) : le passage systématique par `<canvas>.toDataURL(
  "image/jpeg")` produit un JPEG neuf sans aucun bloc EXIF (donc sans GPS) — strip EXIF "gratuit" par
  ré-encodage, sauf repli exotique HEIC non-canvas (rare, documenté comme limite connue). Aucune donnée
  biométrique/identité stockée, aucun langage de diagnostic médical dans l'UI.
- **Persistance (`useBodyPhotoEstimate.ts`)** : architecture "analyse éphémère puis persistance sur
  confirmation" — les photos ne transitent qu'en base64 vers l'edge function tant que l'utilisateur n'a
  pas cliqué "Enregistrer" après avoir vu un résultat `success` ; c'est seulement à ce moment qu'elles
  sont uploadées dans Storage. `useSaveBodyPhotoAnalysis` : 1) crée `body_tracking` (méthode
  `photo_estimate`, `body_fat_min_percent`/`body_fat_max_percent` repris du système de fourchette
  Phase 6B/6A, jamais un écrasement silencieux d'une mesure d'une autre méthode le même jour — un
  nouveau row est toujours créé) ; 2) upload Storage ; 3) crée `body_photo_analyses`. Rollback best-
  effort à chaque étape : en cas d'échec après l'étape 1, suppression des fichiers déjà uploadés PUIS
  suppression de la ligne `body_tracking` orpheline — évite délibérément la lacune connue de
  `use-documents.ts` (`useDeposeDocument`) qui ne nettoie pas les objets Storage en cas d'échec.
  `useDeleteBodyPhotoAnalysis` : suppression Storage D'ABORD puis suppression `body_tracking` (cascade
  automatique vers `body_photo_analyses` via FK) — jamais d'orphelins Storage. `BodyHistorySheet.tsx`
  affiche la fourchette (`"MG estimée {min}–{max} % (photo_estimate, indicatif)"`) quand elle existe, et
  route la suppression vers le flux photo-aware (Storage + DB) plutôt que le flux point-unique.
- **Scope strictement respecté** (§35/§36 du brief) : aucune modification de `macroStrategy.ts`/
  `calorieStrategy.ts`/`tdee.ts`/`bmr.ts`/`neat.ts`/`nutrition_goals` (`git diff --stat` sur ces
  fichiers : vide, confirmé) ; aucune automatisation déclenchée (aucun changement de calories/macros/
  objectif, aucune notification) ; aucun objectif BF/poids cible/prédiction de date ; aucune
  reconnaissance faciale ; aucun coach IA additionnel ; aucune intégration wearable.
- **Sécurité — 3 tests SQL en transaction `BEGIN...ROLLBACK`** (jamais rien committé) simulant deux
  utilisateurs authentifiés distincts via `set_config('request.jwt.claim.sub', ...)` +
  `set_config('role', 'authenticated', true)` : (1) isolation RLS table `body_photo_analyses` dans les
  deux sens (propriétaire voit ses données, autre utilisateur ne voit rien, DELETE d'un autre
  utilisateur sans effet) ; (2) isolation RLS `storage.objects` du nouveau bucket dans les deux sens ;
  (3) tentative d'écriture malveillante simulée dans le dossier d'un autre utilisateur
  (`INSERT INTO storage.objects ... name = '{autre_user}/...'`) — **bloquée avec succès**
  (`malicious_object_exists = 0` après tentative). `get_advisors(type:"security")` : aucune nouvelle
  alerte imputable à cette phase.
- **Tests** (`bodyFatPhotoEstimate.test.ts`, 19 tests) : validité de fourchette/point milieu,
  élargissement à la largeur minimale, entrées invalides (`min > max`, négatif, NaN/Infinity, hors
  bornes BF), calcul masse grasse (exemple du brief vérifié : 80 kg / 14-16 % → 11.2-12.8 kg) et masse
  maigre (exemple du brief vérifié : 80 kg / 14-16 % → 67.2-68.8 kg, avec vérification explicite
  d'inversion des bornes), cas sans poids connu. 902 tests au total (883+19), tous verts au premier
  passage.
- `npx tsc --noEmit` / `npx vitest run` (902 passed) / `npm run build` : tous verts. Aucun `as any`
  introduit. `node scripts/validate-supabase.mjs` : migrations idempotentes OK.
- **Vérification visuelle mobile NON effectuée** — même limite que toutes les phases précédentes de
  cette session : `/corps` étant protégée par authentification, aucune session Supabase réelle n'est
  disponible dans ce sandbox pour naviguer au-delà de `/login`.
- **Limites connues** : le moteur Gemini/GPT-4o n'a jamais été validé empiriquement contre une mesure
  DEXA réelle (aucune donnée de test disponible) — l'estimation reste, comme documenté dans l'UI, une
  approximation indicative et non une mesure clinique ; le repli HEIC non-canvas de
  `fileToBase64Compressed` ne garantit pas le strip EXIF (cas rare) ; pas de limite explicite sur le
  nombre total d'analyses historisées par utilisateur (mêmes règles de rétention que les autres méthodes
  de `body_tracking`, hors scope de cette phase).
- **Livrée sur la branche dédiée `claude/phase6c-body-fat-photo-estimation`, NON fusionnée dans `main`**
  conformément à l'instruction explicite du brief.

## Composition corporelle → stratégie protéines/macros — Phase 7 (2026-08-13, même session)
- **Phase 6C mergée dans `main`** (SHA `b87d961`) avant cette phase — CI intégralement verte (8
  workflows : Typecheck, Supabase Migrations, Supabase Types Sync, RLS Regression Tests, Audit Git↔
  Supabase Drift, Supabase project ref, Deploy Edge Functions, Meal Slugs Check), objets DB re-vérifiés
  en direct (table `body_photo_analyses` 87/87, bucket privé, 4 policies Storage, RLS active, CHECK
  constraints étendues), aucune alerte sécurité nouvelle.
- **Audit préalable exhaustif** (macroStrategy.ts, calorieStrategy.ts, bodyComposition.ts, schémas
  `body_tracking`/`nutrition_goals`, RPC `apply_calorie_goal_adjustment`/`apply_macro_goal_adjustment`,
  hooks, `sante-nutritionnelle.tsx`, tests existants) réalisé via agent Explore dédié avant toute
  implémentation, conformément à l'exigence stricte du brief. Constat central confirmé : le moteur
  protéines actuel (`PROTEIN_G_PER_KG: {fat_loss:2.2, maintenance:1.8, muscle_gain:2.0}` g/kg de POIDS
  TOTAL plafonné à 120 kg) ne s'appuie JAMAIS sur le Body Fat — garde-fou documenté explicitement dans
  le code (`macroStrategy.ts`). Confiance déjà centralisée et mature (`BODY_FAT_METHOD_CONFIDENCE`,
  Phase 6A) : `dexa→high`, `bioimpedance→medium`, `measurements→medium`, `photo_estimate→low`,
  `manual→low`. `calorie_goal_adjustments` avait déjà une colonne `reason` libre, PAS
  `macro_goal_adjustments` — lacune comblée cette phase (voir migration ci-dessous).
- **Décision d'architecture centrale** : Body Fat reste **une donnée d'ENRICHISSEMENT, jamais une
  dépendance obligatoire**. Sans composition corporelle exploitable, `sante-nutritionnelle.tsx` retombe
  silencieusement sur le pipeline poids corporel Phase 5, bit pour bit identique (non-régression
  testée explicitement).
- **`lib/fitness/bodyCompositionForNutrition.ts`** (nouveau, logique pure, zéro import React/Supabase) :
  - `selectBodyCompositionForNutrition(candidates, todayIso)` — sélectionne, parmi un historique
    `body_tracking` trié du plus récent au plus ancien (ordre déjà produit par `useBodyMeasurements`),
    la première mesure réellement exploitable : méthode connue + BF valide (1-70 %, réutilise
    `isValidBodyFatPercent` de Phase 6A) + poids ET BF sur la MÊME ligne (jamais un BF ancien combiné à
    un poids d'aujourd'hui) + dans la fenêtre de récence. **Aucune hiérarchie arbitraire de méthode**
    (DEXA > mensurations > bioimpédance > photo n'est jamais supposée) : le candidat le PLUS RÉCENT
    exploitable l'emporte, choix documenté explicitement dans le code.
  - `BODY_COMPOSITION_MAX_AGE_DAYS = 90` — politique de récence centralisée et documentée comme règle
    produit PRUDENTE (pas une certitude scientifique) : au-delà, repli silencieux sur le poids corporel.
  - Résultat `SelectedBodyComposition` expose `usableForAutomaticAdjustment` (= confiance ≠ "low",
    donc `false` pour `photo_estimate`/`manual`, `true` pour `dexa`/`bioimpedance`/`measurements`) —
    distinct de l'utilisabilité pour la recommandation MANUELLE (toujours vraie dès qu'une composition
    est sélectionnée) : une estimation photo peut informer l'utilisateur sans jamais déclencher un
    ajustement automatique.
  - `LEAN_MASS_PROTEIN_G_PER_KG: {fat_loss:2.6, maintenance:2.0, muscle_gain:2.4}` g/kg de MASSE MAIGRE
    — **PAS une conversion naïve** des coefficients poids-total (interdiction explicite du brief) :
    calibrés pour rester, à un BF "moyen" (~20 %), SOUS l'équivalence naïve (poids×coef / 0.8), donc
    toujours plus conservateurs que le pipeline poids-total, jamais plus agressifs. Justification
    littérature concise en commentaire (ISSN position stand, Jäger et al. 2017, fourchette haute
    jusqu'à ~2.3-3.1 g/kg de masse maigre en déficit) — pas une formule copiée d'un blog fitness.
  - `computeLeanMassProteinTargetG(goal, leanMassKg)` — réutilise le plafond partagé
    `MACRO_STRATEGY_COEFFICIENTS.BODYWEIGHT_CAP_KG` (import direct depuis `macroStrategy.ts`, aucune
    duplication de constante).
- **`lib/fitness/macroStrategy.ts` étendu (additif, non-régression garantie)** :
  - `MacroStrategyInput.proteinTargetOverrideG?` — remplace UNIQUEMENT l'étape protéines du pipeline
    Phase 5 existant (poids×coefficient) quand fourni et valide ; tout le reste (lipides, glucides,
    arrondi, enveloppe, tolérance) reste strictement identique — **aucun second moteur macros créé**
    (§16 du brief). `undefined`/`null`/négatif/non fini → ignoré, comportement Phase 5 inchangé (testé
    explicitement, `toEqual` bit-à-bit).
  - `MacroStrategyResult.proteinBasis: "body_weight" | "lean_mass"` — nouveau champ additif exposant la
    provenance retenue, jamais utilisé pour changer le comportement du pipeline lui-même.
  - Un verrou protéines actif reste **TOUJOURS prioritaire** sur l'override (le verrou n'appelle même
    pas ce chemin de calcul) — testé explicitement.
  - `MAX_AUTO_PROTEIN_ADJUSTMENT_STEP_G = 30` + `clampAutomaticProteinTarget(rawTarget, current)` —
    garde-fou CENTRALISÉ (jamais caché dans un composant React, §24 du brief) : un seul ajustement
    AUTOMATIQUE des protéines ne peut jamais s'écarter de plus de 30 g de la valeur active. Ne
    s'applique JAMAIS à une application manuelle (clic explicite = pas de saut « caché »). Scénario
    extrême du brief testé tel quel : 120 g actif + recommandation brute 190 g → clampé à 150 g.
- **Migration `20260813090000_macro_goal_adjustments_reason.sql`** : ajoute `macro_goal_adjustments.
  reason text` (nullable, sans CHECK — même pattern que `calorie_goal_adjustments.reason` déjà
  existant) ; étend `apply_macro_goal_adjustment` (+`_reason`) et `apply_calorie_goal_adjustment`
  (+`_macro_reason`, chemin combiné calories+macros auto) avec un paramètre trailing optionnel
  `DEFAULT NULL` — appels existants inchangés.
  - **Incident réel rencontré et corrigé pendant l'application** : `CREATE OR REPLACE FUNCTION` avec un
    paramètre trailing supplémentaire change la SIGNATURE (nombre d'arguments) — Postgres a donc créé
    un NOUVEL objet fonction surchargé au lieu de remplacer l'existant, laissant temporairement DEUX
    versions de chaque RPC coexister (ancienne + nouvelle arité), avec un risque d'appel ambigu côté
    client. Corrigé par `DROP FUNCTION` explicite des anciennes signatures avant recréation — un seul
    objet par nom vérifié après coup (`pronargs` unique).
  - **Deuxième incident détecté et corrigé dans la foulée** : les nouveaux objets fonction (signature
    différente = nouvel objet Postgres) ne portaient PAS les `REVOKE`/`GRANT` explicites de la
    migration d'origine — `anon` avait retrouvé un accès EXECUTE par défaut (régression de sécurité
    réelle, confirmée via `has_function_privilege('anon', ...)`  = `true`). Corrigé par `REVOKE ALL ...
    FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated` explicites sur les nouvelles signatures,
    revérifié (`anon_can_exec = false`) avant de committer la migration. Le fichier de migration commité
    documente les deux incidents et inclut les correctifs pour que toute réapplication future (CI)
    reproduise l'état final sûr directement, sans repasser par l'état intermédiaire vulnérable.
  - Vérifié post-migration : `reason` présente sur `macro_goal_adjustments`, une seule fonction par nom
    (`apply_macro_goal_adjustment` arity 13, `apply_calorie_goal_adjustment` arity 19), grants corrects.
    `types.ts` régénéré, diff purement additif (+5 lignes). `get_advisors(security)` : aucune nouvelle
    alerte imputable à cette phase (uniquement les WARN pré-existants `authenticated_security_definer_
    function_executable`, déjà présents avant Phase 7 sur ces mêmes fonctions).
- **Intégration `sante-nutritionnelle.tsx`** :
  - `bodyCompositionCandidates` construits depuis `bodyRows` (déjà chargé par `useBodyMeasurements`,
    aucune nouvelle requête) → `selectedBodyComposition` via `selectBodyCompositionForNutrition`.
  - `macroStrategy` (affichage + application MANUELLE) reçoit `proteinTargetOverrideG` **brut, non
    clampé** — même une estimation photo peut enrichir la recommandation manuelle, l'utilisateur reste
    seul décisionnaire (§6 du brief : « il peut être exclu de la prescription automatique »).
  - Deux calculs SÉPARÉS pour l'éligibilité AUTOMATIQUE (`macroStrategyForAutoAtCurrentCalories` et
    `macroStrategyAtProposedCalories`) reçoivent `autoLeanMassProteinTargetG` — `null` sauf si
    `selectedBodyComposition.usableForAutomaticAdjustment` ET après passage par
    `clampAutomaticProteinTarget` — jamais le même override brut que le chemin manuel.
  - `reason: "lean_mass"` transmis à `useApplyMacroGoal`/`useApplyCalorieGoal` (manuel ET automatique)
    uniquement quand la composition corporelle a réellement influencé la valeur appliquée.
- **UI** : bloc "Base de calcul des protéines" (masse maigre en kg, méthode + confiance via
  `BODY_FAT_METHOD_LABELS`/`CONFIDENCE_LABELS` de Phase 6A, jamais dupliqués) affiché uniquement quand
  `proteinBasis === "lean_mass"` ; note sobre "Estimation photo disponible — utilisée à titre indicatif"
  quand le mode est automatique mais la composition sélectionnée n'est pas assez fiable pour l'auto ;
  explication courte adaptée selon la base retenue. **Aucune demande de Body Fat obligatoire** —
  l'intégralité de l'écran reste utilisable sans aucune mesure de composition corporelle (§30).
- **Scope strictement respecté** : aucune modification de `calorieStrategy.ts`/BMR/NEAT/EAT/TEF/TDEE ;
  pas d'objectif BF/poids cible/prédiction de date ; pas de reconnaissance faciale/diagnostic médical ;
  pas de nouvelle méthode BF ; pas de nouvelle analyse photo ; pas de LLM dans la décision (moteur
  entièrement déterministe) — vérifié via `git diff --stat` (fichiers hors scope : vide).
- **Tests** : 33 nouveaux tests (`bodyCompositionForNutrition.test.ts` : sélection/récence/snapshot/
  confiance/coefficients masse maigre ; `macroStrategy.test.ts` : non-régression bit-à-bit sans
  override, override valide/invalide/verrouillé/cas extrême, `clampAutomaticProteinTarget` avec le
  scénario extrême exact du brief 120g→190g brut→150g clampé). 935 tests au total (902+33), tous verts.
- `npx tsc --noEmit` / `npx eslint` (fichiers modifiés) / `npx vitest run` (935 passed) / `npm run
  build` : tous verts. `node scripts/validate-supabase.mjs` : migrations idempotentes OK. Aucun
  `as any` introduit.
- **Vérification visuelle mobile NON effectuée** — même limite sandbox `EAFNOSUPPORT` que toutes les
  phases précédentes de cette session.
- **Limites connues** : les coefficients `LEAN_MASS_PROTEIN_G_PER_KG` sont une décision produit
  raisonnée (documentée, conservative par construction) mais n'ont jamais été validés empiriquement
  contre des données réelles ; le seuil de récence (90 jours) et le pas maximal d'ajustement automatique
  (30 g) sont des règles produit prudentes explicitement documentées comme telles, pas des certitudes
  scientifiques — ajustables sans casser l'architecture si besoin.
- **Livrée sur la branche dédiée `claude/phase7-body-composition-nutrition`, NON fusionnée dans
  `main`** conformément à l'instruction explicite du brief.

## Objectif physique + trajectoire + suivi adaptatif — Phase 8 (2026-08-14, même session)
- **Phase 7 mergée dans `main`** (SHA `41caaed`) avant cette phase — CI verte (7 workflows pertinents,
  `Deploy Supabase Edge Functions` n'a pas déclenché car Phase 7 ne touche aucune edge function),
  `reason` sur `macro_goal_adjustments` et RPC re-vérifiées en direct après merge.
- **Audit préalable exhaustif** (agent Explore dédié) : aucune structure équivalente à un objectif
  physique n'existait déjà (`target_weight` trouvé dans `coach_ia_v2_programs` est un concept
  totalement différent — charge recommandée sur une série, pas un poids corporel cible ; `objective`
  sur `nutrition_goals` est un champ legacy vestigial distinct de `goal`). Confirmé : `adaptiveTdee.ts`
  calcule déjà un poids lissé (moyenne glissante 7 jours + régression linéaire,
  `weight.weeklyTrendKg`/`endTrendKg`/`measurementCount`) — **réutilisé tel quel**, jamais recalculé.
  `computeCalorieStrategy` applique déjà le rythme (`CALORIE_STRATEGY_RATES`, % du poids CORPOREL
  COURANT/semaine) contre le poids courant à chaque appel, jamais une projection figée — la trajectoire
  Phase 8 suit exactement le même principe.
- **Décision d'architecture centrale** : Phase 8 **ORCHESTRE** les moteurs existants
  (`calorieStrategy.ts`, `adaptiveTdee.ts`, `bodyComposition.ts`) — **aucun second moteur
  TDEE/calorique/macros créé**. Confirmé structurellement : `git diff --stat` sur
  `calorieStrategy.ts`/`adaptiveTdee.ts`/`adaptiveTdeeCalibration.ts`/`tdee.ts`/`macroStrategy.ts` :
  vide, ces fichiers ne sont PAS modifiés par cette phase. La seule chaîne d'écriture calorique/macro
  reste `evaluateAutoCalorieAdjustment`/`evaluateAutoMacroAdjustment` → RPC — Phase 8 ne fait que LIRE
  ces résultats, jamais les contourner ni créer un second contrôleur.
- **Table `physical_goals`** (migration `20260814090000_physical_goals.sql`) : `goal` reprend EXACTEMENT
  la taxonomie stable Phase 4 (`fat_loss`/`maintenance`/`muscle_gain`, CHECK identique) ; `target_rate`
  avec la même contrainte de cohérence que `nutrition_goals_target_rate_check` (maintenance sans
  rythme) ; snapshot de départ figé (`starting_weight_kg`/`starting_body_fat_percent`/
  `starting_body_fat_method`/`starting_lean_mass_kg`, jamais recalculé) ; cibles facultatives
  (`target_weight_kg`/`target_body_fat_percent`, toutes deux nullable) ; `status` (`active`/
  `completed`/`cancelled`). **Un seul objectif ACTIF par utilisateur** — index unique PARTIEL
  `physical_goals_one_active_per_user ON (user_id) WHERE status = 'active'` (pas de contrainte pleine
  table, permet l'historisation des objectifs terminés/annulés). RLS propriétaire stricte
  (`auth.uid() = user_id`), trigger `set_updated_at` (fonction déjà existante, réutilisée). Table
  88/88 (87→88), vérifié en direct. `types.ts` régénéré, diff purement additif (+54 lignes).
- **`lib/fitness/physicalGoal.ts`** (nouveau, pur) : `validatePhysicalGoalInput` — refuse proprement
  NaN/Infinity/poids-BF hors bornes/rythme incompatible avec l'objectif, et surtout détecte les
  **contradictions manifestes** (ex. `fat_loss` avec poids cible ≥ poids de départ) sans jamais les
  accepter silencieusement. Poids/BF cible restent TOUJOURS facultatifs — `null` des deux côtés est
  valide.
- **`lib/fitness/goalTrajectory.ts`** (nouveau, pur) :
  - `computeGoalTrajectory` — réutilise EXACTEMENT `CALORIE_STRATEGY_RATES` (aucun second système de
    coefficients). Comme le rythme est un %/semaine du poids COURANT (pas figé), une projection
    linéaire naïve (poids initial × % × N) sous-estimerait la durée — modélise donc une évolution
    **composée** (`w(t) = w0·(1+r)^t`, durée = `ln(target/w0)/ln(1+r)`), testée explicitement contre le
    calcul naïf pour confirmer que le modèle composé annonce toujours une durée ≥ au naïf. Pour
    `maintenance` : zone de maintien `MAINTENANCE_ZONE_PERCENT = 1.5` (±1.5 % du poids de référence,
    règle produit prudente documentée) plutôt qu'un delta zéro exact.
  - `computeBodyFatTargetProjection` — poids théorique à BF cible = `leanMassKg / (1 - targetBF/100)`,
    réutilise `computeLeanMass` de Phase 6A (jamais dupliqué), **toujours marqué `isTheoretical: true`**
    (hypothèse masse maigre constante explicitement documentée, jamais garantie réelle), confiance
    reprise du système Phase 6A existant (`ConfidenceLevel`), jamais un pourcentage inventé. Refuse
    proprement (`invalid_goal`) toute projection qui produirait un résultat non fini/négatif.
- **`lib/fitness/goalProgress.ts`** (nouveau, pur) :
  - `evaluateGoalProgress` — compare la progression RÉELLE au rythme visé en réutilisant
    **exclusivement** `adaptiveTdee.weight.weeklyTrendKg`/`measurementCount`/`window.calendarDays`
    (aucun recalcul de lissage, §22 du brief). Fenêtre minimale `GOAL_PROGRESS_MIN_WINDOW_DAYS = 14`
    jours (documentée : deux fenêtres de lissage TDEE complètes) + `GOAL_PROGRESS_MIN_MEASUREMENTS = 4`
    pesées minimum → sinon `insufficient_data` (état normal, jamais fabriqué en `on_track`). Tolérance
    `GOAL_PROGRESS_TOLERANCE_PERCENT = 25` % autour du rythme cible → `on_track` (évite qu'un écart de
    -0.48 vs -0.50 kg/semaine soit classé `behind`). États : `insufficient_data`/`on_track`/`ahead`/
    `behind`/`maintaining` (plateau quasi-nul, non culpabilisant, s'applique aussi hors maintenance).
    Fonction pure, zéro import Supabase — ne peut structurellement pas déclencher une écriture.
  - `isWeightGoalLikelyReached` — SUGGÈRE seulement qu'un objectif semble atteint (poids LISSÉ proche de
    la cible + assez de mesures) ; ne marque jamais `status = 'completed'` elle-même, décision
    utilisateur explicite uniquement via `useCompletePhysicalGoal`.
- **`hooks/usePhysicalGoal.ts`** (nouveau) : `usePhysicalGoal` (objectif actif), `usePhysicalGoalHistory`
  (terminés/annulés, pas de grosse UI dédiée), `useCreatePhysicalGoal` (clôture l'objectif actif
  existant en `cancelled` PUIS insère le nouveau — deux écritures séquentielles non transactionnelles,
  documenté explicitement : en cas d'échec entre les deux, l'état récupérable est "aucun objectif
  actif", jamais deux objectifs actifs — la contrainte unique DB l'empêche de toute façon),
  `useUpdatePhysicalGoalRate` (change UNIQUEMENT le rythme sur l'objectif existant, sans réécrire
  l'historique), `useCancelPhysicalGoal`, `useCompletePhysicalGoal`.
- **UI** : nouvelle Section "Objectif physique" dans `sante-nutritionnelle.tsx` (pas de nouvelle page),
  bloc compact (objectif/rythme/départ→cible/état de progression/durée estimée qualifiée "estimation"/
  zone de maintien/projection BF théorique), CTA "Marquer comme atteint" affiché uniquement quand
  `isWeightGoalLikelyReached`, boutons rythme rapide (§45, update en place) et "Nouvel objectif"/
  "Annuler". Nouveau composant `PhysicalGoalSheet.tsx` (pattern preview-avant-enregistrement identique
  à `EstimateBodyFatSheet`/`EstimatePhotoBodyFatSheet`) : sélection objectif/rythme + poids/BF cible
  facultatifs, preview live (trajectoire + projection BF), validation bloquante avant soumission. Jamais
  de date affichée comme une promesse — toujours qualifiée "estimation"/"≈".
- **Scope strictement respecté** : aucune modification de `calorieStrategy.ts`/`adaptiveTdee.ts`/
  `adaptiveTdeeCalibration.ts`/`tdee.ts`/`macroStrategy.ts` (vérifié `git diff --stat`) ; pas de
  nouvelle méthode BF ; pas de coach IA/génération de texte LLM (moteur entièrement déterministe) ; pas
  de notifications/gamification ; pas de refonte UI générale.
- **Tests** : 53 nouveaux tests (`physicalGoal.test.ts`, `goalTrajectory.test.ts` incl. comparaison
  explicite modèle composé vs. projection linéaire naïve + exemple travaillé 80kg/20%→15% BF,
  `goalProgress.test.ts` incl. tolérance/plateau/fluctuation isolée/pureté). 988 tests au total
  (935+53), tous verts au premier passage. Non-régression TDEE vérifiée structurellement (aucun fichier
  du moteur calorique/TDEE modifié par cette phase, donc comportement bit-à-bit identique par
  construction — pas seulement testé).
- `npx tsc --noEmit` / `npx eslint` (fichiers modifiés) / `npx vitest run` (988 passed) / `npm run
  build` : tous verts. `node scripts/validate-supabase.mjs` : migrations idempotentes OK. Aucun
  `as any` introduit. `get_advisors(security)` : aucune nouvelle alerte imputable à cette phase.
- **Vérification visuelle mobile NON effectuée** — même limite sandbox `EAFNOSUPPORT` que toutes les
  phases précédentes de cette session.
- **Limites connues** : `useCreatePhysicalGoal` n'est pas transactionnel (deux écritures séquentielles,
  risque résiduel documenté et accepté — jamais deux objectifs actifs grâce à la contrainte DB) ; les
  constantes `MAINTENANCE_ZONE_PERCENT`/`GOAL_PROGRESS_MIN_WINDOW_DAYS`/
  `GOAL_PROGRESS_TOLERANCE_PERCENT`/`GOAL_PROGRESS_MIN_MEASUREMENTS` sont des règles produit prudentes
  documentées comme telles, pas des certitudes scientifiques ; pas de grosse UI d'historique des
  objectifs passés (hors scope explicite, hook déjà prêt si besoin futur) ; la projection BF suppose
  une masse maigre constante, hypothèse explicitement documentée mais jamais garantie réelle.
- **Livrée sur la branche dédiée `claude/phase8-physical-goals-adaptive-tracking`, NON fusionnée dans
  `main`** conformément à l'instruction explicite du brief.

## Santé nutritionnelle V1 — Analyse intelligente + finalisation UX + audit technique — Phase 9 (2026-08-15, même session)

- **Merge Phase 8 → `main`** (SHA `e78b131`) : la migration `20260814090000_physical_goals.sql` était
  non-idempotente (9× `ADD CONSTRAINT` sans `DROP CONSTRAINT IF EXISTS` préalable — contrairement à
  `CREATE TABLE`/`CREATE INDEX`, Postgres n'a AUCUN équivalent `IF NOT EXISTS` pour `ADD CONSTRAINT`),
  jamais rejouée via `db push` car appliquée en direct par `execute_sql` pendant la Phase 8 → CI
  `Supabase Migrations` + `Audit Drift` rouges (`constraint already exists`, SQLSTATE 42710). **Corrigé**
  par hotfix direct sur `main` (`d2a67ac`) : chaque `ADD CONSTRAINT` précédé d'un `DROP CONSTRAINT IF
  EXISTS`, ré-appliqué en direct (vérifié idempotent en le rejouant deux fois), + nouveau garde-fou
  permanent dans `scripts/validate-supabase.mjs` (**CHECK 10 — `CONSTRAINT_NO_DROP`**) qui scanne toute
  migration future pour cette classe de bug. CI entièrement verte après coup.
- **Principe architectural absolu tenu de bout en bout** : `Moteurs déterministes → structured facts →
  IA explique → utilisateur`. L'IA ne calcule JAMAIS un nombre — structurellement impossible : le schéma
  JSON du tool-calling (`explain_nutrition_health`) ne contient AUCUN champ numérique, uniquement des
  chaînes/enums. Aucune route de l'IA vers `nutrition_goals`/`physical_goals` UPDATE (lecture/explication
  pure, jamais d'écriture).

### Phase 9A — Analyse intelligente
- **`lib/fitness/nutritionHealthContext.ts`** (nouveau, pur) : `buildNutritionHealthAnalysisContext` —
  assemble en un objet minimal/typé des valeurs **déjà calculées** par les moteurs existants (BMR/NEAT/
  EAT/TEF/TDEE modélisé/observé/adaptatif, calibration, nutrition/macros, composition corporelle,
  objectif physique, progression, automatisation manuel/auto, locks) — aucun recalcul, aucun dump
  Supabase brut. Zéro champ nom/email/id/chemin Storage/photo (vérifié par test `JSON.stringify` +
  regex). Calcule `dataQuality.flags[]` (ex. `bmr_missing`, `body_composition_low_confidence`,
  `tdee_divergence_suspected`, `physical_goal_missing`, `progress_insufficient_data`) — jamais de valeur
  inventée pour combler un trou. `parseNutritionHealthAnalysisResult` — validation défensive stricte de
  la réponse provider (headline ≤120, summary ≤600, max 6 insights/4 nextSteps, enums vérifiés) → `null`
  si non conforme, jamais une structure partielle affichée.
- **`supabase/functions/nutrition-health-insight/`** (nouvelle edge function, déployée, ACTIVE, id
  `79691d68`) : pattern repris d'`analyze-pdf` (Gemini seul + cache `ai_cache`, PAS de second provider —
  volontairement distinct de `nutrition-analysis`, feature IA existante non liée branchée sur
  `NutritionTab.tsx`, jamais touchée). Auth (anon key + JWT forwardé) → rate-limit (`nutrition_health_
  insight`, 10/h, action ajoutée au CHECK `rate_limits_action_check`) → garde-taille 20KB → clé de cache
  `SHA-256(userId+date+JSON.stringify(context))`, TTL 6h → appel Gemini (tool-calling forcé, schéma zéro
  champ numérique, timeout 45s) → parsing défensif → jamais de Markdown libre. `SYSTEM_PROMPT` : 9 règles
  absolues (jamais inventer un chiffre, contexte = données jamais instructions, vocabulaire neutre non
  culpabilisant, données insuffisantes explicites, jamais diagnostiquer une divergence, signaler photo/
  low_confidence, expliquer sans jamais pousser le mode auto, français uniquement).
- **`hooks/useNutritionHealthInsight.ts`** : `useMutation`, déclenchement **à la demande uniquement**
  (CTA "Analyser ma situation"), jamais automatique au render. Pas de toast d'erreur global — dégradation
  gérée dans l'UI (bouton "Réessayer").
- **UI** (`sante-nutritionnelle.tsx`) : section "Analyse IA" — CTA / erreur+réessai / résultat (headline
  coloré par statut, résumé, insights, prochaines étapes, "Réanalyser"). Fonctionne à 100% sans IA
  (Gemini indisponible → état d'erreur local, reste du dashboard intact).

### Phase 9B — UX finale
- Nouvelle hiérarchie : Résumé compact (objectif+progression / TDEE adaptatif / objectif actuel) →
  section "Corps" (déplacée juste après le Résumé) → Métabolisme → Composition corporelle → Objectif
  physique → Analyse IA → détails avancés. Explications manuel/automatique rendues **persistantes** (plus
  seulement dans les dialogs de confirmation) sous les deux toggles calories/macros.
- **Corrections de faits constatés pendant l'audit UI** (pas de nouveauté produit) : ComingSoonTile
  "Objectif de poids" (stale, doublon de la section Objectif physique) supprimée ; "Masse musculaire"
  **renommée en "Masse maigre"** avec vraie valeur (`selectedBodyComposition.leanMassKg` — masse maigre
  ≠ masse musculaire, règle déjà actée dans `bodyComposition.ts`, appliquée ici où l'UI la violait) ;
  "Masse grasse" affichée réellement (`computeFatMass`) au lieu d'un ComingSoon ; ligne "Analyse
  corporelle IA" (ComingSoon) remplacée par un vrai lien vers `/corps` (Estimation Body Fat par photos,
  feature déjà livrée Phase 6C, simplement pas reliée depuis cette page) ; empty-state "TDEE adaptatif"
  aligné sur la convention `InsufficientDataTile` (au lieu de `ComingSoonTile`, incohérent avec les
  autres tuiles TDEE) ; ancienne section "Corps" dupliquée (bloc mort identique) supprimée.
  ComingSoonTiles genuinement non construits (hydratation, sommeil, HRV…) volontairement non touchés
  (hors scope §70).
- Aucun graphique ajouté (pas de fit naturel identifié cette phase — explicitement permis de sauter,
  §70). Aucun nouveau composant one-off — réutilisation stricte de `StatTile`/`InsufficientDataTile`/
  `Section`/`MetabolicAnalysisSheet` existants.

### Phase 9C — Audit technique V1
- **Legacy supprimé (confirmé mort par grep exhaustif AVANT suppression)** : `nutrition_goals.
  objective`/`weight_kg`/`activity_factor`/`fiber_g` — orphelines depuis la suppression de l'ancienne RPC
  `compute_nutrition_targets` (déjà DROPée `CASCADE` en Phase antérieure) ; zéro appelant frontend/RPC.
  Migration `20260815090000_nutrition_health_insight_and_legacy_cleanup.sql` (`DROP COLUMN IF EXISTS`
  ×4 + extension du CHECK `rate_limits_action_check`). `fiber_g` des AUTRES tables (food_logs/
  nutrition_items/recipes) explicitement PAS touché (toujours utilisé).
- **Double-comptage énergie (§48)** : vérifié par lecture directe — `tdee.ts` fait une somme plate
  `bmr+neat+eat+tef` sans chevauchement ; `neat.ts` documente explicitement que le NEAT basé wearable
  exclut volontairement l'EAT du jour pour éviter le double-comptage. Aucun problème trouvé — audit
  propre, rien à corriger.
- **Un seul contrôleur calories / un seul contrôleur macros** : tracé la chaîne complète TDEE→
  `calorieStrategy`→`evaluateAutoCalorieAdjustment`→RPC `apply_calorie_goal_adjustment` (idem macros) —
  Phase 9 n'ajoute AUCUN second contrôleur ; l'objectif physique et l'IA restent des lecteurs/
  explicateurs, jamais des sources d'écriture.
- **RLS/Storage/Edge Functions** : `get_advisors(security)` re-vérifié après la migration Phase 9 —
  aucune nouvelle alerte (les warnings existants — `function_search_path_mutable` sur une fonction RPG
  non liée, extensions dans `public`, bucket `avatars` listable, quelques `SECURITY DEFINER` legacy,
  protection mot de passe compromis désactivée — sont tous pré-existants, non introduits par cette
  phase, documentés mais hors scope §70). `nutrition-health-insight` déployée et `ACTIVE` (`verify_jwt:
  true`, id `79691d68-4645-454d-95da-526afa16d874`).
- **Grep `as any`** : zéro occurrence dans tous les fichiers nouveaux/modifiés de la Phase 9.
- **Migration** appliquée en direct via `execute_sql` (comme chaque phase précédente) puis **enregistrée
  manuellement dans `supabase_migrations.schema_migrations`** (leçon tirée du hotfix Phase 8 : sans ça,
  `db push` en CI la rejoue — idempotente cette fois donc sans casse, mais hygiène correcte rétablie).
  `types.ts` re-régénéré et diffé **caractère pour caractère identique** au fichier committé — zéro
  dérive Git↔Supabase.
- **Test de non-régression signup** (`scripts/signup-trigger-regression.test.mjs`, 3 tests, analyse
  statique pure des fichiers de migration — aucune infra pgTAP/instance locale ajoutée, §59) : garantit
  qu'aucune migration future ne recrée le trigger `on_auth_user_created_home_categories`/les fonctions
  seed sans les supprimer à nouveau (bug historique qui cassait TOUT signup, corrigé Phase antérieure
  par `20260810090000`).

### Validation finale
- `npx tsc --noEmit` / `npx eslint` (tous fichiers Phase 9, 3 erreurs prettier auto-fixées) / `npx
  vitest run` (**1015 passed | 32 skipped**, +27 vs. baseline Phase 8 — 24 dans
  `nutritionHealthContext.test.ts` + 3 dans `signup-trigger-regression.test.mjs`) / `npm run build` :
  tous verts. `node scripts/validate-supabase.mjs` : uniquement 3 warnings pré-existants (non liés à
  cette phase). `get_advisors(security)` : aucune nouvelle alerte. Migration enregistrée, `types.ts`
  identique à la génération live.
- **Vérification visuelle : tentative réelle cette fois** (contrairement aux phases précédentes bloquées
  par `EAFNOSUPPORT`) — `vite dev` a démarré normalement (HTTP 200 sur `/`), navigation Playwright
  headless vers `/sante-nutritionnelle` confirme que le garde d'authentification fonctionne correctement
  (redirection propre vers `/login`, page de connexion rendue). Un avertissement d'hydratation SSR/client
  a été observé sur la page `/login` (pré-existant, sans rapport avec les fichiers modifiés par cette
  phase, hors scope §70 — non corrigé). Capture d'écran authentifiée de `/sante-nutritionnelle`
  elle-même **non obtenue** faute d'identifiants de test dans ce sandbox — limite honnêtement documentée,
  pas contournée.
- **Limites connues** : pas de capture d'écran authentifiée de la page finale (cf. ci-dessus) ; les
  warnings `get_advisors` pré-existants (SECURITY DEFINER legacy, protection mot de passe compromis,
  extensions en public) restent hors scope de cette phase de finalisation.
- **Livrée sur la branche dédiée `claude/phase9-nutrition-health-v1-finalization`, NON fusionnée dans
  `main`** conformément à l'instruction explicite du brief.

## Déblocage Santé nutritionnelle + suppression des placeholders — Phase 10 (2026-08-16, même session)

- **Contexte** : suite au diagnostic de la session précédente (tuiles vides malgré des données
  réelles en base), Phase 10 corrige les blocages identifiés en réutilisant strictement les moteurs
  Phases 1-9 (aucun second moteur BMR/NEAT/TDEE/Body Fat créé).
- **Migration `20260816090000_body_fat_legacy_method_and_manual_activity.sql`** (appliquée en direct,
  committée) :
  - `UPDATE body_tracking SET body_fat_method='manual' WHERE body_fat_method IS NULL AND body_fat IS
    NOT NULL` — 22 lignes historiques corrigées (toutes appartenant au même compte réel). `'manual'`
    n'est PAS une méthode précise inventée : elle porte déjà la sémantique exacte « provenance
    inconnue » dans `bodyComposition.ts` (`BODY_FAT_METHOD_CONFIDENCE.manual = "low"`). Zéro valeur
    perdue (seule la colonne `method` touchée).
  - `daily_activity` : ajout colonne `hrv_ms` (nullable) + CHECK ; ajout de CHECK jusque-là absents sur
    `resting_hr`/`avg_hr`/`max_hr`/`steps`/`source` (`source` limité à `apple_health`/`manual`).
  - Migration idempotente (`DROP CONSTRAINT IF EXISTS` avant chaque `ADD CONSTRAINT`), vérifiée par
    `validate-supabase.mjs` (0 nouveau warning).
- **`lib/fitness/bodyComposition.ts`** : nouvelle fonction pure `resolveBodyFatMethod(selectedMethod,
  hasBodyFatValue)` — retourne `selectedMethod ?? "manual"` dès qu'un BF est saisi, ne renvoie plus
  jamais `null` silencieusement. Corrige le bug UX réel : `CorpsTab.tsx` (formulaire principal + 
  `QuickMeasurementSheet`) et `BodyHistorySheet.tsx` (édition) laissaient `body_fat_method = null` si
  l'utilisateur ne cliquait aucune puce de méthode — désormais toute nouvelle saisie BF a
  systématiquement une méthode, jamais `null`.
- **`lib/fitness/adaptiveTdee.ts` — audit + ajustement documenté du seuil de densité (§3 du brief)** :
  `EARLY.MIN_WEIGHT_DENSITY` abaissé de **0.30 → 0.20**. Audit explicite : 0.30 exigeait en pratique
  plus d'une pesée tous les 3.3 jours pour obtenir ne serait-ce qu'un statut "précoce" — plus strict
  que le rythme que Cortex documente lui-même comme attendu ("quelques pesées par semaine, parfois
  irrégulières"). Un utilisateur pesant EXACTEMENT 2×/semaine (densité ≈0.286, rythme réaliste et
  documenté) échouait déjà ce seuil. La densité n'est pas le seul garde-fou (MIN_CALENDAR_DAYS/
  MIN_WEIGHT_MEASUREMENTS/nutrition coverage + `weeklyTrendKg: null` indépendant si la régression ne
  peut réellement pas être calculée) — 0.20 reste largement au-dessus du cas déjà couvert par le test
  historique (4 pesées/26j ≈ 0.15, toujours rejeté). `ESTABLISHED.MIN_WEIGHT_DENSITY` (0.4) **inchangé**
  — seule la barre d'entrée "précoce" est assouplie. Nouveau test explicite reproduisant le cas réel
  diagnostiqué (6 pesées/24j, densité ≈0.25) confirmant que le statut n'est désormais plus
  `insufficient_data`.
- **`lib/fitness/dailyActivity.ts`** (nouveau, pur) : `mergeDailyActivityRows` — fusionne les lignes
  `daily_activity` d'un même jour (une par `source`, `UNIQUE(user_id,date,source)` déjà existante)
  champ par champ, le manuel gagnant toujours quand renseigné, provenance conservée par champ
  (`SourcedValue<T>`). Permet à une future intégration (Garmin/Whoop/Oura...) de coexister avec la
  saisie manuelle sans modification de ce fichier.
- **`lib/fitness/systemicRecovery.ts`** (nouveau, pur) — À NE PAS CONFONDRE avec `recovery.ts`
  (récupération PAR MUSCLE pour le BodyMap, préservée intacte, jamais touchée). `evaluateSystemicRecovery`
  : statut de récupération globale basé **uniquement** sur la FC repos vs baseline personnelle (moyenne
  des ≤14 mesures antérieures, ≥5 minimum requis sinon `insufficient_data`). Écart significatif = ±3
  bpm (règle produit prudente documentée). **HRV et charge d'entraînement volontairement EXCLUES du
  calcul** — HRV dépend trop de la méthode/l'appareil pour être fusionnée sans risque de faux signal
  (affichée séparément, jamais combinée) ; charge d'entraînement nécessiterait un modèle plus complexe
  que ce que la donnée actuelle justifie. Aucun score 0-100 inventé, aucun sommeil dans le calcul.
- **`hooks/useDailyActivity.ts`** : `useLatestActivity`/`useActivityForDate` réécrits pour fusionner
  toutes les sources d'un jour via `mergeDailyActivityRows` (au lieu de `.maybeSingle()`, qui aurait
  planté dès qu'une saisie manuelle ET un import Apple Health coexisteraient). Nouveau
  `useRestingHrHistory(days)` (historique fusionné par jour, alimente la baseline de récupération).
  Nouveau `useUpsertManualDailyActivity` — upsert PARTIEL (`source:"manual"`, `onConflict:
  "user_id,date,source"`) : n'efface jamais un champ déjà saisi un autre jour pour la même date.
- **`components/fitness/DailyActivityEntrySheet.tsx`** (nouveau) : Sheet unique (pas/FC repos/HRV, tous
  facultatifs, au moins un requis) — réutilise `Field`/`Sheet`/`SubmitButton` existants, aucun nouveau
  système de formulaire. Avertissement HRV explicite sur la dépendance méthode/appareil.
- **`components/fitness/InsufficientDataTile.tsx`** étendu (rétrocompatible) : `reason`/`ctaLabel`+
  `onAction` optionnels — devient un vrai bouton actionnable quand une action résout le manque
  ("Compléter mon profil", "Ajouter mes pas"...), sinon reste un simple constat.
- **`components/fitness/ComingSoonTile.tsx` supprimé** (Phase 10 §4/§10) — plus aucun appelant dans
  tout le repo après le nettoyage de `sante-nutritionnelle.tsx` (Sommeil/Temps actif/Hydratation/
  Niveau de stress/Adaptation métabolique supprimés ; Poids actuel/IMC/Masse grasse/Masse maigre/
  Objectif calorique/Pas quotidiens/FC repos/HRV migrés vers `InsufficientDataTile` avec un `reason`
  honnête — "Aucune donnée saisie"/"Profil à compléter" — jamais "À venir" pour une fonctionnalité déjà
  implémentée).
- **UI `sante-nutritionnelle.tsx`** : BMR/TDEE/NEAT affichent désormais un CTA direct "Compléter mon
  profil" (ouvre `MetabolicProfileSheet`, réutilisé tel quel) quand la cause est `metabolicProfileIncomplete`/
  `activityLevelMissing` — les deux bannières redondantes précédemment affichées SOUS la grille de
  tuiles ont été supprimées (le CTA est maintenant sur la tuile elle-même, jamais dupliqué). Section
  "Activité" : "Temps actif" supprimée, "Pas quotidiens" actionnable. Section "Santé" : "Sommeil" et
  "Niveau de stress" supprimés ; "Fréquence cardiaque" renommée "FC au repos" (alignée sur `resting_hr`
  plutôt que `avg_hr`, cohérent avec la saisie manuelle demandée) ; "Variabilité (HRV)" et "Récupération"
  désormais réelles (actionnables/calculées) au lieu de ComingSoon.
- **Tests** : +17 (`resolveBodyFatMethod` ×3, densité réaliste ×1, `mergeDailyActivityRows` ×5,
  `evaluateSystemicRecovery` ×8) — **1032 tests au total (1015+17)**, tous verts.
- **Non-régression (§11 du brief)** : aucun fichier des moteurs BMR/EAT/TEF/NEAT/TDEE modélisé/
  calorieStrategy/macroStrategy/goalTrajectory/goalProgress/nutritionHealthContext n'a été modifié
  (seul le SEUIL de densité dans `adaptiveTdee.ts` a changé, documenté ci-dessus) ; suite de tests
  complète (1032) verte au premier passage après chaque édition ; `recovery.ts` (récupération par
  muscle, BodyMap) intact, jamais touché — nommage `systemicRecovery.ts` choisi précisément pour éviter
  toute collision/confusion avec ce moteur existant.
- **Validation finale** : `npx tsc --noEmit` / `npx eslint` (tous fichiers modifiés, quelques erreurs
  prettier auto-fixées) / `npx vitest run` (1032 passed) / `npm run build` (succès, 1m58) : tous verts.
  `node scripts/validate-supabase.mjs` : 0 nouvelle erreur/warning. `types.ts` régénéré depuis la base
  live et vérifié **identique caractère pour caractère**. `get_advisors(security)` : aucune nouvelle
  alerte imputable à cette phase.
- **Drift pré-existant hors scope détecté (non corrigé, signalé)** : une table `outfit_feedback`
  existe sur le projet Supabase live sans aucune migration correspondante dans le repo — drift déjà
  présent AVANT cette phase (pas causé par Phase 10), origine externe (probablement une édition directe
  hors Git, ex. Lovable). Non traité ici : hors scope explicite de cette phase de déblocage.
- **Limites connues** : la tuile Récupération affichera `insufficient_data` pour tous les comptes tant
  qu'au moins 6 mesures de FC repos (1 récente + 5 de baseline) n'auront pas été saisies — attendu,
  aucune valeur n'est inventée pour combler ce vide. HRV reste affichée sans comparaison de tendance
  inter-appareils (volontairement non implémenté, cf. doctrine ci-dessus).
- **Travaillé directement sur `main`** conformément à l'instruction explicite du brief (pas de branche
  dédiée pour cette phase).

## Correctif de clôture Phase 10 (2026-08-03, même session)

- **Drift CI (`Audit - Git ↔ Supabase Drift Detection`)** : deux versions de migration
  (`20260803054157`/`20260803054734`) signalées "orphelines" par `supabase migration list --linked`
  lors du run CI du 03/08 12:54 UTC. Audit : `supabase_migrations.schema_migrations` interrogée en
  direct juste après montre **exactement 200 lignes = 200 fichiers Git**, sans aucune trace de ces deux
  versions — confirmé transitoire (probablement une activité concurrente sur ce projet Supabase
  partagé par de nombreuses branches/produits, cf. tables HR/paie et `outfit_feedback`/`outfits`
  déjà étrangères à Cortex). Aucun SQL rejoué, aucune migration vide créée. Re-déclenchement manuel du
  workflow (`workflow_dispatch`) → **repassé au vert** (confirmé, run `30821728587`).
- **`outfit_feedback`/`outfits`** : audit complet — schéma propre (FK, CHECK, UNIQUE), RLS activée,
  4 policies CRUD "own" par table, **0 ligne**, **zéro appelant** dans tout le repo Cortex (grep). Ne
  correspondent à AUCUNE migration Git (même orpheline — absentes aussi de `schema_migrations`,
  confirmant qu'elles ont été créées hors du système de migration, ex. SQL Editor direct). Domaine
  conceptuel (garde-robe/tenues) sans rapport avec Cortex fitness/nutrition — même profil que les
  tables HR/paie déjà présentes dans ce même projet Supabase partagé. **Conclusion : n'appartient pas
  à l'architecture Cortex actuelle.** Aucune migration Cortex créée pour ces tables (cela leur
  attribuerait à tort une appartenance à ce produit). **Aucune suppression effectuée** — signalé
  comme demandé, décision de conservation/suppression laissée à l'utilisateur.
- **Provenance Body Fat vs méthode** : nouvelle distinction conceptuelle explicite dans
  `bodyComposition.ts` — `BodyFatMethod` (COMMENT, pilote la confiance, inchangé) vs
  `BodyFatProvenance` (`"direct_entry" | "imported_document"`, D'OÙ vient la ligne, PURE information
  de traçabilité, n'affecte JAMAIS la confiance). `describeBodyFatProvenance(hasSourceDocument)` —
  dérivée de `body_tracking.source_document_id` (colonne déjà existante, déjà remplie pour certaines
  lignes via l'analyse PDF). **Audit des 22 mesures backfillées** : 4 liées à un document PDF
  ("Analyse corporelle" avec composition + circonférences + posture — format cohérent avec un scanner
  3D type Visbody), mais **aucune preuve fiable** (nom de fichier, texte extrait, métadonnée) ne
  mentionne explicitement une marque — provenance conservée comme "document importé" (fait vérifiable),
  **jamais "Visbody" inventé**. Les 18 autres restent "saisie directe". Rétrocompatible Phase 6/7 :
  `BODY_FAT_METHOD_CONFIDENCE`/`getBodyFatConfidence` restent keyed uniquement sur la méthode, aucune
  logique de confiance modifiée.
- **Récupération — pas de changement de seuil** : `MIN_BASELINE_SAMPLES` (5) et `BASELINE_WINDOW_SIZE`
  (14) laissés inchangés — comportement normal, pas un bug. `SystemicRecoveryResult` étendu avec
  `remainingBaselineSamples` (calculé dynamiquement, jamais un texte statique) ; le message
  `insufficient_data` explique désormais précisément *"Encore N mesure(s) de FC au repos
  nécessaire(s) pour établir ta référence personnelle"* — N recalculé à chaque évaluation à partir des
  données réelles, jamais codé en dur côté UI. Aucun sommeil réintroduit.
- **Tests** : +6 (`describeBodyFatProvenance` ×3, `remainingBaselineSamples`/reason dynamique ×3) —
  **1038 tests au total**, tous verts.
- **Validation** : `tsc --noEmit` / `eslint` / `npx vitest run` (1038 passed) / `npm run build` : tous
  verts. Aucune migration créée ce round (aucun changement de schéma nécessaire pour les points 1-4).
  `validate-supabase.mjs` : 0 nouvelle erreur/warning.
- **Non-régression** : BMR/NEAT/TDEE/TDEE adaptatif/Body Fat/Pas/FC repos/HRV/Récupération/Nutrition/
  Fitness — aucun moteur touché, seule la sortie `systemicRecovery` a été enrichie (champ ajouté,
  rétrocompatible) et `bodyComposition.ts` a reçu un ajout pur (aucune fonction existante modifiée en
  comportement, seule `resolveBodyFatMethod` du Phase 10 initial reste inchangée).
- **Travaillé directement sur `main`**, comme demandé.

## Body Fat Cortex — estimation indépendante (mensurations + photos uniquement) (2026-08-03, même session)

- **Règle d'architecture définitive** : BODY FAT CORTEX = estimation calculée UNIQUEMENT à partir de
  `measurements` (mensurations, Navy) et `photo_estimate` (analyse photo). Visbody/bioimpédance
  externe/DEXA/ancienne saisie `manual` ont une contribution STRUCTURELLEMENT nulle — restent visibles
  dans l'historique (comparaison/tendance) mais n'entrent jamais dans le calcul, même une DEXA
  (méthode la plus fiable en littérature). Aucune donnée historique supprimée.
- **`lib/fitness/cortexBodyFat.ts`** (nouveau, pur) :
  - `selectCortexBodyFatInputs(candidates, todayIso, maxAgeDays)` — filtre `method === "measurements" |
    "photo_estimate"` (garantie STRUCTURELLE que les méthodes externes ne peuvent jamais entrer), une
    seule contribution par méthode = la plus RÉCENTE exploitable dans la fenêtre de récence (réutilise
    `BODY_COMPOSITION_MAX_AGE_DAYS`, inchangé, audité et conservé).
  - `computeCortexBodyFatEstimate({measurements, photo})` — combine les deux JAMAIS par une moyenne
    naïve des midpoints : les mensurations (point déterministe) reçoivent une bande de tolérance
    (`MEASUREMENTS_CONSENSUS_TOLERANCE_PERCENT = 2.0`, documentée — plus stricte que l'erreur-type
    publiée de la méthode Navy ~3-4 points) testée pour recouvrement avec la fourchette photo :
    recouvrement → zone d'intersection (concordance, confiance "medium"), pas de recouvrement →
    élargissement explicite + médiane des 3 valeurs (désaccord, `disagreement=true`, confiance "low").
    Écart temporel mensurations/photo > `STALE_CROSS_METHOD_GAP_DAYS` (30j, documenté) → confiance
    plafonnée à "low" même en concordance. `usableForAutomaticAdjustment = confidence !== "low"` —
    même prédicat que la doctrine Phase 7 existante, jamais dupliqué. Retourne `referencePercent/
    minPercent/maxPercent/confidence/methodsUsed/methodCount/disagreement/usableForRecommendation/
    usableForAutomaticAdjustment/reason` — jamais confidence `"high"` (jamais une certitude médicale).
  - `describeCortexBodyFatSources(methodsUsed)` — "Mensurations"/"Photos"/"Mensurations + Photos".
- **`lib/fitness/bodyCompositionForNutrition.ts`** réécrit (même nom de fonction exportée,
  `selectBodyCompositionForNutrition`, pour minimiser le churn des 2 appelants) : nouveau paramètre
  obligatoire `currentWeightKg` — **§14 : les masses grasse/maigre actuelles utilisent désormais
  TOUJOURS le poids ACTUEL, jamais le poids historique attaché à l'ancienne mesure BF** (bug réel
  corrigé : poids affiché 70,3 kg mais masse maigre calculée avec un poids de mesure à 74,2 kg).
  `BodyCompositionCandidate` n'a plus de champ `weightKg` par ligne (découplage volontaire). `method`
  devient `null` quand mensurations ET photos contribuent toutes les deux (voir `methodsUsed` pour le
  détail) — `PhysicalGoalSheet.tsx` déjà typé `BodyFatMethod | null`, aucun changement nécessaire.
- **`routes/.../fitness/CorpsTab.tsx`** — carte "Composition corporelle" renommée "Body Fat Cortex",
  reconstruite entièrement sur `computeCortexBodyFatEstimate` + poids actuel (`latestWeight`). Nouvelle
  section "Dernière mesure externe" (manual/dexa/bioimpedance) affichée séparément, avec provenance
  honnête (`describeBodyFatProvenance`/`BODY_FAT_PROVENANCE_LABELS` du correctif de clôture précédent —
  "Document importé"/"Saisie directe", jamais "Visbody" sans preuve) — jamais fusionnée dans
  l'estimation Cortex. CTA "Ajouter une mesure" (manuel) retiré de cette carte spécifique (reste
  disponible via la tuile "MG" en haut de page) — seules les deux actions Cortex ("Estimer avec mes
  mensurations"/"avec des photos") y figurent désormais, conformément à la doctrine.
- **`routes/.../sante-nutritionnelle.tsx`** — tuiles "Masse grasse estimée"/"Masse maigre estimée"
  (renommées, §20) utilisent `selectedBodyComposition` (désormais Cortex-only). Message d'encouragement
  dynamique si une seule méthode Cortex contribue ("Ajoute une estimation par photos…") ou avertissement
  si désaccord. `nutritionHealthContext` (analyse IA, Phase 9) reçoit désormais les vraies bornes
  min/max Cortex (au lieu de `null` en dur) — aucune écriture, l'IA continue d'expliquer sans jamais
  calculer (architecture Phase 9 intacte).
- **Terminologie** : "Body Fat Cortex"/"Body Fat estimé", "Fourchette estimée", "Masse grasse/maigre
  estimée" — jamais "réel"/"exact"/"vrai taux". Masse maigre ≠ masse musculaire, toujours respecté.
- **Tests** : +45 (`cortexBodyFat.test.ts` : 23, couvrant A-N + F/G/H critiques Visbody-zéro-contribution
  + Q/R du brief ; `bodyCompositionForNutrition.test.ts` réécrit : 18, dont le test explicite §14 poids
  historique vs actuel). **1060 tests au total**, tous verts.
- **Aucune migration** — le Body Fat Cortex est une valeur DÉRIVÉE, calculée à la lecture depuis
  `body_tracking` existant (§19 du correctif : préférer le calcul au cache, aucune colonne
  `cortex_body_fat` créée).
- **Non-régression** : TDEE/adaptiveTdee/calorieStrategy/macroStrategy/locks/objectifs physiques/
  analyse IA/RLS/Storage — aucun fichier de ces moteurs modifié. `macroStrategy.ts` continue de
  recevoir un simple `proteinTargetOverrideG` calculé en amont, sans second contrôleur.
- **Validation** : `tsc --noEmit` / `eslint` / `npx vitest run` (1060 passed) / `npm run build` : tous
  verts. Zéro `as any`. Vérification visuelle : dev server démarré, `/corps` et `/sante-nutritionnelle`
  redirigent correctement vers `/login` (garde d'authentification fonctionnel, aucun crash de route) —
  capture authentifiée non obtenue faute d'identifiants dans ce sandbox (limite documentée, pas
  contournée).
- **Travaillé directement sur `main`**, comme demandé.

## Réordonnancement manuel des exercices en séance active — drag-and-drop (2026-08-05)
- **Objectif** : pouvoir glisser une carte exercice pour la replacer exactement à l'endroit où elle a
  été réellement effectuée en séance (ex. remonter "Rotation interne" en 2e position).
- **Schéma** — migration `20260819090000_exercises_manual_reorder_position.sql` : colonne
  `exercises.position` (integer NOT NULL DEFAULT 0), backfillée par `row_number() over (partition by
  workout_id order by ctid)` pour matérialiser l'ordre implicite déjà utilisé par l'app (voir note
  historique ligne ~505 — "pas de colonne position, décision délibérée" : cette décision est
  maintenant révisée à la demande explicite de Nathan). Index `(workout_id, position)`. Appliquée en
  prod via MCP Supabase puis `types.ts` régénéré (`npm run gen:types` équivalent via MCP) — aucune
  édition manuelle des types.
- **`hooks/use-fitness.ts`** : `ActiveExercise.position` ajouté ; `useActiveWorkout()` sélectionne
  `position` et trie explicitement les exercices (`position` asc, id en repli) — la relation imbriquée
  Supabase ne garantit pas d'ordre. `useAddExerciseToActiveWorkout` calcule `position` = max+1 (nouvel
  exercice toujours en dernier). `useStartWorkoutFromTemplate` ("Refaire en live") passe désormais
  `position: i` sur l'insert batché pour préserver l'ordre de la séance source. Nouveau
  `useReorderActiveExercises(orderedIds: string[])` : update `position` par id (Promise.all), optimiste
  via `patchActiveCache` (même convention que les autres mutations séance active), rollback on error,
  invalidate on settle. Ne touche jamais `exercise_sets`/reps/charge/rang.
- **`components/fitness/exerciseCard/ReorderableList.tsx`** (nouveau, générique) : implémentation
  drag-and-drop maison — **dnd-kit reste banni** (retiré le 2026-07-05, ne pas réintroduire), utilise
  uniquement `framer-motion` (déjà une dépendance) pour l'animation de tassement des cartes non
  actives (`motion.div layout`) + pointer events natifs pour la carte activement déplacée (transform
  imperatif, hors React re-render, pour un suivi 1:1 du doigt). Activation par appui long (380ms,
  annulé si mouvement > 10px avant l'échéance → laisse le scroll natif intact). Exclut les cibles
  interactives (`button, input, textarea, select, a, [role="button"]`) — toutes les zones cliquables
  des cartes (`ExerciseCardPrimitives.tsx`) sont déjà des `<button>`, donc chevron/sets/suppression/
  photo/graph ne déclenchent jamais le drag. `touch-action` bascule `none` uniquement pendant le drag
  actif de la carte concernée (iOS friendly), `pan-y` sinon. Relâcher = commit immédiat de l'ordre
  (`onReorder`) + petite animation de "settle" (220ms) si l'ordre a changé, no-op sinon. Aucune
  numérotation 1/2/3 ajoutée, design des cartes 100% inchangé (le composant les enveloppe, ne les
  modifie pas).
- **`ActiveWorkoutView.tsx`** : la liste `.map(...)` d'exercices est remplacée par
  `<ReorderableList items={workout.exercises} getId={ex => ex.id} onReorder={...} renderItem={...} />`
  — même `className="flex flex-col gap-3"` qu'avant, `ActiveExerciseCard` inchangé.
- **Non-régression** : `superset_group` n'est utilisé que côté `TemplateEditorSheet` (modèles), jamais
  en séance active — aucune interaction avec le réordonnancement. Séances existantes sans `position`
  explicite conservent leur ordre exact (backfill = ordre physique déjà observé). Aucune série/rep/
  charge/rang/stat touchée par cette fonctionnalité.
- **Validation** : `tsc --noEmit` / `eslint` (0 erreur, warnings pré-existants uniquement) /
  `npx vitest run` (1147 passed) / `npm run build` : tous verts. Vérification visuelle en navigateur
  **non obtenue** — ce sandbox ne supporte pas le bind IPv6 (`EAFNOSUPPORT` sur `::`) requis par le
  serveur dev Lovable, même avec `--host`/`--port` explicites ; limite d'environnement documentée, pas
  contournée.

## Réordonnancement séance active : remplacement du drag-and-drop par des flèches ↑ ↓ (2026-08-05, session suivante)
- **Retour de Nathan** : le drag-and-drop par appui long (`ReorderableList.tsx`, session précédente)
  n'était pas fiable au tactile (sélection de texte du nom d'exercice, manipulation imprécise).
  Remplacé par deux boutons ↑/↓ discrets, sans toucher au schéma ni à la mutation existants.
- **Supprimé** : `src/components/fitness/exerciseCard/ReorderableList.tsx` (plus aucun appelant) —
  appui long 380ms, pointer events de drag, blocage du scroll (`touch-action`), tout le geste tactile.
  `dnd-kit` toujours banni, non réintroduit (aucun changement de dépendances).
- **Réutilisé tel quel** : `exercises.position` (migration `20260819090000...`, session précédente) et
  `useReorderActiveExercises()` (hooks/use-fitness.ts) — aucune nouvelle logique de réordonnancement,
  aucune nouvelle migration.
- **`ActiveWorkoutView.tsx`** : la liste redevient un `.map()` simple (comme avant le drag-and-drop) ;
  nouveau `moveExercise(from, to)` qui échange deux ids adjacents dans `workout.exercises` et appelle
  `reorderExercises.mutate(orderedIds)` — même mutation optimiste qu'avant, juste déclenchée par un
  clic au lieu d'un geste. `ActiveExerciseCard` reçoit désormais `isFirst`/`isLast`/`onMoveUp`/
  `onMoveDown` calculés ici (seul détenteur de la liste triée complète).
- **`ActiveExerciseCard.tsx` (MuscuExerciseCard)** : deux `ExerciseCardIconButton` (déjà le composant
  bouton icône standard de la carte, 36×36, feedback `active:scale-90` et `disabled:opacity-30`
  intégrés nativement — aucun nouveau composant créé) avec `ChevronUp`/`ChevronDown` (lucide-react,
  déjà importés dans ce fichier), ajoutés dans la colonne d'actions existante (stats, suppression),
  désactivés respectivement sur le premier/dernier exercice.
- **Timer de repos** : `restTimer` (useRestTimer.ts) est indexé uniquement par `exerciseId`, jamais par
  position/index — un déplacement ne peut donc jamais décrocher un timer actif de son exercice.
  Vérifié, aucun changement nécessaire.
- **Nombre de séries dans l'en-tête** (même session) : ajouté sous le fanion de rang, toujours visible
  (carte ouverte ou fermée) — contrairement au bloc "record / X sur Y séries" existant qui, lui, reste
  conditionné à la carte dépliée (comportement inchangé). `{sortedSets.length} série(s)`, dérivé de
  `exercise.exercise_sets` déjà chargé, aucune donnée supplémentaire, texte `text-[10px]` discret sous
  le `RankFlag`.
- **Validation** : `tsc --noEmit` / `npx vitest run` (1185 passed) / `npm run build` verts. `eslint`
  ciblé sur les 3 fichiers touchés : 0 erreur (3 warnings pré-existants, non liés à ce changement) — le
  lint pleine base (`eslint .`) remonte des centaines d'erreurs pré-existantes dans des fichiers jamais
  touchés (edge functions, vite.config.ts), non introduites par cette session.
- **`src/routeTree.gen.ts`** : régénéré localement par les outils (tsc/build) avec 10 lignes en plus
  qu'une modification amont avait délibérément retirées — reverté avant commit pour ne pas écraser ce
  changement upstream (non lié à cette feature).

## Import de recettes — audit V1 (déjà livrée par Lovable) (2026-08-07)
- **Contexte** : demande de « reprendre le développement » de l'import de recettes (Instagram en
  priorité, architecture prête pour TikTok/YouTube Shorts/vidéo locale/photo/URL). Audit du commit
  `93088b3` (« Crée la V1 d'import recette », déjà sur `main`) : la V1 complète existait déjà, rien à
  réécrire — seul un correctif de formatage a été appliqué (voir plus bas).
- **`src/lib/nutrition/recipeImport/types.ts`** (domaine pur, zéro React/couleur) : contrats partagés
  par toutes les sources — `RecipeSourceKind` (instagram/tiktok/youtube-shorts/local-video/photo/
  recipe-url), `ImportStage` (étape de pipeline + durée simulée), `ImportedIngredient`/`ImportedMacros`/
  `ImportedRecipe` (fiche générée), `ImportInput` (`{kind:"url"}` ou `{kind:"file"}`), interface
  `RecipeImporter` (`canHandle`/`stages`/`run`). Helpers `confidenceLabel()` et `totalMacros()`.
- **`src/lib/nutrition/recipeImport/index.ts`** : registre `RECIPE_IMPORTERS` — un seul
  `createMockImporter()` factory partagé par toutes les sources (V1 = toutes simulées). Seul
  `instagramImporter` a `available: true` (regex `INSTAGRAM_RE` sur reel/reels/p/tv) ; les 5 autres
  sont déclarées avec `available: false` et leur propre `canHandle` (déjà correct pour reconnaître
  leur type d'entrée le jour où elles seront activées), donc **aucun changement de code n'est requis
  pour activer une nouvelle source** — juste passer `available: true` + brancher un vrai `run()`.
  Pipeline simulé déterministe : `pickMock(seed)` hash l'URL/nom de fichier pour choisir une des 3
  fiches mockées (poulet parmesan, bowl saumon, pancakes protéinés) → mêmes résultats pour le même
  lien, pratique pour tester/démo. 7 étapes (`download → transcribe → vision → ingredients →
  quantities → nutrition → card`), ~6.5s au total.
- **`src/components/fitness/RecipeImportSheet.tsx`** (546 l., UI only) : `FullscreenSheet` avec 3
  phases (`input`/`running`/`result`, `AnimatePresence`) — champ URL avec validation via
  `resolveImporter()` (message clair si lien non reconnu ou source « bientôt »), liste des étapes en
  cours avec coche/spinner, fiche résultat éditable (`RecipeResultCard` : titre, portions, macros par
  portion, ingrédients, jauge de confiance) avec bouton Modifier (inline, pas de sous-écran) et
  Ajouter au journal (sélection repas via `MealSelect`, portions à logger, appelle
  `useAddNutrition()` déjà existant — aucune nouvelle mutation Supabase).
- **Navigation** : intégré à `NutritionTab.tsx` via `NutritionCommandCenter` (le "+"), action
  `import-recipe` dans la section « Ajouter » — cohérent avec les 13 autres actions du même menu.
  État `recipeImportOpen` au niveau de la page, sheet monté conditionnellement comme les autres
  (`analysisOpen`, `voiceOpen`, etc.).
- **Correctif appliqué cette session** : `types.ts` avait une erreur `prettier/prettier` (union type
  `ImportInput` sur plusieurs lignes au lieu d'une) — `eslint --fix`, aucun changement fonctionnel.
- **Restant pour la V2 (backend réel)** : téléchargement effectif du Reel Instagram (edge function,
  cf. règle `GEMINI_API_KEY`), transcription audio + vision sur les frames, extraction ingrédients/
  quantités par IA, persistance de la fiche importée (actuellement non sauvegardée en base — la V1
  ne fait que logger les macros calculées dans `nutrition_entries` via `useAddNutrition`, la recette
  elle-même n'est pas stockée dans `recipes`/`recipe_ingredients`). Aucun de ces points ne nécessite
  de changement d'UI ou de contrat `RecipeImporter` : remplacer `run()` d'`instagramImporter` par un
  appel edge function réel, garder la même signature.
- **Validation** : `tsc --noEmit` / `npx vitest run src/lib/nutrition` (52 passed) / `eslint` ciblé
  sur les fichiers du module (0 erreur après fix) verts. Vérification visuelle en navigateur non
  obtenue (même limite d'environnement que les sessions précédentes — pas de bind IPv6 pour le
  serveur dev Lovable dans ce sandbox).

## Import de recettes — V2 pipeline réel Instagram + persistance (2026-08-07, session suivante)
- **Demande de Nathan** : garder V1 (UI + contrat `RecipeImporter`) strictement intacte, remplacer la
  simulation par un pipeline réel pour Instagram, persister la recette (`recipes`/`recipe_ingredients`)
  au lieu de juste logger les macros, dédoublonner. Une seule edge function `recipe-import` doit servir
  toutes les sources futures — le frontend ne connaît jamais l'implémentation propre à une source.
- **`supabase/functions/_shared/recipe-import.ts`** (nouveau) : contrat commun à toutes les sources —
  `RecipeExtraction`/`SourceHandler` (miroir volontaire de `recipeImport/types.ts` frontend, dupliqué
  comme `meal-items.ts`/`MealItem` car Deno edge et navigateur ne partagent pas de bundler), schéma
  tool-calling `RECIPE_TOOL` + `RECIPE_SYSTEM_PROMPT` partagés, `sanitizeRecipeExtraction()` (bornes),
  `toBase64()` (encodage chunké, évite le stack overflow de `String.fromCharCode(...buf)` sur une image
  complète).
- **`supabase/functions/_shared/recipe-import-instagram.ts`** (nouveau) : seule source avec un pipeline
  réel. 1) scraping des balises `<meta og:*>` de la page publique du post (pas d'API Instagram gratuite
  pour du contenu grand public — limite connue et documentée, cf. Livrables ci-dessous) → titre/légende/
  miniature/URL vidéo ; 2) téléchargement de la miniature (cap 8 Mo) ; 3) si `og:video` présent ET
  `OPENAI_API_KEY` configurée, transcription via Whisper (`audio/transcriptions`, cap 25 Mo, best-effort,
  jamais bloquant) ; 4) un seul appel Gemini 2.5 Flash multimodal (image + légende + transcription, tool
  calling `RECIPE_TOOL`) reconstitue titre/portions/ingrédients (nom/quantité/unité/grammes)/macros par
  portion/notes en une fois ; 5) confiance = confiance IA pondérée par pénalité selon les signaux
  manquants (pas de transcript -0.15, pas de légende -0.1, pas d'image -0.25). `validate()` fait aussi
  office de garde anti-SSRF : n'accepte que `https://(www.)instagram.com/(reel|reels|p|tv)/...`, rejette
  tout le reste avant le moindre `fetch`.
- **`supabase/functions/recipe-import/index.ts`** (nouveau, POST unique) : auth → `SOURCE_HANDLERS`
  (`Record<RecipeSourceKind, SourceHandler | null>`, seul `instagram` non-null — ajouter une source
  future = une entrée ici, rien d'autre) → dédoublonnage AVANT le rate-limit (cache hit sur
  `(user_id, source_url)` ne consomme pas de quota IA) → pipeline → `persistRecipe()` (insert
  `recipes` + `recipe_ingredients`, réutilise l'existante sur violation `23505` si une course a créé la
  même ligne entre-temps) → réponse `{ recipe: RecipeExtraction & { sourceKind, sourceUrl, recipeId } }`.
  Toujours HTTP 200, erreurs dans `{ error }` (même convention que `scan-meal`). Nouvelle action
  rate-limit `recipe_import` (10/h).
- **Migration `20260821090000_recipe_import_v2.sql`** (additive) : `recipes` gagne `source_kind`,
  `source_url`, `source_image_url`, `confidence`, `notes`, `per_serving_{calories,proteins,carbs,fats,
  fiber}` — une recette importée a des ingrédients à noms libres sans `item_id` fiable vers `items`, donc
  `recipeMacros()` (jointure items) renverrait 0 : ses macros/portion sont figées à l'import dans ces
  colonnes plutôt que recalculées. Index unique partiel `(user_id, source_url) WHERE source_url IS NOT
  NULL` (dédoublonnage). `nutrition` gagne `recipe_id` (FK `ON DELETE SET NULL`) pour tracer quelle
  recette a produit une entrée du journal. `rate_limits_action_check` étendu avec `recipe_import`.
- **`src/hooks/useRecipes.ts`** : `useRecipe()` bascule sur le snapshot `per_serving_*` quand il est
  renseigné (recette importée) au lieu de `recipeMacros(ingredients)` (qui donnerait 0 sans `item_id`) —
  sinon `RecipeLogSheet`/`MealPlanSheet` afficheraient 0 kcal pour une recette importée. Recettes créées
  manuellement : comportement inchangé (toujours dérivé de `items` via `recipeMacros`).
- **Contrat frontend (nécessité admise par Nathan)** : `ImportedRecipe` (types.ts) gagne
  `recipeId: string | null` — `null` pour les sources encore simulées, l'id `recipes` réel pour
  Instagram. `RecipeImportSheet.logToJournal()` ajoute juste `recipe_id: recipe.recipeId` au payload
  existant (aucun autre changement UI/visuel).
- **`recipeImport/index.ts`** : `instagramImporter` passe de `createMockImporter` à
  `createRealImporter` → `runRealImport()` appelle `supabase.functions.invoke("recipe-import", ...)`.
  `durationMs` de `STAGES` est ignoré comme prévu par le commentaire du type V1 (« ignorée quand le
  pipeline sera réel ») : `onStage("download")` avant l'appel réseau (seule étape mesurable côté
  client), puis les 6 autres étapes marquées faites d'un coup à la réception (elles se sont vraiment
  déroulées côté serveur en un seul appel). Les 5 autres sources gardent `createMockImporter` (inchangé).
- **`.github/workflows/deploy-functions.yml`** : `recipe-import` ajouté à la liste explicite des
  fonctions déployées (ce workflow ne déploie PAS tout `supabase/functions/**` automatiquement — liste
  blanche manuelle, piège découvert en auditant ce fichier ; sans cet ajout la fonction resterait non
  déployée après merge malgré le dossier présent dans le repo).
- **`src/integrations/supabase/types.ts`** : `nutrition.recipe_id` ajouté à la main (Row/Insert/Update)
  — `recipes`/`recipe_ingredients` ne sont PAS dans ce fichier (déjà non typées avant cette session,
  `useRecipes.ts` les consomme via `as any`), donc pas de bloc à ajouter pour elles. À régénérer via
  `npm run gen:types` une fois la migration appliquée en prod (conforme à la règle CLAUDE.md).
- **Limites connues, à traiter en V2.1** : scraping des `<meta og:*>` de la page Instagram publique
  (pas d'API officielle gratuite pour du contenu grand public) — Meta peut bloquer/rediriger vers une
  page de connexion pour un fetch non authentifié, cas géré par un message d'erreur clair plutôt qu'un
  échec silencieux, mais pas de garantie de succès systématique. Transcription audio dépend de
  `OPENAI_API_KEY` (optionnelle, best-effort) — sans elle, la confiance est simplement pénalisée
  (-0.15), pas d'échec. Miniature hotlinkée depuis le CDN Instagram (`source_image_url`), pas re-hébergée
  dans le storage Supabase — peut expirer/disparaître ; un rehébergement serait une amélioration V3.
- **Validation** : `tsc --noEmit` / `eslint` (0 erreur sur les fichiers touchés, warnings `no-console`
  sur les edge functions = convention existante déjà présente sur `scan-meal`) / `npx vitest run`
  (1186 passed / 32 skipped, 0 régression) / `npm run build` (client + SSR + PWA) tous verts. Pas de
  `deno check` disponible dans ce sandbox pour les edge functions (même limite que les sessions
  précédentes) — syntaxe vérifiée via `ts.transpileModule` (0 erreur), types Deno non vérifiables
  localement. Migration validée par `scripts/validate-supabase.mjs` (0 erreur, avertissements
  pré-existants uniquement, non liés). Aucune application réelle de la migration ni déploiement de la
  fonction dans cette session (pas d'accès direct au projet Supabase prod depuis ce workflow — conforme
  à CLAUDE.md : migration → merge → `migrate.yml`/`deploy-functions.yml` appliquent).

## Import de recettes — V2.1 cache global + pipeline Provider/Parser/Engine/DB + erreurs typées (2026-08-07, session suivante)
- **Demande de Nathan** : rendre l'import Instagram « prêt pour la production » — cache GLOBAL (plus
  seulement par utilisateur), architecture explicite `InstagramProvider -> Content Extraction ->
  Recipe Parser -> Nutrition Engine -> Database`, erreurs différenciées par cas (URL invalide/privé/
  supprimé/inaccessible/rate-limit/timeout/IA/serveur), et une vraie campagne de validation E2E sur 7
  scénarios. UI et contrat `RecipeImporter` intacts (seule la ligne swallowant le message d'erreur dans
  `RecipeImportSheet.tsx` a été corrigée — nécessité explicite du point 5).
- **Découpage `supabase/functions/_shared/` (un fichier par étage du pipeline demandé)** :
  - `recipe-import.ts` — contrats communs (`RecipeExtraction`, `SourceHandler`) + **`RecipeImportError`**
    (classe avec `code: "invalid_url"|"private_post"|"deleted_post"|"content_unavailable"|
    "instagram_rate_limited"|"timeout"|"ai_error"|"server_error"`) + helpers numériques.
  - `instagram-provider.ts` — **Content Extraction**. Interface `InstagramProvider` (`fetchContent()`)
    + `InstagramScraperProvider` (seule implémentation aujourd'hui, scraping `og:*` + téléchargement
    miniature + transcription Whisper best-effort). Classification d'erreur au plus près de la source :
    404→`deleted_post`, 429→`instagram_rate_limited`, redirection/texte de mur de connexion→
    `private_post` (heuristique best-effort — pas d'API gratuite pour distinguer fiablement privé
    d'un blocage anti-robot générique, limite documentée), `AbortSignal.timeout`→`timeout`, sinon
    `content_unavailable`. Changer de fournisseur (API officielle/service payant demain) = implémenter
    cette interface ailleurs, brancher dans `recipe-import-instagram.ts` — aucune autre étape à toucher.
  - `recipe-parser.ts` — **Recipe Parser**. Un seul appel Gemini 2.5 Flash multimodal (tool calling,
    `RECIPE_TOOL`/`RECIPE_SYSTEM_PROMPT` déplacés ici depuis `recipe-import.ts`), retourne le JSON brut
    (non sanitisé) ou lève `RecipeImportError("ai_error"|"timeout", ...)`.
  - `nutrition-engine.ts` — **Nutrition Engine**. `computeRecipeExtraction(raw, imageUrl, signals)` :
    bornes/typage + calcul du score de confiance final (pénalité cumulée selon
    `hasTranscript`/`hasCaption`/`hasImage`, déplacé ici depuis l'ancien `recipe-import-instagram.ts`).
    Zéro appel réseau — logique pure, testable isolément.
  - `recipe-db.ts` — **Database**, deux couches : (1) cache global service_role (`findCachedRecipe`/
    `saveCachedRecipe` sur `recipe_import_cache`, clé `(source_kind, source_url)`, écriture non-fatale
    en cas d'échec, réutilise le gagnant sur course `23505`) ; (2) association par utilisateur
    (`findUserRecipe`/`createUserRecipeFromExtraction` sur `recipes`/`recipe_ingredients`, inchangées
    depuis la V2) — **rollback** : si l'insert `recipe_ingredients` échoue, la ligne `recipes` tout
    juste créée est supprimée avant de relancer l'erreur (« aucun enregistrement incomplet »).
  - `recipe-import-instagram.ts` — devient un simple adaptateur : `makeInstagramHandler(provider)`
    compose Provider → Parser → Engine et implémente `SourceHandler` (validation d'URL anti-SSRF
    inchangée, migrée vers `RecipeImportError("invalid_url", ...)`).
  - `recipe-import-handler.ts` (nouveau) — **`handleRecipeImport(rawBody, deps)`**, toute l'orchestration
    extraite de `index.ts` (dédoublonnage par utilisateur → cache global → pipeline → persistance),
    zéro dépendance à `Deno.serve`/`Deno.env` (déps injectées) — extraction volontaire, comportement
    identique, uniquement pour rendre le tout testable sans session Deno déployée (voir Validation).
    `recipe-import/index.ts` devient un wrapper HTTP de ~50 lignes (CORS, auth, lecture des secrets,
    parsing du corps) qui appelle cette fonction et sérialise sa réponse.
- **Cache global (le cœur de la demande)** — migration `20260822090000_recipe_import_global_cache.sql` :
  nouvelle table `recipe_import_cache` (SANS `user_id`), clé unique `(source_kind, source_url)`, RLS
  activée avec UNE SEULE policy `select` (`to authenticated using (true)`) — aucune policy insert/
  update/delete : seule la clé `SUPABASE_SERVICE_ROLE_KEY` (bypass RLS, précédent déjà établi par
  `food-lookup/index.ts` pour son cache `foods` partagé) peut y écrire, jamais un utilisateur final.
  `recipe-import/index.ts` crée un client `admin` avec cette clé (dégrade proprement en `null` — donc
  pas de cache global, comportement V2 — si le secret n'est pas configuré) ; `recipes`/
  `recipe_ingredients` restent PAR UTILISATEUR (RLS `user_id = auth.uid()` inchangée) pour ne rien
  casser côté `useRecipes.ts`/`RecipeLogSheet`/`MealPlanSheet`. Flux : 1) déjà associée à CET
  utilisateur ? retour immédiat, zéro coût. 2) sinon, déjà en cache global (n'importe quel utilisateur) ?
  copie DB pure vers une nouvelle ligne `recipes`+`recipe_ingredients` pour l'utilisateur courant, ZÉRO
  appel Gemini/scraping/transcription, zéro rate-limit consommé. 3) sinon seulement : pipeline complet,
  écriture cache, `recordRateLimit`.
- **Erreurs différenciées (point 5)** : `respondError`/`errorFromException` mappent chaque
  `RecipeImportError` vers `{ error: message, code }` (toujours HTTP 200, convention `scan-meal`).
  `RecipeImportSheet.tsx` — bug trouvé en implémentant ce point : le `catch { setError("L'analyse a
  échoué...") }` de V1/V2 ignorait totalement le message réel remonté par l'edge function, TOUJOURS le
  même texte générique affiché quelle que soit la cause. Corrigé en `catch (e) { setError(e instanceof
  Error && e.message ? e.message : "...") }` — un seul changement de ligne, aucun autre changement visuel/
  UI.
- **Campagne de validation E2E (point 7)** : `supabase/functions/recipe-import/recipe-import.e2e.test.ts`
  (12 tests), exécutée via Vitest — `vitest.config.ts` étendu avec `supabase/functions/**/*.test.ts`
  (nouveau glob, aucun test existant déplacé). Fake client Supabase maison (postgrest-like, chainable +
  thenable, avec simulation de violation de contrainte unique `23505` pour tester les courses) + `fetch`
  stubbé par scénario (page Instagram / miniature / Gemini). **Important : ce sandbox n'a ni session Deno
  déployée ni clé IA/Instagram réelle** — ces tests exercent le VRAI code de production
  (`handleRecipeImport`, extrait exactement pour ça) contre un réseau/DB simulés, pas contre
  l'infrastructure réelle. Les 7 scénarios demandés + 5 complémentaires, tous verts :
  - Cas 1 (Reel public) : recette + 3 ingrédients + macros créés, cache global écrit.
  - Cas 2 (même Reel, 2e utilisateur) : `cached:true`, **zéro appel fetch**, 1 seule ligne cache
    globale mais 2 lignes `recipes` (une par utilisateur, comportement attendu) — `recipeId` différent
    entre les deux utilisateurs pour la même publication.
  - Cas 2bis (même utilisateur réimporte) : association déjà existante réutilisée, zéro appel réseau.
  - Cas 3 (URL invalide) : `code: "invalid_url"`, rien en base.
  - Cas 4 (compte privé, heuristique mur de connexion) : `code: "private_post"`, rien en base.
  - Cas 5 (404) : `code: "deleted_post"`, rien en base.
  - Cas 6 (Gemini 503) + Cas 6bis (tool_call vide) : `code: "ai_error"`, AUCUNE ligne créée nulle part
    (recipes/recipe_ingredients/cache tous vides) — pas d'enregistrement partiel.
  - Cas 7 (timeout `DOMException("TimeoutError")` sur le fetch Instagram) : `code: "timeout"`.
  - Complémentaires découverts en testant : 429 Instagram → `instagram_rate_limited` (jamais confondu
    avec un timeout) ; échec d'insert `recipe_ingredients` → la ligne `recipes` orpheline est bien
    supprimée (rollback vérifié directement, pas juste supposé) ; source pas encore disponible (tiktok)
    → message explicite, aucun crash.
- **Temps d'import** : mesuré dans le test Cas 2 (`performance.now()`), mais la preuve solide n'est PAS
  le chronométrage (bruité par les mocks) — c'est l'assertion `expect(fetchMock).not.toHaveBeenCalled()`
  sur le 2e import : structurellement, aucun appel réseau (donc aucun Instagram/Whisper/Gemini) n'a lieu
  sur un cache hit. En production, ça élimine ~10-30s (scraping + transcription + appel Gemini) au
  profit de 2 requêtes DB.
- **Fichiers modifiés/créés** : migration `20260822090000_recipe_import_global_cache.sql` (nouvelle
  table) ; `_shared/{recipe-import.ts (réduit), instagram-provider.ts, recipe-parser.ts,
  nutrition-engine.ts, recipe-db.ts, recipe-import-handler.ts}` (nouveaux/réécrits) ;
  `_shared/recipe-import-instagram.ts` (réécrit en adaptateur fin) ; `recipe-import/index.ts` (réduit à
  un wrapper HTTP) ; `recipe-import/recipe-import.e2e.test.ts` (nouveau) ; `vitest.config.ts` (glob
  étendu) ; `RecipeImportSheet.tsx` (1 ligne, bug de message d'erreur).
- **Dépendances externes / limitations restantes** : `GEMINI_API_KEY` obligatoire (déjà en place),
  `OPENAI_API_KEY` optionnelle (transcription best-effort), **`SUPABASE_SERVICE_ROLE_KEY` désormais
  nécessaire** pour que le cache global fonctionne (sans elle, `admin` est `null` et le comportement
  redevient celui de la V2 — dédoublonnage par utilisateur uniquement, un avertissement `console.log`
  le signale). Scraping Instagram toujours sans garantie (pas d'API officielle gratuite) — la
  distinction privé/bloqué reste une heuristique. Migration et déploiement de la fonction pas encore
  effectués dans cette session (même limite que la session précédente : CI applique au merge sur
  `main`).
- **Validation** : `tsc --noEmit` (0 erreur) / `eslint` sur tous les fichiers touchés (0 erreur,
  warnings `no-console`/`no-explicit-any` = conventions déjà établies sur `scan-meal`/tests) /
  `npx vitest run` (1198 passed / 32 skipped, +12 vs avant, 0 régression) / `npm run build` (client +
  SSR + PWA) / `scripts/validate-supabase.mjs` (0 erreur, 3 avertissements pré-existants non liés) tous
  verts. Pas de `deno check` disponible dans ce sandbox (même limite documentée dans les sessions
  précédentes) — contournée cette fois par l'extraction `recipe-import-handler.ts`, qui permet un test
  Vitest réel du code de production plutôt qu'une simple vérification de syntaxe.

## Import de recettes — module "Recettes" : la fiche importée n'est plus un raccourci journal (2026-08-07, session suivante)
- **Demande de Nathan** : l'écran d'import Instagram ne doit plus être un « Ajouter au journal » —
  c'est un créateur de fiche recette. Créer un vrai module « Recettes » dans Nutrition, accessible
  après coup, avec 5 actions par fiche : Ajouter au journal / Modifier / Dupliquer / Favori / Supprimer.
- **Découverte en auditant l'existant** : `RecipeLogSheet.tsx` (V1 Lovable, sélection d'une recette
  dans un `<select>` + log direct) n'était câblé nulle part dans `NutritionTab.tsx` — code mort,
  seulement référencé dans une liste statique de `mealSelectCoverage.test.ts`. Supprimé (pas une
  suppression de feature vivante : personne n'y accédait) et remplacé par le nouveau module, entrée
  mise à jour dans le test de couverture (`RecipeDetailSheet.tsx` à la place).
- **Backend — `originalCaption` ajouté au pipeline** (nouveau champ demandé : « conserver la
  description originale du post », distinct de `notes` qui sont les hypothèses de l'IA) :
  `RecipeExtraction.originalCaption` (`_shared/recipe-import.ts`) ; `computeRecipeExtraction()`
  (`nutrition-engine.ts`) prend désormais un 4e paramètre `originalCaption` et le recopie tel quel
  (pas généré par l'IA, vient directement du provider) ; `recipe-import-instagram.ts` passe
  `content.caption` (déjà récupéré par le provider, seulement utilisé comme signal pour Gemini avant
  cette session) ; `recipe-db.ts` persiste/relit `source_description` sur `recipes` ET
  `recipe_import_cache` (le cache global doit porter la même donnée que ce qu'il alimente).
- **Migration `20260823090000_recipe_module_description_favorite.sql`** (additive) : `recipes` gagne
  `source_description` (text) + `is_favorite` (boolean, défaut false, index partiel sur les favoris) ;
  `recipe_import_cache` gagne `source_description`.
- **`src/hooks/useRecipes.ts`** : `Recipe` s'enrichit de `source_url`/`source_description`/`confidence`/
  `notes`/`is_favorite` (déjà en base côté V2, jamais exposés côté hook avant). 4 nouvelles mutations
  (toutes avec toast + invalidation `["recipes"]`/`["recipe", id]`) : `useUpdateRecipe` (patch
  recipes + remplacement optionnel intégral de `recipe_ingredients`, delete+insert) ;
  `useToggleRecipeFavorite` ; `useDeleteRecipe` (cascade `recipe_ingredients` déjà en place depuis la
  migration V2 initiale) ; `useDuplicateRecipe` (copie recipes+ingredients, `source_url: null` — sans
  ça la copie violerait l'unicité `(user_id, source_url)` et serait invisible pour l'edge function).
- **`RecipeImportSheet.tsx`** : bloc « Ajouter à mon journal » (MealSelect, portions, `useAddNutrition`)
  entièrement retiré. La recette est déjà créée côté serveur au moment où l'écran de résultat
  s'affiche (comportement V2 inchangé) — le nouveau bouton unique « Enregistrer dans mes recettes »
  n'a donc qu'à persister d'éventuelles retouches locales (le bloc « Modifier » existant, réutilisé tel
  quel) via `useUpdateRecipe`, puis fermer. Fiche enrichie : lien « Voir la publication Instagram »
  (`recipe.sourceUrl`) + bloc description originale (`recipe.originalCaption`) ajoutés à
  `RecipeResultCard`, entre le titre et les macros. Perd son prop `date` (n'écrit plus dans le journal).
- **`RecipesListSheet.tsx`** (nouveau) : liste « Mes recettes » — miniature/nom/portions/kcal-portion +
  étoile favori inline (bouton frère du bouton carte, jamais imbriqué — `<button>` dans `<button>`
  est invalide en HTML). Tap une carte → `RecipeDetailSheet` monté par-dessus (les deux sheets utilisent
  le même `Portal`/`z-50` ; le montage plus tardif du détail l'affiche naturellement au-dessus de la
  liste, sans changement à `FullscreenSheet`).
- **`RecipeDetailSheet.tsx`** (nouveau) : fiche complète (miniature + confiance + favori, lien source,
  description originale, macros/ingrédients éditables, notes IA) + les 5 actions demandées — Ajouter au
  journal (repris de l'ancien `RecipeLogSheet`, `MealSelect` + portions + `useAddNutrition` avec
  `recipe_id`), Modifier (édition inline titre/portions/macros/quantités, même style que
  `RecipeImportSheet`, sauvegarde via `useUpdateRecipe`), Dupliquer, Favori (étoile sur la miniature),
  Supprimer (confirmation inline avant `useDeleteRecipe`).
- **Navigation** : nouvelle entrée « Mes recettes » dans `NutritionCommandCenter` (section 🧠 Outils,
  icône `Utensils` déjà importée dans ce fichier) → `RecipesListSheet`. L'entrée existante « Importer
  une recette » (section 📷 Scanner) est inchangée, toujours vers `RecipeImportSheet`.
- **Validation** : `tsc --noEmit` / `eslint` (0 erreur, warning `no-explicit-any` pré-existant sur
  `useRecipes.ts` uniquement) / `npx vitest run` (1198 passed, 0 régression — le test de couverture
  `mealSelectCoverage.test.ts` valide que `RecipeDetailSheet.tsx` rend bien `<MealSelect>`) /
  `npm run build` / `scripts/validate-supabase.mjs` (0 erreur, avertissements pré-existants non liés)
  tous verts. Vérification visuelle en navigateur non obtenue (même limite d'environnement que les
  sessions précédentes).

## Import de recettes — fiche premium : résumé IA, auteur, temps, tags, réanalyse (2026-08-07, session suivante)
- **Demande de Nathan** : transformer chaque recette importée en véritable fiche premium façon « livre
  de recettes personnel enrichi par IA » — en-tête complet (miniature/titre/@auteur/lien/date/
  confiance), description originale ET résumé IA (jamais fusionnés), infos recette (macros + temps
  prépa/cuisson), ingrédients éditables avec recalcul macros, tags auto (modifiables), + action
  « Réanalyser » avec comparaison ancienne/nouvelle. Architecture existante réutilisée telle quelle
  (aucun flux cassé), schéma étendu uniquement là où la valeur est réelle (temps historisé, résumé,
  auteur, tags) — `recipes.tags`/`recipes.prep_minutes` existaient déjà depuis la V2 initiale et sont
  simplement enfin renseignés par le pipeline, pas redéfinis.
- **Migration `20260824090000_recipe_premium_fiche.sql`** (additive) : `recipes` gagne `ai_summary`,
  `source_author`, `cook_minutes`, `last_reanalyzed_at`, `reanalysis_count` (défaut 0) ;
  `recipe_import_cache` gagne les mêmes champs partageables (`ai_summary`, `source_author`,
  `prep_minutes` — absent du cache jusqu'ici —, `cook_minutes`, `tags`) pour qu'une copie sur cache hit
  transporte la fiche complète sans re-analyse IA.
- **Pipeline backend — nouveaux champs threadés de bout en bout** :
  - `_shared/recipe-import.ts` : `RECIPE_TAGS` (liste fermée, 13 tags : High Protein/Healthy/Meal Prep/
    Low Carb/Vegetarian/Vegan/Dessert/Breakfast/Lunch/Dinner/Snack/Spicy/Quick Recipe) + `RecipeExtraction`
    enrichi (`aiSummary`, `authorHandle`, `prepMinutes`, `cookMinutes`, `tags`).
  - `recipe-parser.ts` : `RECIPE_TOOL` gagne `ai_summary`/`prep_minutes`/`cook_minutes`/`tags` (enum
    `RECIPE_TAGS`, max 5) — générés par Gemini dans le MÊME appel tool-calling qu'avant (zéro coût IA
    supplémentaire). `prep_minutes`/`cook_minutes` en `number` (0 = non détectable), pas `["number","null"]`
    — même convention que `grams` (meal-items.ts) pour rester dans le sous-ensemble JSON Schema le plus
    sûr pour le tool-calling Gemini.
  - `instagram-provider.ts` : `extractAuthorHandle()` — best-effort, regex sur `og:title`/`og:description`
    (formats `"Nom (@handle) • ..."` et `"... - handle on Instagram: ..."`) — Instagram n'expose pas
    l'auteur via une balise dédiée sur une page publique non authentifiée, `null` si aucun pattern ne
    matche, jamais bloquant.
  - `nutrition-engine.ts` : `computeRecipeExtraction()` prend un `PassthroughContent` (`originalCaption`
    + `authorHandle`, remplace l'ancien paramètre `originalCaption` seul) + sanitise `ai_summary`
    (cap 1200c), `prep_minutes`/`cook_minutes` (0..600 ou `null`), `tags` (filtre sur `RECIPE_TAGS`,
    dédupliqué, max 5).
  - `recipe-db.ts` : les deux mappers (`userRowToExtraction`/`cacheRowToExtraction`) + les deux inserts
    (`createUserRecipeFromExtraction`/`saveCachedRecipe`) portent maintenant TOUS les champs de
    `RecipeExtraction` — factorisés via `extractionToRecipeRow()`/`extractionToCacheRow()` (évite la
    duplication de 15 champs à 2 endroits). Nouveau `refreshCachedRecipe()` (upsert `onConflict:
    "source_kind,source_url"` — contrairement à `saveCachedRecipe`, on VEUT ici écraser une entrée
    existante, c'est le sens de la réanalyse) et `bumpReanalysisHistory()` (lecture-puis-écriture de
    `reanalysis_count`/`last_reanalyzed_at`, non-atomique mais acceptable — usage mono-utilisateur).
- **« Réanalyser la recette » — nouveau chemin dédié, pas une branche de l'import normal** :
  `recipe-import-handler.ts` gagne `handleRecipeReanalyze()` (fonction séparée de `handleRecipeImport`,
  délibérément — ne touche JAMAIS `findUserRecipe`/`findCachedRecipe`, relance TOUJOURS le pipeline
  complet). Rafraîchit le cache global (bénéfice futur) et bump l'historique de réanalyse
  (`bumpReanalysisHistory`, compte à chaque tentative — appliquée ou non) mais **ne modifie jamais
  `recipes`/`recipe_ingredients`** : retourne juste la fiche fraîche, c'est le frontend qui décide de
  l'appliquer via `useUpdateRecipe` (même mutation que pour une édition manuelle — aucune nouvelle
  route de persistance créée). `recipe-import/index.ts` route vers `handleRecipeReanalyze` quand le
  corps contient `reanalyze: true` (sinon `handleRecipeImport` inchangé) — toujours UNE SEULE edge
  function, comme demandé.
- **Frontend — `useRecipes.ts`** : `Recipe` gagne `ai_summary`/`source_author`/`cook_minutes`/
  `last_reanalyzed_at`/`reanalysis_count`. `RecipeUpdatePatch` gagne `tags`/`ai_summary`/
  `prep_minutes`/`cook_minutes` (appliqués par la nouvelle logique de réanalyse ET par l'édition
  manuelle des tags). Nouveau `useReanalyzeRecipe()` — appelle `recipe-import` avec `reanalyze: true`,
  invalide `["recipe", id]` en toute circonstance (l'historique change côté serveur que le résultat
  soit appliqué ou non).
- **`RecipeDetailSheet.tsx` — réécriture complète (fiche premium)** :
  - En-tête : miniature + @auteur + date d'import + confiance + bouton dédié « Voir le Reel Instagram »
    (`ExternalLink`, plein largeur, pas juste un lien texte comme avant).
  - Description originale (`source_description`) ET résumé IA (`ai_summary`, encadré `primary/5`,
    icône Sparkles) — deux blocs toujours distincts, jamais fusionnés/remplacés.
  - Chips prep/cook time affichées uniquement si détectées (`recipe.prep_minutes`/`cook_minutes`
    non-null) — jamais un « 0 min » trompeur.
  - Ingrédients éditables avec un **second champ grammes** en mode édition (en plus de la quantité
    existante) — `rescaleAfterGramsChange()` recalcule proportionnellement calories/protéines/glucides/
    lipides/fibres selon le ratio masse-totale-après/masse-totale-avant. Ce n'est pas un recalcul
    nutritionnellement exact (pas de macros par ingrédient dans ce schéma, décision V2 assumée) mais une
    estimation proportionnelle honnête, cohérente avec la contrainte « pas de nouveau schéma sauf valeur
    réelle » — pas de nouvel appel IA, pas de colonnes macro par ingrédient.
  - Tags : chips avec suppression (×) + `<details>` natif listant les tags `RECIPE_TAGS` restants — clic
    = `useUpdateRecipe({tags})` immédiat (pas gaté par le mode « Modifier », comme le favori).
  - Nouveau bouton « Réanalyser la recette » (visible seulement si `source_url`+`source_kind` présents,
    donc jamais sur une recette manuelle/dupliquée) → `ReanalysisComparison` (carte ancienne vs
    nouvelle : kcal/confiance/nb ingrédients côte à côte, badge « plus fiable » si confiance
    nouvelle > ancienne + 0.02) → « Mettre à jour la recette » (applique via `useUpdateRecipe`) ou
    « Garder l'actuelle » (ignore, ferme la comparaison) — jamais d'écrasement automatique/silencieux.
  - Footer historique : date d'import + date de dernière réanalyse + compteur, texte discret.
- **Validation** : `tsc --noEmit` / `eslint` (0 erreur, warnings `no-console`/`no-explicit-any`
  pré-existants sur ce type de fichier) / `npx vitest run` (1199 passed, +1 vs avant — nouveau
  « Cas 8 — Réanalyser » dans `recipe-import.e2e.test.ts`, assertions étendues sur le Cas 1 pour
  couvrir résumé IA/auteur/temps/tags) / `npm run build` / `scripts/validate-supabase.mjs` tous verts.
  Fake client Supabase du test E2E étendu avec `.upsert()`/`.update()` (manquants jusqu'ici, nécessaires
  pour tester `refreshCachedRecipe`/`bumpReanalysisHistory`). Vérification visuelle en navigateur non
  obtenue (même limite d'environnement que les sessions précédentes).

## Import de recettes — gestionnaire complet : collections + liste de courses (2026-08-07, session suivante)

**Demande** : transformer "Mes recettes" en gestionnaire complet — (1) Collections : créer/renommer/
supprimer, ajouter/retirer une recette (many-to-many), collections par défaut (Favoris/Meal Prep/
Sèche/Prise de masse/Rapide/À tester) + collections personnalisées ; (2) Liste de courses : bouton
"Ajouter à la liste de courses" depuis une recette (ou plusieurs, sélection multiple), fusion
automatique des ingrédients identiques + somme des quantités, regroupement par rayon (Fruits et
légumes/Viandes/Poissons/Produits laitiers/Épicerie/Surgelés/Boissons/Divers), cases à cocher,
persistance. Contraintes : réutiliser l'architecture existante, ne rien casser, garder la
compatibilité multi-sources (TikTok/YouTube/photo à venir), fournir les migrations, TypeScript/
ESLint/Vitest/build verts.

- **Migration** `20260825090000_recipe_collections_and_shopping_categories.sql` (additive) :
  - `recipe_collections` (id, user_id, name unique par user, is_default, created_at/updated_at) +
    `recipe_collection_recipes` (collection_id, recipe_id, user_id, added_at — clé primaire composite,
    many-to-many). RLS `user_id = auth.uid()` sur les deux, mêmes conventions que `recipes`.
  - `category text` (check sur la liste fermée des 8 rayons) ajouté sur `recipe_ingredients` ET
    `shopping_list` — permet le regroupement de la liste de courses sans réintroduire un catalogue
    d'ingrédients (celui-ci — `public.items` avec sa colonne `category` — a été entièrement supprimé
    en migration `20260714145745` lors du retrait du module "Maison" ; pas de retour en arrière ici).
- **Décision — "Favoris" reste VIRTUEL** : jamais une ligne `recipe_collections` — dérivé de
  `recipes.is_favorite` (déjà câblé depuis la session "module Recettes", étoile sur chaque carte/fiche).
  Le dupliquer en vraie collection aurait créé deux sources de vérité concurrentes pour le même concept.
  `FAVORITES_COLLECTION_ID = "__favorites__"` (constante frontend, jamais envoyée en base) sert
  uniquement de clé de filtre côté UI.
- **Décision — seed des 5 collections par défaut : paresseux côté client**, pas de trigger DB. Le
  pattern précédent (`home_categories`, seed au signup) a été entièrement retiré du code (module
  "Maison" supprimé) — aucune référence active à suivre, et un trigger aurait ajouté un mécanisme non
  testable simplement. `useCollections()` (`src/hooks/useCollections.ts`) : `seedDefaultCollectionsIfEmpty()`
  insère Meal Prep/Sèche/Prise de masse/Rapide/À tester **seulement si** l'utilisateur n'a encore
  aucune ligne (`count === 0`), avant chaque fetch de la liste — idempotent, aucun risque de doublon.
- **Décision — catégorie ingrédient : IA d'abord, repli mot-clé ensuite**. `RECIPE_TOOL`
  (`recipe-parser.ts`) gagne un champ `category` (enum des 8 rayons, `required`) sur chaque ingrédient
  — coût IA nul (même appel multimodal qu'avant, un champ de plus dans le schéma tool-calling).
  `nutrition-engine.ts` : nouvelle `sanitizeCategory()` (garde uniquement les valeurs de la liste
  fermée, `null` sinon). Pour les recettes existantes/manuelles sans catégorie IA, nouveau module pur
  `src/lib/nutrition/ingredientCategory.ts` (`guessIngredientCategory()` — règles mot-clé par rayon,
  `resolveIngredientCategory()` — catégorie stockée sinon repli). Zéro appel réseau, zéro React.
- **Backend — propagation `category`** : `RecipeIngredientExtraction`/`ImportedIngredient` (types
  partagés backend + frontend, `INGREDIENT_CATEGORIES` dupliqué dans les deux comme le reste du
  contrat) gagnent `category: IngredientCategory | null`. `recipe-db.ts` : les deux mappers
  (`userRowToExtraction`/`RecipeIngredientRow`) et les deux inserts (`createUserRecipeFromExtraction`,
  colonne `category` sur `recipe_ingredients`) portent le champ ; le cache global
  (`recipe_import_cache.ingredients`, jsonb) le transporte automatiquement sans migration
  supplémentaire (blob JSON, pas de colonne dédiée). `useRecipes.ts` (`RecipeIngredient`,
  `RecipeIngredientPatch`) et `RecipeDetailSheet.tsx` (`startEditing`/`applyReanalysis`) propagent
  `category` de bout en bout (édition manuelle, réanalyse).
- **Nouveau `src/hooks/useCollections.ts`** : `useCollections()` (liste + seed paresseux),
  `useCreateCollection()`/`useRenameCollection()`/`useDeleteCollection()`, `useRecipeCollectionIds(recipeId)`
  (appartenances d'une recette), `useAddRecipeToCollection()`/`useRemoveRecipeFromCollection()` (upsert/
  delete sur la table de jointure), `useCollectionRecipeIds(collectionId)` (recettes d'une collection,
  désactivé si `FAVORITES_COLLECTION_ID` — le virtuel se filtre côté client sur `is_favorite`).
- **Nouveau `src/components/fitness/CollectionsListSheet.tsx`** : créer (formulaire), renommer (inline,
  Check/X), supprimer (confirmation inline) — jamais "Favoris" dans cette liste (toujours virtuel).
- **`RecipesListSheet.tsx`** : chips de filtre horizontal (Toutes / Favoris virtuel / chaque collection
  réelle) + bouton header "Gérer les collections" (`FolderCog`, ouvre `CollectionsListSheet`) + nouveau
  **mode sélection multiple** (checkbox par carte, jamais imbriquée dans le `<button>` de la carte —
  sibling comme l'étoile favori) avec barre d'action flottante "Ajouter N recette(s) à la liste de
  courses" → `AddToShoppingListSheet`.
- **`RecipeDetailSheet.tsx`** : nouvelle section "Collections" (chips toggle multi-sélection, exclut
  volontairement Favoris — déjà géré par l'étoile dédiée, éviter un doublon d'affordance) + nouveau
  bouton "Ajouter à la liste de courses" (une seule recette) → `AddToShoppingListSheet`.
- **Nouveau `src/hooks/useShoppingList.ts`** — liste de courses depuis des recettes sélectionnées,
  distinct de `useMealPlan.ts` (planning hebdo) mais réutilise le **même domaine pur**
  `buildShoppingList`/`aggregateNeeds` (`src/lib/nutrition/shoppingList.ts`, étendu de façon additive
  avec `category?` sur `PlannedIngredient`/`NeededIngredient`/`ShoppingLine` — 100% rétro-compatible
  avec `MealPlanSheet.tsx`, aucune régression). `useRecipesShoppingPreview(recipeIds)` lit
  `recipe_ingredients` des recettes sélectionnées avec `servings: 1` (les quantités y représentent déjà
  la recette telle qu'écrite, contrairement au planning qui multiplie par les portions planifiées) et
  résout la catégorie via `resolveIngredientCategory`. `useSaveRecipesShoppingList()` écrit dans
  `shopping_list` (table **existante**, réutilisée telle quelle — `done`/persistance par utilisateur
  déjà présents depuis la V1 planning). `useShoppingList()`/`useToggleShoppingItem()`/
  `useDeleteShoppingItem()`/`useClearBoughtItems()` pour la lecture/le cochage/le nettoyage.
- **Nouveau `src/components/fitness/AddToShoppingListSheet.tsx`** : aperçu de la fusion (une ou
  plusieurs recettes), groupé par rayon, avant confirmation d'écriture — utilisé à la fois depuis
  `RecipesListSheet` (sélection multiple) et `RecipeDetailSheet` (une recette), même composant.
- **Nouveau `src/components/fitness/ShoppingListSheet.tsx`** : liste persistée groupée par rayon,
  cases à cocher (achat), section "Achetés" séparée (opacité réduite, bouton "Vider"). Nouvelle entrée
  "Liste de courses" dans `NutritionCommandCenter` (`NutritionTab.tsx`, section "tools", à côté de "Mes
  recettes").
- **Validation** : `tsc --noEmit` (0 erreur) / `eslint` sur tous les fichiers touchés (0 erreur, seuls
  warnings pré-existants `no-explicit-any` sur `supabase as any`, même convention que `useMealPlan.ts`/
  `useRecipes.ts`) / `npx vitest run` (1199 passed, 32 skipped — suite E2E `recipe-import` inchangée à
  13 tests, `category` ajoutée au payload mock Gemini par défaut sans casser d'assertion existante) /
  `npm run build` vert. `src/routeTree.gen.ts` (drift de build habituel) revert avant commit.
  Vérification visuelle en navigateur non obtenue (même limite d'environnement que les sessions
  précédentes — pas de serveur dev lancé/testé manuellement).
- **Migration non appliquée à la base distante dans cette session** (comme les migrations des sessions
  précédentes sur cette branche) — écrite et committée, sera appliquée par `migrate.yml` au merge vers
  `main`, qui régénère aussi `src/integrations/supabase/types.ts` ensuite. Les hooks utilisent le
  client `as any` (convention déjà en place pour toutes les tables Nutrition V2), donc aucune dépendance
  de compilation sur `types.ts` pour ce module.
- **Mise en prod** : PR #26 mergée sur `main` (squash, SHA `123bb35fc6f6da03d14ed42a1b04c73e5d17b0d6`)
  après checks CI verts (TypeScript, migrations statiques, RLS isolation, DB constraint parity).
  `migrate.yml` a appliqué `20260825090000_recipe_collections_and_shopping_categories` (confirmé via
  `list_migrations`) et régénéré `types.ts` (commit auto `ci: auto-corrige la dérive types.ts après
  migration`). `deploy-functions.yml` a redéployé `recipe-import` (confirmé `ACTIVE`, version 2 côté
  Supabase). Module collections + liste de courses en production.

## Import de recettes — correctif nettoyage `source_description` (entités HTML + métadonnées Instagram) (2026-08-08, session suivante)

**Demande** : un test réel d'import montrait deux défauts dans `source_description` — (1) entités HTML
numériques non décodées (`&#x1f363;`, `&#xa0;`, ...) affichées brutes au lieu des emojis/espaces
correspondants ; (2) le préfixe de métadonnées Instagram (`"1,066 likes, 46 comments - bou... - July
28, 2026:"`) inclus dans la légende alors qu'il n'en fait pas partie. Contraintes explicites : ne
jamais réécrire/traduire la légende avec l'IA, ne rien supprimer arbitrairement (uniquement le
nettoyage de format + retrait des métadonnées Instagram reconnues), conserver emojis/hashtags/
quantités/texte original intégralement, ajouter un test de non-régression dédié, ne rien modifier
d'autre dans le fonctionnement de l'import.

- **Cause racine** : `instagram-provider.ts` → `decodeHtmlEntities()` ne gérait que 5 entités nommées
  (`&amp;` `&quot;` `&#39;` `&lt;` `&gt;`) — aucun support des références numériques décimales/
  hexadécimales (`&#NNN;`/`&#xHHHH;`), massivement utilisées par Instagram pour encoder les emojis
  d'og:description. Le préfixe likes/comments/date d'Instagram n'était par ailleurs jamais retiré —
  `page.caption = description ?? title` était utilisé tel quel.
- **Fix — `decodeHtmlEntities()` réécrite** : regex unique `/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g` —
  branche numérique via `String.fromCodePoint` (gère aussi les emojis hors BMP, paires suggogates,
  contrairement à `fromCharCode`), branche nommée via une table (`amp`/`quot`/`apos`/`lt`/`gt`/`nbsp`).
- **Nouveau `stripInstagramMetadata()`** : retire UNIQUEMENT un préfixe reconnu — compteurs
  (likes/vues + éventuels commentaires) + identité + soit `"- Mois JJ, AAAA"` soit `"on Instagram"` +
  `":"`. Couvre les deux formats observés (`"1,066 likes, 46 comments - user - July 28, 2026: ..."` ET
  `"523 Likes, 12 Comments - user (@handle) on Instagram: ..."`). Si le format ne matche pas, le texte
  est laissé intact — jamais de suppression arbitraire hors de ce préfixe reconnu.
- **Nouveau `normalizeWhitespace()`** : espaces insécables (` `, issus du décodage de `&#xa0;`) →
  espace normal, fins de ligne uniformisées, espaces multiples réduits par ligne (`trimEnd`), 3+ lignes
  vides consécutives réduites à 2, trim global — préserve intentionnellement les sauts de ligne simples
  et doubles (mise en forme originale de la légende : titres, sections ingrédients, hashtags).
- **Nouveau `cleanInstagramCaption()` exporté** — compose les trois étapes dans l'ordre demandé
  (décodage → retrait métadonnées → normalisation), zéro appel IA, zéro réécriture/traduction. Branché
  dans `fetchInstagramPage()` sur le `caption` retourné UNIQUEMENT (`description ?? title` nettoyé) —
  `extractAuthorHandle(title, description)` continue de recevoir les champs bruts (juste
  entity-décodés comme avant), donc l'extraction de l'auteur (@handle) est inchangée.
- **Nouveau test dédié** `supabase/functions/_shared/instagram-provider.test.ts` (7 cas, exécuté par
  vitest via le pattern `supabase/functions/**/*.test.ts` déjà configuré) : décodage emojis
  numériques + nommés, retrait des deux formats de préfixe Instagram, normalisation espaces
  insécables/lignes vides, cas réel complet (reprend l'exemple du bug — vérifie absence de `&#`, de
  "likes"/"comments", de la date, ET présence des emojis/quantités/macros/hashtags), non-modification
  si le format n'est pas reconnu, `null` sur entrée vide.
- **Validation** : `tsc --noEmit` (0 erreur) / `eslint` sur les fichiers touchés (0 erreur, seuls
  warnings `no-console` pré-existants sur des lignes non touchées) / `npx vitest run` (1206 passed,
  +7 vs avant — la suite E2E `recipe-import` à 13 tests reste verte, fixture `PUBLIC_HTML` inchangée
  donc non affectée) / `npm run build` vert. Aucun autre fichier du pipeline d'import touché
  (parser/engine/db/handler inchangés) — correctif strictement scopé au nettoyage de légende, comme
  demandé.
