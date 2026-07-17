# RPG CORTEX — Système de Saisons (architecture validée)

> Document de conception. **Aucun code** — vision validée par Nathan avant implémentation.
> Suite de `rpg-vision-et-r1-niveau-personnage.md` (R1 Niveau de Personnage, R2 écran de récompense).
> S'implémente APRÈS validation, en lots S0→S4.

---

## 0. Décisions fondatrices (validées par Nathan)

1. **Saisons de 12 semaines** (3 mois) — un vrai cycle de transformation physique, pas un rythme de jeu
   compétitif. Les gains de force, PR et changements physiques y deviennent réellement visibles, et la
   Chronique de fin raconte un **chapitre important**, pas une simple quinzaine.
2. **Architecture à 4 rythmes** pour qu'il y ait toujours quelque chose à faire : Objectifs quotidiens →
   Quêtes hebdomadaires → Événements (1-2 sem) → Saison (12 sem).
3. **Points de Saison (PS) 100 % musculation.** Le soutien (HYROX/course/cardio/guidé) et la nutrition
   **ne font pas progresser la saison**. La progression vient toujours de l'entraînement.
4. **Récompenses de prestige uniquement** : titres exclusifs, badges saisonniers datés, reliques/trophées
   exposables au profil, cosmétiques, chapitre de Chronique. **Aucun** boost d'XP/force, multiplicateur
   ou avantage de gameplay permanent. La valeur = prestige, histoire du personnage, collection.
5. **Saisons à identité forte** (nommées et thématisées : *Saison I — L'Ascension*, *II — Le Colosse*,
   *III — Le Panthéon*, *IV — L'Héritage*…), pour que les Chroniques deviennent, au fil des années, le
   **livre de la progression du joueur** — ouvrable dans 5 ans pour revoir chaque saison traversée.

## 1. Rôle dans l'écosystème RPG

Le RPG répond déjà à *« suis-je devenu plus fort ? »* (Niveau + Rang, permanents, R1/R2). La Saison
répond à *« que fais-je aujourd'hui, et pourquoi revenir demain ? »* — un arc temporel qui crée de
l'urgence douce, remet tout le monde sur une ligne de départ régulière, et **produit un chapitre des
Chroniques** à chaque fin. C'est la méta-boucle de rétention identifiée dès l'analyse initiale (§5
« ce qui manque »).

**Règle directrice (anti-« énième système confus ») :** la Saison ne crée pas une nouvelle notion de
*puissance*. Elle est une lecture **temporelle, cadencée et récompensée** de l'entraînement que le
joueur produit déjà. La puissance reste le Niveau + le Rang (permanents, muscu-purs).

## 2. Les 4 rythmes (la colonne cadencée)

| Rythme | Durée | Rôle | Alimente |
|---|---|---|---|
| **Objectifs** | 1 jour | « Reviens aujourd'hui » | PS (petit) |
| **Quêtes** | 1 semaine | « Structure ta semaine » | PS (moyen) |
| **Événements** | 1-2 semaines | « Un défi ponctuel qui pimente » | Récompense d'événement (+ PS si muscu) |
| **Saison** | 12 semaines | « Ton chapitre de progression » | Le track de saison → Chronique |

Le joueur a donc toujours un horizon : chaque **jour** (objectifs), chaque **semaine** (quêtes),
**régulièrement** (événements), et **tous les 3 mois** une grande saison qui marque une étape.

## 3. Deux voies, clairement séparées

| | **Niveau de Personnage** (R1) | **Palier de Saison** (nouveau) |
|---|---|---|
| Nature | Puissance / prestige **permanent** | Engagement / habitude **temporaire** |
| Monnaie | XP (`xp_events`, muscu-primaire) | **Points de Saison (PS)**, `sp_events` |
| Source | Toutes activités (muscu domine) | **Musculation uniquement** |
| Reset | Jamais | À chaque saison |
| Récompense | Le niveau lui-même | Titres, badges datés, reliques, cosmétiques, Chronique |

Les deux partagent l'événement « séance muscu terminée » (elle verse XP *et* PS), mais restent deux
compteurs de rôle distinct. Le Niveau ne baisse jamais ; la Saison se rejoue.

## 4. Identité des saisons

Chaque saison est **authorée**, pas générée : un **nom**, un **thème**, une **direction artistique**
(couleur/sceau/sigil, extension de la DA Reliquary) et un **jeu de récompenses** cohérent.

- Exemples : *Saison I — L'Ascension* (premiers sommets), *II — Le Colosse* (la force brute), *III — Le
  Panthéon* (l'excellence), *IV — L'Héritage* (la durée). Une **méta-narration** peut relier les saisons.
- La saison colore l'app pendant 12 semaines (accent de thème sur l'Accueil, le track, la Chronique).

## 5. Objectifs quotidiens (le hook du jour)

- **2-3 objectifs muscu rotatifs** par jour, globaux (mêmes pour tous ce jour-là → simplicité + effet
  social/comparaison), reset quotidien. Ex. *« Termine une séance de musculation »* (gros PS), *« Bats un
  record »*, *« Valide 24 séries »*, *« Atteins X kg de tonnage »*.
- Affichés sur l'**Accueil** dans une carte **« Contrat du jour »** (avec le track de saison + le compte à
  rebours de fin de saison).
- **Streak de saison** : jours d'entraînement consécutifs *dans* la saison (flamme dédiée, distincte du
  streak global d'activité).
- *Nutrition/soutien* : hors économie PS (décision §0.3). Ils restent des modules de support ; ils
  peuvent apparaître comme rappels de bien-être **sans PS** (à décider plus tard — non bloquant).

## 6. Quêtes hebdomadaires (la structure de la semaine)

- **3-4 quêtes muscu** par semaine, plus ambitieuses, reset hebdomadaire. Ex. *« 3 séances de musculation »*,
  *« 2 nouveaux records »*, *« 30 000 kg de tonnage »*, *« progresse sur un exercice suivi »*.
- Récompense : **PS moyen** + parfois un jalon narratif dans les Chroniques.

## 7. Événements (le grain de sel ponctuel)

Un **événement** = un jeu de défis + une fenêtre (1-2 sem) + des récompenses exclusives, **posé au-dessus**
de la saison active. Ex. *Défi Développé Couché*, *Défi Dos*, *Semaine HYROX*, événements saisonniers.

- **Récompense d'événement propre** : relique/badge daté exclusif, cosmétique ponctuel.
- **PS** : un événement **muscu** verse aussi des PS (il fait partie de la progression muscu) ; un
  événement **non-muscu** (ex. *Semaine HYROX*) donne sa **récompense d'événement** mais **pas de PS**
  (la saison reste 100 % muscu — §0.3). Cela permet des événements variés sans casser l'invariant.
- Première classe dès le modèle de données → aucune refonte pour en ajouter.

## 8. Le track de saison (la progression)

- **~50 paliers** sur 12 semaines, chaque palier = un seuil de PS.
- **Sources de PS (100 % muscu)** : séance muscu terminée (grosse part, non plafonnée) + PR + montée de
  rang + objectifs/quêtes muscu + événements muscu. Séance de soutien = **0 PS**. Nutrition = **0 PS**.
- **Calibrage** : un pratiquant muscu assidu (~3-4 séances/sem) atteint le palier max vers la semaine
  10-11 (marge de fin) ; un pratiquant occasionnel atteint un palier honorable sans frustration. Jamais
  punitif, jamais « pay-to-skip ».
- **Paliers ordinaires** → petite récompense cosmétique ; **jalons** (10/20/30/40) → grosse récompense ;
  **palier final (50)** → *« Légende de la Saison »* (titre + relique + déblocage de la Chronique de Saison).

## 9. Récompenses — prestige, collection, mémoire (jamais de puissance)

Cohérent avec un RPG de **progression physique** : aucune récompense fonctionnelle. On récompense
l'**identité** et on crée des **souvenirs** :

- **Titres exclusifs** datés (*Le Forgeron*, *Le Colosse*, *L'Héritier*…) — affichés sous le pseudo.
- **Badges saisonniers datés** (extension du catalogue existant, fenêtre de disponibilité) — non
  reproductibles → prestige réel.
- **Reliques / trophées** exposables dans un nouveau **« Cabinet des Reliques »** du Profil : objets de
  collection plus « lourds » qu'un badge (un par jalon/saison), qui exploitent la DA Reliquary
  (métal/émail/sceau). Le profil devient une **vitrine de la carrière**.
- **Cosmétiques exclusifs** : variantes de métal/émail du badge de rang, cadres d'avatar, atmosphères de
  carte Hero, effets de particules, sceaux de Chronique.
- **La récompense reine — la Chronique de Saison** (§10).

> Explicitement exclu (Nathan) : boosts d'XP/force, multiplicateurs, déblocages de gameplay, avantages
> permanents. La progression vient **toujours** de l'entraînement, jamais des récompenses.

## 10. Intégration Chroniques — la saga pluriannuelle (cœur de la valeur)

C'est ici que « la Saison nourrit naturellement les Chroniques » :

1. **Pendant la saison** : chaque jalon (objectif/quête complété, palier atteint, PR, montée de rang,
   événement remporté) dépose une **entrée légère** dans la chronologie du Livre — la saison en cours est
   un fil narratif vivant.
2. **À la fin (intersaison)** : génération d'une **Chronique de Saison** — page rétrospective au langage
   immersif de `LivreChroniquesPage` : niveau atteint, tonnage total, PR, montées de rang, jours
   entraînés, exercice-phare, badges/reliques gagnés, événements marquants, palier final. Résumé narratif
   (réutilise le pattern IA `workout_analyses`, ou factuel). Porte le **sceau/thème** de la saison.
3. **Le Livre gagne une étagère « Saisons »** : chaque saison passée = un **tome/chapitre** (Saison I, II,
   III…). Le Livre des Chroniques devient **le livre de la progression du joueur au fil des années** —
   ouvrable dans 5 ans pour revivre chaque saison.

Boucle de rétention : finir une saison → obtenir un **chapitre + une relique** → vouloir écrire le suivant.

## 11. Intégration Niveau / Badges / Profil / Événements

- **Niveau de Personnage** (R1) : inchangé, permanent, muscu-pur. La même séance muscu verse XP (Niveau) et
  PS (Saison). Zéro conflit, une seule action nourrit les deux.
- **Écran de récompense de fin de séance** (R2) : gagne une ligne « +N PS · Palier de saison » et signale
  un objectif/quête/palier franchi (le slot d'extension existe déjà dans `SessionRewardScreen`).
- **Badges** : les badges de saison entrent dans le catalogue existant avec une fenêtre de disponibilité.
- **Profil** : nouveau **Cabinet des Reliques** (vitrine des trophées de saison) + **titre équipé**.
- **Événements** : première classe (§7), composables au-dessus de la saison.

## 12. Muscu-primaire & équité (l'invariant, prolongé)

- Les PS ne viennent **que** de la musculation → un athlète assidu en muscu grimpe **toujours** le track de
  saison plus vite que quiconque. Le soutien/la nutrition = 0 PS.
- Les récompenses étant **cosmétiques/narratives**, aucun avantage de puissance n'est en jeu → équité
  totale entre joueurs, quelle que soit leur ancienneté ou leur budget. La saison ne fausse jamais le RPG.

## 13. Modèle de données (serveur-autoritaire, réutilise le pattern R1)

Tout écrit par des fonctions `SECURITY DEFINER` (jamais le client), comme `award_character_xp` :

- `seasons(id, index, name, theme, art, starts_at, ends_at, status)` — 12 semaines, authorée.
- `season_tiers(tier, ps_required, reward_type, reward_payload, is_milestone)` — courbe (template partagé).
- `user_season_progress(user_id, season_id, ps, tier, claimed_tiers, streak_days, updated_at)`.
- `quest_defs(id, scope daily|weekly, code, title, target_type, target_value, ps_reward, window)` — muscu.
- `user_quests(user_id, quest_id, period, progress, completed, claimed_at)`.
- `sp_events(user_id, season_id, source, amount, created_at)` — **ledger de PS** (miroir de `xp_events` :
  plafonds éventuels, audit, et alimentation du fil Chroniques).
- `events(id, name, window, discipline_scope, modifiers, quest_set, reward_payload)` + `user_event_progress`.
- `season_rewards / user_relics(user_id, season_id, relic_type, payload, earned_at)` — reliques/titres.
- **Attribution des PS d'entraînement** : le trigger de clôture de séance (R1) verse *aussi* des PS à la
  saison active **uniquement si `discipline='muscu'`**, pondéré. **Rotation** (démarrage/fin de saison,
  roulement des objectifs quotidiens/quêtes, génération des rétrospectives) : `pg_cron` ou edge function
  planifiée. Objectifs/quêtes globaux (mêmes pour tous) pour simplicité + effet social.

## 14. Découpage en lots (après validation, ordre par valeur)

| Lot | Contenu | Répond à |
|---|---|---|
| **S0** | Modèle de données + 1 saison authorée + track de progression alimenté par les PS d'entraînement muscu (lecture, Accueil) | « la saison existe et avance » |
| **S1** | **Objectifs quotidiens + Quêtes hebdomadaires** + carte « Contrat du jour » + streak de saison | **le hook quotidien/hebdo** |
| **S3** | **Chronique de Saison** rétrospective + étagère « Saisons » du Livre + Cabinet des Reliques (Profil) | **la rétention émotionnelle / la saga** |
| **S2** | Récompenses complètes (titres, badges datés, cosmétiques, reliques) + flux de réclamation | la raison de monter le track |
| **S4** | Framework d'événements (Défi Développé Couché, Semaine HYROX…) | l'extensibilité long-terme |

Ordre de valeur recommandé : **S0 → S1 → S3 → S2 → S4** (le quotidien puis la saga avant le polish des
récompenses). S1 et S3 répondent directement à la demande de Nathan (« revenir chaque jour » + « nourrir
les Chroniques »).

## 15. Points ouverts (non bloquants, à trancher au fil de l'implémentation)

- Objectifs quotidiens : purement muscu, ou tolérer des rappels bien-être **sans PS** (nutrition/récup) ?
- Courbe exacte du track (nombre de paliers, PS par palier) — à calibrer sur des données réelles en S0.
- Méta-narration inter-saisons (arc L'Ascension → Le Colosse → Le Panthéon → L'Héritage) : scénarisée ou
  purement thématique ?
- Reliques : combien par saison (une finale + jalons ?), et leur représentation visuelle exacte.
