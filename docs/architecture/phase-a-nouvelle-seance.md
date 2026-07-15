# Phase A — Refonte de l'expérience "Nouvelle séance"

Statut : **en cours d'implémentation**. Document officiel de la phase, conformément à la
règle de gouvernance actée le 15/07/2026 : *aucune phase ne peut exister uniquement dans la
mémoire de conversation, toute phase validée est documentée dans le dépôt avant implémentation.*

Construit à partir de : la Spécification Fonctionnelle v1.0 et le plan de migration validés par
Nathan (transmis en conversation le 15/07/2026, non présents ailleurs dans le dépôt au moment de
la rédaction de ce document), l'architecture Exercise-Central existante (voir
[architecture.md](../architecture.md) et
[exercise-central-architecture.md](exercise-central-architecture.md)), et l'état réel du code
audité le 15/07/2026 (voir section "Constat" ci-dessous).

## Contexte

Le module Séances/Sensei a été reconstruit en 7 phases + Phase 8 (moteurs par discipline,
Open/Closed — voir [exercise-central-architecture.md](exercise-central-architecture.md)) puis
fiabilisé en Phase 0 (14/07/2026 : conflit séance active en double, fraîcheur du cache,
confirmation "Refaire", identité des segments — close et validée). Cette Phase A ne touche PAS
à cette architecture (moteurs, `ENGINE_REGISTRY`, contrat `WorkoutEngine`, persistance) : elle
refond uniquement le parcours utilisateur de création d'une nouvelle séance.

## Constat (audit du code réel, 15/07/2026)

Aujourd'hui, l'écran d'accueil Séances (`SeancesTab.tsx`) expose **trois portes d'entrée
distinctes** pour démarrer quelque chose :

1. **Sensei^IA** (`SenseiIACard`) → `CoachSheet` → choix de discipline interne → questions →
   génération. Résultat : séance active live (Course uniquement, `supportsLiveTracking`) ou
   brouillon à relire puis sauvegarder directement (`GenericSessionReviewSheet` — Cardio, HYROX,
   Guidé, Autre).
2. **Choisir une épreuve** (`ChoisirEpreuveCard`) → `NewSessionChoiceSheet` → séance vide
   (`StartWorkoutSheet`, **musculation uniquement**, pas de sélection de discipline) ou séance
   sauvegardée (`SavedTemplatesSheet`, **musculation uniquement**).
3. **La Forge** (`LaForgeCard`) → `ForgeDisciplineChooser` → catalogue d'exercices
   (`ExerciseCatalogSheet` muscu ou `DisciplineExerciseLibrarySheet` autres disciplines). Ce
   n'est déjà pas un démarreur de séance — c'est une bibliothèque de référence (A.5 est donc
   déjà largement satisfait structurellement, cf. section A.5 plus bas).

Capacités réelles par discipline (`ENGINE_REGISTRY`, `comingSoon: false` pour les 6) :

| Discipline | Libre (vide) | Modèle sauvegardé | Coach IA | Séance active live aujourd'hui |
|---|---|---|---|---|
| Musculation (`muscu`) | ✅ StartWorkoutSheet | ✅ SavedTemplatesSheet | ✅ | ✅ (WorkoutSheet, historique) |
| Course (`course`) | ❌ | ❌ | ✅ | ✅ (`supportsLiveTracking`, pilote 09/07) |
| Cardio (`cardio`) | ❌ | ❌ | ✅ | ❌ (brouillon direct) |
| HYROX (`hyrox`) | ❌ | ❌ | ✅ | ❌ (brouillon direct) |
| Activité accompagnée (`guided`) | ❌ | ❌ | ✅ | ❌ (brouillon direct) |
| Autre (`autre`) | ❌ | ❌ | ✅ | ❌ (brouillon direct) |

Aucune de ces 5 dernières disciplines n'a de mode "Libre" ni "Modèle" aujourd'hui.

## Principes actés (transmis par Nathan, 15/07/2026)

### A.1 — Porte d'entrée unique
Il n'existe plus qu'une seule porte d'entrée : **Nouvelle séance**. Les portes existantes
(Sensei^IA, Choisir une épreuve) deviennent des variantes internes de ce nouveau parcours —
leurs composants ne sont pas supprimés (A.7), ils sont ré-orchestrés depuis le nouvel écran
unifié plutôt que d'être des cartes séparées sur l'accueil.

### A.2 — Premier écran : Choisir une discipline
Les 6 disciplines existantes du registre sont présentées de façon homogène (icône +
couleur d'accent déjà portées par chaque moteur depuis la Phase 7, réutilisées telles quelles) :
Musculation, Course, Cardio, HYROX, Activité accompagnée, Autre.

**Point de vigilance signalé à Nathan** : l'exemple donné en conversation listait "Lagree"
comme discipline séparée d'"Activité accompagnée". Dans le code actuel, Lagree Pilates est une
des 4 activités *à l'intérieur* du moteur `guided` (`GuidedActivityEngine`, avec Yoga/Mobilité/
Stretching), pas une entrée de `DisciplineId`. En faire une discipline de premier niveau
demanderait de toucher `DisciplineId`/`ENGINE_REGISTRY`/le contrat exhaustif des moteurs — exclu
par la contrainte explicite "cette phase ne modifie pas l'architecture Exercise-Central". Ce
document traite donc l'exemple de Nathan comme illustratif et garde les 6 disciplines
existantes ; Lagree reste sélectionnable comme activité à l'intérieur d'"Activité accompagnée".
À corriger si ce n'était pas l'intention.

### A.3 — Modes réellement disponibles, jamais de faux choix
Après le choix de discipline, seuls les modes réellement câblés sont affichés — jamais de
bouton grisé. D'après le constat ci-dessus :
- **Musculation** : Libre, Modèle, Coach IA (les 3 existent déjà).
- **Course, Cardio, HYROX, Activité accompagnée, Autre** : Coach IA (existe déjà) + **Libre**
  (nouveau — voir A.6, nécessite l'extension du live-tracking générique). Pas de "Modèle" pour
  ces disciplines : la fonctionnalité de séance sauvegardée réutilisable n'existe aujourd'hui
  que pour la musculation (`SavedTemplatesSheet`/`useWorkoutTemplates`, contenu de forme
  exercices/séries) ; l'étendre aux autres disciplines n'est pas demandé par cette phase et
  n'est pas fait ici (pas de faux "Modèle" affiché pour ces disciplines).

### A.4 — Convergence vers une architecture de séance active unique
Tous les chemins (Libre ou Coach IA, quelle que soit la discipline non-muscu) convergent vers
la même séance active générique (`useGenericActiveSession`/`workout_segments`, le même moteur
qui sert déjà Course en pilote depuis le 09/07). La musculation garde son propre parcours
dédié (`WorkoutSheet`/`ActiveWorkoutView`, `exerciseRows`), qui reste hors du périmètre
"séance active générique" par construction (`feedsRankEngine=true`, frontière posée dès la
Phase 1 — inchangée par cette phase, cf. contrainte "ne modifie pas Exercise-Central").

### A.5 — La Forge devient bibliothèque uniquement
Déjà vrai structurellement (constat ci-dessus : La Forge n'ouvre aujourd'hui aucun démarreur de
séance). Cette phase retire simplement sa carte de la liste des "façons de démarrer une séance"
sur l'accueil et la conserve comme point d'accès bibliothèque (déjà atteignable depuis une
séance active et les fiches exercice, inchangé).

### A.6 — Coach IA toujours une vraie séance active
Aujourd'hui seul Course a `supportsLiveTracking=true`. Cette phase étend cette capacité à
Cardio, HYROX, Activité accompagnée et Autre, en réutilisant le miroir numérique
`SessionSegment.metrics` déjà posé (Phase 1 multi-discipline, "solution transitoire") plutôt
qu'en dupliquant une logique par moteur : un convertisseur générique
`template.segments → LiveSegmentSeed[]` et son inverse `LiveSegmentRow → SessionSegment`,
partagés par les 4 moteurs (`sessionViewHelpers.ts`). `GenericSessionReviewSheet` (parcours
"brouillon → sauvegarde directe") devient inutilisé par le nouveau parcours mais n'est pas
supprimé (A.7).

**Point de vigilance** : ceci lève la restriction posée le 09/07/2026 ("pilote Course
seulement, ne pas étendre sans validation explicite de Nathan") — la validation explicite est
cette Phase A elle-même.

### A.7 — Additif, rien de supprimé cette phase
`SenseiIACard`, `ChoisirEpreuveCard`, `NewSessionChoiceSheet`, `StartWorkoutSheet`,
`SavedTemplatesSheet`, `GenericSessionReviewSheet` restent dans le dépôt et fonctionnels. Seule
la surface visible sur l'accueil change (une carte au lieu de deux/trois) ; l'implémentation
sous-jacente est réutilisée, jamais dupliquée.

## Décisions d'implémentation

- Nouveau composant `src/components/fitness/templates/NewSessionSheet.tsx` : étape discipline
  (grille des 6 disciplines, icône/couleur via `DisciplineIcon.tsx` déjà existant) → étape mode
  (liste filtrée par capacité réelle, cf. tableau A.3). Musculation route vers les sheets
  existants inchangés (`StartWorkoutSheet`, `SavedTemplatesSheet`) ; les 5 autres disciplines
  routent vers un nouveau démarrage "Libre" générique (séance active vide, `seedSegments: []`)
  ou vers `CoachSheet` (nouveau prop optionnel `initialDiscipline` pour sauter l'étape
  discipline déjà faite dans le nouvel écran — évite de choisir la discipline deux fois).
- `sessionViewHelpers.ts` : `genericBuildLiveSegments`/`genericFormatLiveSegment`, réutilisés
  par `cardioEngine.ts`/`hyroxEngine.ts`/`guidedEngine.ts`/`freeformEngine.ts`.
- `SeancesTab.tsx` : la ligne `SenseiIACard` + `ChoisirEpreuveCard` est remplacée par une seule
  carte "Nouvelle séance" ouvrant `NewSessionSheet`. `LaForgeCard` reste en place, inchangée.

## Vérifications de fin de phase

À exécuter dans l'ordre fixé par Nathan : relecture, TypeScript, ESLint, Vitest, corrections,
GitHub, Lovable, tests fonctionnels, nettoyage, rapport final. Résultats consignés dans le
rapport final de la phase (mémoire de session + commit).

## Addendum — harmonisation "exercice" (15/07/2026, retour de Nathan après premier test live)

**Constat important avant de coder quoi que ce soit** : contrairement à ce que le retour laissait
supposer, l'essentiel de l'architecture demandée existait déjà, posée le 11/07/2026 (session
"CORRECTION 2026-07-11 (retour de Nathan)", non documentée dans ma mémoire jusqu'ici) :
- `groupByExerciseLabel` (`segmentStats.ts`) regroupe déjà les répétitions par exercice, en séance
  active (`ActiveCourseExerciseCard.tsx`, vocabulaire déjà "exercice"/"répétition") comme en
  historique détaillé (`CourseHistoryContent.tsx`/`DisciplineHistoryContent.tsx`).
- `SEGMENT_METRIC_CONFIG` (`segmentStats.ts`) est déjà une table déclarative libellé/format par
  métrique, partagée par toutes les disciplines (Distance, Allure, Vitesse, Résistance, Cadence,
  Charge, Tours, Durée, Calories...).
- `SegmentAnalysisSheet.tsx` est déjà une fiche générique par exercice : analyse textuelle,
  graphique (recharts), tuiles de meilleure valeur ("records"), progression/tendance, historique
  par séance — déjà pilotée par `SEGMENT_METRIC_CONFIG`, déjà intitulée "Fiche exercice".

Autrement dit, la demande "le moteur déclare les métriques/records/graphiques disponibles" est
déjà largement satisfaite par ce mécanisme existant. Il ne s'agit donc pas de construire une
nouvelle couche déclarative par moteur, mais de corriger deux vrais trous qui expliquent le
symptôme observé pendant le test live (Cardio/Rameur affichait speed_kmh/incline_pct/
escalier_level en plus de la distance) :

1. **Root cause réelle — fuite de métriques à la source** : `CoachSheet.tsx` pré-remplit dès le
   choix de discipline TOUTES les valeurs par défaut des questions du moteur, y compris celles
   masquées par leur `when()` (ex: `incline_pct` n'existe que pour "Marche inclinée", mais sa
   valeur par défaut atterrissait quand même dans `answers` même si l'utilisateur choisissait
   "Rameur"). `engine.generate()`/`toWorkoutRecord()` transmettent ensuite `answers` tel quel.
   Fix : filtrer `answers` par `question.when()` juste avant l'appel au moteur
   (`effectiveAnswers`), dans `CoachSheet.tsx` — un seul point de correction pour toutes les
   disciplines, pas un fix par moteur.
2. **`ActiveSegmentCard.tsx` n'est pas générique** : écrit pour le pilote Course uniquement, il
   n'expose que 2 champs éditables codés en dur (distance/allure) et une mini-table de 3 libellés
   pour le reste (`zone`/`elevation_m`/`max_heart_rate`) — toute autre clé s'affichait en `snake_case`
   brut. Fix : rendu générique piloté par `SEGMENT_METRIC_CONFIG` (déjà tous les libellés/formats
   nécessaires), chaque métrique de la répétition devient éditable avec son vrai libellé.

**Vocabulaire "segment" retiré de l'UI** (restait visible dans `aria-label`, textes de bouton et
placeholders de `ActiveSegmentCard.tsx`/`ActiveGenericSessionView.tsx`, et l'incohérence
"répétition"/"occurrence" de `SegmentAnalysisSheet.tsx`) — remplacé par "exercice"/"répétition",
cohérent avec le vocabulaire déjà utilisé par `ActiveCourseExerciseCard.tsx` depuis le 11/07. Les
identifiants techniques (`workout_segments`, `SessionSegment`, `useGenericSegment*`, commentaires)
restent inchangés, conformément à la consigne de Nathan ("segment" reste un mot de code, pas un
mot d'interface).

**Explicitement HORS PÉRIMÈTRE de cette correction** (signalé, pas traité) : la carte
`GenericHistoryCard.tsx` (liste compacte affichée directement dans "Chroniques complètes") utilise
`SessionSegmentList.tsx`, qui affiche les répétitions à PLAT (pas groupées par exercice) —
contrairement à la vue active et à la fiche détaillée d'historique qui, elles, groupent déjà. Ne
montre aucun mot "segment" à l'utilisateur donc hors du périmètre strict de cette demande, mais
reste une incohérence structurelle mineure pour une séance à répétitions multiples (ex. fractionné
Course) consultée depuis la liste compacte. Candidat pour une prochaine passe si Nathan le
souhaite.
