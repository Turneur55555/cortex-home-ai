-- Refactor items table: introduce 'room' column, clean up module constraint,
-- make category optional, add fiber/sugar/sodium nutrition columns.

-- 1. Add room column (current 'module' values are actually room IDs)
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS room text;

-- 2. Migrate data: copy room ID from module, set module = 'maison' for home items
UPDATE public.items
SET    room   = module,
       module = 'maison'
WHERE  module NOT IN ('maison', 'nutrition', 'sport');

-- 3. Add optional nutrition columns
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS fiber_per_100g  float,
  ADD COLUMN IF NOT EXISTS sugar_per_100g  float,
  ADD COLUMN IF NOT EXISTS sodium_per_100g float;

-- 4. Make category fully optional (UI no longer sends it)
ALTER TABLE public.items
  ALTER COLUMN category SET DEFAULT 'autre';

DO $$
BEGIN
  ALTER TABLE public.items ALTER COLUMN category DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 5. Index for efficient room-based queries
CREATE INDEX IF NOT EXISTS idx_items_room
  ON public.items (user_id, room)
  WHERE room IS NOT NULL;
