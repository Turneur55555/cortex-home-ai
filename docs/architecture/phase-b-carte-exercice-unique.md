# Phase B — Carte exercice unique (document officiel)

**Statut : document de phase, rédigé avant implémentation, conformément à la règle de gouvernance du 2026-07-15 (voir mémoire `gouvernance-repo-source-de-verite`).**

Déclenché par le retour de Nathan du 2026-07-15 (juste après la correction de vocabulaire de la Phase A) : le problème n'est plus le mot "segment", mais le fait qu'il continue d'exister plusieurs interfaces de séance selon la discipline. L'architecture validée (Spécification Fonctionnelle v1.0 + `docs/architecture/exercise-central-architecture.md`) prescrit **une seule architecture de séance** : séance > exercice > répétitions, avec des métriques entièrement déclarées par la discipline. La musculation est le premier exemple complet de cette architecture, pas un cas à part.

---

## 1. Constat sur le code réel (pas une supposition)

Avant de concevoir la cible, état exact du dépôt à `main` (commit `2b5018a`) :

- **Les primitives visuelles sont déjà unifiées.** `ExerciseCardPrimitives.tsx` (`ExerciseCardContainer`, `ExerciseCardHeader`, `ExerciseCardPillButton`, `ExerciseCardIconButton`, `AddExerciseButton`, `ExerciseCardConfirmDelete`) est déjà la seule source de vérité visuelle, réutilisée telle quelle par la carte musculation ET la carte générique. Ce n'est pas un problème de style incohérent.
- **Deux composants de haut niveau existent encore** : `ActiveExerciseCard` (`src/components/fitness/ActiveExerciseCard.tsx`, musculation) et `ActiveCourseExerciseCard` (`src/components/fitness/session/ActiveCourseExerciseCard.tsx`, toutes les autres disciplines — nom hérité du pilote Course du 2026-07-11, déjà générique dans les faits mais mal nommé). C'est ce doublon de nom/fichier, pas de logique visuelle, que Nathan désigne.
- **La carte de répétition générique (`ActiveSegmentCard.tsx`) est déjà 100% pilotée par configuration** (`SEGMENT_METRIC_CONFIG`, `lib/fitness/segmentStats.ts`) — chaque métrique d'une discipline s'affiche avec son libellé déclaré, sans branche `if(discipline)`. C'est déjà l'implémentation du principe "les métriques sont entièrement déclarées par la discipline" pour le niveau répétition.
- **Le point de friction réel identifié par Nathan** ("la course ouvre encore un formulaire") est localisé : le bouton "Ajouter un exercice" du bas de `ActiveGenericSessionView.tsx` ouvre un mini-formulaire texte (nom + 2 champs numériques codés en dur "Distance (km)"/"Allure (min/km)"), alors que côté musculation le même bouton (`AddExerciseButton`) ouvre `ExercisePickerSheet` (récents + catalogue + recherche + création libre) et crée immédiatement une carte vide.
- **Le catalogue d'exercices (`exercise_reference` via `useFullExerciseCatalog`/`useAddExercise`) est aujourd'hui câblé en dur sur `discipline_id="muscu"`** (commentaire explicite dans `useExerciseCatalog.ts` : "ce picker reste muscu-only"). C'est la vraie raison pour laquelle le picker musculation n'a jamais pu être réutilisé tel quel par les autres disciplines — pas un choix de conception qui les sépare volontairement, une limitation non généralisée jusqu'ici.

Conclusion : l'écart avec la cible de Nathan est plus étroit qu'il n'y paraît, mais réel sur deux points précis — le nom/l'existence de deux composants de haut niveau, et l'absence de picker générique pour l'ajout d'exercice hors musculation.

## 2. Cible

### 2.1 Un seul composant `ActiveExerciseCard`

`src/components/fitness/exerciseCard/ActiveExerciseCard.tsx` devient l'unique composant de haut niveau, déplacé dans le dossier partagé aux côtés de `ExerciseCardPrimitives.tsx`. Il est appelé par les deux vues de séance active (`ActiveWorkoutView.tsx` pour musculation, `ActiveGenericSessionView.tsx` pour les 5 autres disciplines) — **un seul nom, un seul fichier, un seul export, deux appelants.**

En interne, une discrimination `kind: "muscu" | "generic"` sépare le rendu des lignes de répétition, pour une raison structurelle et non arbitraire : la ligne musculation (`SetRow`, poids/répétitions + 1RM live/tendance/PR/récupération/photo/reprise-dernière-séance) porte une logique métier profonde (`estimate1RM`, `recommendLoad`, `muscleMapping`/`recovery`, upload photo) qui n'a pas d'équivalent déclaré pour les autres disciplines aujourd'hui. La ligne générique (`ActiveSegmentCard`, déjà pilotée par `SEGMENT_METRIC_CONFIG`) reste le rendu pour toutes les autres disciplines. Le header/conteneur/repli/confirmation de suppression/bouton d'ajout — c'est-à-dire "l'architecture" au sens où Nathan l'entend (comment une carte exercice se comporte et s'agence) — devient strictement partagé et unique.

**Périmètre explicitement laissé de côté, documenté comme decision consciente (voir section 4)** : fusionner la logique métier de `SetRow` (1RM, PR, suggestion de charge liée à la récupération musculaire, photo) dans un système de "capacités" générique que chaque discipline activerait à la carte est un chantier plus vaste que celui déclenché aujourd'hui — il touche au cœur du flux le plus utilisé et le plus testé de l'app. Ce n'est pas fait dans cette phase.

### 2.2 Ajout d'exercice sans formulaire séparé, pour toutes les disciplines

`ActiveGenericSessionView.tsx` : le bouton "Ajouter un exercice" ouvre `ExercisePickerSheet` (le même composant que la musculation, pas une copie), pré-rempli avec le catalogue de LA discipline de la séance en cours. La sélection (récent, catalogue, ou libellé libre tapé) déclenche immédiatement `useAddGenericSegment` avec des métriques vides — une carte `ActiveExerciseCard` (branche générique) apparaît aussitôt, prête à être remplie, exactement comme en musculation. Le formulaire Distance/Allure codé en dur disparaît.

Pour rendre ça possible sans dupliquer `ExerciseExplorerSheet` (904 lignes, déjà la seule implémentation de recherche/catalogue/scan/création) :
- `useFullExerciseCatalog`/`useAddExercise`/`usePromoteExercise` (`useExerciseCatalog.ts`) gagnent un paramètre `discipline: DisciplineId = "muscu"` — additif, valeur par défaut identique au comportement actuel, zéro régression pour les appelants existants (musculation).
- `ExerciseExplorerSheet`/`ExercisePickerSheet` gagnent une prop `discipline` (défaut `"muscu"`), transmise aux hooks ci-dessus. Le scan caméra IA (`enableScan`, reconnaissance de machines de musculation) n'a pas de sens hors musculation — désactivé par défaut dès que `discipline !== "muscu"`.

### 2.3 "Fréquents / récents / recherche / création libre"

- **Recherche + création libre** : déjà le comportement de `ExerciseExplorerSheet` en `mode="picker"` (taper un nom sans correspondance → sélection directe, aucune mutation de catalogue nécessaire) — fonctionne immédiatement dès que le catalogue est discipline-paramétré (2.2).
- **Récents** : dérivés de `workouts.metadata.segments` (couvre Cardio/HYROX/Guided/Autre) filtré sur la discipline de la séance en cours, même principe que `computeRecentExercises` (musculation) mais sur les labels de segments. Limite connue et assumée : Course, qui persiste dans `workout_segments` (table dédiée, pas `metadata.segments`), n'alimente pas encore cette liste de récents — recherche et création libre restent pleinement fonctionnelles, seule la suggestion "récents" est vide pour cette discipline dans cette phase.
- **Fréquents** : non implémenté comme un tri distinct par fréquence d'usage — la musculation elle-même n'a pas cette notion aujourd'hui (seulement "récents" + catalogue trié). Le catalogue (`exercise_reference`, qui se peuple à l'usage via `ExerciseResolutionService`, voir `exercise-central-architecture.md` section 2.2) joue ce rôle. Assumé, pas un chantier oublié.

## 3. Fichiers touchés

| Fichier | Changement |
|---|---|
| `src/components/fitness/exerciseCard/ActiveExerciseCard.tsx` | **Nouveau** — fusion de `ActiveExerciseCard.tsx` (musculation) et `ActiveCourseExerciseCard.tsx` (générique), discriminée par `kind`. |
| `src/components/fitness/ActiveExerciseCard.tsx` | Supprimé (contenu déplacé). |
| `src/components/fitness/session/ActiveCourseExerciseCard.tsx` | Supprimé (contenu déplacé). |
| `src/components/fitness/ActiveWorkoutView.tsx` | Import mis à jour, `kind="muscu"` explicite. |
| `src/components/fitness/session/ActiveGenericSessionView.tsx` | Import mis à jour, `kind="generic"` explicite ; formulaire Distance/Allure remplacé par `ExercisePickerSheet` + ajout immédiat. |
| `src/hooks/useExerciseCatalog.ts` | `useFullExerciseCatalog`/`useAddExercise`/`usePromoteExercise` paramétrées par `discipline` (défaut `"muscu"`, additif). |
| `src/components/fitness/ExerciseExplorerSheet.tsx` | Prop `discipline` (défaut `"muscu"`), `enableScan` conditionné. |
| `src/components/fitness/ExercisePickerSheet.tsx` | Prop `discipline` transmise. |
| `src/lib/fitness/recentSegmentLabels.ts` | **Nouveau** — équivalent de `computeRecentExercises` pour les labels de segments génériques (`metadata.segments`), fonction pure testée. |

## 4. Judgment calls (documentés, pas des motifs d'arrêt)

1. **Fusion complète de la logique métier musculation (1RM/PR/récupération/photo) dans un système de capacités générique : hors scope.** Nathan liste explicitement "records/statistiques/graphiques" comme dimensions de configuration — la fiche `SegmentAnalysisSheet`/`computeSegmentStats` (déjà générique, pilotée par `SEGMENT_METRIC_CONFIG`) couvre déjà cette promesse pour les statistiques/graphiques hors séance active. Mais la logique **temps réel** de suggestion de charge liée à la récupération musculaire est spécifique au modèle poids/répétitions et n'a pas d'équivalent déclaré pour distance/temps/watts. La généraliser proprement (quelles disciplines ont un "PR", sur quelle métrique, avec quelle logique de suggestion) est une décision de conception à part entière (invariant 9.9 d'`exercise-central-architecture.md` : toute décision majeure touchant ce modèle nécessite une validation explicite). Je documente le choix plutôt que de le découvrir en revue.
2. **Catalogue par discipline démarre vide/sparse pour tout sauf musculation** (99 exercices seedés) — comportement déjà voulu par l'architecture Exercise-Central (le référentiel se peuple à l'usage), pas une régression introduite ici.
3. **Récents Course non couverts** (table `workout_segments` vs `metadata.segments`) — gap documenté en 2.3, pas silencieux.

## 5. Vérifications prévues

`tsc --noEmit` (scope des fichiers touchés), `eslint --fix`, `vitest` (régression zéro sur les tests existants `ActiveSegmentCard`/`segmentStats`/`recentExercises`, + nouveaux tests sur `recentSegmentLabels.ts`), test fonctionnel live sur les deux flux (musculation inchangé, Cardio/Course "Ajouter un exercice" → picker → carte vide → remplissage).

---

*Document produit le 2026-07-15, avant implémentation, conformément à la règle de gouvernance permanente du projet.*

---

## 6. Addendum — convergence de l'historique (2026-07-15, retour de Nathan)

Phase B jugée incomplète : la carte exercice de séance ACTIVE est unifiée, mais l'historique
("Chroniques complètes") reste visuellement un module à part pour les disciplines non-muscu.
Cible : même header, même grille de stats, même carte exercice (icône/meta/accordéon), mêmes
actions de menu, chaque fois que l'existant le permet sans réécrire la musculation elle-même
(qui reste le modèle, intouché).

### 6.1 Constat précis

- `WorkoutCard.tsx` (muscu) : titre éditable dans le header, grille de 4 tuiles de stats
  (Durée/Tonnage/Calories/Exos), une carte par exercice (icône ou photo, méta "N séries",
  badges PR, accordéon de séries), menu à 4 actions (Refaire en live, Enregistrer comme modèle,
  Enregistrer comme séance passée, Supprimer).
- `GenericHistoryCard.tsx` (5 autres disciplines) : PAS de titre dans le header (seulement date +
  badges), contenu délégué à `SessionSummaryCard` (puces texte, pas de tuiles) puis soit
  `CourseHistoryContent`/`DisciplineHistoryContent` (quasi-duplication : bouton plat par exercice,
  aucun accordéon), soit `SessionSegmentList` (liste à plat, non groupée, pour "Autre" — seule
  discipline sans entrée dans `HISTORY_CONTENT_RENDERERS`, alors que ses segments ont bien un
  `label` groupable comme les autres, vérifié dans `freeformEngine.ts`). Menu à 1 seule action
  (Supprimer) — "Refaire en live" n'existe pas pour ces disciplines (câblé en dur sur
  `useStartWorkoutFromTemplate`, muscu-only).

### 6.2 Cible et fichiers touchés

- `CourseHistoryContent.tsx` + `DisciplineHistoryContent.tsx` fusionnés en UN
  `GenericHistoryExerciseList.tsx`, utilisé par les 5 disciplines sans exception (Autre inclus) —
  rendu aligné sur la ligne exercice de `WorkoutCard` (icône, méta "N répétitions", chevron,
  accordéon des répétitions via `SessionStatChip`, bouton stats → `SegmentAnalysisSheet` avec la
  bonne discipline). `historyContentRenderers.tsx` et son registre deviennent inutiles (un seul
  rendu pour tous) — supprimés.
- `GenericHistoryCard.tsx` : titre éditable (`EditableText` + `useUpdateWorkoutName`, déjà
  générique) ajouté au header ; grille de tuiles (`StatTile`, déjà partagé) alimentée par Durée +
  Exos (calculables génériquement) + `view.summaryStats` (déjà déclarés par chaque moteur — c'est
  exactement le mécanisme "la discipline injecte ses capacités dans une architecture commune") ;
  menu gagne "Refaire en live" via un nouveau hook générique (6.3) ; contenu délégué à
  `GenericHistoryExerciseList` (remplace `SessionSummaryCard` dans cette carte — `SessionSummaryCard`
  n'est pas supprimé, reste utilisé par l'écran de relecture avant sauvegarde).

### 6.3 "Refaire en live" générique — nouvelle capacité, pas juste un déplacement visuel

`repeatLiveGeneric(workout)` : construit un `WorkoutRecordDraft` (déjà fait via `adaptWorkoutRow`,
disponible dans `GenericHistoryCard`) + des `LiveSegmentSeed[]` depuis `view.segments`
(label + metrics, même format que `genericBuildLiveSegments`), puis appelle
`useStartGenericActiveWorkout`. Équivalent fonctionnel exact du `repeatLive` muscu
(`useStartWorkoutFromTemplate`), mêmes garde-fous (confirmation, séance active existante bloque).
Judgment call : ceci est une capacité nouvelle (pas seulement une réorganisation visuelle), mais
elle découle directement de la convergence demandée ("même comportement des boutons") et réutilise
des hooks déjà existants sans toucher au chemin musculation — traité comme faisant partie de cette
convergence, pas comme une décision produit à part.

### 6.4 Explicitement hors scope (documenté, pas un motif d'arrêt)

- **"Ajouter un exercice" rétroactif sur une séance générique déjà terminée.** Musculation permet
  d'ajouter un exercice après coup à une séance passée (`AddExerciseModal`, écrit directement dans
  `exercises`). Aucun mécanisme équivalent n'existe pour muter `workouts.metadata.segments` (JSON)
  ou `workout_segments` d'une séance déjà `completed`. Ce n'est pas une différence d'interface mais
  une vraie absence de chemin d'écriture pour des données historiques déjà closes — une décision de
  conception (faut-il autoriser la mutation d'un historique clos ?) plutôt qu'une unification
  mécanique. Reporté, signalé explicitement.
- **Fusion fichier `ExerciseAnalysisSheet`/`SegmentAnalysisSheet`** : déjà explicitement reportée à
  une phase ultérieure par une décision antérieure documentée dans `SegmentAnalysisSheet.tsx`
  ("la fusion éventuelle des deux est une décision explicitement reportée à la Phase 3") — non
  rouverte ici, les deux fiches restent cohérentes visuellement (mêmes primitives
  `SectionCard`/`StatTileMini`/`TrendIcon`) sans être le même fichier.

## 7. Addendum 2 — densité générique pilotée par les métriques (2026-07-15, retour de Nathan)

Retour après vérification live de l'addendum 6 : la convergence structurelle (header, tuiles,
carte exercice, accordéon) est en place, mais le résultat perçu reste une "adaptation minimale".
La carte Cardio ne donne pas la même impression de produit fini que la carte Musculation, à
cause d'un déficit de DENSITÉ, pas de structure. Cible reformulée par Nathan : un seul composant
intelligent, où la discipline déclare metrics + ordre + type + format + importance, et où le
composant décide seul du layout (colonnes, lignes, groupes, responsive) — jamais l'inverse.

### 7.1 Constat précis (code réel, pas supposition)

- Grille de tuiles (`WorkoutCard`/`GenericHistoryCard`) : `grid-cols-4` figé. La musculation a
  toujours exactement 4 tuiles (Durée/Tonnage/Calories/Exos) donc ça ne se voit jamais. Cardio
  n'a que 3 tuiles réelles (Exos + `baseSummaryStats` = Durée + Activité) → une case vide dans la
  grille à chaque séance Cardio. Vérifié dans `cardioEngine.ts` (`buildStats` ne pousse
  qu'"Activité") et `sessionViewHelpers.ts` (`baseSummaryStats` ajoute systématiquement "Durée").
- Accordéon de répétition (`GenericHistoryExerciseList.tsx`) : rendu en puces (`SessionStatChip`,
  `flex flex-wrap`) dans une boîte `rounded-xl` — pour une répétition à 1-2 métriques (cas courant
  Cardio/Guided), la boîte reste presque vide car les puces ne remplissent jamais la largeur.
  `WorkoutCard`, à l'inverse, rend un vrai TABLEAU (`grid-cols-[56px_1fr_1fr]`, en-tête Série/
  Reps/Kg) qui occupe toujours la largeur disponible, quel que soit le nombre de séries — c'est
  précisément l'écart de "densité d'information" signalé.
  - "Refaire en live" générique testé lors du retour précédent avait ouvert un `window.confirm()`
    natif qui a bloqué les deux onglets Chrome utilisés — non résolu, aucune tentative de
    contournement (l'outil de test n'autorise pas de cliquer une boîte native) ; le clic vers la
    boîte fonctionne (vérifié en base : aucune séance active créée par erreur), reste à re-tester
    depuis un onglet frais.
- `genericFormatLiveSegment` (sessionViewHelpers.ts) affiche la clé brute (`distance_m`) comme
  libellé au lieu de passer par `SEGMENT_METRIC_CONFIG["distance_m"].label` ("Distance") — un
  segment généré par Sensei affiche "Distance", le même segment reformaté après une séance live
  affiche "distance_m". Incohérence directe avec "même comportement" — pas juste un manque de
  densité, un vrai bug de convergence.
- `SEGMENT_METRIC_CONFIG` (`segmentStats.ts`) porte déjà `label`/`direction`/`format` — donc DÉJÀ
  la table déclarative unique demandée par Nathan pour le vocabulaire de métriques. Il manque
  seulement deux champs déclaratifs pour piloter le layout : l'ORDRE d'affichage explicite (repose
  aujourd'hui sur l'ordre d'insertion dans l'objet, non documenté comme contrat) et l'IMPORTANCE
  (aujourd'hui aucune métrique n'est distinguée "colonne de tableau" vs "détail secondaire").

### 7.2 Principe retenu

`SEGMENT_METRIC_CONFIG` reste la SEULE source déclarative (aucun nouveau fichier de config par
discipline — un moteur qui introduit une nouvelle métrique numérique n'a qu'à ajouter UNE entrée
ici, jamais toucher un composant). Deux champs ajoutés par entrée :
- `order: number` — ordre d'affichage stable, remplace la dépendance implicite à l'ordre
  d'insertion JS.
- `importance: "primary" | "secondary"` — `primary` = mérite sa propre colonne de tableau (ex.
  Distance, Allure, Charge, Répétitions, Tours, Durée) ; `secondary` = détail contextuel affiché en
  ligne compacte seulement s'il est présent (ex. Dénivelé+, Inclinaison, Cadence, Résistance,
  Calories estimées) — jamais d'espace réservé si absent.

Le composant (`GenericHistoryExerciseList.tsx`) lit `seg.metrics` (miroir numérique déjà posé
Phase 1, déjà rempli par `cardioEngine`/`hyroxEngine`/`courseEngine`/`genericFormatLiveSegment`)
pour classer chaque valeur via `SEGMENT_METRIC_CONFIG` : les clés `primary` présentes dans AU MOINS
UNE répétition du groupe deviennent les colonnes du tableau (ordonnées par `order`), le reste
s'affiche en ligne secondaire compacte, uniquement quand non vide. Un groupe sans aucune métrique
`primary` (ex. "Autre" : blocs texte libre, `freeformEngine.ts`) garde le rendu en puces actuel —
dégradation explicite et déjà actée (§6.4), pas une régression.

### 7.3 Cible précise

1. Grille de tuiles auto-adaptative — nouveau composant `StatTileRow.tsx` (colonnes = nombre réel
   de tuiles passées, jamais de case vide), utilisé par `WorkoutCard.tsx` ET `GenericHistoryCard.tsx`
   (musculation garde exactement 4 tuiles → zéro changement visuel, vérifié par construction).
2. Tableau dense par groupe d'exercice dans `GenericHistoryExerciseList.tsx`, remplace les puces
   flottantes quand des métriques `primary` sont présentes — en-tête "Rép." + colonnes déclarées,
   une ligne par répétition, valeurs déjà formatées via `SEGMENT_METRIC_CONFIG[key].format`.
3. Ligne méta enrichie sous le titre de chaque exercice (meilleure valeur des 1-2 premières
   colonnes `primary`, calculée via `direction`) — même esprit que "N séries · max X kg" en
   musculation.
4. Correction `genericFormatLiveSegment` : libellé et valeur toujours dérivés de
   `SEGMENT_METRIC_CONFIG` quand la clé est connue (fallback sur la clé brute uniquement si
   vraiment inconnue — robustesse conservée pour une métrique future non encore déclarée).
5. Complète le miroir `metrics` de `courseEngine.formatLiveSegmentImpl` (aujourd'hui seul `stats`
   est rempli à cet endroit précis, contrairement à `generate()` et aux 4 autres moteurs) — sans
   ce miroir, une séance Course relancée en live puis reclôturée perdrait sa colonne de tableau.

### 7.4 Explicitement hors scope (documenté, pas un motif d'arrêt)

- Introduire un système de records/PR générique (au-delà de "meilleure valeur" affichée dans la
  ligne méta, qui est un simple max/min instantané, pas un PR persistant avec badge). Rappel de
  l'invariant déjà posé (§6.4, addendum 1) : la fusion avec le moteur de Rang/PR musculation reste
  hors scope.
- Rendre `importance`/`order` configurables par discipline (surcharge locale). `SEGMENT_METRIC_CONFIG`
  reste global et partagé — cohérent avec le choix déjà fait pour `distance_m` (partagé Course/HYROX/
  Cardio). Si une vraie divergence d'importance apparaît un jour entre disciplines pour la MÊME clé,
  ce sera une vraie décision produit à soumettre, pas une extension mécanique.

## 8. Addendum 3 — audit exhaustif de convergence UX (2026-07-15, retour de Nathan)

Nouveau recadrage de Nathan après l'addendum 2 : la densité de l'historique est corrigée, mais ce
n'était qu'UN symptôme. Demande explicite d'un audit complet, discipline par discipline, du
parcours entier (création → séance active → clôture → historique → fiche exercice), sur 24
dimensions, en comparant systématiquement à la Musculation (modèle de référence). Toute différence
qui n'est pas une différence de CAPACITÉ (métriques, champs, calculs) mais une différence de
FINITION (vide, pauvre, plus simple, moins abouti) est un écart à corriger — "spécifique à cette
discipline" n'est plus une réponse acceptable en soi, seulement un fait à documenter puis à
traiter.

### 8.1 Méthode

Audit fait par lecture de code complète (moteurs, vues de séance active, cartes d'historique,
fiches exercice, dialogues de confirmation, système de records) ET par test live réel : les 3
disciplines sans aucune séance en base (Course, HYROX, Autre — vérifié par requête SQL directe,
`select discipline, count(*) from workouts where status='completed' group by discipline` ne
retournait que muscu/guided/cardio) ont chacune reçu une séance de test générée via Sensei,
terminée (jamais annulée), pour pouvoir auditer réellement leur historique — pas seulement
supposer son comportement depuis le code. Musculation/Cardio/Guidé avaient déjà des séances
réelles, réutilisées telles quelles.

### 8.2 Régression critique découverte pendant l'audit — corrigée immédiatement

`StatTileRow` (addendum 2) rend les colonnes en largeur égale stricte (`repeat(n, 1fr)`) sans
plancher de largeur ni retour à la ligne du texte. Sur une séance Course à 5 tuiles avec des
valeurs longues ("Type de séance : Endurance fondamentale", "Récupération estimée : ~24h avant une
séance intense"), le texte déborde visuellement d'une tuile sur l'autre (mots non coupables,
`StatTile` sans `overflow-hidden`/`break-words`) — capture live sur `cortex-home-ai.lovable.app`,
tuiles "Endurance", "1 min", "fondamentale" se chevauchent littéralement. HYROX (3 tuiles) et Autre
(4 tuiles) n'ont pas ce problème — la cause est la combinaine "beaucoup de colonnes + texte long",
pas la logique de comptage en elle-même. **Corrigé dans ce même lot** (voir 8.5) : `StatTile`
tronque/coupe proprement, `StatTileRow` plafonne à 4 colonnes par ligne (au-delà, une 2e ligne).

### 8.3 Constats par dimension (Musculation = référence)

Format : dimension — état pour les 5 autres disciplines par rapport à la musculation.

- **Structure de la carte (historique)** — convergente (GenericHistoryCard = même gabarit que
  WorkoutCard : header, titre éditable, tuiles, liste d'exercices, menu). OK pour les 5.
- **Densité visuelle (répétitions)** — convergente depuis l'addendum 2 (tableau dense quand des
  métriques primary existent : Cardio, Course, HYROX). Guidé et Autre n'ont pas de métrique
  numérique primary déclarée → restent en rendu "puces" — dégradation ASSUMÉE, pas un oubli
  (Guidé/Autre sont majoritairement narratifs, pas quantitatifs), mais reste à re-questionner si
  Nathan considère que même ce cas doit converger visuellement (voir 8.6).
- **Hiérarchie visuelle** — convergente (même structure header > tuiles > liste).
- **Répétitions / Exercices (vocabulaire)** — convergent (Phase A + addendum 1 : "exercice"/
  "répétition" partout, plus de "segment" visible).
- **Ajout d'exercice (séance active)** — convergent depuis Phase B core (même `ExercisePickerSheet`
  pour les 6 disciplines) **sauf** : le bouton "Ouvrir le catalogue" (icône livre, bibliothèque de
  référence complète) existe uniquement dans `ActiveWorkoutView` (muscu). Les 5 autres n'ont que le
  bouton picker seul — `DisciplineExerciseLibrarySheet` existe déjà, paramétré par discipline, non
  câblé dans `ActiveGenericSessionView`. Écart mécanique, peu coûteux (8.5).
- **Ajout de répétition (séance active)** — convergent (même bouton "Ajouter une répétition"/série
  selon le kind, vérifié live sur Course/HYROX/Autre).
- **Édition (séance active)** — convergente pour les champs de métriques (mêmes primitives). Édition
  d'une répétition déjà validée depuis la FICHE EXERCICE (pas juste la carte active) : possible en
  musculation (`ExerciseAnalysisSheet` a des icônes Pencil/Trash2), absente de `SegmentAnalysisSheet`
  (aucune icône d'édition/suppression). Écart réel, non corrigé dans ce lot (surface plus large,
  voir 8.6).
- **Suppression** — convergente au niveau séance (`WorkoutDeleteDialog`, même dialogue) et exercice
  en séance active (icône corbeille sur la carte, les 6 disciplines). Pas convergente au niveau
  "une répétition passée depuis l'historique" (voir point Édition ci-dessus).
- **Reprise ("Refaire en live")** — convergente mécaniquement depuis l'addendum 1
  (`useStartGenericActiveWorkout`, même garde-fous que muscu) ; clic non re-testable dans cette
  session (boîte `window.confirm()` native bloque l'outillage de test Chrome utilisé — limite de
  l'outil, pas du code, déjà signalée).
- **Progression (tendance meilleure/dernière valeur)** — partiellement convergente : le calcul
  existe pour les 6 (`computeSegmentStats`/`buildStat` avec tendance up/down/flat, ou l'équivalent
  musculation `progression.ts`), mais son AFFICHAGE dans la fiche exercice est moins riche côté
  générique (pas de graphique de tendance équivalent pour toutes les métriques simultanément —
  `SegmentAnalysisSheet` trace UNE métrique à la fois).
- **Historique (carte)** — convergent depuis addendum 1+2.
- **Fiche exercice** — partiellement convergente : mêmes primitives visuelles
  (`SectionCard`/`StatTileMini`/`TrendIcon`), mais 3 sections absentes côté générique et
  explicitement documentées comme telles dans le code (`SegmentAnalysisSheet.tsx`, commentaire
  d'en-tête) : pas de section Rang/Maîtrise (système scopé musculation, non dupliqué), pas de
  recommandation de surcharge progressive (algorithme non écrit pour les autres disciplines,
  emplacement "Bientôt disponible" honnête), pas d'analyse IA à la demande
  (`useDeepExerciseAI`/`useExerciseAnalysis` n'existent que côté muscu). Ce sont les 3 plus gros
  écarts de "finition perçue" restants (voir 8.6).
- **Graphiques** — convergents dans leur PRINCIPE (recharts `LineChart`, mêmes composants visuels)
  mais moins nombreux côté générique (1 métrique à la fois vs plusieurs vues muscu).
- **Records / PR** — écart réel et significatif. Musculation : badge "Nouveau record !"/"Record X
  kg" (Trophy) affiché EN SÉANCE ACTIVE (carte exercice) ET dans l'historique, alimenté par
  `computePRs`. Les 5 autres disciplines : aucun badge équivalent, ni en séance active ni dans
  l'historique — seule la ligne méta "Distance : 2.00 km" (addendum 2) montre une valeur, sans
  jamais la qualifier de record. Partiellement mécanique à corriger (8.5 : badge basé sur
  `computeSegmentStats`, sans toucher au moteur de Rang musculation) ; la fusion complète avec le
  système de Rang/Maîtrise reste hors scope (invariant 9.9, déjà acté deux fois).
- **Badges (discipline)** — convergent (`DisciplineBadge`, une icône+couleur par discipline, déjà
  généralisé Phase 7 antérieure).
- **Animations / transitions** — convergentes par construction : accordéons (`maxHeight`/`opacity`
  transition identique), confirmations (mêmes classes `animate-in`/`fade-in` là où elles existent).
  **Exception majeure** : l'écran de clôture de séance (voir Résumé de séance ci-dessous) — muscu a
  une animation confetti + slide-in, les 5 autres n'ont AUCUNE animation à la clôture (juste un
  toast). C'est la plus grosse différence d'"impression de produit fini" trouvée dans cet audit.
- **Boutons** — convergents (mêmes composants `ExerciseCardPillButton`/`ExerciseCardIconButton`,
  mêmes tailles/couleurs/`active:scale-90`).
- **Confirmations** — convergentes dans leur FORME (mêmes dialogues custom `fixed inset-0`) sauf un
  écran entier manquant (voir Résumé de séance).
- **Résumé de séance (clôture)** — ÉCART MAJEUR confirmé en live. Musculation :
  `WorkoutSummaryOverlay` — confetti animé, emoji, 4 tuiles de stats (Durée/Séries/Tonnage/Meilleur
  1RM), bouton "Clore 🏆". Les 5 autres disciplines : `window.confirm`-style "Terminer la séance ?
  X/Y réalisé(s)" (aucune tuile, aucune animation), puis un simple toast "Séance terminée 💪" au
  retour à la liste — testé en live sur Course/HYROX/Autre, confirmé identique à la lecture de code
  (`ActiveGenericSessionView` n'a pas d'équivalent de `WorkoutSummaryOverlay`). C'est l'écart le
  plus visible et le plus simple à corriger mécaniquement (8.5).
- **Statistiques (post-séance, analyse IA)** — ÉCART MAJEUR. `PostWorkoutAnalysisSheet` (analyse IA
  complète : muscles sollicités, récupération, PRs, recommandation séance suivante) ne se déclenche
  QUE pour muscu (`ActiveGenericSessionView` appelle `onFinished={() => {}}`, un no-op — vérifié
  dans `SeancesTab.tsx`). Aucune analyse post-séance, aucune forme, pour les 5 autres disciplines.
  Écart réel mais PAS mécanique : le contenu de l'analyse actuelle est structurellement lié au
  vocabulaire musculation (muscles, tonnage, 1RM) — une version générique nécessite soit une
  nouvelle fonction Edge (nouveau prompt IA basé sur `SessionView`), soit une décision de portée
  (quel niveau de richesse pour un premier jet). Non traité dans ce lot, proposé comme prochaine
  étape (8.6).
- **Cohérence du vocabulaire** — convergente (Phase A + addendum 1, "exercice"/"répétition"
  partout, plus aucune trace de "segment" en UI).
- **Responsive** — convergent par construction (mêmes classes Tailwind, mêmes breakpoints, aucun
  style discipline-spécifique trouvé dans le code qui casserait le responsive) ; non re-testé sur
  un vrai petit viewport dans cette session (limite de temps, risque jugé faible car code partagé).

### 8.4 Tableau de synthèse

| Dimension | Muscu (référence) | Cardio | Course | HYROX | Guidé | Autre |
|---|---|---|---|---|---|---|
| Structure carte historique | ref | OK | OK | OK | OK | OK |
| Densité répétitions | ref | OK | OK | OK | dégradé (assumé) | dégradé (assumé) |
| Ajout exercice (picker) | ref | OK | OK | OK | OK | OK |
| Ajout exercice (catalogue) | ref | **écart** | **écart** | **écart** | **écart** | **écart** |
| Édition répétition passée | ref | **écart** | **écart** | **écart** | **écart** | **écart** |
| Reprise ("Refaire en live") | ref | OK (méca.) | OK (méca.) | OK (méca.) | OK (méca.) | OK (méca.) |
| Records / PR (badge) | ref | **écart** | **écart** | **écart** | **écart** | **écart** |
| Résumé de séance (clôture) | ref | **écart majeur** | **écart majeur** | **écart majeur** | **écart majeur** | **écart majeur** |
| Analyse IA post-séance | ref | **écart majeur** | **écart majeur** | **écart majeur** | **écart majeur** | **écart majeur** |
| Fiche exercice (Rang/surcharge/IA) | ref | dégradé (documenté) | dégradé (documenté) | dégradé (documenté) | dégradé (documenté) | dégradé (documenté) |
| Vocabulaire / Animations / Boutons / Badges discipline | ref | OK | OK | OK | OK | OK |

### 8.5 Corrections mécaniques engagées dans ce lot (sans décision produit nouvelle)

1. Fix régression `StatTileRow`/`StatTile` (8.2).
2. Résumé de séance générique (`GenericWorkoutSummaryOverlay` ou équivalent) — mêmes stats tiles
   (Durée/Exos/Réalisés + 1 métrique-phare si disponible), même animation confetti, réutilise
   `WorkoutSummaryOverlay` comme référence visuelle stricte.
3. Badge "Record" générique sur la carte exercice (séance active + historique), basé sur
   `computeSegmentStats`/`bestMetricValue` déjà existants — jamais touché au moteur de Rang muscu.
4. Bouton "Ouvrir le catalogue" dans `ActiveGenericSessionView` (le sheet existe déjà, juste pas
   câblé).
5. Badge streak dans le header de séance active générique (`useFitnessStreak` déjà générique,
   simplement pas appelé côté `ActiveGenericSessionView`).

### 8.6 Explicitement hors scope de ce lot (documenté, pas un motif d'arrêt)

- **Analyse IA post-séance générique** : nécessite une nouvelle fonction Edge (prompt IA sur
  `SessionView` au lieu de `exercises`/`exercise_sets`) — changement backend, pas seulement
  présentationnel. Proposé comme prochaine étape dédiée.
- **Édition/suppression d'une répétition passée depuis la fiche exercice générique** : mécanisme
  d'écriture rétroactive sur `workouts.metadata.segments`/`workout_segments` à concevoir (même
  famille de limite déjà documentée en addendum 1, §6.4, pour "ajouter un exercice rétroactif").
- **Recommandation de surcharge progressive générique** et **section Rang/Maîtrise générique** :
  déjà explicitement actées hors scope à deux reprises (code `SegmentAnalysisSheet.tsx`, addendum 1
  §6.4) — nécessitent soit d'étendre le moteur de Rang existant (interdit sans validation, invariant
  9.9 d'`exercise-central-architecture.md`), soit d'en concevoir un nouveau. Vraie décision produit,
  pas une extension mécanique.
- **Densité "Guidé"/"Autre" sans métrique primary** : ces deux disciplines sont structurellement
  narratives (texte libre ou groupes musculaires sollicités), pas quantitatives — le tableau dense
  n'a pas de sens sans données numériques. Le rendu "puces" actuel reste correct FONCTIONNELLEMENT ;
  reste à évaluer si Nathan veut malgré tout un habillage visuel plus riche que de simples puces pour
  ces deux cas (question ouverte, pas encore tranchée).
