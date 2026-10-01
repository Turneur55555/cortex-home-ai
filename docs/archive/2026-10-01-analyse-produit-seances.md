# Analyse produit — l'onglet Séances, après E19/E20/G28 (01/10/2026)

> Document daté et clos. Mesures faites en lecture sur la production (`bcwfvpwxzlmkxobvbtzp`) le
> 01/10/2026, agrégats uniquement. Les chiffres de ce document sont ceux de CE jour ; ils vieillissent.

## Le constat en une phrase

L'application a beaucoup grandi autour des Séances, mais **la saisie de séances en direct s'est
effondrée** (54 en juillet → 24 en août → 7 en septembre, aucune depuis le 16/09) alors que le même
joueur logue ses repas **chaque jour** (594 repas, 40 depuis le 17/09). Le pilier « donner envie de
revenir aujourd'hui » fonctionne pour la Nutrition, pas pour les Séances. On ne sait pas encore POURQUOI
(pause d'entraînement, friction, ou ailleurs) : **rien dans l'app ne le mesure** (voir « Mesurer »).

## Ce qui a été mesuré

| Mesure | Valeur |
|---|---|
| Comptes / avec des séances | 4 / 2 (621 + 18 séances) |
| Séances en base | 639, toutes `completed`, de 2018 à 2026 |
| Dont importées (août 2026) | 537 : **aucun exercice, aucune série** — date, nom, durée seulement |
| Séances avec exercices | 91 (14 %) — 6,5 exercices et 20 séries en moyenne |
| Séances live par mois | juin 17 · juillet 54 · août 24 · septembre 7 |
| Plan de la semaine (B06) | 0 ligne (livré le jour même — pas encore jugeable) |
| Analyses IA post-séance | 25 pour ~102 séances live |
| Visiteurs, septembre | 57 (tous directs, tous FR), 216 pages vues ; `/nutrition` 39 vues, `/seances` 17 |

**Durées.** `duration_minutes` valait `maintenant − début`, plafonné à 600. **4 des 7 séances de septembre
sont à 600 min** pour une fenêtre réelle de 21, 23 et 205 minutes (la séance reste ouverte, « Terminer »
est oublié). Médiane des durées enregistrées sur les séances live : 53 min ; sur 85 séances comparables, la
durée enregistrée dépasse deux fois la fenêtre réelle dans 15 cas.

**XP.** 540 des 587 attributions « séance » (54 000 XP sur 69 965, soit 77 %) datent du **06/08**, jour
de l'import : le trigger serveur verse 100 XP à toute séance de musculation `completed`, **même sans aucune
série validée** (542 attributions sur 587 portent sur une séance sans série validée). Le joueur principal est
au palier 22/29 ; le grade suivant coûte 3 235 XP, soit **33 séances à 100 XP** ; aucune promotion depuis le
06/08 (hors un rang d'exercice le 17/09).

**Fiabilité.** Le 14/09, 65 erreurs de synchronisation en 40 secondes (`workouts_one_active_per_user`
puis clés étrangères des exercices et des séries) : l'épisode s'est **résorbé seul** (la séance est arrivée
complète, 9 exercices / 22 séries) mais a pollué le journal. 71 lignes sur 240 (60 jours) sont
« Script sw.js load failed » / « Failed to register a ServiceWorker », sur iPhone et sur Windows, la dernière
le jour même : **non diagnostiqué**, car la production n'est pas joignable depuis le sandbox.

## Ce que l'écran montrait (captures du 01/10, historique réel simulé)

- L'Arène : sélecteur, citation décorative, « Choisir une épreuve », plan, Scan des Titans.
  **Aucune séance faite** n'y apparaissait — il fallait passer par les Chroniques → Progression.
- La Carte du jour sans plan : « Quoi faire aujourd'hui ? », une question renvoyée à quelqu'un qui
  compte des centaines de séances.
- La Chronique d'une séance importée : « Intensité : Légère », un tableau de « — », la phrase « Chaque
  série compte. Cette séance fait partie de ta légende. », et **« 00h00 » sur toutes les séances**.
- Tonnages en « 6.3 t » (point décimal) dans une interface en français.

## Corrigé dans ce lot

1. **Durée vraie** (`lib/fitness/sessionDuration.ts`). À la clôture, le temps sans série validée avant la
   première ou après la dernière (> 90 min) n'est plus compté. À l'affichage, toute durée > 240 min — dont
   les 600 déjà en base — est « inconnue », jamais affichée. Le bilan de semaine ne montre plus de « Temps »
   quand une séance est au plafond (il aurait écrit « 30 h 40 » sur la semaine du 31/08), ni le « record de
   durée ».
2. **Chronique honnête** : plus d'heure inventée, plus d'intensité ni de comparaison pour une séance sans
   exercice, phrase factuelle à la place de la platitude, moyennes calculées sur les séances qui PORTENT la
   valeur (une séance importée n'est pas une séance « à zéro »), virgule décimale (« 6,3 t »).
3. **« Refaire » depuis l'historique** (`lib/fitness/sessionSuggestion.ts`). Sans plan, la Carte du jour
   propose **la plus ancienne de tes séances habituelles** (même nom, ≥ 2 fois en 8 semaines, pas faite
   depuis ≥ 2 jours) avec sa dernière fois, et « Refaire cette séance » ouvre la confirmation de CETTE
   séance. Un fait lisible dans les dates, jamais une estimation de forme.
4. **« Dernière séance »** dans l'Arène : une ligne, un tap vers sa Chronique.
5. **Journal d'erreurs** : l'échec du Service Worker hors connexion (attendu) n'est plus journalisé.

## Reste à faire — par ordre de valeur

1. **Mesurer le funnel des Séances** (démarrage → première série validée → clôture, et l'abandon). Sans
   cela, impossible de dire pourquoi la saisie live s'est arrêtée. Il n'existe aujourd'hui que des pages
   vues et `user_activity` (repas, séances, mesures corporelles).
2. **Plan depuis le rythme** : proposer en un tap « adopter ce rythme » (jours et séances déduits des 8
   dernières semaines) au lieu d'un éditeur vide — c'est le prolongement naturel du point 3 ci-dessus.
3. **Rappel de séance restée ouverte** : à l'ouverture, une séance active sans série validée depuis > 90
   min propose « Terminer à la dernière série ». La règle de durée corrige le chiffre ; le rappel corrige
   la cause.
4. **XP d'une séance sans série validée** (décision produit, trigger serveur, invariant 3.1) : aujourd'hui
   100 XP même à vide. À trancher : 0 XP sans série validée ? Et l'import : un crédit voulu, ou un effet de
   bord ? Ne se change pas sans migration testée.
5. **Économie d'XP au sommet** : 100 XP fixes par séance contre 3 235 à franchir = un grade tous les 33
   séances pour le joueur le plus avancé. Des micro-objectifs intra-grade (records déjà versés à 16 XP)
   donneraient un « aujourd'hui » à ceux qui n'ont plus de palier proche.
6. **Les 537 coquilles** : la plupart des Chroniques de l'historique sont vides. Soit les enrichir à
   l'import, soit les assumer visuellement (c'est ce que fait désormais la Chronique).
7. **Service Worker en production** : ouvrir `/sw.js` dans un navigateur sur le site publié et vérifier que
   le fichier est servi (JavaScript, 200). Si non, le démarrage hors connexion promis n'existe pas en ligne.
8. **Hygiène** : 154 avertissements ESLint, `useWorkouts` plafonné à 60 séances (records possiblement
   surestimés au-delà), RLS Regression Tests rouge depuis août (secrets absents), fonction planifiée
   `scheduled-weekly-report` qui n'a jamais tourné.

## Limites de cette analyse

Deux comptes seulement ont des séances : toute conclusion est celle d'UN joueur (l'auteur du produit).
Les captures viennent d'un jeu de données simulé réaliste, pas de la production. La cause de l'arrêt de la
saisie live est inconnue.
