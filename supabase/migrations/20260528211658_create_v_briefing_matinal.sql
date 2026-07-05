
create or replace view public.v_briefing_matinal as
select
  (select count(*) from public.dsn
   where date_limite = current_date
   and statut in ('a_faire','en_cours'))::int as dsn_aujourdhui,

  (select count(*) from public.dsn
   where date_limite between current_date + 1 and current_date + 2
   and statut in ('a_faire','en_cours'))::int as dsn_48h,

  (select count(*) from public.taches
   where priorite in ('urgent','high')
   and statut != 'done')::int as taches_urgentes,

  (select count(*) from public.arrets_maladie
   where statut in ('en_cours','prolonge'))::int as arrets_actifs,

  (select count(*) from public.stc
   where statut in ('a_faire','en_cours'))::int as stc_en_cours,

  (select count(*) from public.dossiers
   where statut not in ('archived','completed'))::int as dossiers_actifs;

grant select on public.v_briefing_matinal to authenticated;
