-- Phase 4.1 Dressing — formulaire adaptatif : ajoute les deux colonnes
-- manquantes pour piloter la section « Caractéristiques » et l'attribut
-- Usage (Quotidien/Sport/Habillé/Baignade). Additive et non destructif :
-- ADD COLUMN IF NOT EXISTS uniquement, aucune donnée existante touchée.
--
-- Usage est volontairement multi-valué (text[], comme `seasons`) et non
-- une nouvelle catégorie DB — cf. wardrobe_items_category_check qui reste
-- limité à top/bottom/outerwear/shoes/accessory. sleeve_length reste sans
-- CHECK (comme pattern/fit/formality existants) : validé côté application
-- (taxonomie src/lib/wardrobe/taxonomy.ts + Edge Function).
ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS usage text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS sleeve_length text;

COMMENT ON COLUMN public.wardrobe_items.usage IS 'Usage(s) de la pièce (quotidien/sport/habille/baignade) — multi-valué, pour le futur Outfit Engine. Jamais affiché comme catégorie principale.';
COMMENT ON COLUMN public.wardrobe_items.sleeve_length IS 'Longueur de manches (sans_manches/courtes/longues) — pertinent uniquement pour les hauts.';
