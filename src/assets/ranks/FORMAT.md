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

## Cadrage — deux zones, une seule mise en page pour tous les rangs

L'illustration est découpée en deux bandes horizontales fixes. Cette mise en
page doit être **identique sur les six rangs** :

1. **Zone haute (0–80% de la hauteur, soit un carré exact largeur × largeur)**
   — contient le sujet : disque/emblème/personnage du rang. C'est la SEULE
   zone garantie visible partout, y compris dans les médaillons carrés
   compacts (`ExerciseRankBadge`, `MiniRankTile`) qui recadrent en haut
   (`object-position: top`) et perdent la bande basse.
2. **Zone basse (80–100% de la hauteur, les 20% du bas)** — contient le nom
   du rang gravé/incrusté dans l'image (ex. « GUERRIER »), centré
   horizontalement. Visible uniquement sur les écrans plein format
   (`ProfileHeroCard`, `RankUpOverlay`, `ExerciseRankShareSheet`, tous en
   ratio 4:5 exact — aucun recadrage n'y survient puisque le ratio du
   conteneur est identique à celui de l'image).

**Zone de sécurité** : ne placer aucun élément essentiel (sujet ou lettrage)
à moins de **6% de la largeur** des bords gauche/droit, ni à moins de **4%
de la hauteur** du bord du haut — ces marges absorbent les coins arrondis et
les légers écarts de rendu entre appareils.

**Titre** : ne jamais ajouter de titre en overlay côté code — l'illustration
porte déjà le nom du rang, `RankIllustration` ne superpose donc aucun texte
par-dessus (seuls les compteurs de progression indépendants de l'image,
comme le niveau romain, sont superposés en petite pastille).

## Repli si absente

Un rang sans fichier propre n'affiche **jamais** l'illustration d'un autre
rang. `RankIllustration` retombe automatiquement, dans l'ordre, sur :

1. `placeholder.webp` (même dossier, même format ci-dessus) s'il existe ;
2. une carte générique « Illustration à venir », sinon.

Déposer le fichier du rang manquant suffit à le faire apparaître partout —
aucune autre étape.
