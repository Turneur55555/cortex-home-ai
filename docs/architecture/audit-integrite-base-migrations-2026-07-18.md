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

---

## 8. Journal de validation du pipeline (18/07/2026)

### 8.1 Dry-run du `migrate.yml` corrigé — run `29637391413` (branche)
Dispatch `workflow_dispatch` en `dry_run=true` (aucune migration appliquée).
Résultats **factuels** :
- `supabase link` : ✅ — **accès CI validés** (token + project ref corrects).
- `supabase db push --linked --dry-run` : **s'exécute réellement** et **se connecte
  à la base distante** (« Connecting to remote database... »). Plus aucun
  « Unrecognized flag » : le correctif du flag `--project-ref` est confirmé.
  **Pas de problème de password/secret** (la connexion aboutit).
- Job **rouge** sur échec réel : **plus aucun faux « Push réussi » possible.** ✅
- Étapes post-push (bucket, vérif types) : **sautées** en dry-run comme prévu.

### 8.2 Cause de l'échec du push (attendue) : historique divergent
`db push` refuse car la base contient des versions absentes du repo :
```
Remote migration versions not found in local migrations directory.
supabase migration repair --status reverted 20260708210642 … 20260716165402
```
= les orphelines de §2.3. **C'est le vrai bloqueur** à traiter en réconciliation
manuelle (étape 1 du plan) avant d'appliquer quoi que ce soit.

### 8.3 ⚠️ Effet de bord constaté et neutralisé
L'**auto-repair préexistant** du workflow (hérité, conservé par erreur) a marqué
**3 orphelines `reverted` automatiquement** pendant ce run de validation :
`20260707110600`, `20260708210642`, `20260709165411`.
- **Impact réel : métadonnées uniquement.** Les objets créés par ces migrations
  (`workout_templates`, `stock_history`, workout_engine) **existent toujours**
  (vérifié `to_regclass`). Aucune perte de schéma ni de données.
- L'historique est passé de **135 → 132** migrations enregistrées.
- **C'est précisément la « réparation silencieuse » à proscrire.** → **Auto-repair
  entièrement retiré de `migrate.yml`** (même commit) : le workflow **détecte et
  reporte** désormais les orphelines mais ne les **répare jamais** ; il **échoue
  bruyamment** sur erreur déterministe (orpheline / objet existant / dépendance
  manquante) sans retry ni mutation.

### 8.4 État des orphelines après ce run (10 restantes)
`20260709165428`, `20260709182521`, `20260709215432`, `20260711200853`,
`20260711203309`, `20260711203334`, `20260711211110`, `20260712213330`,
`20260714201321`, `20260716165402`.
Toute opération `migration repair` future sur ces versions devra être **explicite,
justifiée cas par cas, et consignée ici** (aucune ne doit masquer un écart réel).

### 8.5 Statut du plan de remédiation
- **Étape 0 (CI)** : ✅ **validée en conditions réelles** (dry-run) + auto-repair retiré.
- **Étape 1 (réconcilier l'historique)** : ⏳ partiel — surface RPG réconciliée (§9),
  reste les doublons re-timestampés + orphelines non-RPG (§9.5).
- **Étapes 2–5** : ✅ exécutées le 18/07 (§9).

---

## 9. Journal d'exécution RPG (18/07/2026)

### 9.1 Classification des 39 migrations en attente (lecture seule)
Objets créés par chaque migration croisés avec leur existence réelle en base :
- **Doublons déjà matérialisés** (objets présents) → à marquer `applied`, ne pas rejouer.
- **Objets réellement absents** : tables `xp_events`, `seasons`, `sp_events`,
  `user_season_progress` (RPG) ; fonction `compute_level_from_xp` (dépendance R1) ;
  + objets **dormants non utilisés par aucun code** : tables `daily_activity`,
  `exercise_catalog`, `calendar_tokens` (0 référence dans `src/`), `food_search_history`
  (volontairement `DROP` par `20260705120933`), et fonctions badge legacy
  (`award_xp_on_badge`, `award_xp_on_goal_complete`, `award_time_of_day_badges`).

### 9.2 Objets RPG appliqués (idempotents, aucune table TachePaie touchée)
Via `apply_migration` (DDL direct + enregistrement historique) :
1. `compute_level_from_xp(integer)` — `max(1, floor(sqrt(xp/100)))` + recalcul des
   niveaux existants. (repo : `20260718084455_rpg_compute_level_from_xp.sql`)
2. **R1** `20260717120000_rpg_character_xp_backbone` — `xp_events`, `award_character_xp`,
   `award_xp_on_workout_complete`, trigger `trg_award_xp_on_workout_complete`.
3. **S0** `20260717130000_rpg_seasons_s0` — `seasons`, `sp_events`, `user_season_progress`,
   `compute_season_tier`, `award_season_points`, `award_sp_on_workout_complete`,
   trigger `trg_award_sp_on_workout_complete`, **Saison I « L'Ascension » active**.

Versions d'historique alignées sur les fichiers repo (R1/S0) pour ne pas créer de
nouvelles orphelines.

### 9.3 Démonstration end-to-end (transaction ROLLBACK, zéro donnée persistée)
Clôture d'une séance muscu de test → **factuellement vérifié** :
| Étape | Résultat |
|---|---|
| XP event | `workout_muscu=100, streak=15` |
| XP total | 875 → **990** (+115) |
| Niveau | 2 → **3** (`compute_level_from_xp(990)=3`) |
| SP event | `workout_muscu=100` |
| Progression saison | **100 PS / palier 1** |
| Récompense (`useSessionReward`) | **115 XP** sur la séance |

### 9.4 Intégrité TachePaie
Row counts inchangés après opérations : `dossiers=44, dsn=44, ca_praticiens=627,
controle_lignes=929` (identiques à l'audit). **Aucun objet TachePaie modifié.**

### 9.5 Ce qui reste (hors périmètre RPG, décision requise)
- **`types.ts`** : régénération impossible proprement tant que la base héberge
  TachePaie (le générateur ramènerait le schéma paie). Lié à la séparation vers un
  projet Supabase dédié CORTEX (feuille de route validée par Nathan, 18/07).
- Voir §10 pour la réconciliation complète de l'historique (traitée le 18/07,
  scope CORTEX uniquement, TachePaie non touchée).

---

## 10. Réconciliation de l'historique de migrations (18/07/2026, scope CORTEX only)

**Préalable de confiance résolu** : vérification croisée du `project_ref` — repo
(`supabase/config.toml`), base auditée, et preuve indépendante préexistante
(`MIGRATION_AUDIT_REPORT.md`, committé le 17/07 avant cette investigation) confirment
tous `bcwfvpwxzlmkxobvbtzp` / organisation **Icortex**. L'organisation « Taches »
possède un projet Supabase **distinct**, jamais touché par cette session.

**Périmètre explicitement exclu** : aucune donnée ni objet TachePaie modifié ou
supprimé (confirmé par row counts inchangés en fin d'opération, §10.4).

### 10.1 Inventaire complet TachePaie (lecture seule, périmètre confirmé)
21 tables (`dossiers` 44 lignes, `dsn` 44, `taches` 3, `taches_recurrentes` 0,
`echeances` 88, `arrets_maladie` 0, `stc` 0, `contrats` 0, `dossier_documents` 0,
`profiles` 2, `activity_log` 182, `controle_lignes` 929, `ca_praticiens` 627,
`cp_controles` 1, `cp_historique` 6, `imports` 1, `historique_imports` 0,
`regles_analyse` 0, `affiliations_mutuelle` 0, `silae_sync_logs` 20,
`app_settings` 1 — **1948 lignes au total**), 1 vue (`v_briefing_matinal`),
12 triggers, ~24 policies, ~63 index. Fonctions propres : `log_table_activity`,
`update_updated_at`. **Découverte critique** : `set_updated_at` (utilitaire
générique) est utilisée par `regles_analyse` (paie) **et** `user_preferences`
(CORTEX) — créée par CORTEX en tout premier (`20260510000001_shared_updated_at_function`,
avant même TachePaie) — **jamais** incluse dans le périmètre TachePaie, jamais touchée.
Vérifié : **zéro référence** à un objet TachePaie dans `src/` (code CORTEX).

### 10.2 Repair — historique réconcilié (métadonnées uniquement, aucun DDL exécuté)
**10 orphelines distantes supprimées** (`DELETE FROM supabase_migrations.schema_migrations`,
équivalent `migration repair --status reverted`) : `20260709165428`, `20260709182521`,
`20260709215432`, `20260711200853`, `20260711203309`, `20260711203334`,
`20260711211110`, `20260712213330`, `20260714201321`, `20260716165402` — toutes
correspondant à des objets CORTEX déjà existants sous un autre timestamp (workout
engine, exercice_central, hyrox catalog…), aucune ne touchait TachePaie.

**34 migrations locales marquées `applied`** (INSERT metadata, SQL jamais exécuté) :
objets déjà présents en base sous un autre chemin (Lovable/Studio non tracké) ou
fonctions legacy dormantes (`award_xp_on_badge`, `award_xp_on_goal_complete`,
`award_time_of_day_badges` — 0 appel réel dans le code, seulement 1 commentaire) ou
table `exercise_catalog` (superseded par `exercise_reference`, 0 référence code).
Liste complète et justification par version : voir commit associé. Une entrée
(`20260705180000_reconstructed_snapshot_missing_creates`) crée des objets TachePaie
(`activity_log`/`dossier_documents`/`taches_recurrentes`) déjà existants — marquée
`applied` en métadonnées seules, **aucune donnée TachePaie modifiée**.

### 10.3 Gap fonctionnel réel comblé : `daily_activity`
Découverte en classifiant les migrations : `daily_activity` est référencée par du
code **actif** (`src/lib/health/importAppleHealth.ts`, utilisé par
`HealthDataPanel.tsx`, `upsertChunks("daily_activity", …)`) — l'import Apple Health
écrivait silencieusement dans le vide. Table absente en base pour la même raison
racine que le RPG (migration jamais poussée). **Appliquée** (idempotente, additive,
dépendance `touch_updated_at()` vérifiée présente) : la table existe désormais,
la fonctionnalité d'import Apple Health est réparée.

### 10.4 🔴 Retenu — 2 migrations destructrices, décision utilisateur requise
Deux fichiers pending contiennent des `DROP TABLE … CASCADE` visant des **tables
CORTEX vivantes avec données réelles**, jamais exécutés jusqu'ici (bug migrate.yml) :
- `20260619195942` : `DROP TABLE reminders CASCADE` + `DROP TABLE calendar_tokens CASCADE`
  — `reminders` contient **5 lignes réelles**. Zéro référence dans `src/` (feature retirée du code).
- `20260714145745` : `DROP FUNCTION ensure_home_categories_for_me` + `DROP TABLE items/home_subcategories/home_categories CASCADE`
  — **98 lignes réelles** (11+54+33). Zéro référence dans `src/` (feature « Maison » retirée du code).

Le code ne référence plus aucun de ces objets — cohérent avec une suppression de
fonctionnalité voulue mais jamais réellement poussée en base (même cause racine que
le RPG : `migrate.yml` cassé). **Mais supprimer 103 lignes de données réelles est
irréversible** : non exécuté sans confirmation explicite. Confirmé par dry-run CI
(run `29639556315`, 18/07 09:41) : ce sont **les deux seules** migrations qu'un
`db push` réel appliquerait désormais — tout le reste est propre.

### 10.5 Validation post-réconciliation
- Dry-run CI (`29639556315`) : `Push migrations to Supabase` → **success**. Détecte
  et lie exactement les 2 migrations retenues, zéro erreur d'orpheline.
- TachePaie : row counts inchangés (`dossiers=44, dsn=44, ca_praticiens=627,
  controle_lignes=929`) — **confirmé intact**.
- CORTEX : `reminders=5, items=11, home_categories=33` — **confirmé intact** (rien
  supprimé sans confirmation).
- Tests : 391 pass. Typecheck : 0 erreur (hors artefacts sandbox `html-to-image`).
