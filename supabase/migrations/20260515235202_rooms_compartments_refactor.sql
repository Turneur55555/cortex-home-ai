-- Refactor: replace flat module enum with flexible room-based architecture

-- 1. Drop the old CHECK constraint that limited module to 4 values
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_module_check;

-- 2. Add flexible constraint (any non-empty string up to 50 chars)
ALTER TABLE public.items ADD CONSTRAINT items_module_check
  CHECK (char_length(module) >= 1 AND char_length(module) <= 50);

-- 3. Migrate module values → new room IDs
UPDATE public.items SET module = 'cuisine'       WHERE module = 'alimentation';
UPDATE public.items SET module = 'salle-de-bain' WHERE module = 'pharmacie';
UPDATE public.items SET module = 'dressing'      WHERE module = 'habits';
UPDATE public.items SET module = 'buanderie'     WHERE module = 'menager';

-- 4. Normalize existing location values → compartment IDs
UPDATE public.items SET location = 'frigo'
  WHERE module = 'cuisine'
  AND lower(coalesce(location, '')) IN ('frigo','réfrigérateur','refrigerateur','fridge','frigo ');

UPDATE public.items SET location = 'congelateur'
  WHERE module = 'cuisine'
  AND lower(coalesce(location, '')) IN ('congélateur','congelateur','freezer');

UPDATE public.items SET location = 'armoire-pharmacie'
  WHERE module = 'salle-de-bain'
  AND lower(coalesce(location, '')) IN ('armoire','armoire pharmacie','pharmacie','armoire à pharmacie');

UPDATE public.items SET location = 'penderie'
  WHERE module = 'dressing'
  AND lower(coalesce(location, '')) IN ('penderie','armoire','garde-robe','placard');

UPDATE public.items SET location = 'produits-lessive'
  WHERE module = 'buanderie'
  AND lower(coalesce(location, '')) IN ('placard','placard ménager','ménager','menager','rangement');
