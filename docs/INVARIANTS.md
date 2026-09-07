# Invariants CORTEX — les règles à ne jamais casser

**Ce document est court, et doit le rester.** Il ne contient QUE des décisions permanentes :
ce qui, s'il est cassé, produit une perte de données, une récompense fausse, un doublon ou une
régression de sécurité. Il ne raconte aucun chantier.

- L'**histoire** des chantiers (ce qui a été fait, quand, pourquoi, sur quelle branche) vit dans
  [`MEMORY.md`](../MEMORY.md), à la racine. Ce journal reste la mémoire longue du projet : il
  n'est jamais réécrit, seulement complété.
- Les **conventions de travail** (piliers RPG, direction artistique, workflow Git, stack) vivent
  dans [`CLAUDE.md`](../CLAUDE.md).
- Le présent document est le **filet de sécurité technique** : avant de modifier le moteur
  offline, la clôture de séance, la récompense ou les lectures Supabase, on le relit.

Chaque invariant indique **où il est appliqué** et **ce qui le vérifie**. Un invariant sans
garde-fou exécutable n'en est pas un : si vous en ajoutez un, ajoutez le test avec.

---

## 1. Le moteur offline

### 1.1 La file est FIFO, et le reste

`syncQueue` est ordonnée par `createdAt` (horloge **monotone** — `Date.now()` seul produirait des
égalités dans une rafale de taps, et le tri retomberait alors sur l'ordre des uuid).
**Ne jamais paralléliser la file** : l'ordre est ce qui garantit qu'un `create` parent parte avant
ses enfants.
→ `src/lib/offline/syncQueue.ts` (`nextMonotonicIsoTimestamp`, `listPendingOperations`)
→ vérifié par `syncQueueResilience.test.ts`, `fitnessCoreOffline.test.ts`

### 1.2 Une opération n'est jamais perdue en silence

Succès = retirée. Échec réseau = conservée avec backoff. Conflit = retirée de la file mais
**archivée** dans `conflicts` jusqu'à arbitrage explicite. Plafond de tentatives = `blocked`,
jamais supprimée.
→ `src/lib/offline/syncEngine.ts`
→ vérifié par `offlineSync.test.ts`, `syncRetryBounds.test.ts`

### 1.3 `blocked` est une dépendance VIVANTE

Une opération `blocked` retient la barrière de dépendance (`dependsOnRecords`) exactement comme une
opération `pending`. C'est volontaire : elle n'atteindra jamais le serveur sans décision de
l'utilisateur, donc l'écriture qui en dépend ne doit pas partir. Un conflit non résolu compte
pareil.
→ `src/lib/offline/syncQueue.ts` (`hasLiveDependencies`, `LIVE_OPERATION_STATUSES`)
→ vérifié par `blockedDependencies.test.ts`, `syncQueueDependencyBarrier.test.ts`

### 1.4 Prise de possession atomique

`claimOperation` lit et écrit dans une seule transaction IndexedDB : deux onglets ne peuvent pas
envoyer la même opération. Aucun prédicat préalable ne remplace ce claim.
→ `src/lib/offline/syncQueue.ts`

### 1.5 Un seul driver, une seule passe

Les effets du moteur (poll, retour réseau) sont portés par `OfflineSyncDriver`, monté **une seule
fois** au niveau authentifié. `runSyncQueueOnce` porte le verrou de passe unique. L'UI de
synchronisation est purement lectrice, et vit **uniquement** dans le Profil — elle ne s'impose
jamais par-dessus l'écran courant.
→ `src/lib/offline/syncRuntime.ts`, `src/hooks/useOfflineSync.ts`
→ vérifié par `components/profile/syncUiPlacement.test.ts` (garde-fou de convention)

### 1.6 Déconnexion : purge et garde

`signOut` purge les données offline du compte sortant (`purgeUserOfflineData`) et vide le cache
React Query. Avant cela, l'utilisateur est averti s'il reste du travail non synchronisé.
→ `src/hooks/use-auth.tsx`, `src/lib/offline/signOutGuard.ts`

---

## 2. Séance : unicité, numérotation, clôture

### 2.1 Une seule séance active à la fois

Trois niveaux, complémentaires, aucun ne remplace les autres :

1. **local** — `assertNoActiveWorkout` avant toute création ;
2. **section critique** — garde + création sérialisées par utilisateur, sinon deux démarrages
   rapprochés lisent tous deux l'état d'avant la première écriture ;
3. **serveur** — index unique partiel `workouts_one_active_per_user`, seul recours contre la
   course entre deux appareils.
   → `src/hooks/use-fitness.ts` (`assertNoActiveWorkout`), `src/lib/fitness/activeWorkoutStart.ts`,
   `src/lib/fitness/activeWorkoutGuard.ts`
   → vérifié par `activeWorkoutStart.test.ts`, `offline/activeWorkoutStartOffline.test.ts`

### 2.2 `set_number` — allocation locale sérialisée + remappage serveur

`exercise_sets` porte `UNIQUE (exercise_id, set_number)` et le numéro est choisi **côté client**
(une série doit être créable hors ligne). Deux collisions distinctes, deux remèdes :

- même contexte → `allocateSetNumber` sérialise le calcul et l'écriture ;
- contextes différents → remappage `23505` à la synchronisation, **sans perte**.
  **Ne jamais toucher à l'un en croyant corriger l'autre.**
  → `src/lib/fitness/setNumberAllocation.ts`, `src/lib/offline/uniqueSequenceRemap.ts`
  → vérifié par `setNumberAllocation.test.ts`, `exerciseSetUniqueCollision.test.ts`

### 2.3 Le verrou de clôture est INTERNE à la mutation

`runExclusiveSessionClosure` refuse une seconde clôture (terminer/annuler) pour une même séance,
quel que soit le point d'entrée. Les `disabled` à l'écran ne font que **refléter** ce verrou : ils
ne le remplacent jamais.
→ `src/lib/fitness/sessionClosure.ts`
→ vérifié par `sessionClosure.test.ts`, `components/fitness/ActiveWorkoutView.closure.test.tsx`

### 2.4 Une saisie invalide n'atteint jamais la donnée métier

Trois issues, jamais quatre : vide → `null` assumé ; valeur exploitable → écrite normalisée ;
saisie inexploitable → **rien n'est écrit** et le champ revient à la valeur enregistrée. Un `NaN`
ou une valeur hors bornes partie en base devient une opération `blocked`, donc une séance retenue.
→ `src/lib/fitness/sets.ts` (`parseSetFieldInput`)
→ vérifié par `sets.test.ts`, `exerciseCard/ActiveExerciseCard.setInput.test.tsx`

---

## 3. Récompense et progression (RPG)

### 3.1 Le serveur est l'unique autorité sur l'XP

Le montant d'XP est décidé par le trigger `award_xp_on_workout_complete`, déclenché quand
`workouts.status` passe à `'completed'` **en base**. Aucun montant n'est jamais calculé côté
client.

### 3.2 La barrière de confirmation ne se contourne pas

Tant que le serveur n'a pas déposé ses compteurs (`workouts.xp_before/xp_after/level_before/
level_after`), l'écran affiche un état honnête — **jamais** une valeur repliée sur `user_stats`,
qui afficherait « +0 XP » avec une barre figée sur l'XP d'avant la séance.
→ `src/lib/fitness/rpg/rewardConfirmation.ts`
→ vérifié par `rewardConfirmation.test.ts`, `offline/sessionRewardOffline.test.ts`

### 3.3 La progression vient de l'entraînement

Les Saisons **racontent** la progression, elles ne donnent aucun avantage de puissance.
→ `docs/architecture/rpg-vision-et-r1-niveau-personnage.md`, `docs/architecture/rpg-saisons.md`

---

## 4. Lectures Supabase

### 4.1 Aucune lecture non bornée

PostgREST tronque toute réponse à `max-rows` **en silence**. Une lecture de référentiel doit passer
par `fetchAllRows`/`fetchAllRowsForIds` (complétude **prouvée** par `count: "exact"`, jamais
déduite d'une page plus courte que demandée), ou porter `single`/`maybeSingle`/`limit`/`range`.
Tout appelant de `fetchAllRows` termine ses `order(...)` par `order("id")` : sans ordre total, deux
pages peuvent doublonner une ligne et en omettre une autre.
→ `src/lib/supabase/pagedRead.ts`
→ vérifié par `check:bounded-reads` (baseline à cliquet, `scripts/bounded-reads-baseline.json`)

### 4.2 `types.ts` est un artefact généré

La base fait foi. Migration → merge → `npm run gen:types` → commit. **Jamais d'édition à la main.**
→ `docs/architecture/supabase-types-source-of-truth.md`

---

## 5. Conventions de code non négociables

- `/src/lib/**` : logique pure — **zéro** import React, Supabase ou IndexedDB, **zéro** couleur,
  **zéro** slug d'UI dans le domaine.
- `/src/hooks/**` : connexion Supabase. `/src/components/**` : UI seulement.
- Jamais de doublon de composant, jamais de réintroduction d'un composant supprimé.
- Le rang se représente **uniquement** via `RankIllustration` ; toute couleur de rang passe par
  `rankTheme.ts` (voir `CLAUDE.md` pour le détail et les exceptions explicites).
- **Aucun test désactivé** hors des deux fichiers d'intégration env-gated
  (`security/rls.test.ts`, `nutrition/nutritionMealCheck.test.ts`) — la CI échoue sinon.
- Mobile first, toujours.

---

## Comment ce document évolue

Une nouvelle règle n'arrive ici que si elle est **permanente** et **vérifiable**. Le récit du
chantier qui l'a produite, lui, va dans `MEMORY.md`. Si un invariant devient faux, on le corrige
ici — on ne le laisse jamais mentir.
