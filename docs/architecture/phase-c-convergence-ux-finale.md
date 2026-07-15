# Phase C — Convergence UX finale des disciplines (document de conception unique)

**Statut : document de conception, AVANT toute implémentation.** Conformément à la règle de
gouvernance du 2026-07-15 (toute phase vit dans le dépôt, jamais seulement en conversation) et à
la consigne explicite de Nathan pour cette phase : **aucun code, aucun pseudo-code, aucune
implémentation** — le développement ne commencera qu'après validation de ce document.

Construit à partir de : l'architecture Exercise-Central
([exercise-central-architecture.md](exercise-central-architecture.md)), les Phases A et B closes
([phase-a-nouvelle-seance.md](phase-a-nouvelle-seance.md),
[phase-b-carte-exercice-unique.md](phase-b-carte-exercice-unique.md), addendums 1-3 livrés,
commit `5d20370`), et un nouvel audit du code réel mené le 2026-07-15 pour cette conception
(fichiers cités section par section — chaque constat ci-dessous a été vérifié dans le code, pas
supposé).

---

## 1. Gouvernance de cette phase (règles fixées par Nathan, 2026-07-15)

1. **Aucune nouvelle architecture, aucun nouveau pattern, aucun système générique nouveau** si
   l'architecture Exercise-Central actuelle permet déjà de résoudre le problème. Priorité :
   (a) terminer la convergence UX ; (b) réutiliser le code existant ; (c) réduire les écarts
   entre disciplines. Pas d'amélioration "parce que ce serait plus propre", pas de refactoring
   opportuniste, pas de dette traitée hors du périmètre.
2. **La Musculation est la référence produit**, pas seulement visuelle. Pour chaque écran d'une
   autre discipline, la question systématique est : *"si cette fonctionnalité existait en
   Musculation, l'utilisateur aurait-il la même sensation de qualité ?"* Si non, l'écart est
   identifié et traité.
3. **Équivalence, jamais identité.** La Course n'aura jamais de kg/séries/1RM ; Lagree n'aura
   jamais les métriques de la Musculation ; le Rameur n'aura jamais la fiche d'un développé
   couché. Mais le niveau de finition, de richesse, de compréhension et de valeur perçue doit
   être exactement le même.
4. **Partir de l'expérience, jamais des composants.** Pour chaque écran : ce que l'utilisateur
   doit ressentir ; ce qu'il doit comprendre en moins de 3 secondes ; ce qui doit attirer
   immédiatement l'œil ; quelles actions doivent être évidentes. L'architecture n'est consultée
   qu'ensuite, pour vérifier qu'elle sait produire cette expérience.

**Périmètre** : le module Séances (parcours création → séance active → clôture → historique →
fiche exercice), les 6 disciplines du registre (`ENGINE_REGISTRY`). Hors périmètre : Nutrition,
Corps, Profil, et toute différence de CAPACITÉ légitime (la récupération musculaire par muscle
reste une capacité musculation ; l'allure reste une capacité course — ce sont des vocabulaires,
pas des écarts de finition).

---

## 2. Où en est la convergence (acquis des Phases A/B — à ne pas refaire)

Vérifié dans le code au 2026-07-15 (branche à jour de `main`) :

- **Porte d'entrée unique** "Nouvelle séance" → discipline → mode (`NewSessionSheet.tsx`),
  6 disciplines homogènes, modes réels seulement (jamais de bouton grisé). ✔
- **Carte exercice unique** (`exerciseCard/ActiveExerciseCard.tsx`, deux branches muscu/générique
  sur primitives 100 % partagées), picker d'ajout identique pour les 6 disciplines, bouton
  bibliothèque partout. ✔
- **Vocabulaire** : "exercice"/"répétition" partout, plus aucun "segment" visible. ✔
- **Historique** : `GenericHistoryCard` au gabarit exact de `WorkoutCard` (titre éditable,
  tuiles auto-adaptatives, accordéons denses pilotés par `SEGMENT_METRIC_CONFIG`,
  badge Record, "Refaire en live"). ✔
- **Clôture** : confetti + tuiles pour les 6 disciplines (`GenericWorkoutSummaryOverlay`). ✔
- **Badge streak** en séance active pour les 6. ✔

Ce qui suit est donc le **dernier kilomètre** : tout ce qui, aujourd'hui encore, fait qu'une
séance de Rameur, de Course ou de Lagree ne procure PAS la même sensation de produit fini qu'une
séance de Musculation.

---

## 3. Lecture expérientielle du parcours — où l'équivalence casse encore

Chaque étape du parcours est relue ci-dessous par l'expérience (règle §1.4), avec le constat de
code qui l'explique. Les identifiants P0-x/P1-x renvoient à la classification de la section 4.

### 3.1 Pendant la séance — "est-ce que je me bats contre quelque chose ?"

**En Musculation**, la carte exercice active raconte un duel : la dernière séance est affichée
série par série, la charge suggérée est pré-calculée, le 1RM live et la tendance s'affichent
pendant la saisie, un trophée surgit au record, un bouton restaure les charges de la dernière
fois. L'utilisateur comprend en 1 seconde *où il en était* et *ce qu'il doit battre*.

**Dans les 5 autres disciplines**, la carte (`GenericExerciseCard`) affiche le badge Record
(livré en Phase B) mais **aucun repère de la dernière fois** : l'utilisateur qui démarre son
2 000 m au Rameur ne voit ni sa dernière distance, ni son dernier temps, ni aucune valeur cible.
Il rame contre rien. L'historique nécessaire est pourtant **déjà chargé par cette même carte**
(`useDisciplineSegmentHistory`, utilisé uniquement pour le badge Record) — c'est un écart de
finition pur, pas de capacité. → **P1-2**

De plus, le bouton statistiques de la carte ouvre la fiche exercice **avec un historique faux** :
`ActiveGenericSessionView.tsx` ne transmet pas la discipline à `SegmentAnalysisSheet`, qui
retombe sur sa valeur par défaut "course". Une séance active Cardio/HYROX/Guidé/Autre affiche
donc "Pas encore réalisé" sur un exercice pratiqué dix fois. Donnée fausse montrée à
l'utilisateur. → **P0-1**

### 3.2 La clôture — "qu'est-ce que ça m'a apporté ?"

**En Musculation**, clore une séance déclenche `PostWorkoutAnalysisSheet` : bilan IA rédigé,
muscles travaillés, records, risque de surentraînement, conseil concret pour la prochaine
séance. C'est le moment de récompense cognitive — l'app prouve qu'elle a *compris* la séance.

**Dans les 5 autres disciplines**, après le confetti… rien. `SeancesTab.tsx` câble
littéralement `onFinished={() => {}}`. L'utilisateur qui vient de finir un fractionné ou un
cours de Lagree ne reçoit aucun retour, aucun enseignement, aucun conseil. C'est l'écart de
valeur perçue le plus violent du parcours, au moment émotionnel le plus fort. → **P0-2**

### 3.3 La fiche exercice — "est-ce que l'app comprend cet exercice ?"

**En Musculation** (`ExerciseAnalysisSheet`, 541 lignes) : résumé intelligent + pertinence en
étoiles, carte de Rang RPG, analyse IA à la demande, objectif d'entraînement réglable, 3
graphiques, comparaison à la séance précédente, muscles par rôle, impact physique,
recommandations, déséquilibres, détail des séries. Et pour un exercice jamais pratiqué : une
vraie page Découverte.

**Pour les autres disciplines** (`SegmentAnalysisSheet`, 353 lignes) : analyse textuelle
calculée, graphique par métrique, tuiles de meilleures valeurs, progression, historique — une
bonne base — mais : **une section entière affiche "Bientôt disponible"** (recommandation de
surcharge progressive), pas d'analyse IA à la demande, pas d'équivalent du résumé de pertinence,
et un exercice jamais pratiqué n'affiche qu'une ligne de texte au lieu d'une découverte. Un
écran qui s'excuse ("bientôt disponible") est exactement l'inverse de la sensation Musculation.
→ **P1-1** (recommandation de prochaine cible), **P1-3** (analyse IA à la demande),
**P3-2** (état découverte)

### 3.4 L'historique — "puis-je corriger et réutiliser mon passé ?"

**En Musculation**, une séance passée est une matière vivante : nom éditable, exercices
modifiables série par série, exercice supprimable/ajoutable après coup (`WorkoutCard` +
`AddExerciseModal`), menu ⋮ à 4 actions (Refaire en live / Enregistrer comme séance sauvegardée /
Enregistrer comme séance passée / Supprimer).

**Pour les autres disciplines**, la séance passée est figée : aucune correction possible d'une
valeur mal saisie (une faute de frappe sur une distance est définitive), aucun ajout/retrait
rétroactif, et le menu ⋮ n'a que 2 actions (Refaire en live / Supprimer). Il n'existe par
ailleurs **aucun moyen de consigner une séance faite hors de l'app** (le cours de Lagree d'hier,
la sortie course sans téléphone) alors que la Musculation le permet ("Enregistrer comme séance
passée" → `WorkoutSheet` rétroactif). → **P1-4** (édition rétroactive), **P1-5** (consigner une
séance passée), **P2-1** (modèles multi-disciplines)

À noter : la confirmation "Refaire en live" utilise un `window.confirm()` natif (les deux côtés,
muscu compris) — hors charte, et il a déjà bloqué des onglets Chrome pendant les tests de la
Phase B. → **P1-6**

### 3.5 Les disciplines narratives (Guidé, Autre) — "une fiche, pas un ticket"

Un cours de Lagree génère de vraies informations qualitatives (groupes sollicités, bénéfices,
intensité, calories estimées, récupération conseillée — `guidedEngine.ts` les produit déjà
toutes) mais elles s'affichent en puces plates dans l'accordéon. L'équivalence pour une
discipline narrative n'est pas un tableau de chiffres (il n'y a pas de chiffres) : c'est une
**fiche de cours** aussi soignée que la carte muscu — hiérarchie, icônes, texte mis en scène.
→ **P2-2**

### 3.6 L'identité RPG — "la seule dimension où l'équivalence n'existe pas encore du tout"

Rang, Maîtrise, XP par exercice (`lib/fitness/rank/`, `ExerciseRankCard`, `MasteryBar`) restent
100 % musculation. C'est assumé et protégé par l'invariant 9.9 (aucune extension du moteur de
Rang sans validation explicite). Ce document propose un **concept équivalent** (§5.8) mais le
classe volontairement en dernier : c'est une décision produit à part entière, pas une
convergence mécanique — et tout le reste de ce document a plus d'impact immédiat. → **P2-4**

---

## 4. Problèmes classés P0 → P3

**P0 — donnée fausse ou moment-clé vide (casse la confiance)**

| ID | Problème | Preuve dans le code |
|---|---|---|
| P0-1 | La fiche exercice ouverte depuis une séance active non-Course lit l'historique de la mauvaise discipline (défaut "course") → "Pas encore réalisé" mensonger, records/progression faux. | `ActiveGenericSessionView.tsx` (montage de `SegmentAnalysisSheet` sans prop `discipline`) vs `GenericHistoryExerciseList.tsx` et `DisciplineExerciseLibrarySheet.tsx` qui la transmettent correctement. |
| P0-2 | Aucune analyse post-séance pour 5 disciplines sur 6 — le moment de clôture ne délivre aucun enseignement, contre une analyse IA complète en Musculation. | `SeancesTab.tsx` : `onFinished={() => {}}` pour la vue générique ; `PostWorkoutAnalysisSheet` monté uniquement dans la branche musculation. |

**P1 — écarts majeurs de valeur perçue sur le parcours quotidien**

| ID | Problème | Preuve dans le code |
|---|---|---|
| P1-1 | Section "Recommandation de surcharge progressive : Bientôt disponible" affichée en dur dans chaque fiche exercice générique — l'app s'excuse au lieu de conseiller. | `SegmentAnalysisSheet.tsx` (SectionCard placeholder) ; le calcul équivalent est possible dès aujourd'hui avec `computeSegmentStats` (tendances, direction min/max) + les tables des moteurs (allures `courseEngine`). |
| P1-2 | La carte exercice en séance active générique n'affiche aucun repère "dernière fois" ni valeur cible, alors que la carte muscu affiche dernière séance + suggestion + restauration. | `exerciseCard/ActiveExerciseCard.tsx`, branche `GenericExerciseCard` : `useDisciplineSegmentHistory` déjà appelé mais consommé uniquement pour le badge Record. |
| P1-3 | Pas d'analyse IA à la demande dans la fiche exercice générique (bouton "Analyse IA approfondie" muscu sans équivalent). | `useDeepExerciseAI`/`useExerciseAnalysis` consommés uniquement par `ExerciseAnalysisSheet` (muscu). |
| P1-4 | Une séance générique passée est totalement figée : impossible de corriger une valeur, d'ajouter/supprimer une répétition ou un exercice — la muscu le permet intégralement. | `GenericHistoryExerciseList.tsx` (lecture seule) vs `WorkoutCard.tsx` (`useUpdateExercise`, `useDeleteExercises`, `AddExerciseModal`). |
| P1-5 | Impossible de consigner une séance non-muscu faite hors de l'app (hier, sans téléphone) — la muscu a "Enregistrer comme séance passée". | `GenericSessionReviewSheet.tsx` existe (éditeur brouillon complet) mais n'est plus atteignable depuis la Phase A ; aucun point d'entrée rétroactif générique. |
| P1-6 | Confirmation "Refaire en live" en `window.confirm()` natif (muscu et générique) — hors charte, a bloqué les onglets de test Phase B. | `SeancesTab.tsx` (repeatLive), `GenericHistoryCard.tsx` (handleRepeatLive). |

**P2 — parité d'offre et écrin (importants, non quotidiens)**

| ID | Problème | Preuve dans le code |
|---|---|---|
| P2-1 | "Modèle" (séances sauvegardées) n'existe qu'en Musculation : ni mode "Modèle" dans Nouvelle séance, ni "Enregistrer comme séance sauvegardée" dans le menu ⋮ générique. | `NewSessionSheet.tsx` (mode Modèle conditionné `isMuscu`) ; schéma `workout_templates`/`workout_template_exercises` de forme exercices/séries/charge uniquement. |
| P2-2 | Disciplines narratives (Guidé, Autre) : les informations qualitatives riches déjà générées s'affichent en puces plates — pas de "fiche de cours" à la hauteur du reste. | `guidedEngine.ts` (stats descriptives complètes générées) ; `GenericHistoryExerciseList.tsx` (rendu puces quand pas de métrique primary). |
| P2-3 | L'explication Sensei après génération (toast "pourquoi cette séance") n'existe qu'en muscu. | `CoachSheet.tsx` (`template.explanation`, renseigné par `strengthEngine` uniquement). |
| P2-4 | Aucun équivalent Rang/Maîtrise/XP par exercice hors musculation — la dimension identitaire/RPG du produit est mono-discipline. | `lib/fitness/rank/` scopé muscu ; sections absentes de `SegmentAnalysisSheet` (documenté en en-tête du fichier). |
| P2-5 | Liste compacte des Chroniques : bouton ↻ "Refaire" affiché pour les séances muscu seulement — les génériques semblent moins "vivantes" au même endroit. | `SeancesTab.tsx` (garde `isMuscu` sur le bouton ↻, alors que `GenericHistoryCard` sait déjà refaire en live). |

**P3 — polissage et hygiène (à faire en fin de phase, jamais bloquants)**

| ID | Problème | Preuve dans le code |
|---|---|---|
| P3-1 | Tuile "Discipline" en secours dans le résumé de clôture générique (remplissage) là où la muscu affiche une vraie performance ("Meilleur 1RM") — remplacer par le nombre de records du jour quand il existe. | `GenericWorkoutSummaryOverlay.tsx` (fallback "Discipline"). |
| P3-2 | Fiche exercice générique jamais pratiqué : une ligne de texte, contre une vraie page Découverte muscu (`ExerciseDiscoveryPage`). | `SegmentAnalysisSheet.tsx` (branche `sessionCount === 0`). |
| P3-3 | Commentaires/documentation périmés : "récents Course non couverts" (`recentSegmentLabels.ts` — depuis la Phase A, Course fige aussi `metadata.segments` à la clôture, à re-vérifier et corriger la doc), statut de `GenericSessionReviewSheet` (redevient utilisé si P1-5 est retenu). | `lib/fitness/recentSegmentLabels.ts`, `useRecentSegmentLabels.ts`, `GenericSessionReviewSheet.tsx`. |

---

## 5. Maquettes conceptuelles (décrites)

Chaque maquette suit la méthode imposée : ressenti → compréhension <3 s → ce qui attire l'œil →
actions évidentes. Aucune n'est "identique à la musculation" : chacune est l'équivalent dans le
vocabulaire de sa discipline.

### 5.1 — M1 · Bilan de séance (toutes disciplines) — répond à P0-2

**Ressenti visé** : "l'app a compris ce que je viens de faire et me rend plus intelligent pour
la prochaine fois." **En <3 s** : une phrase-titre qui qualifie la séance. **L'œil va vers** :
la phrase-titre, puis les badges records. **Actions évidentes** : fermer ; (si record) le badge
mène à la fiche exercice.

Sheet plein écran qui s'ouvre automatiquement après la clôture (même déclenchement, même gabarit
visuel et mêmes primitives de sections que le bilan musculation), mais dont les sections parlent
le vocabulaire de la discipline :

- **Bilan** — phrase-titre + 2-3 phrases : ce qui a été accompli, comment ça se situe vs les
  séances précédentes du même type (volume, régularité, intensité déclarée).
- **Performances** — records du jour (déjà détectés par le badge Record), meilleures valeurs
  par exercice, comparaison à la dernière séance équivalente. Course : distance, allure,
  fractionnés tenus. Cardio/Rameur : distance, résistance, régularité. Guidé : assiduité (n-ième
  cours, cumul du mois), calories estimées.
- **Récupération** — conseil de fraîcheur : Course/Cardio sur l'intensité et le volume récent ;
  Guidé reprend la "récupération conseillée" déjà déclarée par le moteur. Jamais de vocabulaire
  musculaire par muscle (capacité muscu).
- **Prochaine séance** — un conseil concret et actionnable ("la prochaine fois, vise X", "alterne
  avec une sortie légère", "reviens sur ce cours d'ici N jours").

Réutilisation : même mécanique de déclenchement que la muscu (snapshot à la clôture dans
`SeancesTab`), mêmes primitives de cartes de section. Le contenu vient soit d'une nouvelle
fonction Edge dédiée nourrie de la `SessionView` + historique de la discipline (même famille que
la fonction muscu existante, prompt distinct), soit — décision d'arbitrage à l'implémentation —
d'une génération 100 % calculée côté client pour la v1 (le badge Record, `computeSegmentStats`
et les moteurs fournissent déjà tout le nécessaire sauf la rédaction libre). Recommandation :
Edge IA d'emblée, pour être l'équivalent réel du bilan muscu et pas une version au rabais ;
repli calculé si l'Edge échoue (même philosophie que le narratif calculé de la fiche exercice).

### 5.2 — M2 · Carte exercice active générique avec duel — répond à P1-2

**Ressenti visé** : "je sais exactement ce que j'ai à battre." **En <3 s** : ma dernière
performance sur cet exercice. **L'œil va vers** : la ligne "Dernière fois". **Actions
évidentes** : reprendre les valeurs de la dernière fois en un geste.

Sous le titre de la carte (même emplacement que la méta muscu "N séries · max X kg") : une ligne
**"Dernière fois : {date relative} · {1-2 métriques primary formatées}"**, calculée depuis
l'historique déjà chargé par la carte. Sur chaque répétition vide, une action discrète "reprendre
la dernière fois" pré-remplit les métriques de la répétition correspondante de la dernière
séance (équivalent du bouton de restauration des charges muscu — même geste, autre vocabulaire).
Si l'exercice n'a jamais été pratiqué : pas de ligne (jamais d'espace réservé vide).

### 5.3 — M3 · Fiche exercice générique v2 — répond à P1-1, P1-3, P3-2

**Ressenti visé** : "cette fiche me connaît et me coache", au même niveau que la fiche muscu.
**En <3 s** : où j'en suis (tendance) et quoi viser ensuite. **L'œil va vers** : la
recommandation de prochaine cible. **Actions évidentes** : changer de métrique, lancer
l'analyse IA, parcourir l'historique.

Trois changements, dans la structure existante (aucune refonte de la fiche) :

1. **"Prochaine cible"** remplace le placeholder "Bientôt disponible" : une recommandation
   concrète calculée depuis l'historique réel — métrique principale de l'exercice, tendance
   récente, direction (min/max) — formulée dans le vocabulaire de la discipline ("vise 8 km/h
   sur 25 min", "tiens 2:05/500 m sur 2 000 m", "allonge à 10 min si la régularité tient").
   Progression douce en tendance haussière, consolidation en stagnation, décharge suggérée en
   régression — l'équivalent conceptuel de la suggestion de charge muscu, jamais son clone
   (aucun 1RM, aucun pourcentage de charge). Jamais de chiffre inventé : sous 2 séances de
   données, la section affiche l'étape suivante la plus simple ("refais cet exercice une fois
   pour débloquer ta première cible") — un état d'attente actif, pas une excuse.
2. **"Analyse IA approfondie"** : même bouton, même comportement de chargement que la fiche
   muscu, nourri par l'historique agrégé de l'exercice (sessions, métriques, tendances) — même
   famille de fonction Edge que M1. Le narratif calculé actuel reste le contenu par défaut
   avant/sans IA (déjà le cas).
3. **État Découverte** : pour un exercice jamais pratiqué, une mini-page équivalente à la
   Découverte muscu — à quoi sert cet exercice (description du catalogue `exercise_reference`
   quand elle existe), quelles métriques le mesurent (déjà déclarées), bouton "Démarrer avec cet
   exercice"/"Ajouter à la séance" selon le contexte. Remplace la ligne "Pas encore réalisé".

### 5.4 — M4 · Corriger le passé — répond à P1-4

**Ressenti visé** : "mes données m'appartiennent, une faute de frappe n'est pas une fatalité."
**En <3 s** : je vois que les valeurs sont éditables (mêmes affordances que la muscu).
**Actions évidentes** : corriger une valeur, supprimer une répétition, ajouter un exercice.

Dans l'accordéon d'une séance passée générique : les valeurs du tableau deviennent éditables au
tap (mêmes champs et mêmes gestes que la séance active — composants de saisie déjà existants),
suppression d'une répétition et ajout d'un exercice via le même picker qu'en séance active.
L'écriture met à jour la source de vérité de l'historique de la discipline (le miroir
`metadata.segments`, et la table dédiée pour la Course) — c'est un nouveau chemin d'écriture
rétroactif, l'équivalent exact de ce que `WorkoutCard` fait déjà pour la muscu, résolution
d'identité comprise (invariant 2 : toute écriture d'occurrence passe par
`ExerciseResolutionService`). Décision de conception assumée par ce document : oui, un
historique clos est corrigeable — c'est déjà la règle en Musculation depuis toujours ; refuser
l'équivalent ailleurs était l'anomalie.

### 5.5 — M5 · Consigner une séance passée — répond à P1-5

**Ressenti visé** : "même sans l'app pendant l'effort, ma trace est complète." **En <3 s** :
c'est le même éditeur que d'habitude, avec une date. **Actions évidentes** : choisir la date,
décrire, enregistrer.

Deux points d'entrée, aucun nouvel écran à inventer :

- Menu ⋮ d'une séance générique passée → **"Enregistrer comme séance passée"** (même libellé
  que la muscu) : rouvre l'éditeur de relecture pré-rempli des exercices de la séance source,
  avec un champ date — l'équivalent exact du re-log muscu.
- Nouvelle séance → discipline → nouveau mode **"Consigner une séance passée"** (troisième
  carte, même gabarit que Libre/Coach IA) : même éditeur, vide, avec date.

Réutilise `GenericSessionReviewSheet` (l'éditeur brouillon complet écrit pour ce rôle et devenu
orphelin depuis la Phase A) enrichi d'un champ date — il redevient le pendant générique de
`WorkoutSheet` rétroactif. La muscu ne change pas.

### 5.6 — M6 · Fiche de cours (Guidé, Autre) — répond à P2-2

**Ressenti visé** : "mon cours de Lagree est un objet aussi précieux qu'une séance de muscu."
**En <3 s** : quel cours, quelle intensité, ce qu'il m'apporte. **L'œil va vers** : le bloc
intensité/bénéfices. **Actions évidentes** : déplier, ouvrir la fiche exercice.

Dans l'accordéon des séances Guidé/Autre, les puces plates sont remplacées par une **fiche de
cours** : les informations déjà générées par le moteur, mises en scène — intensité (libellé mis
en avant), groupes sollicités et bénéfices (lignes icône + texte, même hiérarchie que les
sections muscu), calories estimées et récupération conseillée (petites tuiles). Aucune nouvelle
donnée, aucune nouvelle déclaration de moteur : uniquement l'écrin. Pour "Autre" (texte libre),
même gabarit avec le contenu narratif de l'utilisateur en vedette. La règle addendum 2 ("un
groupe sans métrique primary garde un rendu non-tabulaire") reste vraie — c'est ce rendu
non-tabulaire qui monte en gamme.

### 5.7 — M7 · Confirmation "Refaire en live" — répond à P1-6

Dialogue custom au gabarit de `WorkoutDeleteDialog` (titre, rappel du nom de la séance, deux
boutons), partagé par les deux chemins (muscu et générique) — supprime les deux `window.confirm`.
Même composant, deux appelants, zéro duplication.

### 5.8 — M8 · Maîtrise par exercice, toutes disciplines — répond à P2-4 (concept, décision requise)

**Ressenti visé** : "chaque exercice que je pratique raconte une progression qui m'appartient",
quelle que soit la discipline. **En <3 s** : mon niveau sur cet exercice et ce qui me sépare du
suivant.

Concept d'équivalence (PAS une extension du moteur de Rang muscu, qui reste intouché —
invariant 9.9) : une **Maîtrise par exercice** fondée sur ce que toutes les disciplines savent
déjà mesurer — nombre de réalisations, ancienneté de pratique, records battus, tendance de la
métrique principale. Affichée dans la fiche exercice générique à l'emplacement exact où la fiche
muscu affiche sa carte de Rang, avec la même grammaire visuelle (palier nommé, barre de
progression, prochaine étape). Pas d'XP global, pas de fusion avec le RPG muscu : un système
sœur, borné à la fiche.

**Porte de décision explicite** : ce concept touche à l'identité produit (qu'est-ce qu'un
"palier" en Course ? en Yoga ?) et ne sera PAS développé dans cette phase sans validation
dédiée de Nathan sur : la grammaire des paliers, l'opportunité même d'un système sœur vs
l'attente d'une extension officielle du Rang. Il est dans ce document pour que la décision soit
posée consciemment, pas découverte plus tard.

### 5.9 — Micro-convergences sans maquette (P2-3, P2-5, P3-1, P3-2, P3-3)

- Explication Sensei : les moteurs non-muscu attachent une explication courte calculée depuis
  les réponses (type de séance, volume, pourquoi cette structure) — même toast que la muscu.
- Liste compacte des Chroniques : le ↻ apparaît aussi pour les séances génériques (le chemin
  "Refaire en live" générique existe déjà) — avec la confirmation M7.
- Résumé de clôture : la tuile de secours "Discipline" cède la place à "Records du jour" quand
  au moins un record est tombé.
- Hygiène documentaire : commentaires périmés corrigés (P3-3) au fil des lots qui touchent ces
  fichiers, jamais en refactoring isolé.

---

## 6. Plan d'implémentation

Découpage en 6 lots, chacun livrable/testable indépendamment, chacun clos par la séquence de
vérification standard du projet (relecture, TypeScript, ESLint, Vitest, test fonctionnel live
sur `cortex-home-ai.lovable.app` avec de vraies séances, rapport). Aucun lot ne modifie
l'architecture Exercise-Central : tous s'appuient sur `ENGINE_REGISTRY`, `SEGMENT_METRIC_CONFIG`,
`computeSegmentStats`, les hooks d'historique existants et `ExerciseResolutionService`, conformes
aux invariants 1-9 et aux principes 12.x du document d'architecture.

**Lot C0 — Vérité des données et gestes sûrs (P0-1, P1-6, P2-5)** — petit lot correctif.
Transmission de la discipline à la fiche exercice depuis la séance active ; dialogue de
confirmation "Refaire en live" partagé remplaçant les deux `window.confirm` ; ↻ générique dans
la liste compacte. Fichiers : `ActiveGenericSessionView.tsx`, `SeancesTab.tsx`,
`GenericHistoryCard.tsx`, un nouveau composant de dialogue au gabarit de `WorkoutDeleteDialog`.
Risque : minimal, correctifs localisés. Test live : fiche exercice depuis une séance active
Cardio affiche le bon historique ; "Refaire en live" confirmable au doigt sur mobile.

**Lot C1 — Bilan de séance générique (P0-2, P3-1)** — le plus gros gain de valeur perçue.
Nouvelle fonction Edge de bilan (entrée : SessionView + historique agrégé de la discipline ;
sortie : structure bilan/performances/récupération/prochaine séance), sheet de bilan générique
au gabarit du bilan muscu, déclenchée à la clôture ; repli 100 % calculé si l'IA échoue ; tuile
"Records du jour" dans le résumé de clôture. Fichiers : nouvelle Edge function (+ déploiement CI
existant), nouveau sheet côté `session/`, branchement dans `SeancesTab.tsx`,
`GenericWorkoutSummaryOverlay.tsx`. Risque : prompt/parse IA (mitigé par le repli calculé) ;
secret `GEMINI_API_KEY` déjà en place. Test live : clore une séance réelle de chaque famille
(Course, Cardio, Guidé) et vérifier le bilan.

**Lot C2 — Le duel en séance active (P1-2)**.
Ligne "Dernière fois" + reprise des valeurs sur la carte exercice active générique, à partir de
l'historique déjà chargé. Fichiers : `exerciseCard/ActiveExerciseCard.tsx` (branche générique),
`ActiveSegmentCard.tsx` (action de pré-remplissage). Risque : faible — lecture déjà en place,
écriture via la mutation d'update existante. Test live : séance Rameur avec historique →
repère visible, reprise en un geste.

**Lot C3 — Fiche exercice générique v2 (P1-1, P1-3, P3-2)**.
"Prochaine cible" calculée (nouvelle fonction pure dans `segmentStats.ts` ou fichier domaine
voisin, testée unitairement — tendance + direction + bornes par discipline via les tables des
moteurs) ; analyse IA à la demande (réutilise la fonction Edge du lot C1 avec un mode
"exercice") ; état Découverte. Fichiers : `SegmentAnalysisSheet.tsx`, domaine `lib/fitness/`,
hook d'appel IA générique. Risque : qualité de la recommandation sous faible historique —
règle "jamais de chiffre inventé" testée explicitement. Test live : fiche d'un exercice riche
en historique (recommandation) et d'un exercice jamais fait (découverte).

**Lot C4 — Le passé vivant (P1-4, P1-5, P3-3)**.
Édition/suppression/ajout rétroactifs sur une séance générique passée (nouvelles mutations
d'écriture sur le miroir `metadata.segments` + `workout_segments` pour la Course, résolution
d'identité systématique) ; "Enregistrer comme séance passée" (menu ⋮) et mode "Consigner une
séance passée" (Nouvelle séance) via `GenericSessionReviewSheet` réactivé avec date. Fichiers :
`GenericHistoryExerciseList.tsx`, `GenericHistoryCard.tsx`, `NewSessionSheet.tsx`,
`GenericSessionReviewSheet.tsx`, hooks d'écriture. Risque : le plus élevé de la phase (nouveaux
chemins d'écriture sur données historiques) — d'où sa position après les lots de lecture pure ;
mutations couvertes par tests + vérification en base après test live. Test live : corriger une
valeur d'une séance passée, consigner un cours d'hier, vérifier fiches/records recalculés.

**Lot C5 — Modèles pour toutes les disciplines (P2-1) + fiche de cours (P2-2, P2-3)**.
Extension additive du schéma des modèles (discipline + contenu de forme exercices/répétitions
génériques, colonnes nullables — les modèles muscu existants inchangés), mode "Modèle" dans
Nouvelle séance pour les 6 disciplines, "Enregistrer comme séance sauvegardée" dans le menu ⋮
générique, démarrage d'une séance live depuis un modèle générique ; fiche de cours Guidé/Autre ;
explication Sensei générique. Fichiers : migration additive, `useWorkoutTemplates.ts`,
`SavedTemplatesSheet.tsx`/`TemplateEditorSheet.tsx` (branche générique sur primitives
partagées), `NewSessionSheet.tsx`, `GenericHistoryExerciseList.tsx`, moteurs (explication).
**Porte de décision** : la migration additive du schéma des modèles est soumise à validation
avant le lot (règle projet : évolution de schéma = décision explicite). Risque : modéré, borné
par l'additivité. Test live : créer un modèle Course depuis une séance passée, le rejouer.

**Lot C6 — Maîtrise par exercice (P2-4)** — uniquement si la porte de décision §5.8 est validée.
Sinon la phase se clôt au lot C5 et P2-4 est documenté comme décision produit en attente.

---

## 7. Ordre exact des développements

1. **C0.1** — Transmission de la discipline à la fiche exercice en séance active (P0-1).
2. **C0.2** — Dialogue de confirmation "Refaire en live" partagé, remplacement des deux
   `window.confirm` (P1-6).
3. **C0.3** — ↻ "Refaire" générique dans la liste compacte des Chroniques (P2-5).
4. **C1.1** — Fonction Edge "bilan de séance générique" + son contrat de sortie + repli calculé.
5. **C1.2** — Sheet de bilan générique + déclenchement à la clôture (P0-2).
6. **C1.3** — Tuile "Records du jour" dans le résumé de clôture (P3-1).
7. **C2.1** — Ligne "Dernière fois" sur la carte exercice active générique (P1-2).
8. **C2.2** — Reprise des valeurs de la dernière séance sur une répétition (P1-2).
9. **C3.1** — Fonction domaine "prochaine cible" (pure, testée) + section fiche remplaçant le
   placeholder (P1-1).
10. **C3.2** — Analyse IA à la demande dans la fiche générique (P1-3).
11. **C3.3** — État Découverte de la fiche générique (P3-2).
12. **C4.1** — Mutations d'écriture rétroactive (métriques, suppression, ajout) + tests (P1-4).
13. **C4.2** — Édition dans l'accordéon d'historique générique (P1-4).
14. **C4.3** — "Enregistrer comme séance passée" (menu ⋮) + mode "Consigner une séance passée"
    (Nouvelle séance), réactivation datée de l'éditeur de relecture (P1-5) ; hygiène P3-3 au
    passage.
15. **[PORTE DE DÉCISION — schéma modèles]** puis **C5.1** — Migration additive + hooks modèles
    multi-disciplines (P2-1).
16. **C5.2** — Mode "Modèle" Nouvelle séance + "Enregistrer comme séance sauvegardée" générique
    + démarrage live depuis un modèle générique (P2-1).
17. **C5.3** — Fiche de cours Guidé/Autre (P2-2).
18. **C5.4** — Explication Sensei générique (P2-3).
19. **[PORTE DE DÉCISION — Maîtrise]** puis **C6** — Maîtrise par exercice toutes disciplines
    (P2-4), uniquement si validée.

Chaque numéro est un incrément commitable et testable seul ; aucun n'exige d'anticiper le
suivant ; les deux portes de décision sont les seuls points d'arrêt planifiés.

---

## 8. Addendum — épreuve de la vision (2026-07-15, demande de Nathan après validation du principe)

Nathan valide le principe général et impose un dernier exercice avant développement : oublier
les P0/P1/P2, imaginer le produit terminé dans 2 ans, puis vérifier que chaque lot sert
réellement cette expérience — et **réordonner la phase par valeur utilisateur, jamais par
facilité technique**. Cet addendum fait cet exercice ; **son ordre (§8.4) remplace celui du §7.**

### 8.1 Le produit dans 2 ans — l'utilisateur aux six pratiques

Il pratique Musculation, Lagree, Marche inclinée, Tapis de course, Rameur et Vélo. Mardi soir,
après son Rameur, il ouvre l'app — et le rituel est exactement celui de sa muscu de lundi et de
son Lagree de mercredi. Quatre moments, toujours les mêmes, toujours tenus :

- **Ouvrir** — en moins de 3 secondes il sait où il en est : sa flamme, sa dernière séance, ce
  qui l'attend. Aucun écran ne demande de réfléchir.
- **S'entraîner** — chaque carte d'exercice est un duel contre la dernière fois. La cible est
  visible avant l'effort, le record surgit pendant. Il n'a jamais besoin de se souvenir : l'app
  se souvient pour lui.
- **Clore** — confetti, puis le bilan : ce que la séance lui a apporté, ce qu'elle change, quoi
  viser ensuite. C'est la récompense cognitive — la raison de clore dans l'app plutôt que de
  poser le téléphone.
- **Relire** — les Chroniques ne sont pas un log, ce sont des pages : chaque séance close garde
  son bilan, ses records, son histoire. Il lui arrive de les rouvrir *pour le plaisir*, comme on
  relit un carnet de voyage.

**L'identité propre** n'est pas à inventer : elle est déjà dans la langue de l'app (les
Chroniques, la Forge, le Sensei, le Scan des Titans, "ta première légende t'attend"). Hevy est
un carnet de gym, Strava un réseau social de la performance, Garmin un tableau de bord de
capteurs. ICORTEX est **le chroniqueur d'une légende personnelle**. Quatre piliers en découlent,
qui servent de test à chaque lot :

1. **Le duel contre soi-même** — chaque écran confronte à son propre passé (dernière fois,
   record, tendance). Jamais de comparaison sociale.
2. **La chronique comme saga** — l'historique se relit ; une séance close n'est jamais une ligne
   morte, c'est une page avec son récit.
3. **Le mentor** — le Sensei explique le *pourquoi*, jamais seulement le quoi ; chaque chiffre
   important a une phrase.
4. **Une seule langue** — exercice, répétition, duel, chronique : la grammaire est identique
   dans les six pratiques ; seules les métriques changent de vocabulaire.

### 8.2 Découverte faite pendant cet exercice — la chronique ne se rouvre jamais, même en muscu

En vérifiant "plaisir de rouvrir ses anciennes séances" contre le code réel : le bilan IA
post-séance musculation est **déjà persisté en production** (table `workout_analyses`, upsert
par la fonction Edge `analyze-workout` à chaque clôture) mais **jamais relu nulle part dans
l'app** (seul l'export de données référence la table). Autrement dit : même pour la discipline
de référence, le bilan est à usage unique — fermé, perdu. La promesse "les chroniques deviennent
une récompense en elles-mêmes" a donc un prérequis qui manque *aussi* à la Musculation, et la
donnée pour le tenir dort déjà en base. Correction intégrée au lot Bilan (§8.4, V2) : **le bilan
devient une page de la chronique**, re-ouvrable depuis la carte d'historique — muscu comprise.
C'est le seul point où cette phase touche à la Musculation : non pour la copier, mais parce que
la vision a révélé qu'elle-même n'était pas au niveau.

### 8.3 Chaque lot à l'épreuve de la vision

| Lot (§6) | Ce qu'il apporte aux 5 axes (fluidité / satisfaction / motivation / compréhension / plaisir des chroniques) | Verdict |
|---|---|---|
| C0.1 — vérité de la fiche (P0-1) | Une chronique qui ment ("Pas encore réalisé" sur un exercice pratiqué dix fois) détruit la confiance, donc tout le plaisir de relire. Pas un lot "technique" : le préalable du pilier 2. | **Maintenu en tête** |
| C0.2 — confirmation custom (P1-6) | Un dialogue natif au milieu d'une app soignée casse l'immersion (et a réellement bloqué des onglets). Fluidité pure. | **Maintenu en tête** (minuscule) |
| C0.3 — ↻ liste compacte (P2-5) | Confort mineur, n'alimente fortement aucun axe. | **Repoussé** (lot polish) |
| C1 — bilan de séance générique (P0-2) | Satisfaction et motivation maximales : LE moment de récompense. Mais tel que spécifié en §6, le bilan restait éphémère — la vision impose qu'il se relise (§8.2). | **Remonté et élargi** : bilan + sa page dans la chronique (toutes disciplines, muscu incluse) |
| C2 — duel en séance (P1-2) | Motivation quotidienne, compréhension immédiate : on sait ce qu'on doit battre, à chaque répétition. Pilier 1 incarné. | **Maintenu haut** |
| C3 — fiche exercice v2 (P1-1, P1-3, P3-2) | "Les fiches racontent une histoire" : prochaine cible = progression évidente sans réfléchir ; analyse IA = le mentor ; découverte = donner envie d'essayer. | **Maintenu** (juste après le duel) |
| C5.3 — fiche de cours Guidé/Autre (P2-2) | Lagree est l'une des six pratiques de la vision et sa chronique est aujourd'hui la plus pauvre des six (puces plates). Forte valeur perçue, petite surface. | **Remonté nettement** (sort du lot C5) |
| C4 — consigner une séance passée (P1-5) | Une saga avec des trous ne se relit pas : la complétude de la chronique est une condition du plaisir de relecture. | **Maintenu milieu** |
| C4 — édition rétroactive (P1-4) | De la confiance (corriger une faute de frappe), pas de la joie. Assurance nécessaire, émotion faible — et la surface d'écriture la plus risquée. | **Descendu** (après consigner) |
| C5.1/5.2 — modèles multi-disciplines (P2-1) | Fluidité réelle pour les routines Rameur/Vélo/Marche, mais valeur rituelle, pas émotionnelle. Porte de décision inchangée. | **Maintenu tard** |
| C5.4 — explication Sensei générique (P2-3) | Pilier 3 mais micro-surface (un toast). | **Repoussé** (lot polish) |
| C6 — Maîtrise par exercice (P2-4) | Très aligné (identité, progression évidente, fiches vivantes) — c'est même le lot le plus "vision" de tous. Mais gated par une vraie décision produit. | **Décision remontée** (à trancher dès la fin de V2, pour que le concept soit prêt) ; implémentation planifiée après les fiches (V5) si validée tôt, sinon en dernier |
| P3-3 — hygiène documentaire | N'apporte rien à l'expérience. | **Repoussé** : au fil de l'eau dans les lots qui touchent ces fichiers, jamais un lot dédié |

Aucun lot n'est supprimé : la vision confirme la liste, elle en change la hiérarchie — et elle a
ajouté un élément (la relecture du bilan) qu'aucune analyse P0/P1 n'avait vu, parce qu'il
manquait aussi à la référence.

### 8.4 Ordre définitif des développements (remplace le §7)

1. **V1 — La confiance** : vérité de la fiche en séance active (P0-1) + confirmation "Refaire
   en live" custom partagée (P1-6).
2. **V2 — La récompense qui reste** : bilan de séance générique (P0-2) **+ le bilan devient une
   page re-ouvrable de la chronique, toutes disciplines muscu comprise** (lecture de
   `workout_analyses` existante + persistance du bilan générique) + tuile "Records du jour" à la
   clôture (P3-1). → *Dès la fin de V2 : porte de décision Maîtrise (§5.8) soumise à Nathan.*
3. **V3 — Le duel** : ligne "Dernière fois" + reprise des valeurs sur la carte exercice active
   générique (P1-2).
4. **V4 — Les fiches qui racontent** : prochaine cible calculée (P1-1), analyse IA à la demande
   (P1-3), état Découverte (P3-2).
5. **V5 — La fiche de cours** : écrin narratif Guidé/Autre (P2-2) — la chronique Lagree au
   niveau des autres.
6. **V6 — La Maîtrise** (P2-4) — *si et seulement si* la porte de décision ouverte en V2 est
   validée ; sinon ce créneau glisse aux lots suivants et la Maîtrise sort de la phase.
7. **V7 — La chronique sans trous** : consigner une séance passée (P1-5).
8. **V8 — Corriger le passé** : édition rétroactive des séances génériques (P1-4).
9. **[PORTE DE DÉCISION — schéma modèles]** puis **V9 — Les modèles pour tous** (P2-1).
10. **V10 — Polish** : ↻ générique liste compacte (P2-5), explication Sensei générique (P2-3),
    tuile de secours du résumé, hygiène P3-3 résiduelle.

Le contenu détaillé de chaque lot (fichiers, risques, vérifications) reste celui du §6 — seuls
la hiérarchie, le découpage de C5 et l'élargissement du lot Bilan (§8.2) changent.

---

## 9. Règles permanentes ajoutées à la validation (Nathan, 2026-07-15 — vision et ordre V1-V10 validés)

Ces règles gouvernent TOUTE la Phase C, chaque lot, chaque décision de détail :

1. **La question-filtre de tout développement** : *"Est-ce que cette évolution donne envie à
   l'utilisateur de revenir dans ses Chroniques ?"* Si la réponse est non, ce n'est
   probablement pas une priorité. Les Chroniques sont le cœur émotionnel du produit : une
   séance n'est plus un enregistrement, c'est un **souvenir**, une **progression**, une
   **histoire** — l'utilisateur doit avoir envie de rouvrir une séance réalisée il y a 6 mois.
2. **Réutilisation avant création** : avant d'ajouter une fonctionnalité, toujours vérifier si
   l'information existe déjà (exemple fondateur : le bilan IA, déjà persisté dans
   `workout_analyses` et jamais relu — voir §8.2). Si elle existe, la réutiliser prime sur la
   création d'une nouvelle donnée : enrichir le produit avec ce qu'il possède déjà avant
   d'augmenter sa complexité.
3. **Invariants de phase** : pas de régression sur la Musculation ; pas de nouvelle
   architecture ; pas de duplication ; pas de dette technique volontaire. Chaque lot doit
   augmenter la valeur perçue du produit.

Le développement démarre au lot V1 (§8.4) sur autorisation explicite de Nathan.

---

*Document produit le 2026-07-15 sur la branche `claude/exercise-central-governance-0qvidl`, à
partir de l'état réel du code (tip incluant la clôture de la Phase B, commit `5d20370`).
Addendum §8 (épreuve de la vision, réordonnancement par valeur utilisateur) ajouté le même jour
après validation du principe général par Nathan ; §9 (règles permanentes) ajouté à la validation
finale, qui autorise le démarrage du développement au lot V1.*
