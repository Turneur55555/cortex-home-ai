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
