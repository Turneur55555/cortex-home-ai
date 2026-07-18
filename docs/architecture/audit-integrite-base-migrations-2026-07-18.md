# Audit d'intégrité — Code ⇄ Migrations ⇄ Base de production (18/07/2026)

> Déclenché après la découverte que le backend RPG (R1 + S0), pourtant mergé sur
> `main`, est **absent de la base de production**. L'audit établit l'état réel du
> système avant toute opération DDL. **Aucune migration n'a été appliquée dans le
> cadre de cet audit** (lecture seule + correctif CI uniquement).

Projet Supabase audité : `bcwfvpwxzlmkxobvbtzp` (le seul du compte).

---

## 0. Verdict — le RPG fonctionne-t-il de bout en bout en production ?

**NON. Démontré, vérifié en base :**

| Maillon de la chaîne RPG | Attendu | État réel en prod | Preuve |
|---|---|---|---|
| Trigger XP à la clôture de séance | `trg_award_xp_on_workout_complete` sur `workouts` | **ABSENT** | `pg_trigger` sur `workouts` = ∅ |
| Journal d'XP | table `xp_events` | **ABSENTE** | `to_regclass('public.xp_events')` = null |
| Courbe de niveau | fonction `compute_level_from_xp` | **ABSENTE** | `pg_proc` = ∅ (toute signature) |
| Trigger Points de Saison | `trg_award_sp_on_workout_complete` | **ABSENT** | idem workouts |
| Tables Saisons | `seasons`, `sp_events`, `user_season_progress` | **ABSENTES** | `to_regclass` = null ×3 |
| Front — carte Saison (`useActiveSeason`) | lit `seasons` | requête en **erreur** → carte masquée | `src/hooks/useActiveSeason.ts:49` |
| Front — écran récompense (`useSessionReward`) | lit `xp_events` | requête en **erreur** → « 0 XP » | `src/hooks/useSessionReward.ts:45` |

Conséquence : terminer une séance muscu **n'octroie aucun XP ni PS** (aucun trigger).
L'XP/Niveau affiché provient de valeurs **héritées** de `user_stats` (antérieures à R1),
non alimentées par le moteur R1. Les Saisons sont silencieusement non fonctionnelles.
**Le RPG n'a jamais été actif en production** — ce n'est pas une régression récente
mais une feature jamais réellement déployée.

---

## 1. Cause racine — pourquoi le vert masquait la panne

`.github/workflows/migrate.yml`, étape « Push migrations (with retry) », invoquait :

```bash
supabase db push --yes --include-all --project-ref "$PROJECT_REF" 2>&1 | tee /tmp/push_output.txt
```

Deux défauts cumulés :

1. **`--project-ref` n'est pas un flag valide de `supabase db push`** (CLI 2.109.1 ;
   le projet est déjà lié par `supabase link`). La CLI affiche l'aide et **sort en
   code 0** (« Help requested »).
2. **Le pipe `… | tee`** renvoie le code retour de `tee` (0), pas celui de `db push`.
   Même le `pipefail` par défaut des runners GitHub est neutralisé par le point 1.

Résultat : `if supabase db push … ; then echo "✅ Push réussi"` → **faux succès**, job
**vert**, aucune migration appliquée. Le flag existe depuis la version d'origine du
workflow (`b978d11`) ; il est devenu bloquant quand la CLI a été épinglée à `2.109.1`.
Premier run affecté : merge R1 du 17/07 (run `29574916035`, log explicite).

**Correctif appliqué** (ce commit, aucun DDL) : retrait de `--project-ref` sur
`db push` / `migration list` / `migration repair` (projet lié) ; capture stricte du
code retour via `${PIPESTATUS[0]}` ; garde-fou qui force l'échec si la sortie contient
« Unrecognized flag / Help requested / Usage: » ; `success=true` écrit **uniquement**
sur vrai succès, sinon `exit 1`.

---

## 2. Les 4 états distingués

### 2.1 Présent dans le CODE (`src/integrations/supabase/types.ts` + `src/`)
`types.ts` décrit un schéma **fitness/RPG idéalisé** (~46 tables) incluant les tables
RPG (`seasons`, `xp_events`, `sp_events`, `user_season_progress`) et **omettant** les
~20 tables de l'app de paie co-hébergée. Il ne correspond ni à la base, ni strictement
au repo de migrations.

### 2.2 Présent RÉELLEMENT en base de production (74 tables `public`)
Deux domaines **étanches** cohabitent dans le même schéma `public` :
- **CORTEX** (fitness / nutrition / maison / RPG partiel) ;
- **TachePaie** (paie / cabinet : `dossiers`, `dsn`, `arrets_maladie`, `silae_sync_logs`,
  `ca_praticiens`, `affiliations_mutuelle`, `controle_lignes`, …).

Les tables RPG y sont **absentes**. Cartographie complète en §3.

### 2.3 Présent dans les MIGRATIONS mais jamais appliqué
161 migrations dans le repo, **135** enregistrées en base. Diff :
- **39 migrations « en attente »** (repo, jamais enregistrées sous ce numéro) ;
- **13 « orphelines distantes »** (enregistrées en base, absentes du repo).

La majorité des 39 « en attente » sont en réalité **déjà appliquées sous un autre
numéro de version** (re-timestampées par Lovable / le repair). Exemples de paires :

| Repo (en attente) | Base (orpheline, même migration) |
|---|---|
| `20260707120000_workout_engine_foundation` | `20260707110600` |
| `20260708130000_workout_templates` | `20260708210642` |
| `20260709220000_generic_workout_segments` | `20260709215432` |
| `20260714150000_workouts_one_active_per_user` | `20260714201321` |
| `20260716180000_hyrox_catalog_official_stations` | `20260716165402` |

**Réellement nouvelles** (objets absents de la base) : **seulement 2** —
`20260717120000_rpg_character_xp_backbone` et `20260717130000_rpg_seasons_s0`,
**plus** la fonction `compute_level_from_xp` dont les migrations créatrices
(`20260529061501`, `20260602083143`, `20260704110408`) sont elles aussi « en attente »
et **jamais réellement matérialisées** (fonction absente en base).

### 2.4 Affiché par le FRONT mais absent du BACKEND
- `useActiveSeason` (`seasons`) → carte Saison masquée, requêtes en erreur à chaque Home.
- `useSessionReward` (`xp_events`) → écran de récompense post-séance affiche « 0 XP ».
- Affichage XP/Niveau (`user_stats.xp`) → valeur héritée figée, non pilotée par R1.

---

## 3. Propriété des tables — CORTEX vs TachePaie

Établie par la migration créatrice de chaque table (`create table …`).

**TachePaie (paie/cabinet) — à NE PAS toucher, hors périmètre CORTEX (≈20 tables) :**
`profiles`, `dossiers`, `dossier_documents`, `taches`, `taches_recurrentes`,
`echeances`, `dsn`, `arrets_maladie`, `stc`, `contrats`, `silae_sync_logs`,
`imports`, `historique_imports`, `controle_lignes`, `regles_analyse`,
`affiliations_mutuelle`, `ca_praticiens`, `cp_historique`, `cp_controles`,
`app_settings`, `activity_log`
(origine : `20260521203001_tachepaie_initial_schema` et suivantes 002→005, cp_*).

> ⚠️ `profiles` appartient à **TachePaie**. CORTEX utilise **`users_profiles`**.

**CORTEX (fitness / nutrition / maison / RPG) — le reste (~53 tables) :**
`users_profiles`, `workouts`, `exercises`, `exercise_sets`, `exercise_history`,
`exercise_reference`, `disciplines`, `workout_templates`, `workout_template_exercises`,
`workout_segments`, `workout_analyses`, `user_exercise_illustrations`,
`training_programs`, `program_weeks`, `supplements`, `supplement_logs`,
`user_stats`, `user_badges`, `badges_catalog`, `user_activity`, `goals`,
`user_preferences`, `nutrition`, `nutrition_goals`, `nutrition_favorites`,
`food_preferences`, `foods`, `food_barcodes`, `food_synonyms`, `food_servings`,
`food_quality_scores`, `food_favorites`, `food_custom_foods`, `recipes`,
`recipe_ingredients`, `meal_plans`, `saved_meals`, `saved_meal_items`,
`shopping_list`, `body_tracking`, `health_data_imports`, `weekly_reports`,
`reminders`, `documents`, `user_pdfs`, `items`, `home_categories`,
`home_subcategories`, `stock_history`, `data_backups`, `ai_cache`,
`rate_limits`, `error_logs`.

**Fait vérifié :** le code front CORTEX (`src/`) ne référence **AUCUNE** table
TachePaie (`grep from('<table_paie>')` = ∅). Les deux domaines sont étanches côté code.

---

## 4. Analyse de risque — appliquer les migrations RPG

### 4.1 Risque de `supabase db push --include-all` (rejouer TOUT le pending)
**Élevé.** Tenterait de rejouer les **39** en attente dans l'ordre. La plupart
recréent des objets **déjà existants**. Si une seule n'est pas parfaitement
idempotente (`CREATE POLICY` sans garde, `ALTER … ADD COLUMN` sans `IF NOT EXISTS`,
`INSERT` de seed sans `ON CONFLICT`), le push **s'arrête** et les migrations RPG
(en fin de file) **ne sont jamais atteintes** — exactement le blocage historique.
→ **Ne pas utiliser `db push --include-all` en l'état.**

### 4.2 Dépendance bloquante : `compute_level_from_xp`
R1 (`award_character_xp`) appelle `public.compute_level_from_xp(new_xp)`.
Cette fonction est **absente de la base**. Appliquer R1 **sans** la créer d'abord →
le trigger `trg_award_xp_on_workout_complete` lèverait une exception à la **première
clôture de séance muscu** → rollback de l'`UPDATE workouts.status = 'completed'` →
**l'utilisateur ne peut plus enregistrer ses séances.** Régression critique.
→ La fonction doit exister **avant** le trigger R1.

### 4.3 Idempotence & innocuité paie des 2 migrations RPG
Les fichiers R1/S0 sont **idempotents** (`CREATE TABLE IF NOT EXISTS`,
`CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS`, `CREATE INDEX IF NOT EXISTS`,
`INSERT … ON CONFLICT DO NOTHING`). Dépendances vérifiées **présentes** en base :
`workouts(discipline,status,date,user_id,created_at)`, `exercise_sets(weight,exercise_id)`,
`exercises(exercise_reference_id,name,workout_id)`, `user_stats(xp,level,total_actions)`.
**Seule** dépendance manquante : `compute_level_from_xp` (§4.2).
Elles ne touchent **aucune** table TachePaie (créent des tables RPG neuves + 2 triggers
sur `workouts`, table CORTEX). Risque pour la paie : **nul**.

### 4.4 Risque de `supabase migration repair` en masse
Aligner les 13 orphelines / 39 en attente via `repair` modifie l'historique
`schema_migrations` (métadonnées, pas de DDL destructif). Risque **modéré** mais
demande de la rigueur : marquer `applied` ce qui existe déjà, `reverted` ce qui n'a
pas lieu d'être, sans jamais laisser `db push` rejouer un objet existant non idempotent.

---

## 5. Plan de remédiation (proposé — aucune étape exécutée)

**Objectif : remettre en cohérence code ⇄ migrations ⇄ base, RPG réellement actif,
sans jamais toucher TachePaie ni casser l'enregistrement des séances.**

- **Étape 0 — CI (FAIT).** Correctif `migrate.yml` : plus aucun faux « Push réussi ».
  À valider au prochain `workflow_dispatch` contrôlé (voir risque password §6).
- **Étape 1 — Réconcilier l'historique de migrations.** Marquer `applied` (via
  `migration repair --status applied`) les 37 « en attente » dont les objets existent
  déjà, pour que `db push` ne les rejoue jamais. Vérifier chaque cas (objet réellement
  présent). Aucune DDL sur les données.
- **Étape 2 — Matérialiser la dépendance `compute_level_from_xp`.** L'appliquer seule
  et vérifier `to_regprocedure('public.compute_level_from_xp(integer)')`.
- **Étape 3 — Appliquer R1 puis S0**, isolément (pas `--include-all` aveugle), et
  vérifier après chaque : tables/fonctions/triggers créés ; **test de non-régression :
  compléter une séance muscu de test → séance bien enregistrée + 100 XP + PS si saison
  active.**
- **Étape 4 — Régénérer `types.ts` depuis la base** (`npm run gen:types`) une fois la
  base cohérente, décider du sort des tables TachePaie dans les types (voir §6).
- **Étape 5 — Re-vérifier** `supabase-types.yml` (doit passer) et rejouer la
  démonstration RPG de bout en bout.

---

## 6. Décisions de fond à trancher (hors code)

1. **Co-hébergement CORTEX + TachePaie dans un même projet/schéma `public`.**
   Tant qu'ils cohabitent, `supabase gen types` ramène le schéma paie dans le
   `types.ts` de CORTEX (fuite de schéma + bruit). Options : projet Supabase dédié à
   CORTEX ; schéma dédié ; ou filtre de génération. **Décision produit/archi requise.**
2. **Secret `SUPABASE_PROJECT_REF` / password DB en CI.** Après le correctif, valider
   que `supabase db push --linked` dispose bien des accès (un `SUPABASE_DB_PASSWORD`
   peut être nécessaire selon la CLI). Le workflow échouera désormais **bruyamment** si
   ce n'est pas le cas — c'est le comportement voulu.

---

## 7. Ce qu'il ne faut PAS faire

- ❌ Lancer `supabase db push --include-all` en l'état (rejoue 39 migrations, risque
  d'arrêt sur objet existant, RPG jamais atteint).
- ❌ Committer un `npm run gen:types` de « bootstrap » maintenant (écraserait les types
  RPG et injecterait le schéma paie).
- ❌ Appliquer R1 avant d'avoir matérialisé `compute_level_from_xp` (casse
  l'enregistrement des séances).
- ❌ Toute opération sur les tables TachePaie.
