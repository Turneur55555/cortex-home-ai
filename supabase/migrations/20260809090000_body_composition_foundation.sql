-- Phase 6A : fondation composition corporelle (Body Fat + provenance +
-- masse grasse/masse maigre dérivées).
--
-- Audit préalable (voir MEMORY.md) : `body_tracking` EST DÉJÀ la table
-- "une mesure corporelle datée" (weight/body_fat/muscle_mass/mensurations
-- sur la même ligne, RLS `auth.uid() = user_id` déjà correcte, hooks CRUD
-- déjà génériques `useAddBodyMeasurement`/`useUpdateBodyMeasurement`/
-- `useDeleteBodyMeasurement`). Décision : ÉTENDRE cette table plutôt que
-- créer une deuxième table concurrente (§2 du brief Phase 6A) — `body_fat`
-- existe déjà comme valeur ponctuelle, il ne manque que la PROVENANCE.
--
-- `weight`/`body_fat` étant déjà sur la MÊME ligne (même date), le
-- problème "snapshot poids ↔ Body Fat" (§12/§13 du brief) est déjà résolu
-- structurellement par le schéma existant — inutile d'ajouter une colonne
-- `weight_kg_at_measurement` dédiée : `body_tracking.weight` de CETTE ligne
-- EST le snapshot. Si `weight` est NULL sur une ligne où `body_fat` est
-- renseigné, `fatMass`/`leanMass` sont simplement indisponibles pour cette
-- mesure (§33) — jamais un poids fabriqué.
--
-- Provenance : `body_fat_method` (catégorie métier stable, jamais un
-- coefficient — même principe que `nutrition_goals.goal`). La CONFIANCE
-- (high/medium/low) n'est PAS stockée : c'est un mapping centralisé et
-- ajustable côté TypeScript (`lib/fitness/bodyComposition.ts`,
-- `BODY_FAT_METHOD_CONFIDENCE`), jamais une valeur figée en base qui
-- pourrait diverger du mapping si celui-ci est ajusté plus tard (§8).
--
-- `body_fat_min_percent`/`body_fat_max_percent` préparent une estimation
-- par INTERVALLE (mensurations/photo, Phases 6B/6C) sans forcer une valeur
-- ponctuelle artificielle — `body_fat` reste la valeur ponctuelle (ou le
-- point représentatif si une méthode future n'en fournit qu'un).
--
-- Aucune perte de données existantes : ADD COLUMN uniquement, toutes
-- NULLABLE (rétrocompatible avec les lignes historiques sans méthode
-- connue — jamais une provenance devinée a posteriori).

ALTER TABLE public.body_tracking
  ADD COLUMN IF NOT EXISTS body_fat_method text,
  ADD COLUMN IF NOT EXISTS body_fat_min_percent double precision,
  ADD COLUMN IF NOT EXISTS body_fat_max_percent double precision;

ALTER TABLE public.body_tracking
  DROP CONSTRAINT IF EXISTS body_tracking_body_fat_method_check;
ALTER TABLE public.body_tracking
  ADD CONSTRAINT body_tracking_body_fat_method_check
  CHECK (body_fat_method IS NULL OR body_fat_method IN (
    'manual', 'dexa', 'bioimpedance', 'measurements', 'photo_estimate'
  ));

-- Mêmes bornes que `body_tracking_body_fat_check` (1-70) — une seule
-- définition de "Body Fat plausible" dans la base (§15/§16 du brief : ne
-- jamais dupliquer une définition contradictoire).
ALTER TABLE public.body_tracking
  DROP CONSTRAINT IF EXISTS body_tracking_body_fat_min_percent_check;
ALTER TABLE public.body_tracking
  ADD CONSTRAINT body_tracking_body_fat_min_percent_check
  CHECK (body_fat_min_percent IS NULL OR (body_fat_min_percent >= 1 AND body_fat_min_percent <= 70));

ALTER TABLE public.body_tracking
  DROP CONSTRAINT IF EXISTS body_tracking_body_fat_max_percent_check;
ALTER TABLE public.body_tracking
  ADD CONSTRAINT body_tracking_body_fat_max_percent_check
  CHECK (body_fat_max_percent IS NULL OR (body_fat_max_percent >= 1 AND body_fat_max_percent <= 70));

ALTER TABLE public.body_tracking
  DROP CONSTRAINT IF EXISTS body_tracking_body_fat_range_order_check;
ALTER TABLE public.body_tracking
  ADD CONSTRAINT body_tracking_body_fat_range_order_check
  CHECK (
    body_fat_min_percent IS NULL
    OR body_fat_max_percent IS NULL
    OR body_fat_min_percent <= body_fat_max_percent
  );

-- RLS déjà correcte sur `body_tracking` ("Users manage own body",
-- auth.uid() = user_id, FOR ALL) — s'applique automatiquement aux
-- nouvelles colonnes, aucune policy supplémentaire nécessaire.
