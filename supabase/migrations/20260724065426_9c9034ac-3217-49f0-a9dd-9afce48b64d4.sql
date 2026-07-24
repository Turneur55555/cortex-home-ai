-- Refonte du module Documents : pipeline de déversement transactionnel multi-module.
--
-- Contexte : jusqu'ici, l'analyse IA d'un document (analyze-pdf) ne faisait
-- qu'écrire son propre résumé dans la table `documents` (colonne `analysis`,
-- texte opaque jamais relu nulle part — vérifié par grep sur tout le repo).
-- Aucune donnée n'était réellement déversée dans les modules métier
-- (body_tracking, nutrition, supplements, workout_templates). Cette migration
-- pose l'infrastructure DB pour un déversement réel, traçable et atomique.

-- ── 1. documents.analysis (text, écriture-seule) → extracted_items (jsonb) ──
-- Permet aux modules métier réels (et à un futur module Santé) de relire les
-- données déjà extraites sans refaire l'analyse IA.
alter table public.documents
  add column if not exists extracted_items jsonb not null default '[]'::jsonb;

update public.documents
set extracted_items = case
  when analysis is null or btrim(analysis) = '' then '[]'::jsonb
  when analysis ~ '^\s*[\[{]' then analysis::jsonb
  else '[]'::jsonb
end
where extracted_items = '[]'::jsonb;

alter table public.documents drop column if exists analysis;

-- ── 2. Traçabilité : document → lignes créées dans les modules métier ──────
alter table public.body_tracking
  add column if not exists source_document_id uuid references public.documents(id) on delete set null;
alter table public.nutrition
  add column if not exists source_document_id uuid references public.documents(id) on delete set null;
alter table public.supplements
  add column if not exists source_document_id uuid references public.documents(id) on delete set null;
alter table public.supplement_logs
  add column if not exists source_document_id uuid references public.documents(id) on delete set null;
alter table public.workout_templates
  add column if not exists source_document_id uuid references public.documents(id) on delete set null;

create index if not exists idx_body_tracking_source_document on public.body_tracking(source_document_id) where source_document_id is not null;
create index if not exists idx_nutrition_source_document on public.nutrition(source_document_id) where source_document_id is not null;
create index if not exists idx_supplements_source_document on public.supplements(source_document_id) where source_document_id is not null;
create index if not exists idx_workout_templates_source_document on public.workout_templates(source_document_id) where source_document_id is not null;

-- ── 3. RPC transactionnelle : un seul appel = une seule transaction ────────
-- Extensibilité assumée : ajouter un futur module métier = une migration qui
-- (a) ajoute sa colonne source_document_id, (b) ajoute un bloc ci-dessous.
-- Le frontend n'a jamais besoin d'être modifié : il itère sur les clés
-- présentes dans le rapport retourné, quel que soit le module.
--
-- Gestion des doublons/conflits : chaque item est inséré dans un sous-bloc
-- BEGIN/EXCEPTION (savepoint implicite) — une violation de contrainte ou un
-- doublon détecté n'annule que cet item (journalisé dans `skipped`), jamais
-- toute la fonction. Un échec véritablement bloquant (ex. document introuvable
-- ou appartenant à un autre utilisateur) reste une exception non rattrapée :
-- toute la transaction est alors annulée, ce qui est le comportement voulu
-- (jamais d'état partiellement écrit).
create or replace function public.deposit_document_analysis(
  p_document_id uuid,
  p_modules jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_doc_owner uuid;
  v_report jsonb := '{}'::jsonb;
  v_item jsonb;
  v_ex jsonb;
  v_new_id uuid;
  v_existing_id uuid;
  v_supp_id uuid;
  v_tmpl_id uuid;
  v_written jsonb;
  v_skipped jsonb;
begin
  if v_user_id is null then
    raise exception 'Non authentifié';
  end if;

  select user_id into v_doc_owner from public.documents where id = p_document_id;
  if v_doc_owner is null then
    raise exception 'Document introuvable';
  end if;
  if v_doc_owner <> v_user_id then
    raise exception 'Accès non autorisé';
  end if;

  -- ── body_tracking ────────────────────────────────────────────────────
  if p_modules ? 'body' then
    v_written := '[]'::jsonb;
    v_skipped := '[]'::jsonb;
    for v_item in select * from jsonb_array_elements(p_modules->'body') loop
      begin
        if (v_item->>'date') is null then
          v_skipped := v_skipped || jsonb_build_object('reason', 'date manquante', 'item', v_item);
          continue;
        end if;

        select id into v_existing_id from public.body_tracking
          where user_id = v_user_id and date = (v_item->>'date')::date
          limit 1;
        if v_existing_id is not null then
          v_skipped := v_skipped || jsonb_build_object(
            'reason', 'doublon : une mesure existe déjà pour cette date', 'date', v_item->>'date'
          );
          continue;
        end if;

        insert into public.body_tracking (
          user_id, date, weight, body_fat, muscle_mass, chest, waist, hips,
          left_arm, right_arm, left_thigh, right_thigh, notes, source_document_id
        ) values (
          v_user_id,
          (v_item->>'date')::date,
          (v_item->>'weight')::double precision,
          (v_item->>'body_fat')::double precision,
          (v_item->>'muscle_mass')::double precision,
          (v_item->>'chest')::double precision,
          (v_item->>'waist')::double precision,
          (v_item->>'hips')::double precision,
          (v_item->>'left_arm')::double precision,
          (v_item->>'right_arm')::double precision,
          (v_item->>'left_thigh')::double precision,
          (v_item->>'right_thigh')::double precision,
          nullif(v_item->>'notes', ''),
          p_document_id
        ) returning id into v_new_id;

        v_written := v_written || jsonb_build_object('id', v_new_id, 'date', v_item->>'date');
      exception when others then
        v_skipped := v_skipped || jsonb_build_object('reason', sqlerrm, 'item', v_item);
      end;
    end loop;
    v_report := v_report || jsonb_build_object('body', jsonb_build_object('written', v_written, 'skipped', v_skipped));
  end if;

  -- ── nutrition ────────────────────────────────────────────────────────
  if p_modules ? 'nutrition' then
    v_written := '[]'::jsonb;
    v_skipped := '[]'::jsonb;
    for v_item in select * from jsonb_array_elements(p_modules->'nutrition') loop
      begin
        if (v_item->>'date') is null or (v_item->>'name') is null then
          v_skipped := v_skipped || jsonb_build_object('reason', 'date ou nom manquant', 'item', v_item);
          continue;
        end if;

        select id into v_existing_id from public.nutrition
          where user_id = v_user_id
            and date = (v_item->>'date')::date
            and coalesce(meal, '') = coalesce(v_item->>'meal', '')
            and lower(name) = lower(v_item->>'name')
          limit 1;
        if v_existing_id is not null then
          v_skipped := v_skipped || jsonb_build_object(
            'reason', 'doublon : entrée identique déjà présente ce jour-là', 'name', v_item->>'name'
          );
          continue;
        end if;

        insert into public.nutrition (
          user_id, date, meal, name, calories, proteins, carbs, fats, source_document_id
        ) values (
          v_user_id,
          (v_item->>'date')::date,
          v_item->>'meal',
          v_item->>'name',
          (v_item->>'calories')::integer,
          (v_item->>'proteins')::double precision,
          (v_item->>'carbs')::double precision,
          (v_item->>'fats')::double precision,
          p_document_id
        ) returning id into v_new_id;

        v_written := v_written || jsonb_build_object('id', v_new_id, 'name', v_item->>'name');
      exception when others then
        v_skipped := v_skipped || jsonb_build_object('reason', sqlerrm, 'item', v_item);
      end;
    end loop;
    v_report := v_report || jsonb_build_object('nutrition', jsonb_build_object('written', v_written, 'skipped', v_skipped));
  end if;

  -- ── supplements (+ supplement_logs si une prise datée est identifiable) ─
  if p_modules ? 'supplements' then
    v_written := '[]'::jsonb;
    v_skipped := '[]'::jsonb;
    for v_item in select * from jsonb_array_elements(p_modules->'supplements') loop
      begin
        if (v_item->>'name') is null then
          v_skipped := v_skipped || jsonb_build_object('reason', 'nom manquant', 'item', v_item);
          continue;
        end if;

        v_supp_id := null;
        select id into v_supp_id from public.supplements
          where user_id = v_user_id and lower(name) = lower(v_item->>'name')
          limit 1;

        if v_supp_id is null then
          insert into public.supplements (user_id, name, dosage, unit, notes, source_document_id)
          values (v_user_id, v_item->>'name', v_item->>'dosage', v_item->>'unit', nullif(v_item->>'notes', ''), p_document_id)
          returning id into v_supp_id;
          v_written := v_written || jsonb_build_object('id', v_supp_id, 'name', v_item->>'name', 'table', 'supplements');
        else
          v_skipped := v_skipped || jsonb_build_object(
            'reason', 'doublon : complément déjà existant', 'name', v_item->>'name'
          );
        end if;

        if (v_item->>'taken_date') is not null then
          v_new_id := null;
          insert into public.supplement_logs (user_id, supplement_id, date, taken, source_document_id)
          values (v_user_id, v_supp_id, (v_item->>'taken_date')::date, true, p_document_id)
          on conflict (user_id, supplement_id, date) do nothing
          returning id into v_new_id;
          if v_new_id is not null then
            v_written := v_written || jsonb_build_object('id', v_new_id, 'table', 'supplement_logs', 'date', v_item->>'taken_date');
          else
            v_skipped := v_skipped || jsonb_build_object(
              'reason', 'doublon : prise déjà enregistrée ce jour-là', 'name', v_item->>'name', 'date', v_item->>'taken_date'
            );
          end if;
        end if;
      exception when others then
        v_skipped := v_skipped || jsonb_build_object('reason', sqlerrm, 'item', v_item);
      end;
    end loop;
    v_report := v_report || jsonb_build_object('supplements', jsonb_build_object('written', v_written, 'skipped', v_skipped));
  end if;

  -- ── fitness : programme scanné → modèle (workout_templates), jamais une
  --    séance loggée automatiquement (voir consigne produit) ──────────────
  if p_modules ? 'fitness_template' then
    v_written := '[]'::jsonb;
    v_skipped := '[]'::jsonb;
    for v_item in select * from jsonb_array_elements(
      case jsonb_typeof(p_modules->'fitness_template')
        when 'array' then p_modules->'fitness_template'
        else jsonb_build_array(p_modules->'fitness_template')
      end
    ) loop
      begin
        if (v_item->>'name') is null then
          v_skipped := v_skipped || jsonb_build_object('reason', 'nom de programme manquant', 'item', v_item);
          continue;
        end if;

        select id into v_existing_id from public.workout_templates
          where user_id = v_user_id and lower(name) = lower(v_item->>'name')
          limit 1;
        if v_existing_id is not null then
          v_skipped := v_skipped || jsonb_build_object(
            'reason', 'doublon : modèle de séance déjà existant', 'name', v_item->>'name'
          );
          continue;
        end if;

        insert into public.workout_templates (user_id, name, source_document_id)
        values (v_user_id, v_item->>'name', p_document_id)
        returning id into v_tmpl_id;

        for v_ex in select * from jsonb_array_elements(coalesce(v_item->'exercises', '[]'::jsonb)) loop
          insert into public.workout_template_exercises (
            template_id, user_id, name, position, default_sets, default_reps, default_weight, notes
          ) values (
            v_tmpl_id, v_user_id, v_ex->>'name',
            coalesce((v_ex->>'position')::smallint, 0),
            (v_ex->>'sets')::smallint,
            (v_ex->>'reps')::smallint,
            (v_ex->>'weight')::numeric,
            nullif(v_ex->>'notes', '')
          );
        end loop;

        v_written := v_written || jsonb_build_object('id', v_tmpl_id, 'name', v_item->>'name');
      exception when others then
        v_skipped := v_skipped || jsonb_build_object('reason', sqlerrm, 'item', v_item);
      end;
    end loop;
    v_report := v_report || jsonb_build_object('fitness_template', jsonb_build_object('written', v_written, 'skipped', v_skipped));
  end if;

  return v_report;
end;
$$;

revoke all on function public.deposit_document_analysis(uuid, jsonb) from public;
revoke all on function public.deposit_document_analysis(uuid, jsonb) from anon;
grant execute on function public.deposit_document_analysis(uuid, jsonb) to authenticated;