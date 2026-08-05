-- Phase 5 Dressing — détourage/normalisation visuelle.
-- Additive et non destructif : ajoute une colonne nullable pour référencer
-- la version détourée/normalisée de la photo, générée côté client. La
-- colonne `storage_path` existante continue de référencer l'ORIGINAL, qui
-- n'est jamais remplacé ni supprimé — le détourage est un traitement
-- additionnel, pas un remplacement.
ALTER TABLE public.wardrobe_items
  ADD COLUMN IF NOT EXISTS processed_storage_path text;

COMMENT ON COLUMN public.wardrobe_items.processed_storage_path IS 'Chemin Storage (bucket privé wardrobe) de la version détourée/normalisée de la photo, générée côté client (Phase 5). Null si le détourage a échoué ou n''a pas été retenu par l''utilisateur — storage_path (original) reste alors la seule source d''affichage. Traitement non destructif : storage_path original n''est jamais supprimé ni écrasé.';
