-- Phase 6B : estimation du Body Fat à partir des mensurations (méthode
-- U.S. Navy — Hodgdon & Beckett, 1984).
--
-- Audit préalable (voir MEMORY.md) : `body_tracking` a déjà `waist`/`hips`
-- (Phase pré-6A) et `body_fat`/`body_fat_method`/`body_fat_min_percent`/
-- `body_fat_max_percent` (Phase 6A). Il manque uniquement `neck`
-- (obligatoire pour la méthode Navy) et de quoi conserver la PROVENANCE
-- EXACTE d'une estimation par mensurations : la formule utilisée, et un
-- snapshot de taille/sexe biologique (`metabolic_profile.sex`/
-- `user_preferences.height_cm` n'ont PAS d'historique — si l'utilisateur
-- corrige sa taille ou son sexe plus tard, une estimation BF historique ne
-- doit JAMAIS être recalculée silencieusement avec le nouveau profil, §7/
-- §28 du brief Phase 6B). Décision : ÉTENDRE `body_tracking` (pas de
-- nouvelle table) — cohérent avec la décision Phase 6A, aucune ligne/jour
-- unique n'est imposée par le schéma (pas de contrainte UNIQUE(user_id,
-- date) sur cette table), donc une estimation par mensurations crée
-- naturellement sa PROPRE ligne sans jamais écraser une mesure DEXA/
-- bio-impédance existante du même jour (§15 du brief).
--
-- `body_fat_formula` est distinct de `body_fat_method` ('measurements') :
-- le mapping confiance (Phase 6A) reste au niveau de la MÉTHODE, mais la
-- FORMULE précise doit être conservée pour savoir un jour comment une
-- estimation historique a été produite (§8 du brief) — jamais perdue.
--
-- Aucune perte de données existantes : ADD COLUMN uniquement, toutes
-- NULLABLE.

ALTER TABLE public.body_tracking
  ADD COLUMN IF NOT EXISTS neck double precision,
  ADD COLUMN IF NOT EXISTS body_fat_formula text,
  ADD COLUMN IF NOT EXISTS body_fat_height_cm double precision,
  ADD COLUMN IF NOT EXISTS body_fat_sex text;

-- Bornes techniques larges (jamais un diagnostic médical) — cohérentes
-- avec les autres mensurations existantes (chest/waist/hips : 30-250 cm,
-- left/right_arm : 10-100 cm). Le cou est structurellement plus petit que
-- la taille ou les bras : 15-60 cm couvre largement toute morphologie
-- humaine plausible sans exclure arbitrairement de vrais utilisateurs.
ALTER TABLE public.body_tracking
  DROP CONSTRAINT IF EXISTS body_tracking_neck_check;
ALTER TABLE public.body_tracking
  ADD CONSTRAINT body_tracking_neck_check
  CHECK (neck IS NULL OR (neck >= 15 AND neck <= 60));

-- Une seule formule supportée pour l'instant (§8 du brief : identification
-- stable de la formule, pas seulement `method = measurements`) — étendre
-- cette liste quand une formule supplémentaire sera ajoutée, jamais
-- réutiliser une valeur existante pour une formule différente.
ALTER TABLE public.body_tracking
  DROP CONSTRAINT IF EXISTS body_tracking_body_fat_formula_check;
ALTER TABLE public.body_tracking
  ADD CONSTRAINT body_tracking_body_fat_formula_check
  CHECK (body_fat_formula IS NULL OR body_fat_formula IN ('navy_v1'));

-- Snapshot de taille utilisée pour LA formule — mêmes bornes que
-- `metabolic_profile`/profil utilisateur (50-250 cm, garde-fou technique).
ALTER TABLE public.body_tracking
  DROP CONSTRAINT IF EXISTS body_tracking_body_fat_height_cm_check;
ALTER TABLE public.body_tracking
  ADD CONSTRAINT body_tracking_body_fat_height_cm_check
  CHECK (body_fat_height_cm IS NULL OR (body_fat_height_cm >= 50 AND body_fat_height_cm <= 250));

-- Snapshot du sexe biologique utilisé pour LA formule — même domaine que
-- `metabolic_profile.sex` (lib/fitness/metabolism.ts#BiologicalSex).
ALTER TABLE public.body_tracking
  DROP CONSTRAINT IF EXISTS body_tracking_body_fat_sex_check;
ALTER TABLE public.body_tracking
  ADD CONSTRAINT body_tracking_body_fat_sex_check
  CHECK (body_fat_sex IS NULL OR body_fat_sex IN ('homme', 'femme'));

-- RLS déjà correcte sur `body_tracking` ("Users manage own body",
-- auth.uid() = user_id, FOR ALL) — s'applique automatiquement aux
-- nouvelles colonnes, aucune policy supplémentaire nécessaire.
