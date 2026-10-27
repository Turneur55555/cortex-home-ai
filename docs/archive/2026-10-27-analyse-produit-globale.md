# Analyse produit globale de Cortex (27/10/2026)

> Document daté et clos. Mesures en lecture sur la production (`bcwfvpwxzlmkxobvbtzp`), agrégats
> uniquement, statistiques Lovable sur 30 jours, journal d'erreurs, et audit de 20 écrans au format
> iPhone 17 Pro (402 × 874 pt @3x) sur données simulées calibrées. Version illustrée (captures,
> graphiques) publiée en Artifact : https://claude.ai/artifact/ToTXWzLd1wGXj5M7AqA5bG

## Le constat

Cortex est très abouti visuellement, mais le joueur principal ne s'en sert plus pour l'essentiel :
la saisie des séances en direct s'est éteinte, la nutrition n'est saisie qu'à moitié, et l'app n'a
pas été ouverte du 22 au 27/10. La cause mesurable est la friction des deux gestes quotidiens, pas
un manque de fonctionnalités. Et le démarrage hors ligne n'existait pas en production.

## Mesures

| Mesure | Valeur |
|---|---|
| Comptes / joueur actif | 4 / 1 ; le second utilisateur (actif fin juin → fin août) a décroché après des erreurs |
| Séances avec exercices par mois | juin 17 · juillet 45 · août 22 · sept. 7 · oct. 4 |
| Saisie après coup | « Dos » 19/10 : 9 exos / 16 séries en 50 s ; « Épaule » 20/10 : 5 exos / 13 séries en 75 s → durée enregistrée « 1 min » |
| Plan « Mon rythme » (13/10) | 5 séances/semaine prévues ; 3 faites sur 11 jours prévus (27 %) |
| Titre | Olympien « Sublime », 71 164 XP ; « Éternel » à 2 036 XP ≈ 18 séances au rythme d'octobre ; aucune promotion depuis le 06/08 |
| Nutrition (45 j) | 19 jours saisis, 13 aliments/jour ; 65 % saisis par lots dans la même minute, pic 16-17 h |
| Dîner | saisi 5 jours sur 19 ; 1 690 kcal/j avec dîner, 895 sans ; moyenne affichée 1 104 pour un objectif de 1 800 |
| Ajout d'un aliment | ≥ 4 appuis ; quantité par défaut 100 g (habituelle : 215 g carotte, 217 g Monster) ; repas par défaut « Déjeuner » |
| Recettes | 17, aucune utilisée pour une saisie en 60 j |
| Visites 30 j | Accueil 47, Nutrition 37, Séances 19, Profil 14, Chroniques 4, Livres 4, Corps/Documents/Dressing 1 ; aucune du 22 au 27/10 |
| IA (rate_limits) | recherche d'aliments vivante (86/30 j) ; Sensei 0 depuis 28/07 ; bilan IA 0 depuis 19/07 ; scan d'exercice 0 depuis 14/07 ; PDF 0 depuis 01/08 ; idées de lecture jamais |
| Jamais ou plus utilisés | mesures corporelles (0 depuis 11/08), objectif physique (0), tenues générées (0 pour 33 pièces), planning de repas (0), compléments : seule la créatine |
| Erreurs | `/sw.js` 404 / « load failed » : 47 sur iPhone, 27 sur ordinateur (15/09 → 21/10) |

## Défauts constatés

1. **Service worker absent en production** (`/sw.js` 404) : sur Lovable le site sort dans
   `dist/client`, le SW et `offline.html` étaient écrits dans `.output/public`. **Corrigé le 27/10**
   (`scripts/build-output.mjs`, INVARIANTS §1.8). À confirmer sur le site : plus de nouvelle erreur
   `sw.js` dans `error_logs` après publication.
2. **Durée « 1 min »** pour une séance saisie après coup (règle `sessionDuration` du 01/10).
3. **Journées incomplètes comptées comme complètes** dans les moyennes nutrition.
4. **Lisibilité** : « Démarrer la séance » à 2,8:1 de contraste ; étiquettes en 8,5-9 px sur presque
   tous les écrans (jusqu'à 1,9:1 dans Corps > Santé) ; 363 zones tactiles < 44 pt dans le journal de
   Progression.
5. **Format des nombres** incohérent : « 81,1 » (Accueil) / « 81.1 » (Profil, Corps), « 57.5 kg »,
   « 71164 XP », « L0 G4.4 P0 ».
6. **Boutons flottants** qui masquent du contenu (Nutrition, Corps).
7. **Poids JS** : Séances charge 580 Ko gzip (2 Mo bruts), graphiques compris, sans graphique affiché.
8. **Base partagée avec une application de paie** (DSN, arrêts maladie, mutuelle) et mêmes comptes :
   aucune faille trouvée (`authenticated` n'a aucun droit UPDATE sur `profiles`, tables de paie sous
   `is_paie_staff()`), mais risque structurel ; à séparer.
9. Doublons dans la bibliothèque d'aliments (« Harissa » / « Harissa (sauce au piment) »…).

## Recommandations, par ordre

1. **« J'ai fait ma séance »** : saisie après coup assumée (modèle pré-rempli, corrections, durée
   demandée, validation d'un coup).
2. **Nutrition** : « Ma journée type » / « comme hier », quantité habituelle et repas selon l'heure par
   défaut, clôture de journée le soir, journées non clôturées hors des moyennes.
3. **Un rappel par jour** (notifications de la PWA installée) : séance prévue le matin, clôture le soir.
4. **Plan réaliste** : partir du rythme tenu, ne plus barrer les jours manqués.
5. **Une victoire visible chaque semaine** (record à battre, exercice proche du rang suivant).
6. **Écran de séance** : l'action d'abord (exercice courant déplié, badges réduits, navigation masquée,
   suppression éloignée de la validation).
7. **Lisibilité iPhone** : ≥ 11 px, contraste ≥ 4,5:1, format français, cibles ≥ 44 pt.
8. **Une seule voix** : vocabulaire RPG réservé aux récompenses et aux Chroniques.
9. **Alléger** (décision de Nathan) : sortir des écrans principaux les fonctions mortes.
10. **Séparer la base de paie** dans son propre projet Supabase.

## Limites

Un seul joueur actif : les chiffres décrivent un usage, pas un public. Le motif de la saisie après
coup est une hypothèse. Captures sur données simulées calibrées. Site publié injoignable depuis la
session : correction du SW vérifiée en simulant le build Lovable.
