# Journal de migration — Backfill historique exercice-central (Phase 3, Étape 3)

Ce journal consigne chaque exécution du script [`supabase/scripts/phase3_step3_backfill_historique.sql`](../supabase/scripts/phase3_step3_backfill_historique.sql), qui relie les occurrences historiques (`exercises` pour la musculation, `workout_segments` pour les autres disciplines) au référentiel universel `exercise_reference`.

Le script est **idempotent** : il ne touche que les lignes dont `exercise_reference_id` / `exercise_id` est encore `NULL`. Il peut être relancé sans risque sur le même environnement (no-op si tout est déjà backfillé) ou exécuté sur un autre environnement (staging, autre projet Supabase) pour reproduire la même opération. Consigner une nouvelle entrée ci-dessous à chaque exécution, sur n'importe quel environnement.

## Règle de normalisation anti-doublon (valable pour toutes les exécutions)

Avant de créer une nouvelle référence pour un nom donné, le script vérifie s'il existe déjà, dans la même discipline, une référence dont le nom est identique **à la casse près** (`lower(trim(name)) = lower(trim(nom_source))`).

- Si une référence correspondante existe déjà : toutes les occurrences sont rattachées à cette référence existante, quelle que soit leur casse d'origine. La référence existante n'est jamais renommée.
- Si aucune référence n'existe : une seule nouvelle référence est créée pour l'ensemble des variantes de casse rencontrées, en utilisant la variante la plus fréquente (majorité), départagée alphabétiquement en cas d'égalité.

Cette règle est appliquée à l'identique côté application (`resolveExerciseId` dans `src/services/exerciseResolution.ts`) afin qu'un doublon de casse ne puisse plus être créé par les écritures live, pas seulement par le backfill.

**Limite connue :** en cas d'écritures concurrentes quasi simultanées portant sur un exercice réellement nouveau (jamais vu avant) avec deux casses différentes, une rare duplication reste théoriquement possible côté application (fenêtre de course entre la vérification et la création). Risque jugé négligeable au regard du profil de concurrence de l'application (écritures utilisateur individuelles, non массives). Non traité pour rester proportionné (pas de verrou/fonction SQL dédiée ajoutée pour ce cas résiduel).

## Historique des exécutions

### 2026-07-12T13:49:47Z — Projet Supabase `bcwfvpwxzlmkxobvbtzp` (production)

Préalable de cette exécution : suppression de l'index legacy global `exercise_catalog_name_idx` (UNIQUE sur `lower(name)`, toutes disciplines confondues, hérité de l'ancienne table `exercise_catalog` muscu-only, jamais supprimé lors du renommage de l'Étape 0). Cet index empêchait à tort qu'un même nom d'exercice existe dans deux disciplines différentes et bloquait le cas ambigu ci-dessous. Validé par Nathan avant exécution. L'unicité `(discipline_id, name)` reste en vigueur.

| Statistique | Muscu (`exercises`) | Générique (`workout_segments`) | Total |
|---|---|---|---|
| Lignes analysées (référence NULL au départ) | 188 | 0 | 188 |
| Correspondances automatiques réalisées | 188 | 0 | 188 |
| Nouvelles références créées | 39 | 0 | 39 |
| Cas ambigus détectés (groupes de variantes de casse) | 1 | 0 | 1 |
| Lignes concernées par un cas ambigu | 9 | 0 | 9 |
| — dont fusionnées dans une référence déjà existante | 1 | 0 | 1 |
| Erreurs | 0 | 0 | 0 |

**Détail du cas ambigu fusionné :**

- Clé de regroupement : `tirage horizontal assis poitrine`
- Variantes rencontrées dans les données historiques : `"tirage horizontal assis poitrine"` (3 lignes), `"Tirage horizontal assis poitrine"` (6 lignes)
- Référence conservée (déjà existante dans le catalogue d'origine, catégorie "Dos") : `Tirage horizontal assis poitrine` — id `bfaf47fc-c151-428d-96ae-215eac228227`
- Les 9 lignes historiques (les deux variantes confondues) pointent désormais vers cette référence unique. Aucune donnée supprimée : le texte d'origine de chaque ligne (`exercises.name`) est resté inchangé, seul le lien `exercise_reference_id` a été renseigné.

**Note sur le périmètre `workout_segments` :** la table était vide au moment de cette exécution (aucune donnée historique pré-Phase 3 — le pilote Course n'avait pas encore produit de séance réelle en base au-delà des tests déjà nettoyés). Le volet générique du script s'exécute néanmoins pour rester réutilisable dès que des données historiques y apparaîtront ou lors d'une exécution sur un autre environnement.

**Vérifications post-exécution :** `exercises` : 0 ligne restante avec `exercise_reference_id IS NULL` (188/188). `exercise_reference` (muscu) : 148 lignes, 0 doublon de casse résiduel détecté (`lower(trim(name))` tous uniques). Index legacy confirmé supprimé.
