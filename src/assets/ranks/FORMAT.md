# Format des illustrations de rang

Contrat que **toute** illustration déposée dans ce dossier doit respecter pour
s'afficher correctement, partout dans CORTEX, sans la moindre adaptation de
code ou de CSS. `RankIllustration` applique le même traitement (`object-fit:
cover`, ancrage haut) à tous les fichiers : c'est le fichier qui doit se
plier au format, jamais le code qui s'adapte au fichier.

## Fichier

- Nom : `<clé-de-rang>.webp` (`mortel`, `guerrier`, `heros`, `titan`,
  `olympien`, `primordial`) — exactement la `key` de `RANK_TIERS`
  (`src/lib/fitness/exerciseRanks.ts`).
- Format : WebP, fond opaque (pas de transparence — certains conteneurs sont
  carrés, un fond transparent laisserait apparaître l'arrière-plan de la
  page).
- Poids cible : < 250 Ko (déjà compressé/redimensionné avant dépôt).

## Dimensions et ratio

- **Ratio exact : 4:5** (portrait), par exemple **1200 × 1500 px**. N'importe
  quel multiple exact de 4:5 convient ; un ratio différent sera cadré de
  façon imprévisible par `object-fit: cover`.

## Cadrage — une seule mise en page, partout, sans exception

**Règle absolue depuis le 22/07/2026 (une seule source de vérité pour
l'affichage des rangs) : tout conteneur qui accueille `RankIllustration`
respecte le ratio 4:5 exact.** Il n'existe plus aucun médaillon/badge carré
recadré nulle part dans l'app (l'ancien recadrage carré de
`ExerciseRankBadge`/`MiniRankTile` a été retiré) — `object-fit: cover` ne
recadre donc jamais rien en pratique, quel que soit l'écran : accueil, fiche
d'exercice, La Forge, montée de rang, écran de partage, bandelette de
Progression. L'illustration est toujours vue en entier, disque ET titre
gravé compris. Seule la TAILLE du conteneur varie selon le contexte (grand
sur l'accueil, compact dans une liste) — jamais son ratio.

**Zone de sécurité** : ne placer aucun élément essentiel (sujet ou lettrage)
à moins de **6% de la largeur** des bords gauche/droit, ni à moins de **4%
de la hauteur** du bord du haut — ces marges absorbent les coins arrondis et
les légers écarts de rendu entre appareils.

**Titre** : ne jamais ajouter de titre en overlay côté code — l'illustration
porte déjà le nom du rang, `RankIllustration` ne superpose donc aucun texte
par-dessus. Aucun chiffre romain, aucune répétition du nom de rang nulle
part : le seul texte de progression toléré est le nom du grade officiel
(`gradeName()`, `src/lib/fitness/rpg/grade.ts`), affiché par l'appelant SOUS
l'illustration — jamais en overlay dessus.

## Repli si absente

Un rang sans fichier propre n'affiche **jamais** l'illustration d'un autre
rang. `RankIllustration` retombe automatiquement, dans l'ordre, sur :

1. `placeholder.webp` (même dossier, même format ci-dessus) s'il existe ;
2. une carte générique « Illustration à venir », sinon.

Déposer le fichier du rang manquant suffit à le faire apparaître partout —
aucune autre étape.
