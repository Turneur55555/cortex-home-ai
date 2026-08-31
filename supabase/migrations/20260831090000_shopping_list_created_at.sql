-- Offline-first (cf. CLAUDE.md) — contrat du repository générique.
--
-- `shopping_list` est câblée sur `createOfflineRepository`
-- (src/hooks/useShoppingList.ts + src/hooks/useMealPlan.ts) mais elle est la
-- DERNIÈRE table offline à ne pas avoir de colonne `created_at`, alors que
-- `repository.ts::create()` l'ajoute inconditionnellement à CHAQUE payload
-- créé (contrat générique partagé par toutes les tables offline). Même cause
-- racine exacte que le bug prod corrigé pour `exercises` le 29/08
-- (20260829130000_exercises_created_at.sql) : tout `POST /shopping_list`
-- issu de la sync queue échoue en 400 (PGRST204, colonne inconnue du schema
-- cache) et est retenté à l'infini sans jamais pouvoir réussir.
--
-- Correctif : aligner `shopping_list` sur le contrat générique déjà respecté
-- par les 18 autres tables offline (id / user_id / created_at / updated_at).
-- Strictement additive : aucune colonne existante n'est supprimée, renommée
-- ni modifiée. `added_at` (date d'ajout métier, affichée et utilisée pour le
-- tri de la liste) reste la colonne produit — `created_at` est le champ
-- d'infrastructure du contrat offline, comme partout ailleurs.
--
-- Ajout en 3 temps (colonne nullable → backfill → NOT NULL + DEFAULT) plutôt
-- qu'un `ADD COLUMN ... NOT NULL DEFAULT now()` suivi d'un UPDATE : ça rend
-- la migration réellement idempotente (le backfill ne cible que les lignes
-- restées NULL, donc 0 ligne à un second passage) et ça évite qu'un rejeu
-- réécrive `created_at` — et donc `updated_at` via le trigger
-- `trg_shopping_list_updated_at` — sur des lignes déjà correctes, ce qui
-- provoquerait de faux conflits de synchronisation côté clients.

ALTER TABLE public.shopping_list
  ADD COLUMN IF NOT EXISTS created_at timestamptz;

-- `added_at` (NOT NULL DEFAULT now()) est la date de création réelle de la
-- ligne : meilleur backfill possible, exact et non approximatif.
UPDATE public.shopping_list
   SET created_at = added_at
 WHERE created_at IS NULL;

ALTER TABLE public.shopping_list
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.shopping_list
  ALTER COLUMN created_at SET NOT NULL;

NOTIFY pgrst, 'reload schema';
