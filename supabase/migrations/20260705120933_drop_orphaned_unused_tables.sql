-- Nettoyage code mort (audit 2026-07-05) : 6 tables sans aucune référence
-- frontend, edge function, fonction SQL, trigger, vue ou clé étrangère, et
-- 0 ligne de données. Fonctionnalités correspondantes entièrement retirées
-- du frontend (hooks/composants absents du repo) :
--   - training_programs / program_weeks / program_sessions / program_exercises
--     : "Coach IA V2 Programs" (périodisation) — hooks/usePrograms.ts et
--       lib/fitness/periodization.ts n'existent plus dans le repo.
--   - stock_history : historique de l'inventaire "Stocks/Maison" — use-stocks.ts
--     n'existe plus dans le repo.
--   - food_search_history : historique de recherche alimentaire — jamais lu
--     par le frontend, indexe déjà signalé "unused" par les advisors Supabase.
-- Chaque table n'avait qu'une policy RLS standard "Users manage own X" ;
-- CASCADE nettoie policies/index dépendants.

drop table if exists public.program_exercises cascade;
drop table if exists public.program_sessions cascade;
drop table if exists public.program_weeks cascade;
drop table if exists public.training_programs cascade;
drop table if exists public.stock_history cascade;
drop table if exists public.food_search_history cascade;

notify pgrst, 'reload schema';
