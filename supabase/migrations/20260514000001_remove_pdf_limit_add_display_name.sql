-- ============================================================
-- 1. Remove the 10-document free-plan limit on the documents table.
--    All users can now upload unlimited documents.
-- ============================================================
drop trigger if exists check_free_plan_documents on public.documents;
drop function if exists public.enforce_free_plan_documents();

-- ============================================================
-- 2. Add display_name to users_profiles.
--    Nullable so existing rows are unaffected.
--    Used as the user-facing pseudo across the whole app.
-- ============================================================
alter table public.users_profiles
  add column if not exists display_name text;
