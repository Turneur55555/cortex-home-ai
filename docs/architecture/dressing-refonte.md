# Refonte du Dressing — diagnostic, direction et feuille de route

> Proposition du 03/11/2026, à la demande de Nathan (« je le trouve très peu fonctionnel… fais-moi
> un vrai chemin de progression et prépare-moi tout le boulot »). **Rien n'est construit tant que
> Nathan n'a pas choisi l'entrée du module** (variante A, B ou C, en images). Ce document décrit
> ensuite chaque étape en chantier prêt à exécuter : fichiers, règles, tests, critères de sortie.
>
> Maquettes (captures iPhone 402×874, données réelles du compte, rien d'antérieur à février 2026) :
> planche 1 « choisir l'entrée » et planche 2 « le reste du parcours », publiées sur
> https://claude.ai/artifact/E8jrDhbKmQKfdqroo31NGJ (privé). Les vêtements y sont dessinés à la **couleur enregistrée** de chaque pièce : les photos
> sont dans le bucket privé `wardrobe`, inaccessibles depuis l'environnement de travail. Dans l'app,
> ce sont les photos détourées.

---

## 0. Avancement

| Étape                      | État                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0 · Remise à niveau        | **Livrée le 03/11/2026** (code). Détourage et corrections : à lancer par Nathan depuis Vestiaire → « Remise à niveau ».          |
| 1 · Entrée A « Le Miroir » | **Livrée le 03/11/2026** (choix de Nathan : « fais la A »). Sac de salle et puce de séance (étape 3, partie rythme) livrés avec. |
| 2 · Composer               | à faire (le bouton ⇄ ouvre l'actuel « Composer une tenue »)                                                                      |
| 3 · Météo                  | à faire (la partie « Mon rythme » est livrée)                                                                                    |
| 4 · Vestiaire vivant       | en partie : onglet Vestiaire, grille uniforme, filtre « De saison », pastilles « Portée hier »                                   |
| 5 · Style et Chroniques    | à faire (l'onglet Style ouvre le journal existant)                                                                               |

## 1. Diagnostic — mesuré en production le 02-03/11/2026

| Mesure                | Valeur                                                          | Ce que ça dit                                      |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| Pièces                | **33** = 22 hauts + 11 bas                                      | 0 chaussure, 0 veste, 0 accessoire                 |
| Saisie                | 4 → 11 août 2026, 44 analyses IA, plus rien depuis              | dressing construit en une semaine puis abandonné   |
| Bas                   | **8 shorts** sur 11                                             | un dressing d'août                                 |
| Portable cet automne  | **18 / 33** (15 hauts, **3 bas**)                               | `seasonForDate` + colonne `seasons`                |
| Portable en hiver     | **7 / 33** (6 hauts, **1 bas** : le jogging noir)               | à partir du 1er décembre                           |
| Hauts manches courtes | 14 / 22                                                         | proposés tels quels en novembre                    |
| Photos détourées      | **15 / 33**                                                     | la grille mélange 18 photos brutes et 15 détourées |
| Tenues notées         | **1** en 3 mois (02/11, 23 h 28 : Sweat beige + Pantalon beige) | 0 avis 👍                                          |
| Visites               | 1 en 30 jours (analyse du 27/10)                                | module invisible : Profil → Mes espaces → Dressing |

**Le moteur n'est pas en cause — le dressing et l'écran le sont.** Moteur réel rejoué sur les 33
pièces pour la semaine du 2 novembre (`planWeek`, saison automne) :

- 6 jours planifiés avec **3 bas** seulement : jogging noir ×3, jogging vert ×2, pantalon beige ×1
  (+ porté lundi). La promesse « aucun bas répété dans la semaine » est intenable.
- Mardi : **T-shirt vert manches courtes + Jogging vert** en novembre (le moteur ignore `sleeve_length`).
- « Chemise + jogging » sort à 96 % : aucune règle d'association par type de pièce.
- Contexte Travail : polo manches courtes + pantalon beige (seule possibilité) ; Soirée : 73 %.
- Toutes les tenues : « Sans chaussures ».

**L'écran d'entrée est un menu** : 5 boutons + une carte avant le premier vêtement ; la tenue du
jour est à 2 appuis (« Mes tenues de la semaine ») ; 7 routes (`/dressing`, `ajouter`, `import`,
`semaine`, `generer`, `historique`, `$itemId`) sans fil conducteur.

**Qualité des données** (relevé pièce par pièce) :

- noms générés sans accord : « Chemise blanc » ×2, « Chemise vert » ×2, « Chemise noir » —
  cause : `buildWardrobePrefill` (`src/hooks/useWardrobe.ts`) concatène `${label} ${couleur}` ;
- « Polo noir » (Fred Perry) enregistré couleur principale **blanc** ;
- « Jogging vert » rangé en sous-catégorie `pantalon` ;
- « T shirt blanc » (Uniqlo) et « T shirt noir » : aucune saison, aucune formalité ;
- noms en double : 2 « Polo noir », 2 « Polo bleu marine » ; noms génériques « Polo », « Shorts » ;
- marque 7/33, taille 1/33, aucun prix (colonne absente).

## 2. Ce que font les meilleures applications (et ce qu'on leur prend)

| App                     | Ce qu'on retient                                                                                                               | Où dans CORTEX                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| **Whering**             | « W Pick » : une tenue proposée chaque jour (style + météo) ; « Dress Me » : shuffle façon _Clueless_ ; planner ; statistiques | A (tenue du jour), B (Composer) |
| **Acloset**             | recommandations météo / agenda ; « Style Stats » (coût par port, taux d'utilisation) ; valise selon la météo                   | A, C, Style                     |
| **Indyx**               | calendrier des tenues, coût par port automatique, tableau d'analyse                                                            | Style                           |
| **Cladwell**            | une tenue par jour, garde-robe capsule, rotation par saison                                                                    | A, rangement de saison          |
| **Fits / Smart Closet** | composition par lignes (haut / bas / chaussures) qu'on fait défiler                                                            | B                               |
| **Stylebook**           | calendrier, listes de valise, lookbooks                                                                                        | semaine, plus tard « valise »   |

Constante chez tous : **photos détourées sur fond uniforme**, la tenue montrée **comme un look**
(pièces assemblées), pas comme une rangée de vignettes.

## 3. Trois entrées possibles (planche 1) — à choisir

- **A · Le Miroir** — on ouvre, la tenue du jour est là, mise en scène à plat sur fond studio,
  « Je la porte » en 1 appui, glisser pour la suivante, sac de salle les jours de séance, semaine en
  bas. _Whering W Pick, Acloset, Cladwell._
- **B · Le Shuffle** — une ligne par étage (haut, bas, chaussures) qu'on fait glisser, cadenas pour
  garder une pièce, « Mélanger », harmonie en direct. _Whering Dress Me, Fits._
- **C · Le Vestiaire** — le dressing tel qu'il est : portable cette saison, ce qui dort, ce qui
  manque (chiffré), grille uniforme. _Acloset Style Stats, Indyx._

**Recommandation : A en entrée**, B derrière le bouton ⇄ (« Composer »), C comme onglet
« Vestiaire », et un onglet « Style ». Les trois idées se complètent ; la question pour Nathan est
**laquelle on voit en ouvrant**. A est la seule qui crée une habitude quotidienne (pilier 1).

Architecture cible (quelle que soit l'entrée) : 3 onglets internes au module
**Aujourd'hui · Vestiaire · Style**, la barre principale de l'app inchangée.

## 4. Les piliers

- **Revenir aujourd'hui** : la tenue du jour prête à l'ouverture (module + tuile Accueil),
  1 appui pour la noter.
- **Revenir cette semaine** : la semaine calée sur « Mon rythme » (jours de séance → tenue du jour
  - sac de salle ; repos le week-end), préparée le dimanche.
- **Chroniques** : chaque tenue portée alimente le journal de style ; « Ton automne en tenues »
  (mosaïque mensuelle) à relire dans des années.

**Aucun XP, jamais** : la progression vient de l'entraînement (INVARIANTS §3.3). Le Dressing reste
un espace sans récompense, comme la Bibliothèque.

## 5. Feuille de route — six étapes, chacune livrable seule

Chaque étape suit le workflow habituel : `main`, tsc + lint + Vitest + build verts, CI verte,
publication Lovable vérifiée, récit dans `MEMORY.md`. Effort indicatif en sessions de travail.

### Étape 0 — Remise à niveau (fondations · 1 session) — indépendante du choix A/B/C

But : un dressing propre et un moteur qui ne propose plus d'absurdités. Écran « Remise à niveau »
(planche 2).

1. **Détourage en lot** des pièces sans `processed_storage_path` (18 au 03/11 ; « 13/33 » écrit d'abord dans la proposition était une erreur de comptage). Réutiliser
   `lib/wardrobe/backgroundRemoval.ts` (client, `@imgly`, aucune photo envoyée) et
   `imageProcessing.ts` ; traitement séquentiel avec reprise (une pièce échouée n'arrête pas le
   lot), écriture via `updateWardrobeItemRecord` (`processed_storage_path`). Original jamais
   remplacé (Phase 5 §7 existante).
2. **Qualité des données — module pur `lib/wardrobe/dataQuality.ts`** : détecte et propose
   (jamais d'écriture silencieuse, le joueur accepte) :
   - accord du nom (genre de la sous-catégorie × adjectif de couleur ; « bleu marine », « bleu
     clair », « marron », « beige » invariables) ;
   - nom ↔ couleur principale contradictoires (« Polo noir » / `blanc`) ;
   - nom ↔ sous-catégorie (« Jogging » / `pantalon`) ;
   - saisons vides → « toutes saisons » ; noms en double ; noms génériques.
3. **Nom proposé à l'ajout** : sortir la construction du nom de `buildWardrobePrefill` (hook) vers
   `lib/wardrobe/naming.ts` (pur) avec l'accord ; le hook l'appelle.
4. **Moteur** (`outfitEngine.ts`, toujours déterministe) :
   - `sleeve_length` × saison : manches courtes pénalisées en automne/hiver sauf couche disponible
     (veste/sweat) ;
   - règles d'association par sous-catégorie (chemise ↔ jogging pénalisée ; jogging ↔ t-shirt /
     sweat ; chemise ↔ pantalon / chino / jean) — table pure, testée ;
   - message honnête quand les bas de saison sont < 4 : « tes 3 bas reviendront » au lieu de la
     promesse « aucun bas répété ».
5. **Lecture bornée** : `useWardrobeItems` passe par `fetchAllRows` (+ `order("id")`) et sort de la
   baseline `check:bounded-reads` (INVARIANTS §4.1).

Tests : `dataQuality.test.ts` (les 5 cas réels ci-dessus en fixtures), `naming.test.ts`,
`outfitEngine.test.ts` (manches × saison, associations), test de reprise du lot de détourage
(orchestration pure séparée du DOM). Sortie : 33/33 détourées en production, corrections
appliquées par Nathan, plus aucun t-shirt manches courtes seul proposé en novembre.

### Étape 1 — L'entrée choisie (A recommandée · 1 à 2 sessions)

1. **`components/wardrobe/OutfitLook.tsx`** — rendu « à plat » (haut au-dessus, bas en dessous,
   chaussures et veste en place, ombre douce, fond studio) qui **remplace** `OutfitThumbnails`
   partout (Générer, Semaine, Journal, tuile Accueil) : un seul rendu de tenue, pas de doublon.
   Repli propre quand une catégorie manque (silhouette en pointillés « Chaussures ? »).
2. **`/dressing` devient « Aujourd'hui »** : tenue du jour (même calcul que `useWeeklyOutfits`,
   case du jour), glisser = tenue suivante du réservoir (`rerollDay`), « Je la porte » 1 appui avec
   annulation, bande de la semaine (7 mini-looks), onglets internes Aujourd'hui · Vestiaire · Style.
3. **Rien n'est supprimé** : « Générer » devient le Composer (étape 2), `/dressing/historique`
   rejoint l'onglet Style (redirection avant rendu, un lien existant ne casse jamais),
   `/dressing/semaine` reste (ouvert depuis la bande).
4. **Tuile Accueil** (`TodayOutfitTile`) : même `OutfitLook`, même bouton.

Tests : rendu `OutfitLook` (catégories manquantes), redirections, tuile invisible si dressing
vide (comportement actuel conservé). Sortie : test de la capture d'écran passé sur iPhone.

### Étape 2 — Le Composer (1 session)

- **`lib/wardrobe/composer.ts`** (pur) : lignes par catégorie filtrées (saison, contexte), pièces
  verrouillées, « Mélanger » = meilleure combinaison compatible pour les lignes libres (réutilise le
  score du moteur), harmonie recalculée en direct.
- UI : feuille plein écran depuis ⇄ ; « Je la porte » ; « Garder ce look » → `outfits.is_favorite`
  (colonne existante, **aucune migration**) ; liste « Mes looks » dans le Vestiaire.

Tests : verrou respecté, mélange déterministe à graine donnée, aucune pièce hors dressing.

### Étape 3 — Ton rythme et la météo (1 session)

- **Rythme** : lire `useWeeklyPlan` (« Mon rythme ») — jour de séance → puce « Séance Épaule » et
  **sac de salle** (pièces `usage` sport) ; repos → tenue libre. Rien de stocké (comme
  INVARIANTS §1.7 : dérivé à la lecture).
- **Météo** : Open-Meteo (gratuit, sans clé) à partir de la géolocalisation du navigateur, un appel
  par jour mis en cache local ; sans autorisation ou hors ligne → la saison fait office (comportement
  actuel). Règles pures `lib/wardrobe/weatherRules.ts` : tranches de température → manches / couche
  exigées ; pluie → lin et blanc pénalisés.
- Vérifier que le Service Worker ne met pas l'API en cache de navigation (INVARIANTS §1.9).

### Étape 4 — Le Vestiaire vivant (1 session)

- Grille uniforme 3 colonnes (photos détourées), compteur de port et « jamais portée » **dérivés**
  de `outfits` (aucun compteur stocké), filtres saison / catégorie / couleur.
- **Rangement de saison dérivé** : une pièce hors saison est « rangée » d'office (affichée à part,
  exclue des tenues) ; un appui la ressort. Pas de colonne d'état.
- « Ce qui manque » chiffré (`suggestMissingPieces` existant : sneakers noires +45 tenues…).
- **Ajout unique** : « Ajouter » et « Importer plusieurs pièces » fusionnent en une seule entrée
  multi-photos (pipeline `bulkImport` existant), détourage automatique.

### Étape 5 — Style et Chroniques (1 à 2 sessions)

- **`lib/wardrobe/styleStats.ts`** (pur) : palette (noir 7 · blanc 6 · vert 6…), couverture par
  saison, formalité, pièce fétiche, pièces oubliées (rien conclu avant 30 jours, règle actuelle),
  taux d'utilisation.
- Onglet Style (planche 2) ; page Chroniques « Ton automne en tenues » (mosaïque mensuelle des
  tenues portées) ; carte partageable via `lib/share/shareImage.ts` + `ShareExportFrame`
  (chemin de capture unique, INVARIANTS §5).
- **Optionnel, seule migration de la refonte** : `wardrobe_items.price_cents` et
  `purchased_on` (nullable) pour le coût par port. Workflow types habituel (migration → merge →
  `gen:types`).

## 6. Garde-fous à respecter pendant toute la refonte

- `lib/wardrobe/**` reste pur : **aucune couleur d'affichage** (les teintes des silhouettes et des
  pastilles vivent dans `components/wardrobe/`), aucun import React/Supabase.
- Aucune lecture non bornée ; aucun composant en double (`OutfitLook` remplace, ne s'ajoute pas).
- Aucune fonctionnalité supprimée : chaque route existante redirige ou est absorbée.
- Aucun XP, aucune notion de rang dans le Dressing.
- Mobile first : vérifié à 402×874 et 360×700.

## 7. Mesures de réussite (base au 03/11/2026)

| Indicateur                | Avant         | Cible après étape 1                              |
| ------------------------- | ------------- | ------------------------------------------------ |
| Tenues notées             | 1 en 3 mois   | ≥ 4 par semaine                                  |
| Visites du Dressing       | 1 en 30 jours | quotidiennes (tuile Accueil + entrée)            |
| Photos détourées          | 15 / 33       | 33 / 33                                          |
| Pièces portables en hiver | 7 (1 bas)     | dépend des ajouts — « Ce qui manque » le chiffre |
