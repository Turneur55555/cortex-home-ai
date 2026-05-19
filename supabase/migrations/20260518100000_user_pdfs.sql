-- ============================================================
-- Table user_pdfs — stockage simple de PDF par utilisateur
-- v2: migration entièrement idempotente (DROP POLICY IF EXISTS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_pdfs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name   text        NOT NULL,
  file_path   text        NOT NULL UNIQUE,
  file_size   bigint      NOT NULL CHECK (file_size > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_pdfs ENABLE ROW LEVEL SECURITY;

-- Policies table — idempotentes
DROP POLICY IF EXISTS "user_pdfs_select_own" ON public.user_pdfs;
CREATE POLICY "user_pdfs_select_own" ON public.user_pdfs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_pdfs_insert_own" ON public.user_pdfs;
CREATE POLICY "user_pdfs_insert_own" ON public.user_pdfs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_pdfs_delete_own" ON public.user_pdfs;
CREATE POLICY "user_pdfs_delete_own" ON public.user_pdfs
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_pdfs_user_id_idx ON public.user_pdfs (user_id);

-- ============================================================
-- Bucket storage privé — pdfs
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdfs',
  'pdfs',
  false,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Policies storage — idempotentes
DROP POLICY IF EXISTS "pdfs_select_own" ON storage.objects;
CREATE POLICY "pdfs_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "pdfs_insert_own" ON storage.objects;
CREATE POLICY "pdfs_insert_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "pdfs_delete_own" ON storage.objects;
CREATE POLICY "pdfs_delete_own" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'pdfs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
