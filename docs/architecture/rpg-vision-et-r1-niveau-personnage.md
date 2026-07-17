# RPG CORTEX — Vision cible & Lot R1 : le Niveau de Personnage

> Document de conception. Écrit AVANT toute implémentation, à la demande de Nathan
> (« je veux une analyse complète avant toute implémentation »).
> Aucune ligne de code applicatif n'est modifiée par ce document.
>
> Statut : analyse validée par Nathan. Vision validée. Démarrage retenu : **R1**.
> Règle fondamentale posée par Nathan : **la musculation est la source primaire d'XP.**

---

## 0. Résumé exécutif

Le module RPG existant est **techniquement remarquable et narrativement dispersé** : un moteur
de Rang/Maîtrise par exercice de très bon niveau, mais entouré de 3 autres systèmes de
progression qui se recouvrent (XP/Niveau global orphelin, Badges serveur, ~180 Succès client),
et cantonné à la seule musculation.

La vision cible hiérarchise le tout autour d'**une seule colonne vertébrale : le Niveau de
Personnage (XP globale)**, alimentée par toutes les actions de l'app, **la musculation restant
la source primaire et non plafonnée** ; les rangs par exercice/spécialité restent indépendants
au-dessus ; les badges/succès deviennent la strate de prestige.

Le Lot **R1** pose cette colonne vertébrale.

---

## 1. Critique détaillée du module actuel

### 1.1 Cartographie (vérifiée dans le code)

| Sous-système | Fichiers | Rôle réel |
|---|---|---|
| **Moteur Rang/Maîtrise** | `src/lib/fitness/rank/` (`engine.ts`, `config.ts`, `types.ts`, `familyClassification.ts`) | Rang par exercice (0→29 = 6 rangs × 5 niveaux) depuis la **force relative** (1RM estimé / poids de corps par famille) + modificateurs volume/qualité, **gates de confirmation** Olympien/Primordial, décroissance d'inactivité. Maîtrise (0-100 %) = consolidation + momentum. Pur, config-driven, testé (283 lignes). |
| **DA « Reliquary »** | `exerciseRanks.ts`, `rankVisuals.ts`, `rarityVisuals.ts`, `RankAmbientParticles`, `MasteryBar`, `ExerciseRank{Badge,Card,Strip}` | Mythologie grecque (Mortel→Guerrier→Héros→Titan→Olympien→Primordial), atmosphères, sigils, particules. |
| **Badges** (serveur) | `badges.ts`, `useBadgeSystem.ts`, tables `badges_catalog`/`user_badges` | Débloqués client, persistés, 7 critères, récompensent de l'**XP**. |
| **Succès** (client, additif) | `src/lib/profile/achievements/` (~180 succès, 14 catégories) | Recalculés en direct, jamais persistés. **Système parallèle aux badges.** |

### 1.2 Systèmes de progression parallèles

- **Rang/Maîtrise par exercice** — le système vivant.
- **Niveau/XP global** (`user_stats.xp/level`) — alimenté par les `xp_reward` des badges/objectifs,
  **mais l'affichage « Niveau X / XP » a été retiré du Hero** (`ProfileHeroCard.tsx`, documenté comme
  « source de confusion »). ⇒ L'XP est **gagnée mais invisible** : une monnaie fantôme.

### 1.3 Plomberie XP existante (à réutiliser, pas réinventer)

- `user_stats(user_id, xp, level, total_actions)` — **écriture client interdite** (policies retirées,
  migration `20260603091130`). Seuls des triggers `SECURITY DEFINER` la modifient. Socle inviolable idéal.
- Courbe serveur : `compute_level_from_xp(xp) = FLOOR(SQRT(xp/50)) + 1` (migration `20260529061501`).
- XP versée aujourd'hui **uniquement** par 2 triggers : `trg_award_xp_on_badge` (déblocage badge) et
  `trg_award_xp_on_goal_complete` (objectif complété). **Séances, nutrition, HYROX, Course ne versent RIEN.**
- ⚠️ **Incohérence** : le client `badges.ts:66` (`xpForLevel = level²·100`) n'utilise pas la même courbe
  que le serveur (`xp/50`). À réconcilier sur une source unique.

### 1.4 Trois faiblesses structurelles

1. **Quatre systèmes de progression concurrents**, sans hiérarchie claire de « ce qui compte ».
2. **RPG mono-discipline** : le moteur ne classe que des familles de musculation. Cardio/HYROX/
   Course/Nutrition/Guidé ne produisent aucun rang ni aucune XP. La « Phase 2 » (Rang sur
   `workout_segments`) n'a jamais démarré.
3. **Le pic émotionnel est caché** : la montée de rang (`RankUpOverlay`) ne se déclenche qu'à
   l'ouverture manuelle de la fiche d'un exercice (`ExerciseRankCard.tsx`, via `localStorage`),
   jamais à la clôture d'une séance.

---

## 2. Ce qui fonctionne (à préserver absolument)

- Le moteur Rang/Maîtrise (séparation Rang = niveau réel / Maîtrise = progression).
- La force relative (1RM/poids de corps) comme signal primaire.
- Les gates de confirmation Olympien/Primordial (anti-triche, prestige réel).
- L'architecture propre : `lib/` pur, `hooks/` branchent Supabase, `components/` affichent.
- L'architecture additive des succès (`tierBuilder.ts`).
- **Accueil = fiche de personnage** (décision d'archi « AAA » à conserver).
- La DA Reliquary.

---

## 3. Ce qui doit être supprimé / unifié

- **Code mort** : `src/components/profile/rpg/QuestsPanel.tsx` (aucun importeur) et tout
  `src/components/fusion/` (`FusionDashboard.tsx`, aucun importeur).
- **`exerciseDifficulty()` / `DIFFICULTY_RULES`** (`exerciseRanks.ts`) — à auditer (probable legacy
  coexistant avec `familyClassification.ts`).
- **Doublon de catégories** badges vs succès (`strength`, `nutrition`, `consistency`…) — à fusionner
  sous un vocabulaire unique (les deux utilisent déjà `BadgeRarity`).

> « Supprimer » = retirer du code mort + unifier des doublons, **jamais** casser une fonctionnalité
> vécue par l'utilisateur.

---

## 4. Ce qui doit être amélioré

1. Unifier la monnaie de progression autour du Niveau de Personnage (R1).
2. Déclencher le RankUp à la clôture de séance (R2).
3. Réconcilier les dérivations de rang (`chronicles.projectVolumeToRankTier` vs moteur réel).
4. Rendre la fenêtre de calcul honnête (rang basé sur ~8 exercices × ~60 dernières séances).
5. Fusionner badges + succès dans une seule Salle des trophées.

---

## 5. Ce qui manque

- Le RPG pour les 5 autres univers (spécialités Endurance/Hybride/Guidé/Nutrition).
- Un Niveau/Rang de Personnage global lisible (le « chiffre-roi »).
- La Nutrition comme pilier RPG (aujourd'hui : 1 seul badge `protein_days`).
- Une méta-boucle de saison (raison de revenir chaque semaine).
- Un feedback de contribution en séance (« ce que cette séance a rapporté au personnage »).

---

## 6. Vision cible

> **« Chaque effort, dans chaque univers, fait grandir UN personnage — mais la salle de muscu
> reste le cœur qui bat. »**

```
        NIVEAU DE PERSONNAGE  ← colonne vertébrale (XP globale)
        alimenté par TOUTES les actions ; MUSCU = source primaire non plafonnée
                    ▲
    ┌───────────┬───────────┬───────────┬───────────┐
  Force      Endurance    Hybride   Alchimiste   …   (spécialités = rangs indépendants,
 (muscu)     (course)    (HYROX)   (nutrition)         moteur intact, AU-DESSUS de l'XP)
                    ▲
        Collection & Saga (badges ⊕ succès unifiés, Chroniques = récit des montées)
```

- **Accueil** → Niveau de Personnage.
- **Arène / Forge** → la spécialité concernée monte, visible en direct.
- **Chroniques** → la saga des montées.
- **Nutrition** → multiplicateur + spécialité « Alchimiste ».
- **HYROX / Course** → spécialités de soutien.

---

## 7. Roadmap (lots priorisés)

| Lot | Objet | Risque |
|---|---|---|
| **R1** | Le Niveau de Personnage, colonne vertébrale (ce doc, §8) | moyen (migration `user_stats`) |
| **R2** | Le RankUp / gain d'XP célébré à la clôture de séance | faible |
| **R3** | Salle des trophées unifiée (badges ⊕ succès) | faible |
| **R4** | Spécialité Endurance (Course) — 1re extension multi-univers | moyen |
| **R5** | Spécialités HYROX + Guidé + Nutrition | moyen |
| **R6** | Méta-boucle de saison | moyen |
| **R0** | Nettoyage code mort + convergence des dérivations (fait en continu) | faible |

> Ordre validé par Nathan : **R1 d'abord** (fondation), puis R2 (impact émotionnel), puis
> nettoyage/unification.

---

## 8. Lot R1 — Le Niveau de Personnage (spécification)

### 8.1 Règle fondamentale : la musculation est la source primaire

> Un utilisateur qui fait uniquement de la marche, ou qui respecte parfaitement sa nutrition,
> **ne doit jamais dépasser en progression RPG** un utilisateur qui s'investit réellement en
> musculation.

Cette règle est garantie **par construction** (mécanismes structurels), pas par un équilibrage
fragile de chiffres :

- **Musculation = seule lane non plafonnée.** Plus on s'entraîne, plus on gagne.
- **Disciplines de soutien = XP réduite ET plafond hebdomadaire.** Au-delà du plafond, elles
  continuent d'exister (rangs, badges, historique) mais ne versent plus d'XP globale.
- **Nutrition = multiplicateur, jamais source autonome.** Sans musculation, le multiplicateur
  s'applique à ~0 → impossible de progresser via la seule nutrition.

### 8.2 Barème proposé (config ajustable, comme `rank/config.ts`)

| Source | Rôle | XP |
|---|---|---|
| **Séance musculation complétée** | Primaire | **100** (× multiplicateur nutrition) |
| Nouveau PR musculation | Récompense ponctuelle | +50 *(différé R1.1 — détection PR serveur)* |
| Montée de rang de spécialité | Récompense ponctuelle | +200 *(versé par R2)* |
| **Séance de soutien** (HYROX / Course / Cardio / Guidé) | Soutien | **40**, plafonné |
| **Plafond hebdomadaire soutien** | Garde-fou | **150 XP / semaine** (au-delà : 0) |
| Streak — jour d'activité consécutif | Fidélité | +15 *(différé R1.1)*, dans le plafond soutien |
| Journée nutrition (objectif protéines atteint) | Multiplicateur | **pas d'XP propre** → voir §8.3 |
| Objectif (quête) complété | Ponctuel | inchangé (`xp_reward` existant) |
| Badge débloqué | Ponctuel | inchangé (`xp_reward` existant) |

### 8.3 Le multiplicateur nutrition (mécanisme anti-abus clé)

La régularité nutritionnelle **n'octroie pas d'XP en propre** ; elle **multiplie l'XP des séances
musculation** :

- 0–2 jours d'objectif protéines sur les 7 derniers → ×1.00
- 3–6 jours → **×1.05**
- 7/7 jours → **×1.10**

Conséquence structurelle : un utilisateur « nutrition parfaite mais zéro muscu » multiplie une XP
muscu nulle ⇒ gagne ~0 XP de sa nutrition. La nutrition **récompense l'assiduité de l'athlète**,
elle ne **remplace jamais** l'entraînement.

### 8.4 Invariant garanti (preuve d'ordre)

```
XP_hebdo(muscu régulier)   ≈ 3–4 séances × 100 × (≤1.10) + ponctuels
                            ≈ 330–500+ XP/sem      ── NON plafonné
XP_hebdo(soutien seul)     ≤ plafond soutien (150) + streak borné
                            ≈ 150–250 XP/sem       ── PLAFONNÉ
XP_hebdo(nutrition seule)  ≈ 0                      ── multiplicateur × 0 muscu

⇒  muscu_régulier  >  soutien_seul  >  nutrition_seule   (garanti par construction)
```

### 8.5 Architecture technique (additive, ne casse rien)

1. **Verseur central** `award_character_xp(_user_id, _source, _base_amount)` — `SECURITY DEFINER`,
   factorise l'`INSERT … ON CONFLICT` + recalcul du niveau des 2 triggers existants. Applique le
   multiplicateur nutrition et le plafond de soutien selon `_source`. Les triggers badge/objectif
   actuels l'appellent (zéro régression).
2. **Table `xp_events(user_id, source, amount, created_at)`** — RLS lecture seule client. Nécessaire
   pour (a) faire respecter le plafond hebdo de soutien (sommer l'XP soutien de la semaine) et
   (b) alimenter le futur « journal d'XP » / feedback de contribution (R2).
3. **Trigger sur `workouts`** (AFTER INSERT, séance complétée) :
   - `discipline = 'muscu'` → `award_character_xp(user, 'workout_muscu', 100)` (× mult. nutrition).
   - sinon → `award_character_xp(user, 'workout_support', 40)` (borné au plafond hebdo soutien).
4. **Réconciliation de la courbe** : garder `sqrt(xp/50)+1` côté serveur (n'invalide aucune XP déjà
   gagnée) ; corriger le client (`badges.ts` / nouveau `characterLevel.ts`) pour afficher le **même**
   niveau. Source unique.
5. **UI Accueil** : `ProfileHeroCard` réaffiche le **Niveau de Personnage** (barre XP vers le niveau
   suivant) comme chiffre-roi, sous le titre de rang mythologique (anti-doublon : le rang reste un
   sous-titre, le Niveau devient la barre principale). `useUserStats` fournit déjà `xp/level`.

### 8.6 Périmètre R1 (v1) vs différé

- **Dans R1 v1** : `xp_events` + `award_character_xp` + multiplicateur nutrition + plafond soutien +
  trigger `workouts` (muscu vs soutien) + réconciliation courbe + réaffichage Niveau sur l'Accueil.
- **Différé R1.1 / R2** : bonus PR (détection serveur), bonus streak, bonus montée de rang (naturel
  avec R2 « RankUp à la clôture »).

### 8.7 Invariants de non-régression

- Aucune écriture client directe sur `user_stats` (règle serveur conservée).
- Moteur Rang/Maîtrise **non touché** (les rangs restent indépendants du Niveau).
- XP déjà accumulée conservée (courbe serveur inchangée).
- Aucune feature existante retirée ; aucun doublon de composant créé.
- `lib/` reste sans couleur ni React ; logique métier hors composants Lovable.
- Migration déployée via le flux normal (fichier `supabase/migrations/` → CI), pas appliquée en
  direct sur la prod depuis une session.
