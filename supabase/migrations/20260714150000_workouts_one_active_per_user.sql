-- Étape 0.1 (refonte Séances — Phase 0, INV-1) : une seule séance active par
-- utilisateur. Appliquée en production le 2026-07-14 via MCP Supabase ;
-- fichier ajouté ici pour traçabilité dans le dépôt (idempotente).
create unique index if not exists workouts_one_active_per_user
  on public.workouts (user_id)
  where status = 'active';
