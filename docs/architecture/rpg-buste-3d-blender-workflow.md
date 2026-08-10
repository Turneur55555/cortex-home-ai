# Buste 3D Cortex — workflow Blender → GLB → React Three Fiber

Phase RPG V2 — Phase I (buste 3D), démarrée le 31/08/2026. Ce document est la
référence unique du pipeline : toute personne qui modélise le buste dans
Blender doit suivre exactement ces conventions pour que le résultat
s'intègre sans adaptation de code, comme `FORMAT.md` le fait déjà pour les
illustrations de rang (`src/assets/ranks/FORMAT.md`).

## 1. Décisions verrouillées (ne pas remettre en question sans repasser ici)

- **Aucun avatar générique** (Character Creator, Ready Player Me, Mixamo
  humain complet…) — le buste est une création Cortex sur mesure.
- **8 zones indépendantes**, chacune un **objet Blender séparé** (pas un seul
  mesh avec des groupes de vertex) : l'indépendance de rang par zone exige
  que chaque zone porte sa PROPRE pile de shape keys. Découper en objets
  distincts dès la modélisation évite tout conflit de shape keys entre zones
  et correspond exactement à l'exigence RPG "chaque zone évolue selon son
  propre rang musculaire".
- **Évolution = géométrie réelle** (volume/épaisseur/largeur/définition/
  séparation), pas une teinte sur un modèle figé. Mécanisme : **un shape key
  continu par zone** (voir §3), pas 30 shape keys discrets par palier — un
  seul sculpt "maximum" par zone suffit, l'interpolation 0..1 fait le reste.
- **Deux vues (face/dos)** = un seul modèle, une seule caméra qui pivote
  (voir §6) — pas deux modèles séparés.
- **Périmètre anatomique strict** : buste uniquement, coupe nette au bas du
  torse. Aucune jambe, aucun bassin détaillé, aucune tête détaillée (une
  forme de tête/cou simple suffit pour la lisibilité de la posture, mais ce
  n'est PAS une zone évolutive).

## 2. Les 8 zones — identifiants EXACTS

Ces noms sont la source de vérité utilisée par le code React Three Fiber
(`src/components/rpg/buste3d/CortexBuste.tsx`) pour retrouver chaque objet
dans le fichier GLB. Un nom différent = zone invisible côté app, silencieuse
et sans erreur (comme `RankIllustration` qui retombe sur un repli si le
fichier attendu est absent — même philosophie : jamais de crash, mais rien
n'apparaît tant que le nom n'est pas exact).

| Nom Blender (objet) | Muscle Cortex (`BusteMuscleGroup`) | Vue principale |
|---|---|---|
| `chest`     | pectoraux   | face |
| `back`      | dos         | dos |
| `shoulders` | epaules     | face + dos |
| `biceps`    | biceps      | face |
| `triceps`   | triceps     | face (visible) + dos (dominant) |
| `forearms`  | avant-bras  | face + dos |
| `traps`     | trapeze     | dos (dominant) + face (haut) |
| `abs`       | abdos       | face |

Ce sont **exactement** les 8 clés de `BUSTE_MUSCLE_WEIGHTS`
(`src/lib/fitness/rpg/cortexPower.ts`) — pas une nouvelle taxonomie. Le
Rang musculaire (déjà calculé par le moteur existant, `muscleAggregation.ts`
Méthode C) est la seule source de vérité de la progression ; le buste n'est
qu'une représentation visuelle de ce qui existe déjà.

Éléments non évolutifs autorisés mais neutres (pas de shape key attendu) :
`head`, `neck`, `torso_base` (cage thoracique/silhouette de base servant de
socle aux 8 zones). Ces objets peuvent exister pour la cohérence visuelle du
buste mais le code ne leur cherchera jamais de shape key.

## 3. Shape keys — un seul par zone, continu

Pour **chacun** des 8 objets ci-dessus :

1. Sculpter la zone dans son état **minimum** (Mortel bas de gamme — silhouette
   plutôt fine, faible définition) — c'est la géométrie de base de l'objet
   (Basis).
2. Ajouter **un seul shape key** nommé exactement `evolution`.
3. Sculpter, dans ce shape key, l'état **maximum** (Titan — volume/épaisseur/
   largeur/séparation musculaire nettement accrus, définition marquée). Le
   delta entre Basis et `evolution` porte TOUTE la progression visuelle de
   la zone.
4. Ne jamais ajouter de second shape key sur ces objets (pas de
   `evolution.001`, pas de shape key de correction séparé) — un seul canal
   d'interpolation par zone, pour que le code reste trivial
   (`morphTargetInfluences[0]`) et que le fichier reste léger.

Le code interpole cette valeur en continu entre 0.0 et 1.0 à partir du Rang
musculaire 0-29 (voir §7, `busteEvolution.ts`) — **pas de palier visuel
brutal à chaque changement de tier**, une vraie progression lisse séance
après séance, cohérente avec la règle RPG "rang acquis durable, pas de
saut".

### Pourquoi un seul shape key continu, pas un par Titre (6) ou par palier (30)

- **30 shape keys par zone × 8 zones = 240 sculpts** — hors de portée pour
  un premier chantier, et le fichier GLB exploserait en taille (chaque shape
  key stocke un delta de position par vertex affecté).
- **6 shape keys (un par Titre) par zone** reste cohérent mais crée des
  micro-sauts visuels à chaque changement de Titre plutôt qu'une évolution
  continue — contraire à "Rang acquis durable" qui doit se lire comme une
  progression fluide, pas un déclic.
- **Un seul shape key continu** donne le maximum de fluidité pour le minimum
  d'effort de sculptage (8 sculpts "max" au total) et le fichier le plus
  léger. Un artiste peut toujours enrichir plus tard avec des shape keys
  intermédiaires si le rendu au minimum/maximum ne convainc pas assez au
  milieu — décision à reprendre séparément, pas un blocage du prototype.

## 4. Topologie — éviter les collisions aux frontières de zones

Les 8 objets partagent des zones de contact (ex. `chest`/`shoulders`,
`biceps`/`triceps`/`forearms` au coude, `back`/`traps`). Pour que
l'évolution de l'un ne fasse pas apparaître de trou ou de chevauchement
visible avec son voisin :

- Modéliser les 8 objets à partir d'**un même mesh de base unique** (le
  "socle" anatomique complet du buste), puis le **séparer par sélection**
  (`P` → "Selection" dans Blender) le long des frontières naturelles
  (aisselle, coude, base du cou) — jamais 8 sculpts indépendants recommencés
  de zéro, qui ne s'emboîteraient jamais proprement.
- Garder une **fine marge de recouvrement** (quelques millimètres à l'échelle
  du modèle) entre zones adjacentes plutôt qu'un bord parfaitement jointif :
  au maximum d'évolution, le recouvrement absorbe le delta sans créer de
  fente visible à la jointure.
- Le shape key `evolution` de chaque zone ne doit déplacer QUE les vertices
  propres à cette zone, jamais les vertices partagés à la frontière (sinon
  l'objet voisin, qui ne bouge pas, se détache visuellement).

## 5. Export GLB — réglages exacts

Depuis Blender (File → Export → glTF 2.0) :

- **Format** : `glTF Binary (.glb)`.
- **Include → Shape Keys** : coché (indispensable — sans ça, les shape keys
  ne sont pas exportés et le buste reste figé côté app).
- **Include → Custom Properties** : décoché (inutile, alourdit le fichier).
- **Transform → +Y Up** : coché (convention glTF standard, attendue telle
  quelle par Three.js — ne pas repartir sur une conversion d'axe côté code).
- **Geometry → Apply Modifiers** : coché (tout modificateur Blender —
  Subdivision Surface, Mirror… — doit être figé dans l'export ; les
  modificateurs eux-mêmes ne sont pas exportés).
- **Compression → Draco** : activée, niveau par défaut (6) — réduit
  fortement le poids du fichier, supporté nativement par
  `@react-three/drei`'s `useGLTF` (décodeur chargé automatiquement).
- **Materials** : matériau simple, stylisé (pas de PBR photoréaliste 8K —
  cohérent avec la direction artistique "rendu stylisé" déjà validée pour
  Cortex). Une seule couleur de base neutre par zone suffit pour le
  prototype ; la teinte finale par Titre est appliquée **côté code**
  (`rankThemeByKey`, jamais une texture peinte par rang — même règle que le
  reste de l'app, garde-fou RankTheme du `CLAUDE.md`).

Nom de fichier et emplacement : **`public/buste/cortex-buste.glb`** (dossier
`public/`, pas `src/assets/`) — volontaire : un binaire lourd, chargé à la
demande par une URL fixe, ne doit jamais transiter par le pipeline de build
Vite (qui exigerait sa présence dès la compilation). Le dossier `public/`
est copié tel quel et servi par une URL stable
(`/buste/cortex-buste.glb`), sans dépendance à l'existence du fichier au
moment du build — le composant React Three Fiber gère l'absence du fichier
comme une erreur de chargement normale (repli 2D, voir §6), pas comme un
échec de compilation. Poids cible : **< 3 Mo** après compression Draco
(bien en dessous du seuil qui poserait un problème sur mobile/4G).

## 6. Intégration React Three Fiber

- Le buste est chargé **paresseusement**, uniquement sur l'écran qui
  l'affiche (jamais dans le bundle principal) — `React.lazy` +
  `useGLTF(url)` (`@react-three/drei`), avec repli explicite si le fichier
  est absent (tant que l'asset n'existe pas, ou si WebGL est indisponible) :
  ne JAMAIS faire planter l'écran, retomber sur `RankIllustration` (le
  système 2D existant) — même philosophie de repli que `FORMAT.md`.
- **Face/dos** : une seule instance du modèle, une caméra qui pivote de 0°
  à 180° autour de l'axe Y (transition fluide, pas un cut) — pas de second
  modèle ni de duplication d'assets.
- **Pilotage de l'évolution** : pour chacune des 8 zones, le code retrouve
  l'objet par son nom exact (§2), lit `mesh.morphTargetInfluences[0]`
  (le shape key `evolution`) et l'anime en continu vers la valeur cible
  dérivée du Rang musculaire (0-29 → 0..1, voir §7). Le Titre global
  n'influence JAMAIS directement une zone individuelle — seul le Rang
  musculaire de CETTE zone pilote SA propre influence (exigence RPG
  explicite : "Le Titre global ne doit PAS directement modifier tous les
  muscles").
- Le moteur RPG (rang exercice → rang musculaire → Puissance Cortex → Titre)
  n'est ni modifié ni dupliqué : le buste consomme uniquement la sortie déjà
  calculée par `aggregateMuscleRanks()` (`muscleAggregation.ts`), au même
  titre que n'importe quel autre écran de l'app.

## 7. Mapping Rang musculaire → influence shape key

Implémenté dans `src/lib/fitness/rpg/busteEvolution.ts` (lib pur, zéro
import React/Three, testé) :

```
influence(muscle) =
  not_evaluated → 0   (état de base, sculpt minimum — jamais un état "flashé")
  evaluated(tier) → tier / 29   (0.0 à 1.0, continu)
```

Aucun nouveau seuil, aucune nouvelle règle de progression — une simple
normalisation linéaire de l'échelle 0-29 déjà verrouillée vers l'intervalle
0..1 attendu par un shape key glTF.

## 8. Ce que cette phase NE fait PAS

- Pas d'effets avancés (particules, brillance dynamique par montée de rang,
  respiration/idle animation élaborée).
- Pas de cinématique d'Ascension (caméra scriptée, séquence de révélation).
- Pas de bascule automatique de la Puissance Cortex/Titre en fonction du
  buste — c'est strictement l'inverse (le buste lit l'état RPG existant, il
  ne le modifie ni ne le déclenche jamais).

Ces sujets sont des phases séparées, explicitement hors périmètre ici (voir
consigne "ne commence pas encore les effets avancés ou les cinématiques
d'Ascension").
