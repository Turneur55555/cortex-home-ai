-- ============================================================
-- RLS policies pour le bucket 'pdfs' (Storage)
-- Idempotentes : DROP IF EXISTS avant chaque CREATE
-- Garantit que chaque user n'accède qu'à ses propres fichiers.
-- ============================================================

-- SELECT
DROP POLICY IF EXISTS "Users can read their own PDFs"  ON storage.objects;
DROP POLICY IF EXISTS "pdfs_select_own"                ON storage.objects;
DROP POLICY IF EXISTS "Users read own pdfs in storage" ON storage.objects;

CREATE POLICY "Users can read their own PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'pdfs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- INSERT
DROP POLICY IF EXISTS "Users can upload their own PDFs"    ON storage.objects;
DROP POLICY IF EXISTS "pdfs_insert_own"                    ON storage.objects;
DROP POLICY IF EXISTS "Users upload own pdfs to storage"   ON storage.objects;

CREATE POLICY "Users can upload their own PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pdfs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- DELETE
DROP POLICY IF EXISTS "Users can delete their own PDFs"     ON storage.objects;
DROP POLICY IF EXISTS "pdfs_delete_own"                     ON storage.objects;
DROP POLICY IF EXISTS "Users delete own pdfs from storage"  ON storage.objects;

CREATE POLICY "Users can delete their own PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'pdfs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
