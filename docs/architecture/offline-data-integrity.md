# Intégrité et vérité des données offline

> Chantier 3 de l'audit du 02/09/2026 — MAJ-02, MAJ-03, MAJ-08, MIN-16, AMEL-05.
> Vérifications faites en direct sur le projet Supabase `bcwfvpwxzlmkxobvbtzp`
> (`pg_trigger`, `pg_get_functiondef`, volumétrie réelle) le 03/09/2026.

Ce document explique **pourquoi** le store local peut diverger du serveur, ce
qui a été corrigé, et surtout **ce qui a été délibérément laissé en l'état** —
avec la règle qui l'impose.

## Règle absolue

> Une donnée locale n'est JAMAIS supprimée parce qu'elle est absente d'une
> réponse serveur dont l'exhaustivité n'est pas démontrée. En cas de doute, on
> garde la donnée locale.

Une réponse PostgREST peut être partielle pour au moins cinq raisons, toutes
**silencieuses** : pagination, plafond `max-rows` (1 000 par défaut chez
Supabase), fenêtre applicative (`limit`), filtrage RLS, échec partiel. Aucune
ne se distingue d'une suppression réelle sans preuve supplémentaire.

## MAJ-02 — `updated_at` réécrit après le `RETURNING`

### La cause exacte

`syncEngine.applyOperation` écrit avec `.upsert(...)/.update(...).select().single()`,
c'est-à-dire un `RETURNING`. PostgreSQL calcule `RETURNING` sur la ligne telle
qu'elle sort des triggers **BEFORE** ; les triggers **AFTER** de la même
instruction s'exécutent **ensuite**.

Sur `public.workouts`, la base porte :

| Trigger                                | Moment                             | Effet                                                                                                                                              |
| -------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trg_workouts_updated_at`              | `BEFORE UPDATE`                    | `set_updated_at()` → `NEW.updated_at = now()`                                                                                                      |
| `trg_award_xp_on_workout_complete`     | `AFTER INSERT OR UPDATE OF status` | `award_xp_on_workout_complete()` termine par `UPDATE public.workouts SET xp_before=…, xp_after=…, level_before=…, level_after=… WHERE id = NEW.id` |
| `trg_reverse_xp_on_workout_uncomplete` | `AFTER UPDATE OF status`           | `reverse_xp_on_workout_uncomplete()` remet ces mêmes colonnes à `NULL`                                                                             |

L'`UPDATE` imbriqué des deux triggers AFTER redéclenche le trigger BEFORE et
**avance `updated_at` une seconde fois**, après le `RETURNING`. Le client
mémorise donc T1 alors que la ligne persistée porte T2.

Conséquence mesurée : la modification locale suivante part avec
`baseUpdatedAt = T1`, `syncEngine` relit la ligne (garde PGRST116), trouve T2,
et lève un `updated_at_mismatch` — **un faux conflit**, alors que personne n'a
touché la séance ailleurs. Scénario typique : séance terminée puis annotée.

### La correction

`src/lib/offline/serverRewrittenRows.ts` déclare les tables concernées
(aujourd'hui `workouts`, et elle seule). Pour ces tables, `syncEngine` **relit
la ligne** après une écriture réussie (`readAuthoritativeRow`) et mémorise
cette valeur. Aucun trigger n'est modifié : les garanties d'intégrité RPG
(idempotence, garde `OLD.status IS DISTINCT FROM 'completed'`, ledger
`xp_events`) sont strictement inchangées.

Bénéfice secondaire : la relecture ramène aussi `xp_before`/`xp_after`/
`level_*`, que le `RETURNING` ne pouvait pas contenir.

Coût : **un** aller-retour supplémentaire par écriture sur `workouts`. Les
autres tables (dont `exercise_sets`, la plus volumineuse) n'en paient aucun —
d'où la liste explicite plutôt qu'une relecture systématique.

Tolérance aux pannes : l'écriture a déjà réussi quand la relecture a lieu. Si
la relecture échoue, on retombe sur la réponse du `RETURNING` (comportement
d'avant le correctif) — jamais un échec, jamais une perte.

### Le cas voisin qui N'EST PAS traité par ce mécanisme

`recipe_ingredients` porte `recipe_ing_recompute` (`AFTER INSERT OR DELETE OR
UPDATE`) → `recompute_recipe_nutrition()` → `update public.recipes … updated_at = now()`.
Ici la ligne réécrite n'est **pas** celle de l'opération : c'est la recette
parente. Une relecture après l'opération sur `recipe_ingredients` ne
corrigerait donc pas `recipes`.

Ce cas se répare par le chemin existant : après un passage de file réussi,
`useOfflineSync` invalide les queries offline-first, `useRecipes` /
`useRecipe` relisent le serveur et `hydrateEntitiesFromServer` réécrit
`serverUpdatedAt` (l'entité est `synced` à ce moment-là, l'hydratation n'est
donc pas court-circuitée). Corriger cela dans le moteur supposerait de
**recaler la base de comparaison d'une ligne parente sans l'avoir écrite**,
ce qui reviendrait à écraser silencieusement une modification concurrente
faite sur un autre appareil — exactement la garantie qu'on refuse de perdre.
On documente donc la limite plutôt que d'affaiblir la détection de conflit.

## MAJ-03 — réconciliation des suppressions serveur

### Avant

`hydrateEntitiesFromServer` était **purement additive** : elle écrivait les
lignes reçues et ne retirait jamais rien. Une ligne supprimée depuis un autre
appareil restait indéfiniment visible en local.

### Maintenant

L'hydratation reste additive **par défaut**. Une suppression locale n'est
possible que via l'option `reconcileWithin`, qui est une **affirmation de
complétude** de la part de l'appelant :

> « `rows` contient TOUTES les lignes serveur de cette table, pour cet
> utilisateur, qui satisfont ce prédicat. »

Cette preuve ne peut venir que du site d'appel, et elle repose sur le **total
exact annoncé par la base** (`count: "exact"`, en-tête `Content-Range`),
jamais sur une heuristique de taille de réponse. « Moins de lignes que
demandé » ne distingue pas « fin du jeu de données » de « réponse tronquée par
`max-rows` » — or `max-rows` est une configuration serveur, et cette
distinction autorise des suppressions. Deux formes en production
(`use-fitness.ts::fetchWorkoutsIntoLocalStore`) :

1. **« total atteint »** — le nombre de séances reçues égale le total exact
   ⇒ le jeu est complet pour cet utilisateur. Utilisé pour `workouts`.
2. **« enfants d'une liste explicite de parents, paginés jusqu'à atteindre
   leur total exact, sans erreur »** ⇒ le jeu est complet pour ces parents-là,
   et le prédicat borne la réconciliation à eux. Utilisé pour `exercises`,
   `exercise_sets`, `workout_segments`.

Effet de bord bénéfique : en se calant sur le total plutôt que sur la taille
des pages, la boucle de pagination **absorbe** un `max-rows` abaissé sous la
taille de page (elle continue de paginer au lieu de croire à la fin du jeu de
données). Et si la lecture n'avance plus, ou si le total n'est pas annoncé,
elle renvoie `complete: false` — hydratation additive, aucune suppression.

Même avec cette preuve, une ligne locale n'est retirée que si :

- elle est `synced` (aucune modification locale non confirmée — `pending`,
  `failed` et `conflict` sont intouchables) ;
- aucune opération ne la vise dans la sync queue ;
- elle n'est pas déjà marquée supprimée localement ;
- elle tombe dans le périmètre prouvé.

Les enfants d'une séance prouvée supprimée sont inclus dans le périmètre
(`ON DELETE CASCADE` côté serveur) : pas d'orphelins locaux.

### Tables NON réconciliées (comportement inchangé, volontairement)

Toutes les autres hydratations (`recipes`, `recipe_ingredients`, `nutrition`,
`shopping_list`, `meal_plans`, `saved_meals`, `nutrition_favorites`,
`food_custom_foods`, `supplements`, `physical_goals`, `recipe_collections`,
`workout_templates` et ses enfants, `workout_analyses`) restent **additives**.
Leur requête n'est pas paginée explicitement : elle peut donc être tronquée
en silence par `max-rows`, et « absent de la réponse » n'y est pas une preuve
de suppression. Les rendre réconciliables demanderait d'abord de les paginer
explicitement, table par table — hors périmètre de ce chantier.

## AMEL-05 — tombstones / `deleted_at` : NON, et pourquoi

Trois options ont été comparées :

| Option                                                 | Ce que ça apporte                                                                        | Ce que ça coûte                                                                                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Réconciliation sur jeu prouvé complet** (retenue) | Suppressions serveur répercutées, avec preuve, sans changement de schéma                 | Ne couvre que les datasets qu'on sait borner                                                                                                                                                                 |
| **B. `deleted_at` / tombstones**                       | Répercussion possible même sur un dataset partiel, et sync incrémentale par `updated_at` | Migration sur ~19 tables, réécriture de TOUTES les requêtes de lecture (`is null`), RLS et index à revoir, purge des tombstones à écrire, risque de fuite d'anciennes lignes si une requête oublie le filtre |
| **C. Statu quo (additif)**                             | Aucun risque                                                                             | Le bug reste                                                                                                                                                                                                 |

**Décision : A.** Le seul domaine qui souffrait réellement du problème
(le cœur Fitness) est aussi celui dont le dataset est bornable de façon
déterministe — l'option A le couvre entièrement. Introduire `deleted_at`
partout serait une évolution de schéma majeure et irréversible en pratique,
pour un bénéfice nul sur les tables déjà couvertes et purement théorique sur
les autres tant qu'elles ne sont pas paginées.

**Aucune migration Supabase n'a donc été créée par ce chantier.**

Le jour où une table non bornable devra répercuter ses suppressions, l'option B
redeviendra pertinente — et elle devra alors être décidée table par table, avec
sa migration, ses index, ses RLS et le filtre `deleted_at is null` posé dans
chaque lecture.

## MAJ-08 — hydratation fitness bornée

### Avant

Seules les séances étaient bornées (`limit(200)`). `exercises`,
`exercise_sets` et `workout_segments` partaient en
`select("*").eq("user_id", …)` **sans aucune limite**.

Volumétrie réelle relevée le 03/09/2026 pour l'utilisateur le plus actif :
616 séances, 385 exercices, **1 128 séries**, 26 segments.

Deux défauts :

1. on rapatriait les enfants des 616 séances alors que 200 seulement sont
   hydratées — le reste est inexploitable (aucun parent en local pour la
   jointure) ;
2. surtout, 1 128 > `max-rows` : la réponse `exercise_sets` était **tronquée
   sans erreur**, et les séries manquantes n'arrivaient jamais en local.

### Maintenant

Stratégie parent → enfants, entièrement bornée :

1. les `WORKOUTS_HYDRATION_LIMIT` (= 200) séances les plus récentes,
   départagées par `created_at` pour une frontière déterministe ;
2. **puis uniquement leurs enfants**, demandés par `in(<clé parente>, …)` sur
   des paquets de 100 ids (URL bornée), page par page de 500 lignes
   (`CHILD_PAGE_SIZE`, volontairement sous la valeur par défaut de
   `max-rows`), la boucle s'arrêtant sur le **total exact** annoncé par la
   base et non sur la taille de la dernière page.

`exercise_sets` ne portant pas de `workout_id` (seulement `exercise_id`, cf.
`lib/fitness/workoutSyncDependencies.ts`), la descente se fait en deux temps :
séances → exercices → séries.

**La limite de 200 est inchangée** et le reste volontairement : elle est calée
sur l'usage réel — `useWorkouts` n'affiche que les 60 séances les plus
récentes, la séance active porte toujours la date du jour (donc toujours dans
la fenêtre), et les analyses d'historique profond passent par le serveur
(`useExerciseSetHistory`, `useLastExerciseSession`, `useSenseiTrainingHistory`),
pas par le store local.

Une erreur sur la lecture des séances est désormais **remontée** au lieu d'être
avalée : sans la liste des séances il n'y a aucun enfant à demander, et la
fenêtre de fraîcheur (`workoutsServerRefreshGate`) doit rester ouverte pour
retenter, au lieu de faire croire à un rafraîchissement réussi.

## MIN-16 — `updated_at` local avancé sans changement synchronisable

`repository.update()` réécrivait l'entité avec `data.updated_at = now()` et
`localUpdatedAt = now()` **même quand le patch ne contenait aucune colonne
synchronisable** (`{}`, `{ updated_at }`, `{ id }`…), donc même quand aucune
opération n'était enfilée. Le store local affirmait alors une version que le
serveur ne verrait jamais, et `localUpdatedAt` — l'horodatage présenté comme
« votre version » dans l'arbitrage de conflit — désignait une modification
inexistante.

Depuis ce chantier, un patch sans contenu synchronisable est un **no-op
strict** : aucune écriture IndexedDB, aucun timestamp avancé, aucun changement
de `syncStatus`. Corollaire : le patch appliqué en local est désormais le patch
**débarrassé des colonnes du contrat** — ce qui n'a pas le droit de partir vers
le serveur n'a pas davantage le droit de réécrire l'identité de la ligne en
local.

## Tests

| Fichier                                          | Ce qu'il démontre                                                                                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/offline/updatedAtIntegrity.test.ts`     | MAJ-02 (dont une contre-épreuve qui reproduit le faux conflit avec la valeur du `RETURNING`, et la preuve que le simulateur reproduit bien le trigger) + MIN-16                                                                             |
| `src/lib/offline/fitnessHydrationBounds.test.ts` | MAJ-08 (fenêtre, filtres `in(...)`, pagination sous `max-rows`, gros volume rapatrié intégralement) + MAJ-03 (jeu complet → suppression ; jeu tronqué, lecture en échec, ligne non synchronisée, ligne hors périmètre → aucune suppression) |
| `src/lib/offline/sessionRewardOffline.test.ts`   | Adapté : le local porte désormais les compteurs RPG après synchronisation, grâce à la relecture MAJ-02                                                                                                                                      |
| `src/lib/offline/workoutsRefreshPerf.test.ts`    | Adapté au bornage : le coût réseau reste d'un aller-retour par table et par rafraîchissement réellement utile                                                                                                                               |
