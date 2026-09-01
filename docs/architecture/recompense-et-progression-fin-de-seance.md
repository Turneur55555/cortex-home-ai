# Récompense XP, progression de Rang et coût réseau d'une séance

_Chantier 4 — CRIT-03 / MAJ-08 / MAJ-04. Aucune règle RPG n'est définie ici : ce document décrit
uniquement **quand** une valeur existe, **d'où** elle vient et **ce que l'écran a le droit
d'afficher**. Les règles (montants, seuils, noms et ordre des Rangs) restent celles de
`docs/architecture/rpg-vision-et-r1-niveau-personnage.md`, `lib/fitness/rpg/titleConfig.ts` et des
triggers SQL._

## 1. Qui produit quoi

| Donnée                                          | Producteur                                                | Lisible hors ligne ?              |
| ----------------------------------------------- | --------------------------------------------------------- | --------------------------------- |
| `workouts.status = 'completed'`                 | Client (offline-first : IndexedDB + sync queue)            | Oui — vérité locale immédiate     |
| `xp_events` de la séance                        | Serveur, trigger `award_xp_on_workout_complete`            | Non                               |
| `workouts.xp_before/xp_after/level_before/after` | Serveur, **même trigger**, dans un UPDATE **séparé**       | Non                               |
| `user_stats.xp` / `level`                       | Serveur, `award_character_xp`                              | Dernière valeur confirmée (cache) |
| `rank_promotions`                               | Serveur, trigger `record_rank_promotions`                  | Non                               |
| Rang / Grade affichés                           | **Client, pur** : `titleProgressForXp(user_stats.xp)`      | Oui, si une XP confirmée existe   |

Deux conséquences structurelles :

1. **La clôture d'une séance ne produit aucune XP côté client.** Elle produit une écriture locale,
   que la sync queue pousse ; c'est son **arrivée en base** qui déclenche la récompense.
2. Le trigger est un **AFTER trigger** qui réécrit la ligne `workouts` dans un second UPDATE. Le
   `RETURNING` de l'opération de synchronisation ne contient donc **pas** `xp_after` : seule une
   **relecture** de la ligne apporte les compteurs. (Verrouillé par un test dans
   `src/lib/offline/sessionRewardOffline.test.ts`.)

## 2. CRIT-03 — la récompense est confirmée ou elle est annoncée comme telle

`src/lib/fitness/rpg/rewardConfirmation.ts` (logique pure) répond à **une seule** question : a-t-on
le droit d'afficher cette récompense comme réelle ?

- `confirmed` — les **quatre** compteurs serveur sont présents sur la séance. Seul état où un
  montant d'XP, une montée de grade ou un record sont affichés.
- `syncing` — hors ligne, ou la clôture est encore dans la file. Rien n'a pu être calculé :
  l'écran affiche « Récompense en attente de synchronisation ».
- `awaiting-server` — la clôture est partie, la récompense n'a pas encore été relue. Attente
  courte et normale : « Calcul de ta récompense… ».

Une récompense déjà confirmée le **reste** si l'appareil repasse hors ligne : la valeur affichée
vient bien du serveur.

### Ce qui se passait avant

`useSessionReward` ne distinguait pas « pas encore calculée » de « séance antérieure à la migration
`20260718120000` » : un instantané absent retombait sur `user_stats.xp` et produisait
`xpBefore = xpAfter`, donc **« +0 XP »** et une barre figée sur l'XP d'avant la séance — présentés
comme la récompense réelle. C'était le cas **nominal** juste après une clôture, l'écriture étant
offline-first. `SessionRewardScreen` ignorait de surcroît le `isLoading` du hook.

### Ce qui se passe maintenant

```
clôture → écriture locale → requestSyncFlush() (passage immédiat de la file)
        → écran de récompense : état honnête, aucun montant
        → arrivée en base → trigger → relecture (poll court, tant que non confirmé)
        → état confirmé : XP, transition de niveau et grade servis PAR LE SERVEUR
```

Hors ligne, la dernière flèche attend simplement le retour du réseau : l'écran bascule tout seul,
sans action utilisateur. Aucun `setTimeout` ne masque de course — l'écran attend l'arrivée du seul
signal qui fait foi, et n'affiche rien avant.

## 3. MAJ-08 — Rang hors ligne

Le Rang est **dérivé purement de l'XP** côté client. Il n'y a donc rien à « calculer hors ligne » :
il faut seulement que l'XP disponible soit honnête et rafraîchie au bon moment.

- **Hors ligne** : `user_stats` est une query online-only, servie par son cache localStorage — le
  dernier Rang **confirmé** s'affiche. Sans aucun cache (tout premier lancement hors ligne), on
  n'invente rien : `ProfileHeroCard` et la page Progression affichent un état d'attente explicite,
  là où la page Progression retombait sur `xp = 0` et montrait le tout premier Rang comme réel.
- **Après une séance hors ligne** : l'XP locale ne bouge pas (le serveur seul verse) — le Rang
  affiché reste donc le dernier confirmé, ce qui est exact.
- **Au retour du réseau** : la file part, les triggers versent l'XP… et il fallait encore que le
  client relise. Le ciblage post-synchronisation du chantier 3 ne couvrait que les queries
  **offline-first** (celles qui lisent IndexedDB) : `user_stats`, `rank_promotions` et la
  récompense n'en font pas partie et n'étaient **jamais** invalidées. D'où le Rang figé.
  `src/lib/offline/serverConfirmedQuery.ts` déclare cette **seconde** catégorie légitime, et
  `useOfflineSync` l'invalide en plus de la première — toujours par prédicat, jamais globalement.

Les noms, l'ordre, les seuils et les règles d'ascension sont **inchangés** et verrouillés par
`src/lib/fitness/rpg/rankRulesNonRegression.test.ts` (valeurs exactes figées).

## 4. MAJ-04 — coût réseau d'une séance

`refreshWorkoutsFromServer` lit **4 tables** (workouts, exercises, exercise_sets,
workout_segments). Il est appelé par les `queryFn` de 4 queries montées simultanément pendant une
séance : `useWorkouts`, `useActiveWorkout`, `useActiveGenericWorkout`, `useActiveWorkoutSegments`.

Mesuré sur le code de `main` (voir `src/lib/offline/workoutsRefreshPerf.test.ts`) :

| Scénario                                        | Avant | Après |
| ----------------------------------------------- | ----- | ----- |
| Montage d'une séance active (4 queries)         | 16    | 4     |
| 10 séries validées                              | 40    | 0     |
| Clôture de séance (invalidation préfixe fitness) | 16    | 0     |

Le correctif est une **fenêtre de fraîcheur partagée** (`lib/offline/serverRefreshWindow.ts`,
instance dans `lib/offline/workoutsRefreshWindow.ts`) qui :

- **déduplique les appels concurrents** (les 4 queries partagent un aller-retour) ;
- **ignore une relecture serveur pendant 60 s** — durée pendant laquelle le store local est déjà,
  par construction, la version la plus récente de nos propres écritures ;
- **ne referme pas la fenêtre sur un échec réseau** (la lecture est retentée) ;
- est **rouverte explicitement** aux moments où une lecture serveur apporte réellement quelque
  chose : retour du réseau (`useOfflineSync`), changement de compte (`use-auth`), premier montage
  (fenêtre vide).

**Ce qui n'est pas sacrifié** : la `queryFn` continue de lire le store local **à chaque appel**.
Une lecture ignorée ne remplace jamais une donnée par une supposition — elle supprime seulement un
aller-retour qui n'aurait rien appris. Seul cas non couvert : une écriture faite sur un **autre
appareil** pendant que celui-ci reste connecté et actif apparaît au plus tard 60 s après (ou
immédiatement au retour du réseau).

## 5. DISC-01 — ordre d'arrivée serveur d'une séance vécue hors ligne

**Le problème.** Quand la séance n'a **jamais** été synchronisée, son `create` est encore dans la
file. `repository.update()` fusionne alors tout patch dans **ce `create`** plutôt que d'enfiler un
`update` séparé (comportement correct dans le cas général : il n'existe aucune ligne serveur à
mettre à jour). Conséquence pour la clôture : la séance arrivait en **INSERT déjà
`status='completed'`**, donc **avant** ses exercices et ses séries (file FIFO). Or
`award_xp_on_workout_complete` **parcourt** `exercises` et `exercise_sets` de la séance pour
accorder les récompenses de record et de progression : il s'exécutait sur une séance **vide**.
Le forfait `workout_muscu` était versé, **le reste jamais**. Mesuré : `exercisesSeenByTrigger === [0]`.

**Le correctif — local, sans toucher au moteur de synchronisation ni aux règles d'XP.**
`repository.update()` accepte une option `neverMergeIntoPendingCreate` (défaut `false` : toutes les
autres tables et tous les autres appels sont **strictement inchangés**). Le repository reste
générique — il ne connaît ni la table `workouts` ni la colonne `status` ; c'est l'appelant, seul à
connaître la sémantique de son patch, qui déclare : « le serveur ne doit observer ce patch qu'une
fois les lignes liées arrivées ». Les deux clôtures (`useFinishWorkout`,
`useFinishGenericActiveWorkout`) posent l'option.

Ordre d'arrivée serveur après correctif — identique au parcours en ligne :

```
INSERT workouts (status='active')   ← le trigger ne se déclenche PAS (garde NEW.status='completed')
INSERT exercises
INSERT exercise_sets
UPDATE workouts SET status='completed'  ← le trigger se déclenche, séance COMPLÈTE
```

Deux garde-fous indispensables, tous deux vérifiés par des tests :

- **L'état local ne recule jamais.** Le `create` répond `status='active'` ; sans le mécanisme de
  rebase du chantier 1 (`applyServerRowToEntity` ne réécrit l'entité que s'il ne reste **aucune**
  opération en attente pour elle), l'écran repasserait la séance en « active » entre les deux
  opérations. Ce mécanisme existait déjà et suffit — rien n'a été modifié.
- **Pas d'opération orpheline.** `repository.remove()` annule désormais **toutes** les opérations
  vivantes de l'enregistrement, pas seulement le `create` : depuis cette option, un `update` séparé
  peut coexister avec un `create` pas encore parti, et ne retirer que le `create` laisserait cet
  `update` tenter de modifier une ligne que le serveur n'a jamais vue. Sans l'option, la file ne
  contient de toute façon que le `create` — comportement identique.

## 5 bis. DISC-01b — barrière de dépendance de la file (chantier 1 bis)

**Le problème.** Arriver après les enfants dans l'ORDRE de la file ne suffit pas. Le FIFO du moteur
est un ordre **temporel**, pas une dépendance : `processSyncQueue` traite chaque opération
indépendamment et **poursuit la boucle après un échec**. Mesuré avant correctif — un `create`
d'enfant en échec réseau laissait quand même partir la clôture :

```
result  = { succeeded: 2, retried: 3 }   ← create:workouts ET update:workouts(completed)
trigger = [{ exercises: 0, sets: 0 }]    ← séance vide
```

Irréversible : le garde du trigger (`OLD.status IS DISTINCT FROM 'completed'`) l'empêche de se
redéclencher quand les enfants arrivent enfin. En `blocked` (erreur Postgres non retryable, jamais
reprise automatiquement — précédent réel : le bug prod `exercises.created_at` du 29/08), la perte
était **définitive**.

**Le correctif — barrière OPT-IN par opération.** `SyncOperation.waitForEarlierOperations` : une
opération qui porte ce drapeau n'est pas envoyée tant qu'il reste, dans la file du même
utilisateur, une opération **plus ancienne encore vivante** (`pending` | `failed` | `syncing` |
`blocked`). Elle est laissée intacte (comptée dans `skipped`), sans consommer de tentative ni
avancer son backoff, et retentée au passage suivant.

Points de conception :

- **Jamais un stop-on-error global.** Une opération sans le drapeau garde son comportement exact,
  y compris placée après une opération en échec ou bloquée — garanti par un test dédié et par
  `fitnessCoreOffline.test.ts`, inchangé.
- **Le test lit la file COMPLÈTE**, pas seulement sa partie traitable : une opération `syncing`
  prise en charge par un autre onglet est absente de `listPendingOperations` mais reste vivante.
- **`claimOperation` reste l'unique protection atomique.** La barrière est évaluée *avant* le
  claim et décide seulement s'il y a lieu de tenter l'envoi ; deux instances peuvent la franchir
  simultanément, c'est toujours le claim qui garantit un seul envoi.
- **La barrière survit à un conflit** : elle est conservée dans le `ConflictRecord` et rejouée par
  « garder ma version », exactement comme `opType`.

**Compromis assumé (figé par un test).** La barrière est à l'échelle de l'utilisateur : une
opération antérieure **sans rapport** encore bloquée retient aussi la clôture. Choix conservateur —
mieux vaut une clôture retardée (l'écran affiche « Récompense en attente de synchronisation », état
honnête) qu'une XP amputée définitivement. Un resserrement aux seules lignes liées à la séance
reste possible, ce serait un choix explicite.

## 6. Fichiers

| Fichier                                        | Rôle                                                     |
| ---------------------------------------------- | -------------------------------------------------------- |
| `lib/fitness/rpg/rewardConfirmation.ts`        | Décision pure : confirmée / syncing / awaiting-server     |
| `lib/offline/serverConfirmedQuery.ts`          | Marqueur des queries produites par un trigger serveur     |
| `lib/offline/serverRefreshWindow.ts`           | Fenêtre de fraîcheur + déduplication (générique, pure)    |
| `lib/offline/workoutsRefreshWindow.ts`         | Instance partagée du domaine séances                      |
| `lib/offline/syncFlush.ts`                     | Passage immédiat de la file à la clôture (fire-and-forget) |
| `lib/offline/syncQueue.ts`                     | + `hasQueuedOperationsForRecord` (signal « pas encore parti ») |
| `lib/offline/repository.ts`                    | + `OfflineUpdateOptions.neverMergeIntoPendingCreate` (DISC-01) + passe-plat `waitForEarlierOperations` |
| `lib/offline/syncEngine.ts`                    | barrière de dépendance dans `processSyncQueue` (DISC-01b) |
| `hooks/useSessionReward.ts`                    | Assemble l'état réel de la récompense                     |
| `components/fitness/session/SessionRewardScreen.tsx` | Rend l'état honnête au lieu d'un « +0 XP »          |
