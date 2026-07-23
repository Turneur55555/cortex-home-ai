# Les Chroniques — Product Design Document

> **Nature du document** : conception **produit**, pas technique. Aucune table, aucun
> composant React, aucune migration ici. On définit *ce que vivent les joueurs* et *pourquoi*.
> L'implémentation viendra dans un second temps, dans un doc séparé.
>
> **Statut** : `DRAFT` — à valider **entièrement** par Nathan avant toute ligne de code.
> **Auteur** : réflexion Head of Product, sur demande de Nathan (23/07/2026).
> **Règle de conception permanente** : chaque décision ci-dessous doit renforcer au moins un des
> quatre piliers RPG (revenir aujourd'hui · cette semaine · finir la saison · relire dans des
> années). Voir `CLAUDE.md` et `rpg-vision-et-r1-niveau-personnage.md`.

---

## 0. Décisions à valider (arbitrages ouverts)

Trois points nécessitent ton arbitrage explicite. Le reste du document **assume les réponses
recommandées** ci-dessous pour rester cohérent — si tu changes une réponse, on ajustera.

| # | Décision | Recommandation | Alternative |
|---|---|---|---|
| **D1** | Place des Chroniques dans la navigation | **Renommer l'onglet « Séances » en « Chroniques »** : l'entraînement (Nouvelle séance + Forge) reste en haut, les trois piliers rétrospectifs dessous. Garde 4 onglets. | 5ᵉ onglet dédié (barre plus chargée) · ou sous-page depuis l'Accueil. |
| **D2** | La Forge fait-elle partie des Chroniques ? | **Non.** Les Chroniques = **Légendes · Saga · Panthéon**. La Forge reste dans le flux d'entraînement. Voir §7. | Garder Forge dans les Chroniques → laisse les badges/succès sans domicile. |
| **D3** | Nom du module « évolution » | **La Saga** (évite la collision avec « progression vers le rang » de l'Accueil, colle au « livre de vie »). | Garder « Progression » (plus littéral, moins narratif). |

> Tout ce qui suit part de **D1 = renommer**, **D2 = Forge dehors + Panthéon**, **D3 = La Saga**.

---

## 1. Philosophie

**Les Chroniques sont le livre de vie du joueur.** Un lieu **rétrospectif** : ce que j'ai fait, ce
que je suis devenu, ce que j'ai conquis. On ne vient pas ici pour *agir* — on vient pour *se
souvenir*, *mesurer le chemin* et *ressentir de la fierté*.

Trois convictions structurent tout le reste :

1. **Rétrospectif uniquement.** Aucun outil qui prépare l'avenir n'a sa place ici. Chercher un
   exercice, monter une séance, régler une préférence : ce sont des gestes *d'entraînement*, pas
   des souvenirs. Le livre ne contient que du passé consolidé.
2. **Le Rang est la star.** Conformément à la direction artistique, on retient son **Rang**
   (Titan, Olympien…), jamais son niveau. Le premier écran des Chroniques doit être le plus
   identitaire et le plus « screenshotable » de l'app.
3. **Le livre se relit.** Sa vraie valeur se révèle dans le temps. Un joueur doit avoir envie de
   rouvrir les Chroniques dans deux ans et d'y retrouver ses chapitres, ses montées de rang, ses
   trophées — pas un tableau de bord froid. C'est le seul écran de l'app pensé pour le **pilier
   n°4**.

**Test de chaque écran** : *« Si un joueur ouvrait cet écran pour la première fois, aurait-il
envie d'en faire une capture et de la partager ? »* Si non, on itère.

---

## 2. Le principe cardinal — une information = un seul endroit

C'est la règle qui protège les Chroniques de la confusion. **Chaque donnée a un domicile unique
dans toute l'app.** Voici la carte de répartition qui fait foi :

| Information | Domicile unique | Jamais affichée ailleurs |
|---|---|---|
| Rang **global** du personnage, Niveau, XP globale | **Accueil** (fiche de personnage) | ✗ pas dans les Chroniques |
| Informations générales du joueur (pseudo, classe active…) | **Accueil** | ✗ |
| Mesures corporelles, poids, photos | **Corps** | ✗ |
| Suivi alimentaire | **Nutrition** | ✗ |
| **Rang par groupe musculaire** (maîtrise) | **Chroniques → Légendes** | ✗ |
| **Historique des séances, records perso, courbes, tendances, volume, analyses IA** | **Chroniques → Saga** | ✗ |
| **Badges, succès, hauts faits, Saisons** | **Chroniques → Panthéon** | ✗ |
| **Bibliothèque d'exercices** (recherche, filtres, variantes, favoris, tutoriels) | **Entraînement → La Forge** | ✗ pas dans les Chroniques |
| Création / démarrage d'une séance | **Entraînement → Nouvelle séance** | ✗ |

> **Conséquence directe** : « Progression » n'existe plus comme destination séparée. Tout ce qui
> touche à l'évolution est **rapatrié dans la Saga**. Il ne doit rester **aucune** seconde porte
> vers la progression ailleurs dans l'app (ni depuis le Profil, ni ailleurs).

---

## 3. Architecture — les trois piliers

Les Chroniques sont composées de **trois modules**, dans cet ordre, choisi par intention
émotionnelle et non par commodité :

```
   👑  LES LÉGENDES        →   Qui je suis devenu        (fierté / identité)
   📖  LA SAGA             →   Ce que j'ai fait & vécu   (preuve / élan)
   🏆  LE PANTHÉON         →   Ce que j'ai conquis       (prestige / nostalgie)
```

**Pourquoi cet ordre.** On ouvre sur l'émotion la plus forte et la plus visuelle (le Rang, la
star). On enchaîne sur la preuve chiffrée qui donne l'élan de revenir. On termine par la
collection, qu'on explore plus lentement et qu'on relit dans le temps. Jamais l'inverse : ouvrir
sur des graphiques tuerait la promesse premium.

**Ce que les trois modules ont en commun** : ils sont tous **en lecture seule**, tous
**rétrospectifs**, et chacun a **une mission unique** qu'on peut résumer en une phrase.

---

## 4. Module 1 — 👑 Les Légendes

### Mission (une phrase)
> Montrer, d'un coup d'œil, **le niveau de maîtrise du joueur, muscle par muscle.**

### Ce que le joueur y vit
Il arrive sur **ses illustrations de rang**, réparties par groupe musculaire. Il voit
immédiatement où il est un Titan et où il n'est encore qu'un Guerrier. Il touche un groupe : le
détail s'ouvre — son rang actuel, sa progression vers le rang suivant, et les exercices qui l'ont
porté jusque-là.

### Composants principaux de l'écran
1. **Hero — le blason de maîtrise.** L'illustration officielle du rang le plus élevé, ou une
   composition des groupes musculaires. C'est l'écran-capture de l'app.
2. **La carte du corps / la grille des groupes musculaires**, chacun affichant son rang courant
   via l'illustration officielle (un seul système visuel de rang partout).
3. **La fiche de détail d'un groupe** (au tap) : rang courant, jauge de progression vers le rang
   suivant, et la liste des exercices contributeurs.

### Interactions
- Tap sur un groupe → fiche de détail (drill-down plein écran, retour au module).
- Tap sur un exercice contributeur → *peut* renvoyer vers sa fiche dans la Forge (lecture),
  **à confirmer** — on ne veut pas transformer les Légendes en annuaire.

### Exclusions explicites (repris de ta consigne, gravés ici)
Les Légendes **ne contiennent pas** : XP globale · statistiques générales · historique · records
globaux · badges · succès. Ces informations vivent ailleurs (voir §2).

### ⚠️ Garde-fou de cohérence
Le rang « par groupe musculaire » doit être **dérivé du moteur de rang réel** (celui qui classe
par exercice/famille), pas d'une seconde méthode de calcul inventée pour l'occasion. Une seule
vérité de rang dans toute l'app, sinon un même effort afficherait deux rangs différents selon
l'écran. *(Point technique, tranché à l'implémentation — noté ici pour ne pas l'oublier.)*

---

## 5. Module 2 — 📖 La Saga *(ex-« Progression »)*

### Mission (une phrase)
> Raconter, avec les preuves, **tout ce que le joueur a fait et comment il évolue.**

### Ce que le joueur y vit
La Saga est le **journal** de l'athlète. En haut, un micro-récap vivant (« ce mois-ci ») qui
donne une raison de revenir aujourd'hui. En dessous, la **chronologie** de toutes ses séances —
chacune ouvre la *Chronique immersive* d'une séance (le récit détaillé d'un jour d'entraînement,
qui existe déjà et reste la pièce maîtresse). Entre les deux, les courbes, les records personnels,
les tendances, le volume et les analyses IA.

### Composants principaux de l'écran
1. **Récap « Ce mois-ci »** (haut de page) : quelques chiffres vivants — séances, records tombés,
   volume — pour servir les piliers « revenir aujourd'hui / cette semaine ».
2. **Le Hall of Fame** : les records **personnels** absolus (plus gros tonnage, série la plus
   lourde, plus longue séance…). *(Rapatrié ici : ce sont des records « globaux perso », donc
   Saga, jamais Légendes.)*
3. **Les courbes & tendances** : évolution des performances, volume d'entraînement.
4. **La chronologie des séances** : la liste, chaque carte ouvrant la **Chronique immersive** de
   cette séance.
5. **Les analyses IA** persistées, rattachées à leur séance.

### Interactions
- Tap sur une séance → **Chronique immersive** plein écran (déjà conçue), retour à la Saga.
- Une **montée de rang** vécue en séance apparaît comme une **page marquante** dans la
   chronologie (le pic émotionnel devient un souvenir permanent — voir §11 et backlog premium).

### Exclusions explicites
La Saga **ne contient pas** : le rang par muscle (→ Légendes) · les badges/succès (→ Panthéon) ·
le rang global et l'XP (→ Accueil). Pas de bibliothèque d'exercices, pas de création de séance.

---

## 6. Module 3 — 🏆 Le Panthéon *(le module que ta proposition oubliait)*

### Pourquoi il existe
Ta proposition initiale excluait, à juste titre, les badges et succès des Légendes — mais ne leur
donnait **aucun domicile**. Or trophées, hauts faits et Saisons sont *exactement* la matière d'un
livre de vie : la collection qu'on relit avec émotion des années plus tard. C'est le module qui
porte le mieux le **pilier n°4**. Il remplace la Forge dans le trio (voir §7).

### Mission (une phrase)
> Rassembler **tout ce que le joueur a conquis** : trophées, hauts faits, et chapitres de Saison.

### Ce que le joueur y vit
Une **salle des trophées** unifiée (badges et succès réunis sous un seul vocabulaire de rareté,
comme prévu par la vision RPG, lot R3) et, à terme, le **chapitrage par Saison** (« Chapitre I —
Saison de l'Ascension ») qui transforme les Chroniques en véritable livre paginé dans le temps
(vision RPG, lot R6 et `rpg-saisons.md`).

### Composants principaux de l'écran
1. **La collection de trophées** : badges ⊕ succès, groupés par rareté, débloqués vs à conquérir.
2. **Les Saisons / chapitres** : chaque saison passée = un chapitre relisible ; la saison en cours
   = le chapitre en train de s'écrire.
3. **Les pièces maîtresses** : les trophées les plus rares mis en avant (halo, or).

### Interactions
- Tap sur un trophée → sa fiche (comment il a été obtenu, quand).
- Tap sur une Saison → le chapitre correspondant (récap de saison relisible / partageable).

### Exclusions explicites
Le Panthéon **ne contient pas** de stats brutes ni de courbes (→ Saga), ni de rang par muscle
(→ Légendes). Il célèbre, il ne mesure pas.

> **Note de séquençage.** Les Saisons relèvent d'un lot RPG ultérieur (R6). Le Panthéon peut
> **naître avec les seuls trophées unifiés** et accueillir les Saisons quand elles arriveront. Le
> module est donc viable dès le jour 1, même incomplet.

---

## 7. La Forge — pourquoi elle n'est **pas** dans les Chroniques

Tu tiens à la Forge (son nom, son concept) — et tu as raison, on la garde **telle quelle**. Mais
sa place n'est pas dans le livre de vie, pour trois raisons :

1. **Mission opposée.** Les Chroniques sont rétrospectives (se souvenir). La Forge est
   **prospective** : on y cherche des techniques pour *préparer* sa prochaine épreuve. Sa propre
   accroche le dit : *« Choisis les techniques qui forgeront ta prochaine épreuve. »*
2. **Point d'usage.** On ouvre la Forge quand on prépare une séance — donc à côté de « Nouvelle
   séance », là où elle vit déjà aujourd'hui. L'isoler dans un mémorial l'éloigne de son moment
   d'usage.
3. **Anti-confusion.** Un moteur de recherche avec filtres et favoris au milieu d'un livre
   contemplatif viole ta règle « chaque écran, une seule mission ».

> **Décision** : la Forge **reste dans le flux d'entraînement** (onglet Chroniques renommé, mais
> dans sa partie *haute*, « agir », aux côtés de « Nouvelle séance » — pas dans les trois piliers
> rétrospectifs *dessous*). Aucun renommage, aucune perte de fonctionnalité.

---

## 8. Navigation & mise en page mobile

### Le geste central : un segmented control, pas un menu de cartes
On **n'ouvre pas** les Chroniques sur un lanceur de trois cartes (froid, un tap perdu, effet
« annuaire »). On ouvre **directement sur Les Légendes**, avec un **sélecteur segmenté** collant
en haut :

```
   ┌──────────────────────────────────────────┐
   │  couverture du livre (fin, atmosphérique) │
   ├──────────────────────────────────────────┤
   │   [ Légendes ]   Saga     Panthéon        │  ← segmented control collant, au pouce
   ├──────────────────────────────────────────┤
   │                                           │
   │   contenu du module actif (scroll)        │
   │                                           │
   └──────────────────────────────────────────┘
```

- **Passer d'un module à l'autre = un seul tap**, contenu échangé **en place**. Pas de
  push/retour entre les trois piliers (ce sont des pairs, pas des sous-pages).
- **Les détails** (fiche d'un groupe musculaire, Chronique d'une séance, fiche d'un trophée)
  poussent en **plein écran** — ça, c'est du drill-down légitime, avec retour au module.
- **Objectif explicite** : tuer la pile de navigation profonde d'aujourd'hui
  (Séances → Livre → Chronique → retour · retour · retour).

### Ossature mobile de chaque module
Header fin « couverture » (compteurs carrière discrets) → segmented control collant → scroll
vertical de cartes en verre teinté. Le hero de Légendes est **toujours** l'illustration officielle
du rang. Le pouce atteint le sélecteur sans effort.

---

## 9. Parcours utilisateur

**P1 — « Je veux voir où j'en suis. »** Ouvre l'onglet → tombe sur Les Légendes → voit ses rangs
par muscle → touche « Pectoraux » → voit sa progression vers Olympien et les exercices qui l'y
mènent. *Émotion : fierté, envie de pousser le muscle en retard.*

**P2 — « Comment j'ai progressé ce mois-ci ? »** Ouvre l'onglet → tap « Saga » → récap « ce
mois-ci » en haut → fait défiler ses courbes → touche sa meilleure séance → lit sa Chronique
immersive. *Émotion : preuve tangible, élan.*

**P3 — « Qu'est-ce qu'il me reste à débloquer ? »** Ouvre l'onglet → tap « Panthéon » → voit ses
trophées obtenus et ceux à conquérir → identifie un haut fait proche. *Émotion : objectif,
raison de revenir cette semaine.*

**P4 — « Je prépare ma prochaine séance. »** N'entre **pas** dans les trois piliers : reste dans
la partie haute de l'onglet → « Nouvelle séance » ou « La Forge ». *Le livre n'est pas sollicité :
c'est un geste d'entraînement.*

**P5 — « Je rouvre l'app après un an. »** Panthéon → relit ses chapitres de Saison, revoit ses
montées de rang gravées dans la Saga. *Émotion : nostalgie — le pilier n°4 en action.*

---

## 10. Interactions entre les modules

Les trois piliers sont **étanches par leur mission** mais **connectés par des ponts naturels**,
toujours en drill-down (jamais de duplication) :

- **Légendes → Saga** : depuis un groupe musculaire, un pont possible vers les séances qui l'ont
  travaillé. *(À confirmer — ne pas alourdir Légendes.)*
- **Saga → Légendes** : une **montée de rang** apparue dans une Chronique de séance renvoie vers
  la Légende concernée.
- **Saga ↔ Panthéon** : un **badge débloqué pendant une séance** est mentionné dans la Chronique
  (Saga) et vit dans la collection (Panthéon) — mentionné à deux endroits, mais **détenu** à un
  seul (le Panthéon). La règle §2 est respectée : la Saga *raconte* l'instant, le Panthéon
  *possède* le trophée.

> **Règle des ponts** : un module peut *pointer* vers une donnée d'un autre, jamais la
> *reproduire*. Le tap emmène vers le domicile unique de l'information.

---

## 11. Améliorations premium (backlog priorisé)

Au-delà du socle, ce qui rendrait les Chroniques dignes d'une app premium — à séquencer après
validation :

1. **Ouvrir sur l'illustration de rang** (test « capture d'écran »). — *socle*
2. **Récap « ce mois-ci »** en tête de Saga → piliers 1 & 2. — *fort, simple*
3. **Montées de rang gravées comme pages marquantes** dans la chronologie → le pic émotionnel
   devient un souvenir permanent. — *fort*
4. **Chapitrage par Saison** du Panthéon → piliers 3 & 4. — *dépend de R6*
5. **Cartes partageables** (exporter une Légende ou un récap de Saison en image) → virialité +
   pilier 4. — *fort, différé*
6. **Haptique & sheen** à l'entrée d'une Légende / au déblocage d'un trophée. — *finition*

---

## 12. Ce qui est volontairement exclu (récap global)

- **La Forge dans les trois piliers** — elle reste un outil d'entraînement (§7).
- **Toute création / démarrage de séance** dans les piliers rétrospectifs.
- **Le rang global, le Niveau, l'XP** — domicile unique : l'Accueil.
- **Les mesures corporelles / la nutrition** — domiciles : Corps / Nutrition.
- **Une seconde destination « Progression »** où que ce soit dans l'app — tout est dans la Saga.
- **Un lanceur de trois cartes** à l'ouverture — remplacé par le segmented control (§8).
- **Toute donnée dupliquée entre deux piliers** — un pont, jamais une copie (§10).

---

## 13. Hors périmètre de ce document

Ce doc définit **l'expérience produit**, pas sa réalisation. Sont traités ailleurs, plus tard :
la structure technique (composants, données, dérivations de rang), le plan de migration des écrans
existants (Livre des Chroniques actuel, route Progression), et le calendrier de livraison. **Rien
ne sera codé tant que cette vision n'est pas validée entièrement.**

---

## 14. Questions ouvertes pour la validation

1. **D1/D2/D3** (§0) : valides-tu les trois recommandations ?
2. **Ponts inter-modules** (§10) : jusqu'où on autorise Légendes ↔ Saga sans alourdir ?
3. **Nom** : « La Saga » te parle-t-il, ou tu préfères « Progression » / autre ?
4. **Panthéon jour 1** : on lance avec les seuls trophées unifiés (Saisons plus tard) — OK ?
