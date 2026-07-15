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
