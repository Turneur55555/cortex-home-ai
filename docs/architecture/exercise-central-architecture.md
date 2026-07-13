# Architecture de référence — Exercice-central (ICORTEX)

**Statut : document d'architecture officiel du projet ICORTEX.** Sections 1 à 11 : état final de la migration "exercice-central" (Phases 0 à 4.6), close le 2026-07-13. Sections 12 et 13 : règles de conception et vision long terme pour toutes les évolutions futures (Phase 5 et au-delà). Toute évolution du domaine Fitness doit s'y conformer, ou faire l'objet d'une décision explicite documentée ici.

Projet Supabase : `bcwfvpwxzlmkxobvbtzp`. Dépôt : `github.com/Turneur55555/cortex-home-ai`.

---

## 1. Contexte et principe fondateur

Avant cette migration, un "exercice" n'existait que comme texte libre (`exercises.name`, `workout_segments.label`, ou une clé dans `workouts.metadata.segments`). Toute agrégation historique (progression, records, badges, "exercices récents", fiches de suivi) reposait sur une comparaison de chaînes normalisées (`normalize(name)` : suppression des accents, minuscules, espaces réduits). Deux limites structurelles en découlaient : un même exercice renommé, reformulé ou saisi avec une casse différente perdait son historique ; et rien ne garantissait qu'un texte identique désigne réellement le même exercice.

Principe posé et validé : **un exercice = une identité stable, indépendante de son libellé d'affichage.** Le libellé reste ce que l'utilisateur voit et édite ; l'identité (`exercise_id`) est ce que le système utilise pour regrouper, comparer, suivre une progression dans le temps. Ce principe est permanent (voir mémoire `cortex-exercice-referentiel-principes`) et ne doit plus être remis en cause sans décision explicite.

La migration a procédé par étapes additives (jamais de rupture) : nouvelle table de référence, colonnes d'identité nullables ajoutées à côté du texte existant, double écriture, backfill de l'historique, puis bascule progressive de la lecture — jamais de suppression avant que chaque étape soit vérifiée et testée en conditions réelles.

---

## 2. Modèle de données

### 2.1 `disciplines` — catalogue des disciplines supportées

| colonne | type | contrainte |
|---|---|---|
| `id` | text | clé primaire (ex. `muscu`, `cardio`, `hyrox`, `course`, `guided`, `autre`) |
| `label` | text | NOT NULL |
| `icon` | text | NOT NULL |
| `accent_class` | text | NOT NULL |
| `sort_order` | integer | NOT NULL, défaut 0 |
| `created_at` | timestamptz | NOT NULL, défaut now() |

Seedée depuis `ENGINE_REGISTRY` (voir section 8). Lecture publique (RLS). Sert de table de référence (FK) pour `exercise_reference.discipline_id` et `workout_segments.discipline`.

### 2.2 `exercise_reference` — référentiel central des exercices

| colonne | type | contrainte |
|---|---|---|
| `id` | uuid | clé primaire, `gen_random_uuid()` |
| `name` | text | NOT NULL — libellé canonique |
| `category` | text | nullable (ex-`group_name`, renommé Étape 2a pour ne plus être spécifique musculation) |
| `discipline_id` | text | NOT NULL, FK → `disciplines.id` |
| `description`, `media`, `config`, `aliases` | text / jsonb / jsonb / text[] | nullable, réservés à un usage futur (fiches détaillées, illustrations, variantes) |
| `is_active` | boolean | NOT NULL, défaut true |
| `created_by` | uuid | nullable |
| `sort_order`, `created_at` | integer / timestamptz | |

**Contrainte unique `(discipline_id, name)`** — c'est elle qui rend `ExerciseResolutionService` idempotent : un upsert ciblé sur ces deux colonnes ne peut jamais créer de doublon pour un couple discipline+nom canonique identique.

C'est la seule table qui porte une **identité** d'exercice. Toutes les autres tables y font référence par id, jamais par duplication de nom.

### 2.3 `exercises` — occurrences musculation dans une séance

Colonnes pertinentes : `id`, `user_id`, `workout_id`, `name` (texte affiché, NOT NULL), `sets`, `reps`, `weight` (résumé), `image_path`, `muscle_groups`, `superset_group`, **`exercise_reference_id`** (uuid, nullable, FK → `exercise_reference.id`).

Le nom volontairement différent de "`exercise_id`" (voir section 3) : `exercise_reference_id` a été choisi à l'Étape 1 pour ne jamais entrer en collision avec `exercise_sets.exercise_id`, qui référence `exercises.id` (l'instance de séance), pas `exercise_reference.id` (le référentiel).

### 2.4 `exercise_sets` — séries détaillées d'une occurrence `exercises`

`exercise_id` (FK → `exercises.id`, NOT NULL) + `set_number`, `reps`, `weight`, `tempo`, `rest_seconds`, `completed`, `notes`. Ne porte aucune identité de référentiel — c'est une sous-structure de `exercises`, pas un point d'entrée d'identité.

### 2.5 `workout_segments` — occurrences génériques (Course en live-tracking)

`workout_id`, `user_id`, `position`, `label` (texte affiché, NOT NULL), `metric_key`, `metrics` (jsonb), `completed`, **`discipline`** (FK → `disciplines.id`, nullable), **`exercise_id`** (uuid, nullable, FK → `exercise_reference.id`).

Ici le nom de colonne est bien `exercise_id` (et non `exercise_reference_id`) car cette table n'a pas de FK concurrente vers une autre notion d'"id d'exercice" — pas de risque de collision de nom comme pour `exercises`.

Au 2026-07-13 : 0 ligne en production (fonctionnalité de live-tracking Course existante mais pas encore utilisée en volume).

### 2.6 `user_exercise_illustrations` — photos personnalisées

`user_id`, `exercise_name` (NOT NULL), `storage_path`, **`exercise_reference_id`** (nullable, FK). Contrainte unique `(user_id, exercise_name)` — **contrainte de nommage historique conservée telle quelle** (voir dette technique 10.3) : deux libellés distincts pour un même exercice peuvent donc théoriquement produire deux lignes, même si elles partagent le même `exercise_reference_id`.

### 2.7 `exercise_history` — table write-only, dette documentée

`user_id`, `exercise_name` (NOT NULL), `last_sets`, `last_reps`, `last_weight`, `last_used_at`, `usage_count`. Contrainte unique `(user_id, exercise_name)`. **Aucune colonne d'identité — n'a jamais été conçue pour en avoir.** Voir section 10.1.

### 2.8 `workouts` — séance (toutes disciplines)

`discipline` (text, NOT NULL, défaut `muscu`), `status` (`active`/`completed`), `metadata` (jsonb — contient `segments: SessionSegment[]` pour Cardio/HYROX/Guided/Autre, voir 2.9), `gym_location`, `duration_minutes`, etc. Point de départ commun à toute discipline.

### 2.9 `workouts.metadata.segments` — persistance JSON (Cardio/HYROX/Guided/Autre)

Ce n'est pas une table mais un tableau JSON stocké dans `workouts.metadata`. Chaque élément (`SessionSegment`) porte `label`, `stats` (texte formaté affiché), `metrics` (miroir numérique optionnel), et depuis l'Étape 4 : **`exerciseId?: string | null`** (additif, résolu à l'écriture par `useAddWorkout`, jamais lu par l'affichage — uniquement par la bascule de lecture historique).

C'est un second mécanisme de stockage, structurellement distinct de `workout_segments` (voir dette technique 10.4).

---

## 3. Identité : `exercise_id`, `exercise_reference_id`, `identityKey`

Trois notions à ne jamais confondre :

- **`exercise_reference.id`** — l'identité canonique elle-même, une ligne dans le référentiel central. C'est la seule vérité.
- **`exercises.exercise_reference_id`** / **`workout_segments.exercise_id`** / **`workouts.metadata.segments[].exerciseId`** / **`user_exercise_illustrations.exercise_reference_id`** — des colonnes qui *pointent vers* `exercise_reference.id` depuis une table d'occurrence. Le nom de la colonne varie selon la table (voir 2.3 et 2.5 pour la raison), mais la cible est toujours la même table.
- **`identityKey(ex)`** (`src/lib/fitness/recentExercises.ts`) — une fonction pure côté client, PAS une colonne. Calcule une clé de regroupement en mémoire :
  ```ts
  export function identityKey(ex: { name: string; exercise_reference_id?: string | null }): string {
    if (ex.exercise_reference_id) return `id:${ex.exercise_reference_id}`;
    return `name:${normalize(ex.name)}`;
  }
  ```
  Priorité à l'id ; repli sur le nom normalisé si l'occurrence n'a pas (encore) de référence résolue. C'est le mécanisme central qui a permis de faire cohabiter, pendant la migration, des données anciennes (sans id) et nouvelles (avec id) dans un seul Map de regroupement, sans jamais perdre d'historique ni forcer un backfill bloquant.

`identityKey` est utilisée partout où du **regroupement/dédoublonnage en mémoire** est nécessaire (PR, volume musculaire, exercices récents, profil auto Sensei). Elle n'est jamais persistée : c'est un outil de lecture, pas une donnée.

---

## 4. Services centraux

### 4.1 `ExerciseResolutionService` (`src/services/exerciseResolution.ts`)

Point d'entrée UNIQUE pour résoudre un libellé texte vers un `exercise_id` du référentiel, en créant l'entrée si besoin.

- **`canonicalizeExerciseLabel(rawLabel)`** — réduit un libellé d'affichage à l'exercice de base qu'il représente, en retirant les suffixes de contexte reconnus (`"Fractionné 1/8"` → `"Fractionné"`, `"Farmer Carry série 2"` → `"Farmer Carry"`, `"Exercice #3"` → `"Exercice"`). Appliquée AVANT toute résolution, pour que toutes les occurrences numérotées d'un même exercice (générées par un moteur de discipline) partagent un seul id. Liste de motifs explicite et documentée (pas de règle générique "retirer un nombre final", jugée trop risquée).
- **`resolveExerciseId(discipline, label)`** — canonicalise, cherche une correspondance insensible à la casse dans `exercise_reference` pour cette discipline (ne recrée jamais un doublon de casse), sinon crée la ligne. Lève une erreur réseau/RLS ; à la charge de l'appelant de ne jamais bloquer l'écriture principale dessus.
- **`resolveExerciseIdsByLabel(discipline, labels)`** — résolution par lot, dédoublonnée, jamais bloquante (un échec individuel retombe sur `null` dans la Map retournée plutôt que de lever). C'est la fonction appelée par tous les chemins d'écriture multi-exercices (voir section 5).

### 4.2 `recentExercises.ts` (`src/lib/fitness/recentExercises.ts`)

- **`identityKey(ex)`** — voir section 3.
- **`computeRecentExercises(workouts, limit = 30)`** — dédoublonne une liste de séances en "exercices récents" (dernières valeurs sets/reps/weight connues), en gardant la première occurrence rencontrée par `identityKey` (les séances doivent être triées du plus récent au plus ancien, convention de `useWorkouts()`). Fonction pure, zéro dépendance React. Un seul point d'implémentation, réutilisé par `ActiveWorkoutView.tsx`, `TemplateEditorSheet.tsx`, `AddExerciseModal.tsx` et `WorkoutSheet.tsx` — aucune duplication locale ne doit être réintroduite (voir invariant 9.4).

### 4.3 `ENGINE_REGISTRY` (`src/lib/fitness/engines/registry.ts`)

Pas un service d'identité au sens strict, mais le point d'entrée qui détermine quelles disciplines existent — voir section 8.

---

## 5. Flux d'écriture

Tout chemin qui écrit une occurrence d'exercice résout systématiquement son identité AVANT ou PENDANT l'insertion, jamais après :

| Chemin (fichier) | Discipline(s) | Table cible | Résolution |
|---|---|---|---|
| `useAddExerciseToWorkout` (`use-fitness.ts`) | muscu | `exercises` | `resolveExerciseId("muscu", name)` |
| `useAddExerciseToActiveWorkout` (`use-fitness.ts`) | muscu | `exercises` | idem |
| `useStartWorkoutFromTemplate` ("Refaire en live", `use-fitness.ts`) | muscu | `exercises` | regroupement par `identityKey` puis `resolveExerciseId` en filet seulement pour les groupes sans id connu (voir 4.6c) |
| `useStartWorkoutFromSavedTemplate` (`useWorkoutTemplates.ts`) | muscu | `exercises` | `resolveExerciseIdsByLabel` |
| `transferService.ts` (import bulk) | muscu | `exercises` | `resolveExerciseId` par ligne |
| `useAddWorkout` (`use-fitness.ts`) — chemin muscu | muscu | `exercises` | `resolveExerciseIdsByLabel` sur `exercises[].name` |
| `useAddWorkout` (`use-fitness.ts`) — chemin générique | cardio / hyrox / guided / autre | `workouts.metadata.segments[].exerciseId` | `resolveExerciseIdsByLabel` sur `segments[].label` |
| `useStartGenericActiveWorkout` (seed, `useGenericActiveSession.ts`) | cardio / hyrox / guided / autre | `workout_segments` | `resolveSegmentExerciseId` (wrapper non-bloquant de `resolveExerciseId`) |
| `useAddGenericSegment` (ajout manuel, `useGenericActiveSession.ts`) | idem | `workout_segments` | idem |
| `useUpsertExercisePhoto` (`useUserExercisePhotos.ts`) | muscu | `user_exercise_illustrations` | `resolveExerciseId("muscu", exerciseName)`, non-bloquant |

Toutes les résolutions sont encapsulées dans un `try/catch` local qui logue en `console.error` et retombe sur `null` — une erreur de résolution d'identité **ne bloque jamais** l'écriture de la donnée principale.

**Dette non bloquante** : `exercise_history` (voir 2.7, 10.1) est le seul écrit qui ne passe par aucune résolution — sa colonne d'identité n'existe pas.

---

## 6. Flux de lecture

Toute lecture métier (regroupement d'historique, comparaison entre séances, calcul de PR/records/tendances, mémoire IA) suit le même schéma, appliqué indépendamment à chaque hook/fonction concerné :

> **priorité à l'id (`identityKey` ou correspondance directe par `exercise_id`) ; repli sur le nom normalisé uniquement pour les occurrences qui n'ont pas encore de référence résolue (données antérieures au backfill) ; incohérence (plusieurs id distincts sous un même nom) journalisée en `console.error`, jamais silencieuse.**

Implémentations concrètes de ce schéma :

- **`useExerciseSetHistory.ts`** (historique/PR/1RM musculation) — `selectInstancesForExercise`.
- **`useSegmentHistory.ts`** (historique segments Course, table `workout_segments`) — `selectInstancesForSegmentType`.
- **`useDisciplineSegmentHistory.ts`** (historique Cardio/HYROX/Guided, JSON `metadata.segments`) — même schéma, adapté au stockage JSON.
- **`useExerciseAnalysis.ts`** (`aiMuscleGroups`) — élargit la recherche à toutes les occurrences liées au même id une fois qu'un id commun est détecté parmi les correspondances par nom.
- **`useUserExercisePhotos.ts`** — Map de photos indexé par `identityKey`.
- **`useLastExerciseSession.ts`** — signature élargie (`{name, exerciseReferenceId}`) pour interroger par identité.
- **`computePRs`** (`src/utils/fitness/exercise-stats.ts`) — regroupement PR/historique de charge/volume/rang par `identityKey`.
- **`computeBroadActivity`** (`muscleVolume.ts`) — même espace de clés que `computePRs` (obligatoire : les deux alimentent `ProfileRPGData.tsx`/`RankAggregator` et doivent partager le même format de clé).
- **`inferSenseiAutoProfile`** (`senseiAutoProfile.ts`) — mémoire long-terme du moteur IA (progression, stagnation, abandon) regroupée par `identityKey`. Sortie publique toujours en noms réels (jamais une clé exposée aux consommateurs).
- **`computeRecentExercises`** — voir 4.2.

Chaque fois qu'une clé interne migre vers `identityKey`, mais qu'un composant en aval attend un vrai nom d'exercice (ex. `RankAggregator`), la clé est retraduite en nom réel via une Map `nameByKey` avant transmission — jamais de fuite d'une clé interne vers un composant qui ne sait pas l'interpréter (voir `ProfileRPGData.tsx`).

---

## 7. Usages du nom qui ne sont PAS des lectures métier (légitimes, catégorie A)

Ces usages comparent ou utilisent le texte du nom, mais ne constituent pas une lecture d'identité métier — ils restent corrects par nature :

- **Affichage** : tout rendu UI (`exercises.name`, `workout_segments.label`) reste et doit rester le nom saisi/généré.
- **Recherche texte / filtre / tri alphabétique** : ex. la barre de recherche du catalogue (`ExerciseExplorerSheet.tsx`), le tri par ordre alphabétique.
- **Mapping sémantique** : `muscleMapping.ts` (nom → groupes musculaires par regex), `familyClassification.ts` (classification IA famille/difficulté pour le moteur Rang/RPG), `exerciseIllustrations.ts` (illustrations par mot-clé), `exerciseSimilar.ts` (suggestions d'exercices proches).
- **Correspondance contre un catalogue statique sans id** : `EXERCISE_CATALOG` (`exerciseCatalog.ts`) est une liste frontend `{name, group}` sans aucun identifiant — structurellement distincte de la table `exercise_reference`. Le matching de `neverDoneExercises` (senseiAutoProfile) contre ce catalogue reste par nom : rien à migrer, il n'y a pas d'id de l'autre côté.
- **Texte libre généré par IA** : les suggestions d'exercice détectées par scan image (`ExerciseExplorerSheet.tsx`), et les explications texte de `buildSenseiExplanation` — comparées par nom car elles n'ont, par construction, aucun id (sortie de LLM/vision, pas de la base).

---

## 8. Point d'extension : ajouter une future discipline

`ENGINE_REGISTRY` (`src/lib/fitness/engines/registry.ts`) est le point d'entrée unique. Ajouter une discipline :

1. Ajouter l'id à `DisciplineId` (`src/lib/fitness/engines/types.ts`).
2. Ajouter une ligne dans la table `disciplines` (seed).
3. Créer le moteur de discipline (`RegistryEntry`) et l'enregistrer dans `ENGINE_REGISTRY` — aucune entrée existante n'est modifiée (Open/Closed), le Sensei et l'historique lisent uniquement ce registre, jamais un `if/switch(discipline)` dispersé ailleurs.
4. Décider du mode de persistance de ses occurrences : soit `workout_segments` (si live-tracking nécessaire, comme Course), soit `workouts.metadata.segments` (sinon, comme Cardio/HYROX/Guided/Autre aujourd'hui) — voir dette 10.4 sur la coexistence des deux mécanismes.
5. Câbler la résolution d'identité via `resolveExerciseIdsByLabel(discipline, labels)` au moment de l'écriture (déjà générique, aucune branche par discipline à ajouter dans `ExerciseResolutionService` lui-même).
6. Si la discipline génère des libellés à variation d'affichage (numéro de répétition/série/tour), aucune action requise : `canonicalizeExerciseLabel` est déjà générique et s'applique automatiquement.

---

## 9. Invariants d'architecture — à ne jamais violer

1. **Un exercice = une identité (`exercise_reference.id`), indépendante de son libellé d'affichage.** Ne jamais réintroduire une identité métier basée sur une comparaison de texte pour une nouvelle lecture (historique, PR, badges, mémoire IA, regroupement de séances).
2. **Toute nouvelle écriture d'une occurrence d'exercice (quelle que soit la table/discipline) doit résoudre son identité via `ExerciseResolutionService`** (`resolveExerciseId`/`resolveExerciseIdsByLabel`), jamais une résolution ad hoc dupliquée localement.
3. **La résolution d'identité ne bloque jamais l'écriture principale.** Toujours encapsulée en `try/catch` local, jamais une erreur de résolution ne doit faire échouer l'enregistrement d'une séance.
4. **Toute nouvelle lecture qui regroupe/compare des occurrences par exercice doit utiliser `identityKey` (ou une correspondance directe par id) avec repli documenté sur le nom, jamais un `normalize(name)` nu comme seule identité.** Une seule implémentation de dédoublonnage "exercices récents" existe (`computeRecentExercises`) — ne pas en créer de copie locale.
5. **`canonicalizeExerciseLabel` reste le seul endroit qui retire les suffixes de contexte (répétition/série/tour/numéro).** Ne jamais dupliquer cette logique dans un moteur de discipline particulier.
6. **`exercise_reference` reste l'unique référentiel.** Aucune seconde table de "catalogue d'identité" ne doit être introduite sans décision explicite (voir 10.5 sur `EXERCISE_CATALOG`, qui reste un cas à part assumé, pas un précédent).
7. **Ajouter un champ à un type mappé à la main impose de vérifier la chaîne `select()` PostgREST correspondante** (voir mémoire `cortex-select-postgrest-piege` — un champ absent du `select()` explicite reste `undefined` côté client quelle que soit la valeur en base, sans erreur visible).
8. **Toute étape structurante (nouveau champ d'identité, nouveau chemin d'écriture, bascule de lecture) doit être vérifiée (TypeScript, ESLint, tests) et testée en conditions réelles avant d'être considérée close** — pas de vérification manuelle comme substitut permanent.
9. **Aucune décision d'architecture majeure touchant à ce modèle (nouvelle table d'identité, changement de contrainte d'unicité, fusion/suppression d'un mécanisme de persistance) ne doit être prise sans validation explicite de Nathan.**

---

## 10. Dettes techniques volontairement conservées

### 10.1 `exercise_history` — table write-only

Écrite (fire-and-forget) à chaque séance sauvegardée par `WorkoutSheet.tsx`, mais **jamais lue nulle part dans le dépôt**. Sa clé est `(user_id, exercise_name)`, sans aucune colonne d'identité — elle n'a jamais été conçue pour en avoir. Confirmé en production : 49 lignes écrites, 0 lecture. Acceptée comme dette documentée par Nathan (2026-07-13) : sans impact fonctionnel tant qu'aucune lecture ne l'exploite. À traiter (suppression ou migration) uniquement si un besoin de lecture apparaît.

### 10.2 Filets de compatibilité nom → id

Chaque hook migré (`useExerciseSetHistory`, `useSegmentHistory`, `useDisciplineSegmentHistory`, `useExerciseAnalysis`, `useUserExercisePhotos`) conserve un repli sur le nom normalisé pour les occurrences sans id résolu. Vérifié en production (2026-07-13) : couverture 100 % sur `exercises` (212/212) et `user_exercise_illustrations` (12/12) ; `workout_segments` à 0 ligne (rien à mesurer). Ces filets sont donc aujourd'hui inutilisés en pratique, mais restent nécessaires comme garde-fou tant qu'aucune garantie de couverture 100 % permanente n'est actée (voir Étape 6, suppression des anciens chemins, non encore engagée).

### 10.3 `user_exercise_illustrations` — contrainte unique par nom

`UNIQUE (user_id, exercise_name)` reste une contrainte historique par texte (pas par id). Deux libellés distincts pour un même `exercise_reference_id` peuvent donc créer deux lignes de photo. Connu, non traité — impact jugé mineur (photo personnalisée, pas une donnée de progression).

### 10.4 Double mécanisme de persistance générique

`workout_segments` (table dédiée, avec `exercise_id`) et `workouts.metadata.segments` (JSON, avec `exerciseId` optionnel) coexistent pour les disciplines génériques — le premier pour Course (live-tracking), le second pour Cardio/HYROX/Guided/Autre (pas de live-tracking aujourd'hui). Signalé explicitement comme sujet de réévaluation architecturale possible en Phase 2, jamais tranché : accepté comme état stable tant qu'aucune discipline générique n'a besoin de live-tracking.

### 10.5 `EXERCISE_CATALOG` statique sans id

Liste frontend `{name, group}` (`exerciseCatalog.ts`) utilisée pour les suggestions et le matching "jamais pratiqué" du profil auto Sensei. Structurellement sans identité — assumé comme cas à part (catégorie sémantique, section 7), pas une dette à corriger.

### 10.6 `types.ts` (types Supabase générés)

Non formaté au style du projet (prettier) depuis sa génération initiale — ~1493 erreurs de formatage préexistantes, sans rapport avec cette migration. Non traité, hors scope, connu.

---

## 11. Étapes restantes (hors périmètre de ce document, pour mémoire)

- **Étape 5** — extension goals/badges par exercice (nouvelle Phase, à cadrer séparément).
- **Étape 6** — suppression des anciens chemins de repli par libellé, une fois la couverture id jugée suffisamment garantie dans la durée (candidats déjà identifiés : 10.2).
- **Étape 7** — contrainte `NOT NULL` finale sur les colonnes d'identité, une fois l'Étape 6 passée.

---

## 12. Principes d'évolution de l'architecture

Cette partie ne décrit pas le code actuel (voir sections 1 à 11) mais fixe les règles de conception qui doivent gouverner toute évolution future du domaine Fitness. Elle a valeur de contrat pour la Phase 5 et toutes les suivantes — un désaccord avec ces principes n'est pas interdit, mais doit être tranché explicitement (voir 12.9) avant tout code, jamais découvert après coup dans une revue.

**12.1 — `exercise_reference` est le cœur du domaine Fitness.** Ce n'est plus un détail d'implémentation de la musculation ni une simple table de nommage : c'est désormais le point d'ancrage central autour duquel se conçoit toute nouvelle fonctionnalité touchant à l'entraînement. Toute question de conception doit pouvoir se ramener à "qu'est-ce que cela signifie pour un exercice donné", avant de se demander ce que cela signifie pour une discipline, un écran ou un moteur.

**12.2 — Partir de l'exercice, jamais de la discipline.** Quand une nouvelle fonctionnalité est conçue, la première question est "à quel(s) exercice(s), à quelle(s) capacité(s) cela s'applique-t-il", jamais "quelle logique écrire pour telle discipline". La discipline n'est jamais le point d'entrée d'un raisonnement de conception — seulement un filtre ou un contexte appliqué après coup.

**12.3 — Les disciplines définissent un contexte et un moteur de génération, pas une identité.** Une discipline (`ENGINE_REGISTRY`) répond à "à quoi ressemble une séance de ce type, quel vocabulaire, quelles unités, comment Sensei la génère". Elle ne doit plus jamais redevenir un mécanisme de regroupement ou de comparaison de données — ce rôle appartient exclusivement à `exercise_reference`.

**12.4 — Les fonctionnalités transverses s'appuient toujours sur `exercise_id`.** IA, Sensei, objectifs, badges, statistiques, récupération, progression, programmes, défis, recommandations, social, et toute fonctionnalité future de cette nature doivent identifier "de quel exercice s'agit-il" exclusivement via `exercise_id` (ou `identityKey` en lecture transitoire). Aucune de ces fonctionnalités ne doit reconstruire cette notion à partir d'un nom, d'une discipline ou d'une catégorie.

**12.5 — Les capacités de l'exercice remplacent progressivement les conditions par discipline.** Plutôt que d'écrire, dans une fonctionnalité transverse, "si discipline = course alors distance/allure, si discipline = muscu alors charge/répétitions", l'exercice doit pouvoir décrire les capacités qu'il expose (temps, charge, distance, puissance, cadence, fréquence cardiaque, vitesse, etc.), et les fonctionnalités transverses doivent lire ces capacités plutôt que ramifier par discipline. C'est une trajectoire progressive, pas un chantier à mener d'un bloc : mais toute nouvelle branche conditionnelle par discipline introduite dans une fonctionnalité transverse doit être questionnée — peut-elle s'exprimer comme une capacité de l'exercice à la place ?

**12.6 — Une nouvelle discipline ne doit jamais imposer de modifier une fonctionnalité transverse existante.** C'est le test décisif d'une architecture qui respecte ces principes : si l'ajout d'une discipline oblige à toucher aux badges, aux objectifs, aux statistiques ou à Sensei, l'architecture a régressé vers un couplage par discipline. Le seul point d'extension légitime reste `ENGINE_REGISTRY` (génération) associé à `exercise_reference` (identité) — voir section 8.

**12.7 — Les lectures restent orientées identité, jamais orientées libellé.** Aucune nouvelle fonctionnalité de lecture ne doit réintroduire une comparaison de texte comme mécanisme premier de regroupement ou de suivi. Le schéma id-priority avec filet documenté (section 6) reste l'unique pattern autorisé lorsqu'un filet transitoire est nécessaire — jamais une identité par nom comme solution durable.

**12.8 — L'architecture reste modulaire, additive, Open/Closed.** Toute évolution ajoute (colonnes nullables, nouvelles capacités déclarées, nouvelles entrées de registre, nouveaux services) plutôt que de modifier ce qui existe déjà. Le code existant ne doit jamais avoir à changer pour accueillir une nouveauté purement déclarative — c'est la même discipline qui a gouverné chaque étape de la migration décrite dans ce document (double écriture, colonnes additives, jamais de suppression avant bascule vérifiée).

**12.9 — Toute remise en cause de ces principes doit être documentée et justifiée avant implémentation.** Si l'un de ces principes doit être assoupli ou contredit pour une raison légitime (contrainte technique découverte, coût disproportionné, besoin produit incompatible), la décision — quoi, pourquoi, quel impact, quelles alternatives écartées — doit être écrite dans ce document ou dans la mémoire du projet avant tout code, jamais constatée a posteriori dans une revue.

---

## 13. Vision long terme

Ce chapitre ne décrit aucune implémentation. Il explique pourquoi l'architecture posée dans ce document — un référentiel d'identité central (`exercise_reference`), une résolution systématique à l'écriture (`ExerciseResolutionService`), une lecture toujours orientée identité — est la fondation qui permettra de construire les prochaines briques du produit sans jamais avoir à revenir modifier ce cœur.

Tant qu'une fonctionnalité peut se ramener à "pour cet `exercise_id`, sur cette période, quelles données", elle peut se brancher sur l'architecture existante sans la toucher. C'est le fil conducteur de tout ce qui suit.

**Les objectifs centrés sur les exercices** pourront se définir contre un `exercise_id` (ou une capacité qu'il expose) plutôt que contre un texte saisi par l'utilisateur — un objectif "progresser sur cet exercice" reste valide même si son libellé d'affichage change, est renommé, ou est reformulé par l'IA d'une séance à l'autre.

**Les badges** pourront se construire sur les mêmes fondations que celles déjà en place pour les badges d'exploration et de fréquence (section 6) : des seuils calculés sur des regroupements par identité (nombre d'exercices distincts pratiqués, records battus, volume atteint), qui traversent naturellement toutes les disciplines puisque chaque occurrence, quelle que soit sa provenance, pointe vers le même référentiel.

**Les statistiques globales** pourront agréger au travers des disciplines sans traitement spécial, précisément parce que `exercise_reference` est le seul référentiel : une statistique "temps total passé sur les exercices de type X" n'a pas besoin de savoir si X vient de la musculation, du cardio ou d'une discipline qui n'existe pas encore.

**La progression** pourra s'étendre au-delà de la charge et des répétitions (déjà couvertes par `computePRs`) vers n'importe quelle capacité déclarée sur l'exercice (distance, puissance, vitesse, fréquence cardiaque) — le mécanisme de suivi dans le temps par identité reste le même, seule la nature de la mesure suivie change.

**Les recommandations IA** pourront raisonner sur "cet exercice, cette tendance, cette capacité" en s'appuyant directement sur l'historique résolu par identité, sans avoir besoin de connaître la discipline d'origine ni de reformuler la question à partir d'un nom.

**Sensei** consomme déjà `identityKey` en interne pour sa mémoire de profil (`senseiAutoProfile`) ; la suite naturelle est que Sensei raisonne de plus en plus sur les capacités des exercices plutôt que sur un vocabulaire propre à chaque discipline — une seule intelligence de suivi, appliquée à toute discipline présente ou future.

**Les programmes** (fondations déjà posées en base, non encore branchées) pourront référencer directement des `exercise_id`, ce qui permettra des programmes cohérents même lorsqu'ils mélangent plusieurs disciplines, sans traduction ni correspondance approximative par nom.

**Les défis** pourront se formuler comme "atteindre telle valeur sur tel `exercise_id`" — une formulation qui fonctionne identiquement quelle que soit la discipline de l'exercice ciblé, sans logique spécifique à écrire par type de défi.

**Les futures disciplines** s'ajouteront par le seul point d'extension prévu (`ENGINE_REGISTRY` + `exercise_reference`, voir section 8), sans qu'aucune des briques ci-dessus n'ait besoin d'être modifiée pour les accueillir — c'est la preuve, à chaque nouvelle discipline ajoutée, que l'architecture tient sa promesse.

---

*Document produit le 2026-07-13, à partir de l'état réel du schéma en production (`bcwfvpwxzlmkxobvbtzp`) et du code sur `main` (commit `3f05473`). Sections 1 à 11 décrivent l'état constaté ; sections 12 et 13 fixent les règles de conception futures. Document de référence officiel du projet — à maintenir à jour à chaque évolution structurante du domaine Fitness.*
