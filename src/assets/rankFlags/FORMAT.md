# Format des fanions de rang

Contrat que tout fanion déposé dans ce dossier doit respecter.

## Fichier

- Nom : `<clé-de-rang>.webp` (`mortel`, `guerrier`, `heros`, `colosse`,
  `olympien`, `titan`) — exactement la `key` de `RANK_TIERS`
  (`src/lib/fitness/exerciseRanks.ts`).
- Format : WebP, fond opaque, icône + nom du rang déjà gravés dans l'image
  (aucun texte n'est superposé par le code).

## Dimensions et ratio

- Ratio bandeau horizontal, environ **3.8:1 à 4:1** (ex. 530 × 135 px).
  `RankFlag` affiche l'image en `object-contain` (jamais recadrée) : un ratio
  proche de celui-ci s'intègre sans adaptation.

## Usage

Ce dossier est distinct de `assets/ranks/` (illustration portrait 4:5 pleine
page — Hero, récompenses, montées de rang, Chroniques). Le fanion sert aux
contextes compacts (carte d'exercice en séance) où le rang doit être
identifiable en un coup d'œil sans le texte coloré qu'il remplace.

## Repli si absent

Un rang sans fanion propre n'affiche rien (`RankFlag` retourne `null`) —
jamais le fanion d'un autre rang, jamais de texte de repli improvisé. Déposer
le fichier du rang manquant suffit à le faire apparaître partout.
