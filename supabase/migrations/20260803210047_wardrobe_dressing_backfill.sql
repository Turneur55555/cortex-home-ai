-- Backfill de rattrapage — socle Dressing (wardrobe_items, outfits, outfit_items,
-- outfit_feedback, wardrobe_preferences) + bucket Storage `wardrobe`.
--
-- Ces objets existent déjà sur la base distante (créés hors migration versionnée).
-- Cette migration reproduit fidèlement leur structure réelle (colonnes, contraintes,
-- indexes, RLS, policies, bucket Storage) afin qu'un environnement neuf obtienne le
-- même socle. Entièrement idempotente et non destructive :
--   - clauses IF NOT EXISTS sur les tables et indexes : no-op si l'objet existe déjà
--   - DROP POLICY/TRIGGER IF EXISTS suivi de CREATE : redéfinition à l'identique,
--     jamais de perte de policy ni de données
--   - aucun DROP TABLE, aucune suppression de données, aucun reset

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wardrobe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  category text NOT NULL CHECK (category = ANY (ARRAY['top', 'bottom', 'outerwear', 'shoes', 'accessory'])),
  subcategory text,
  name text,
  brand text,
  size text,
  primary_color text,
  secondary_colors text[] NOT NULL DEFAULT '{}',
  material text,
  pattern text,
  fit text,
  formality text,
  seasons text[] NOT NULL DEFAULT '{}',
  ai_description text,
  ai_metadata jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outfits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  occasion text,
  style text,
  score smallint CHECK (score >= 0 AND score <= 100),
  score_breakdown jsonb NOT NULL DEFAULT '{}',
  ai_explanation text,
  worn_at timestamptz,
  is_favorite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outfit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outfit_id uuid NOT NULL REFERENCES public.outfits(id) ON DELETE CASCADE,
  wardrobe_item_id uuid NOT NULL REFERENCES public.wardrobe_items(id) ON DELETE CASCADE,
  position smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (outfit_id, wardrobe_item_id)
);

CREATE TABLE IF NOT EXISTS public.outfit_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outfit_id uuid NOT NULL REFERENCES public.outfits(id) ON DELETE CASCADE,
  liked boolean,
  rating smallint CHECK (rating >= 1 AND rating <= 5),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, outfit_id)
);

CREATE TABLE IF NOT EXISTS public.wardrobe_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferred_styles text[] NOT NULL DEFAULT '{}',
  avoided_styles text[] NOT NULL DEFAULT '{}',
  preferred_colors text[] NOT NULL DEFAULT '{}',
  avoided_colors text[] NOT NULL DEFAULT '{}',
  preferences jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS wardrobe_items_user_id_idx ON public.wardrobe_items USING btree (user_id);
CREATE INDEX IF NOT EXISTS wardrobe_items_user_category_idx ON public.wardrobe_items USING btree (user_id, category) WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS outfits_user_id_idx ON public.outfits USING btree (user_id);
CREATE INDEX IF NOT EXISTS outfits_user_created_idx ON public.outfits USING btree (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS outfit_items_user_id_idx ON public.outfit_items USING btree (user_id);
CREATE INDEX IF NOT EXISTS outfit_items_outfit_id_idx ON public.outfit_items USING btree (outfit_id);
CREATE INDEX IF NOT EXISTS outfit_items_wardrobe_item_id_idx ON public.outfit_items USING btree (wardrobe_item_id);

CREATE INDEX IF NOT EXISTS outfit_feedback_user_id_idx ON public.outfit_feedback USING btree (user_id);

-- ============================================================
-- updated_at triggers (fonction partagée déjà versionnée dans le repo :
-- utilisée par tachepaie/app_settings/etc. — cf. update_updated_at())
-- ============================================================

DROP TRIGGER IF EXISTS set_outfits_updated_at ON public.outfits;
CREATE TRIGGER set_outfits_updated_at
  BEFORE UPDATE ON public.outfits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_outfit_feedback_updated_at ON public.outfit_feedback;
CREATE TRIGGER set_outfit_feedback_updated_at
  BEFORE UPDATE ON public.outfit_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_wardrobe_preferences_updated_at ON public.wardrobe_preferences;
CREATE TRIGGER set_wardrobe_preferences_updated_at
  BEFORE UPDATE ON public.wardrobe_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Note : wardrobe_items possède une colonne updated_at mais n'a, en base réelle,
-- aucun trigger de mise à jour automatique. Reproduit tel quel (pas d'ajout de
-- comportement non présent en production).

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outfits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outfit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outfit_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wardrobe_preferences ENABLE ROW LEVEL SECURITY;

-- wardrobe_items
DROP POLICY IF EXISTS wardrobe_items_select_own ON public.wardrobe_items;
CREATE POLICY wardrobe_items_select_own ON public.wardrobe_items
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS wardrobe_items_insert_own ON public.wardrobe_items;
CREATE POLICY wardrobe_items_insert_own ON public.wardrobe_items
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS wardrobe_items_update_own ON public.wardrobe_items;
CREATE POLICY wardrobe_items_update_own ON public.wardrobe_items
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS wardrobe_items_delete_own ON public.wardrobe_items;
CREATE POLICY wardrobe_items_delete_own ON public.wardrobe_items
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- outfits
DROP POLICY IF EXISTS outfits_select_own ON public.outfits;
CREATE POLICY outfits_select_own ON public.outfits
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS outfits_insert_own ON public.outfits;
CREATE POLICY outfits_insert_own ON public.outfits
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS outfits_update_own ON public.outfits;
CREATE POLICY outfits_update_own ON public.outfits
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS outfits_delete_own ON public.outfits;
CREATE POLICY outfits_delete_own ON public.outfits
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- outfit_items (dépend de la propriété de l'outfit ET de la pièce référencée)
DROP POLICY IF EXISTS outfit_items_select_own ON public.outfit_items;
CREATE POLICY outfit_items_select_own ON public.outfit_items
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS outfit_items_insert_own ON public.outfit_items;
CREATE POLICY outfit_items_insert_own ON public.outfit_items
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.outfits o
      WHERE o.id = outfit_items.outfit_id AND o.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.wardrobe_items w
      WHERE w.id = outfit_items.wardrobe_item_id AND w.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS outfit_items_update_own ON public.outfit_items;
CREATE POLICY outfit_items_update_own ON public.outfit_items
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.outfits o
      WHERE o.id = outfit_items.outfit_id AND o.user_id = (SELECT auth.uid())
    )
    AND EXISTS (
      SELECT 1 FROM public.wardrobe_items w
      WHERE w.id = outfit_items.wardrobe_item_id AND w.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS outfit_items_delete_own ON public.outfit_items;
CREATE POLICY outfit_items_delete_own ON public.outfit_items
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- outfit_feedback (dépend de la propriété de l'outfit)
DROP POLICY IF EXISTS outfit_feedback_select_own ON public.outfit_feedback;
CREATE POLICY outfit_feedback_select_own ON public.outfit_feedback
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS outfit_feedback_insert_own ON public.outfit_feedback;
CREATE POLICY outfit_feedback_insert_own ON public.outfit_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.outfits o
      WHERE o.id = outfit_feedback.outfit_id AND o.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS outfit_feedback_update_own ON public.outfit_feedback;
CREATE POLICY outfit_feedback_update_own ON public.outfit_feedback
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.outfits o
      WHERE o.id = outfit_feedback.outfit_id AND o.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS outfit_feedback_delete_own ON public.outfit_feedback;
CREATE POLICY outfit_feedback_delete_own ON public.outfit_feedback
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- wardrobe_preferences
DROP POLICY IF EXISTS wardrobe_preferences_select_own ON public.wardrobe_preferences;
CREATE POLICY wardrobe_preferences_select_own ON public.wardrobe_preferences
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS wardrobe_preferences_insert_own ON public.wardrobe_preferences;
CREATE POLICY wardrobe_preferences_insert_own ON public.wardrobe_preferences
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS wardrobe_preferences_update_own ON public.wardrobe_preferences;
CREATE POLICY wardrobe_preferences_update_own ON public.wardrobe_preferences
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS wardrobe_preferences_delete_own ON public.wardrobe_preferences;
CREATE POLICY wardrobe_preferences_delete_own ON public.wardrobe_preferences
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- Storage — bucket privé `wardrobe`
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wardrobe',
  'wardrobe',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Isolation par dossier {user_id}/... — un utilisateur ne peut lire/écrire
-- que dans son propre dossier du bucket privé.
DROP POLICY IF EXISTS wardrobe_storage_select_own ON storage.objects;
CREATE POLICY wardrobe_storage_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'wardrobe'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS wardrobe_storage_insert_own ON storage.objects;
CREATE POLICY wardrobe_storage_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'wardrobe'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS wardrobe_storage_update_own ON storage.objects;
CREATE POLICY wardrobe_storage_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'wardrobe'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'wardrobe'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS wardrobe_storage_delete_own ON storage.objects;
CREATE POLICY wardrobe_storage_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'wardrobe'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
