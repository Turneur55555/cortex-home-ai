-- ICORTEX — Phase 3 (restructuration exercice-central) — Étape 3
-- Backfill historique : relie les occurrences existantes (table `exercises` pour
-- muscu, `workout_segments` pour les autres disciplines) au référentiel universel
-- `exercise_reference`, via la même logique de résolution que `ExerciseResolutionService`
-- (src/services/exerciseResolution.ts), appliquée en une fois aux données historiques.
--
-- IDEMPOTENT : ne touche que les lignes dont exercise_reference_id / exercise_id est
-- encore NULL. Peut être relancé sans risque sur le même environnement (no-op si tout
-- est déjà backfillé) ou exécuté sur un autre environnement (staging, autre projet
-- Supabase) pour reproduire la même opération.
--
-- RÈGLE DE NORMALISATION (anti-doublon de casse) :
-- Avant de créer une nouvelle référence, on vérifie toujours s'il en existe déjà une
-- dans la même discipline dont le nom est identique à la casse près
-- (lower(trim(name)) = lower(trim(nom_source))). Si oui, TOUTES les occurrences
-- correspondantes (quelle que soit leur casse d'origine) sont rattachées à cette
-- référence existante — jamais de renommage, jamais de doublon créé. Si aucune
-- référence n'existe, une seule nouvelle ligne est créée pour tout le groupe de
-- variantes, avec pour nom la variante la plus fréquente (majorité), départagée
-- alphabétiquement en cas d'égalité. Cette même règle doit être respectée par le
-- code applicatif (voir resolveExerciseId dans exerciseResolution.ts) pour que ce
-- type de doublon ne puisse plus réapparaître via les écritures live.
--
-- PRÉALABLE (une seule fois, sans risque à relancer — DROP IF EXISTS) : suppression
-- de l'ancien index unique global hérité de `exercise_catalog` (`exercise_catalog_name_idx`,
-- UNIQUE sur lower(name) toutes disciplines confondues), qui empêchait à tort qu'un
-- même nom d'exercice existe dans deux disciplines différentes. L'unicité correcte
-- (discipline_id, name) reste en place (contrainte exercise_reference_discipline_name_key).
--
-- Sortie : un SELECT final produit les statistiques d'exécution à consigner dans
-- docs/phase3-backfill-log.md (date, lignes analysées, correspondances automatiques,
-- nouvelles références créées, cas ambigus fusionnés, erreurs).

begin;

drop index if exists public.exercise_catalog_name_idx;

-- ============ MUSCU (table exercises — discipline implicite 'muscu') ============

create temporary table _s3_before_exercises as
  select count(*) as n from exercises where exercise_reference_id is null;

create temporary table _s3_variant_counts_muscu as
  select lower(trim(name)) as key, name, count(*) as cnt
  from exercises
  where exercise_reference_id is null and trim(name) <> ''
  group by lower(trim(name)), name;

create temporary table _s3_groups_muscu as
  select key, count(*) as variant_count, sum(cnt) as row_count,
    (array_agg(name order by cnt desc, name asc))[1] as majority_name,
    array_agg(name order by name) as variants
  from _s3_variant_counts_muscu group by key;

create temporary table _s3_target_muscu as
  select g.key, g.majority_name, g.variant_count, g.row_count, g.variants,
    existing.id as existing_id, existing.name as existing_name
  from _s3_groups_muscu g
  left join exercise_reference existing
    on existing.discipline_id = 'muscu' and lower(trim(existing.name)) = g.key;

create temporary table _s3_inserted_muscu as
  with ins as (
    insert into exercise_reference (discipline_id, name)
    select 'muscu', majority_name from _s3_target_muscu where existing_id is null
    returning id, name
  )
  select id, name from ins;

create temporary table _s3_resolved_muscu as
  select r.key, r.variant_count, r.row_count, r.variants,
    coalesce(r.existing_id, i.id) as ref_id,
    coalesce(r.existing_name, i.name) as ref_name,
    (r.existing_id is not null) as reused_existing
  from _s3_target_muscu r
  left join _s3_inserted_muscu i on i.name = r.majority_name and r.existing_id is null;

create temporary table _s3_updated_exercises as
  with upd as (
    update exercises e set exercise_reference_id = r.ref_id
    from _s3_resolved_muscu r
    where lower(trim(e.name)) = r.key and e.exercise_reference_id is null
    returning e.id
  )
  select count(*) as n from upd;

create temporary table _s3_errors_muscu as
  select count(*) as n from exercises where exercise_reference_id is null and trim(name) = '';

-- ============ GÉNÉRIQUE (table workout_segments — par discipline explicite) ============

create temporary table _s3_before_segments as
  select count(*) as n from workout_segments where exercise_id is null;

create temporary table _s3_variant_counts_seg as
  select discipline, lower(trim(label)) as key, label, count(*) as cnt
  from workout_segments
  where exercise_id is null and discipline is not null and trim(label) <> ''
  group by discipline, lower(trim(label)), label;

create temporary table _s3_groups_seg as
  select discipline, key, count(*) as variant_count, sum(cnt) as row_count,
    (array_agg(label order by cnt desc, label asc))[1] as majority_name,
    array_agg(label order by label) as variants
  from _s3_variant_counts_seg group by discipline, key;

create temporary table _s3_target_seg as
  select g.discipline, g.key, g.majority_name, g.variant_count, g.row_count, g.variants,
    existing.id as existing_id, existing.name as existing_name
  from _s3_groups_seg g
  left join exercise_reference existing
    on existing.discipline_id = g.discipline and lower(trim(existing.name)) = g.key;

create temporary table _s3_inserted_seg as
  with ins as (
    insert into exercise_reference (discipline_id, name)
    select discipline, majority_name from _s3_target_seg where existing_id is null
    returning id, name, discipline_id
  )
  select id, name, discipline_id from ins;

create temporary table _s3_resolved_seg as
  select r.discipline, r.key, r.variant_count, r.row_count, r.variants,
    coalesce(r.existing_id, i.id) as ref_id,
    coalesce(r.existing_name, i.name) as ref_name,
    (r.existing_id is not null) as reused_existing
  from _s3_target_seg r
  left join _s3_inserted_seg i on i.name = r.majority_name and i.discipline_id = r.discipline and r.existing_id is null;

create temporary table _s3_updated_segments as
  with upd as (
    update workout_segments s set exercise_id = r.ref_id
    from _s3_resolved_seg r
    where s.discipline = r.discipline and lower(trim(s.label)) = r.key and s.exercise_id is null
    returning s.id
  )
  select count(*) as n from upd;

create temporary table _s3_errors_seg as
  select count(*) as n from workout_segments
  where exercise_id is null and (discipline is null or trim(label) = '');

-- ============ RAPPORT (à consigner dans docs/phase3-backfill-log.md) ============

select
  now() as executed_at,
  (select n from _s3_before_exercises) + (select n from _s3_before_segments) as rows_analyzed,
  (select n from _s3_before_exercises) as exercises_analyzed,
  (select n from _s3_before_segments) as segments_analyzed,
  (select n from _s3_updated_exercises) + (select n from _s3_updated_segments) as auto_matched_total,
  (select n from _s3_updated_exercises) as exercises_auto_matched,
  (select n from _s3_updated_segments) as segments_auto_matched,
  (select count(*) from _s3_inserted_muscu) + (select count(*) from _s3_inserted_seg) as new_refs_created_total,
  (select count(*) from _s3_inserted_muscu) as new_refs_muscu,
  (select count(*) from _s3_inserted_seg) as new_refs_segments,
  (select count(*) from _s3_resolved_muscu where variant_count > 1) + (select count(*) from _s3_resolved_seg where variant_count > 1) as ambiguous_cases_total,
  (select coalesce(sum(row_count),0) from _s3_resolved_muscu where variant_count > 1) + (select coalesce(sum(row_count),0) from _s3_resolved_seg where variant_count > 1) as ambiguous_rows_total,
  (select count(*) from _s3_resolved_muscu where variant_count > 1 and reused_existing) + (select count(*) from _s3_resolved_seg where variant_count > 1 and reused_existing) as merged_into_existing_cases,
  (select n from _s3_errors_muscu) + (select n from _s3_errors_seg) as errors_total,
  (select coalesce(json_agg(row_to_json(t)),'[]') from (
     select key, variants, row_count, ref_name, reused_existing from _s3_resolved_muscu where variant_count > 1
   ) t) as ambiguous_detail_muscu,
  (select coalesce(json_agg(row_to_json(t)),'[]') from (
     select discipline, key, variants, row_count, ref_name, reused_existing from _s3_resolved_seg where variant_count > 1
   ) t) as ambiguous_detail_segments;

commit;
