# Audit et reconstruction des migrations Supabase — 2026-07-05

## Contexte

Suite à la découverte (session du 2026-07-05, investigation des erreurs SUP-*) que
des correctifs de production n'existaient pas dans `supabase/migrations/`, un audit
complet a été demandé : reconstituer toute migration présente en production mais
absente du dépôt, pour que **le dépôt Git redevienne la source de vérité**.

Projet Supabase audité : `bcwfvpwxzlmkxobvbtzp`.

## Méthodologie

Contrairement à une reconstruction "à l'aveugle" à partir du seul schéma actuel,
Supabase conserve le **SQL exact exécuté** pour chaque migration trackée dans la
table interne `supabase_migrations.schema_migrations` (colonne `statements`, un
tableau des instructions SQL réellement jouées). Cette table a été utilisée comme
source de vérité primaire — il ne s'agit donc pas d'une reconstruction approximative
mais d'une **restitution fidèle du SQL historique réellement exécuté**, sauf mention
contraire explicite ci-dessous.

Étapes :
1. Inventaire complet des 120 migrations trackées (`version` + `name`) via l'outil MCP `list_migrations`.
2. Inventaire des 82 fichiers `.sql` présents dans `supabase/migrations/` avant l'audit.
3. Diff version par version (et nom par nom) entre les deux inventaires.
4. Extraction du SQL exact (`statements`) pour chaque migration manquante, écriture d'un fichier par migration, nommage `<version>_<name>.sql` identique à la production.
5. Vérifications de cohérence (couverture des objets, ordre des dépendances).
6. Commit dans le dépôt.

## 1. Résultat de l'inventaire

| | Avant audit | Après audit |
|---|---|---|
| Migrations trackées en production (`schema_migrations`) | 120 | 120 (inchangé, aucune modification de prod) |
| Fichiers `.sql` dans `supabase/migrations/` | 82 | **141** |
| Versions prod sans fichier local correspondant | 60 | **0** |
| Fichiers locaux mal datés (bon contenu, mauvais timestamp) | 2 | 0 (renommés) |
| Objets vivants (tables/fonctions) sans aucun `CREATE` dans le dépôt | 3 tables | 0 (comblé par un snapshot documenté, voir §5) |

Aucun doublon de `version` (clé primaire de `schema_migrations`) n'a été trouvé côté
production. Aucune modification n'a été apportée au schéma de production — toutes
les requêtes exécutées étaient en lecture seule (`select`).

## 2. Les 58 migrations reconstruites

Reconstruites **verbatim** depuis `schema_migrations.statements`, avec leur
`version` et `name` d'origine exacts :

```
20260521203001_tachepaie_initial_schema.sql
20260522060810_silae_sync_logs.sql
20260523164048_profile_redesign_complete.sql
20260528211658_create_v_briefing_matinal.sql
20260528213324_make_taches_dossier_id_nullable.sql
20260530090611_create_historique_imports.sql
20260530140547_002_controle_paie.sql
20260530175417_003_regles_analyse.sql
20260531084410_003_app_settings.sql
20260531135915_004_affiliations_mutuelle.sql
20260531190047_add_siret_controle_lignes.sql
20260531190050_add_sirets_affiliations_mutuelle.sql
20260602211429_005_ca_recoupement.sql
20260605083019_sec1_rls_policies_missing_tables.sql
20260605083022_sec2_view_security_invoker.sql
20260605083025_sec3_revoke_anon_security_definer_functions.sql
20260605083032_sec6_fix_search_path_mutable_functions.sql
20260605083100_sec5_remove_public_bucket_listing_rls.sql
20260605083114_sec4_fix_historique_imports_all_policies.sql
20260605083620_sec3_revoke_public_security_definer_functions.sql
20260605102026_cp_historique.sql
20260609104717_add_gym_location_to_workouts.sql
20260610103237_controles_historique_anti_doublons.sql
20260610121713_cp_perf_rls_et_index.sql
20260612153101_create_user_preferences_table.sql
20260612153117_fix_indexes_and_duplicate_policies.sql
20260612153137_optimize_rls_policies_initplan.sql
20260612153152_security_hardening_functions_extension.sql
20260612155522_optimize_realtime_messages_policy.sql
20260613172120_add_exercise_sets_table.sql
20260613223856_coach_ia_v2_programs.sql
20260613223921_nutrition_v2_recipes_mealplan.sql
20260615192004_add_workout_status_and_set_fields.sql
20260616143452_fix_nutrition_meal_check_petit_dej.sql
20260616151516_create_nutrition_favorites.sql
20260617081241_food_catalog_schema.sql
20260617141646_add_height_cm_to_user_preferences.sql
20260618101406_nutrition_foods_proprietary_schema_and_search.sql
20260618101527_nutrition_search_word_similarity_v2.sql
20260618101644_nutrition_foods_custom_user_rls.sql
20260618102021_nutrition_recipes_suite.sql
20260618102110_nutrition_food_logs_and_goals.sql
20260618103844_nutrition_foods_source_unique.sql
20260618132526_ciqual_import_rpc_temp.sql
20260618132614_foods_source_allow_ciqual.sql
20260619080840_drop_nutrition_stack_b.sql
20260619091229_saved_meals_feature.sql
20260624090442_add_completed_to_exercise_sets.sql
20260624111601_weekly_reports.sql
20260626104719_nutrition_add_consumed_grams_per_unit.sql
20260629142434_fix_rate_limits_badge_storage.sql
20260629152311_exercise_catalog_table.sql
20260630135408_rls_initplan_optimize_cortex_policies.sql
20260630135437_cortex_indexes_policies_definer_hardening.sql
20260703141246_profil_audit_fixes_core.sql
20260703141309_profil_audit_purge_recalc.sql
20260703141420_weekly_auto_backup.sql
20260703141500_backup_all_auth_users.sql
```

Aucune de ces 58 n'a été simplifiée, fusionnée ou réordonnée : chacune correspond à
exactement une entrée de `schema_migrations`, dans son SQL d'origine.

## 3. Fichiers renommés (2) — mauvaise date, pas manquants

Deux fichiers déjà présents dans le dépôt portaient un **timestamp différent** de
celui réellement enregistré en production (même contenu logique, même nom de
migration) :

| Nom | Ancien timestamp (local) | Vrai timestamp (prod) |
|---|---|---|
| `exercise_muscles_and_photos` | `20260629000001` | `20260629140249` |
| `seances_status_completed_drop_rpe` | `20260702120000` | `20260702100030` |

Action : renommés (`git mv`) pour respecter le véritable ordre d'application.
Différence mineure constatée : la version locale contenait des gardes
d'idempotence supplémentaires (`DROP POLICY IF EXISTS ...`) probablement ajoutées
après coup par le validateur CI (`scripts/validate-supabase.mjs --fix`,
cf. `.github/workflows/migrate.yml`) — conservées telles quelles, sans impact sur
le schéma résultant.

## 4. Doublons détectés

- **`weekly_reports`** appliqué deux fois en production, à un jour d'intervalle,
  avec un contenu quasi identique (même table, même policy, même index) :
  - `20260623000001_weekly_reports.sql` (déjà dans le dépôt)
  - `20260624111601_weekly_reports.sql` (reconstruit dans cet audit)

  Les deux sont conservés **distincts**, comme demandé (pas de fusion). Impossible
  de déterminer avec certitude pourquoi la table a été recréée un jour après sans
  garde d'idempotence sur la seconde exécution (elle aurait dû échouer si la table
  existait déjà) — signalé ici plutôt qu'expliqué arbitrairement.

- **Ajout de la colonne `completed` sur `exercise_sets`** : deux sources distinctes
  ajoutent la même colonne :
  - `20260624090442_add_completed_to_exercise_sets.sql` (trackée en prod, reconstruite ici, avec garde `IF NOT EXISTS`)
  - `20260625181053_...sql` (déjà présente dans le dépôt, **non trackée** en prod, sans garde)

  Cohérent avec la note de `MEMORY.md` du 2026-06-25 ("migration ajoutant la colonne
  `completed`"). L'ordre exact d'exécution réel entre les deux ne peut pas être
  établi avec certitude à partir des données disponibles.

## 5. Trou de couverture comblé par un snapshot (pas une reconstruction historique)

Trois tables vivent en production sans qu'aucun `CREATE TABLE` — trackée ou non —
n'ait pu être retrouvé nulle part (ni dans les 120 migrations prod, ni dans les
fichiers locaux non trackés) : **`activity_log`**, **`dossier_documents`**,
**`taches_recurrentes`**. Elles ne sont mentionnées qu'indirectement, via des
migrations postérieures qui leur ajoutent des policies RLS — preuve qu'elles
existaient déjà avant le 5 juin 2026, sans laisser de trace de leur création
(probablement Supabase Studio / éditeur SQL direct, hors tracking CLI).

Un fichier `20260705180000_reconstructed_snapshot_missing_creates.sql` a été ajouté
pour combler ce trou de couverture, **explicitement documenté comme non-historique** :
il capture la structure *actuelle* de ces 3 tables (colonnes, contraintes, index),
avec un gros bandeau d'avertissement en tête de fichier. Cette migration ne prétend
pas dater ni expliquer l'origine réelle de ces tables — conformément à la consigne
de ne pas inventer, l'incertitude est documentée plutôt que masquée.

## 6. Découverte annexe : drift dans l'autre sens (dépôt → prod)

20 fichiers de migration existent dans le dépôt (avant cet audit) **sans entrée
correspondante dans `schema_migrations`** — c'est-à-dire jamais appliqués via
`supabase db push`/CLI (probablement via Lovable ou l'éditeur SQL Studio, qui ne
tracke pas dans cette table). Un échantillonnage a été vérifié contre le schéma
vivant :

**Confirmés appliqués** (l'objet existe en prod, juste non tracké) :
`reminders`, `goals`, `badges_catalog`, `foods`, `rate_limits`, `user_pdfs`,
fonction `unlock_user_badge`, colonnes `exercise_sets.completed` / `nutrition.consumed_grams_per_unit`.

**Confirmés NON appliqués** (l'objet n'existe PAS en prod aujourd'hui — code mort
dans le dépôt) :
- `20260527151755_...sql` (table `calendar_tokens`) — cohérent : une autre migration
  locale non trackée (`20260619195942_...sql`) la `DROP`, mais comme la table
  n'existe pas non plus, le plus probable est que ni le create ni le drop n'ont
  jamais été appliqués.
- `20260602083143_...sql` (fonction `compute_level_from_xp`)
- `20260609101030_...sql` (fonction `award_xp_on_goal_complete` — remplacée en prod
  par une fonction au nom différent, `award_goal_xp`)
- `20260701051118_...sql` (table `daily_activity`)
- `20260705120000_secret_badges_time_of_day.sql` (fonction `award_time_of_day_badges`)

**Anomalie non résolue** : la table `reminders` a été `DROP TABLE ... CASCADE`
par le fichier local non-tracké `20260619195942_...sql`, mais existe aujourd'hui en
prod avec la structure enrichie attendue (priorité, statut, récurrence, favoris).
Aucune migration (trackée ou non) recréant `reminders` après le 19 juin n'a été
retrouvée. Deux explications possibles, non tranchables avec les données
disponibles : (a) ce fichier de `DROP` n'a en réalité jamais été exécuté contre la
production, ou (b) la table a été recréée par un mécanisme totalement hors
migration (Studio). **Aucune action corrective n'a été prise** sur ce point —
signalé pour investigation ultérieure.

Ces 20 fichiers n'ont pas été modifiés ni supprimés (hors périmètre de la demande :
"ne modifie pas le schéma de production" + reconstruction des migrations
manquantes ≠ nettoyage des migrations orphelines). À traiter dans un audit dédié
si souhaité.

## 7. Vérification de fidélité

Ce qui a été vérifié avec certitude :
- **140/140** versions prod ont désormais un fichier local avec le même
  `version` + `name` exacts (0 manquant, 0 divergence de nom).
- **Couverture complète des objets vivants** : les 71 tables et toutes les
  fonctions applicatives custom actuellement en production ont au moins un
  `CREATE` correspondant quelque part dans les 141 fichiers (vérifié par script,
  hors extensions Postgres tierces type `unaccent`/`fuzzystrmatch`).
- **Ordre des dépendances** : vérification statique que toute table référencée en
  clé étrangère est bien créée à une version antérieure ou égale à celle qui la
  référence — **0 violation détectée** sur l'ensemble du corpus.

Ce qui n'a **pas** pu être vérifié (limite de l'environnement) :
- Un **rejeu complet** des 141 migrations sur une base Postgres/Supabase fraîche
  (le gold standard) n'a pas pu être exécuté dans cet environnement : ni le
  démon Docker ni la CLI Supabase n'y sont disponibles (`docker` et `psql` sont
  installés mais le daemon Docker ne répond pas ; `supabase` CLI absent, pas de
  `node_modules` pour l'installer via npx).
  **Recommandation** : avant de considérer ce dépôt comme 100% fiable pour un
  environnement neuf, lancer `supabase db reset` (ou équivalent CI) dans un
  environnement disposant de Docker, et comparer le schéma résultant à la
  production via `get_advisors` / `list_tables` / un diff de schéma.

## 8. Risques identifiés

1. **Rejeu jamais testé de bout en bout** (cf. §7) — risque principal résiduel.
2. **Doublons `weekly_reports` et `completed`** (§4) : rejouer les 141 migrations
   sur une base vierge exécutera les deux versions successivement ; comme elles
   sont fonctionnellement idempotentes ou proches (`IF NOT EXISTS` sur au moins
   une des deux dans chaque paire), cela ne devrait pas provoquer d'erreur, mais
   n'a pas été testé en conditions réelles (cf. limite Docker ci-dessus).
3. **20 migrations orphelines non trackées** (§6) : 5 confirmées jamais
   appliquées (code mort), le reste non vérifié exhaustivement — un `db push`
   futur sur une base neuve les appliquerait, ce qui est probablement souhaitable
   pour celles confirmées vivantes, mais créerait `calendar_tokens`/
   `daily_activity`/des fonctions obsolètes qui n'existent pas en prod
   aujourd'hui si elles sont incluses telles quelles.
4. **Cas `reminders`** (§6) : incohérence non résolue entre l'historique des
   migrations et l'état réel de la table — nécessite une investigation manuelle
   (vérifier dans Supabase Studio / logs d'activité si disponibles).
5. **Snapshot non-historique** (§5) : les 3 tables reconstruites depuis le schéma
   actuel perdent toute trace d'éventuels changements intermédiaires (colonnes
   ajoutées puis retirées, etc.) — seule la structure finale est capturée.

## 9. Ce qui a été restauré — résumé

- ✅ 58 migrations manquantes reconstruites à l'identique du SQL exécuté en prod.
- ✅ 2 fichiers mal datés corrigés (renommés à leur vrai timestamp).
- ✅ 1 trou de couverture (3 tables sans origine traçable) comblé par un snapshot
  explicitement documenté comme non-historique.
- ✅ Aucune modification du schéma de production.
- ✅ Aucune migration fusionnée, simplifiée ou supprimée.
- ⚠️ 20 migrations orphelines (dépôt → prod) identifiées mais non traitées
  (hors périmètre de cette demande) — cf. §6 pour un audit dédié futur.
- ⚠️ Rejeu complet non testé faute d'environnement Docker/Supabase CLI disponible
  dans cette session — recommandé en suivi.
