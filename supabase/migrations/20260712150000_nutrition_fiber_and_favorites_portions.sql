-- Nutrition — persistance des fibres (public.nutrition) + grammes/unité pour
-- les favoris (public.nutrition_favorites).
--
-- Migration STRICTEMENT ADDITIVE : uniquement des colonnes nullables, sans
-- DEFAULT et sans backfill. Aucune ligne existante n'est réécrite/scannée
-- au-delà de la validation triviale des CHECK (toujours vraie pour NULL) —
-- ADD COLUMN nullable sans DEFAULT est une opération de métadonnées en
-- Postgres, pas un rewrite de table. Aucun contrat API/RPC existant modifié.

-- 1) Fibres — même convention que calories/proteins/carbs/fats déjà en place
--    sur public.nutrition : `fiber` = valeur telle que consommée,
--    `base_fiber` = valeur pour 100 g/ml (utilisée par l'édition de portion).
ALTER TABLE public.nutrition
  ADD COLUMN IF NOT EXISTS fiber double precision
    CHECK (fiber IS NULL OR (fiber >= 0 AND fiber <= 1000)),
  ADD COLUMN IF NOT EXISTS base_fiber double precision
    CHECK (base_fiber IS NULL OR (base_fiber >= 0 AND base_fiber <= 1000));

COMMENT ON COLUMN public.nutrition.fiber IS
  'Fibres (g) pour la quantité réellement consommée. NULL = non renseigné (jamais une valeur inventée).';
COMMENT ON COLUMN public.nutrition.base_fiber IS
  'Fibres (g) pour 100 g/ml — même convention que base_calories/base_proteins/base_carbs/base_fats.';

-- 2) Favoris — grammes/unité + valeurs pour 100 g, pour que la portion reste
--    éditable après ajout au journal (même modèle que public.nutrition /
--    saved_meal_items, cf. migration 20260702202431). Les colonnes
--    calories/proteins/carbs/fats déjà existantes ne changent pas de sens :
--    elles restent le total "tel que consommé" pour consumed_quantity.
ALTER TABLE public.nutrition_favorites
  ADD COLUMN IF NOT EXISTS base_calories double precision
    CHECK (base_calories IS NULL OR (base_calories >= 0 AND base_calories <= 10000)),
  ADD COLUMN IF NOT EXISTS base_proteins double precision
    CHECK (base_proteins IS NULL OR (base_proteins >= 0 AND base_proteins <= 1000)),
  ADD COLUMN IF NOT EXISTS base_carbs double precision
    CHECK (base_carbs IS NULL OR (base_carbs >= 0 AND base_carbs <= 1000)),
  ADD COLUMN IF NOT EXISTS base_fats double precision
    CHECK (base_fats IS NULL OR (base_fats >= 0 AND base_fats <= 1000)),
  ADD COLUMN IF NOT EXISTS consumed_quantity double precision
    CHECK (consumed_quantity IS NULL OR consumed_quantity >= 0),
  ADD COLUMN IF NOT EXISTS consumed_unit text
    CHECK (consumed_unit IS NULL OR char_length(consumed_unit) <= 50),
  ADD COLUMN IF NOT EXISTS consumed_grams_per_unit double precision
    CHECK (consumed_grams_per_unit IS NULL OR consumed_grams_per_unit >= 0);

COMMENT ON COLUMN public.nutrition_favorites.base_calories IS
  'Calories pour 100 g/ml, même convention que public.nutrition.base_calories. NULL pour les favoris créés avant cette migration (mode "portion" legacy, inchangé).';
COMMENT ON COLUMN public.nutrition_favorites.consumed_quantity IS
  'Quantité dans l''unité consumed_unit, utilisée à la création du favori. NULL = favori legacy.';
COMMENT ON COLUMN public.nutrition_favorites.consumed_unit IS
  'Unité de consumed_quantity (ex: "g"). NULL = favori legacy, l''application retombe sur "portion" (PortionEditModal).';
COMMENT ON COLUMN public.nutrition_favorites.consumed_grams_per_unit IS
  'Grammes pour 1 unité de consumed_unit (1 pour g/ml) — même convention que public.nutrition.consumed_grams_per_unit.';

NOTIFY pgrst, 'reload schema';
