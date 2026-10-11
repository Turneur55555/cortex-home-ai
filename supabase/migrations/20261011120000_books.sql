-- Bibliothèque : livres lus / en cours / à lire, avec couverture.
-- Espace indépendant (aucun lien avec l'XP ni les Chroniques).
-- Table offline-first : id, user_id, created_at, updated_at (contrat repository.ts).

CREATE TABLE IF NOT EXISTS public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  author text CHECK (author IS NULL OR char_length(author) <= 300),
  isbn text CHECK (isbn IS NULL OR char_length(isbn) <= 32),
  status text NOT NULL DEFAULT 'read' CHECK (status IN ('read', 'reading', 'to_read')),
  rating smallint CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  started_on date,
  finished_on date,
  genre text CHECK (genre IS NULL OR char_length(genre) <= 100),
  pages integer CHECK (pages IS NULL OR pages BETWEEN 1 AND 20000),
  review text CHECK (review IS NULL OR char_length(review) <= 5000),
  cover_url text CHECK (cover_url IS NULL OR char_length(cover_url) <= 1000),
  cover_path text CHECK (cover_path IS NULL OR char_length(cover_path) <= 500),
  external_id text CHECK (external_id IS NULL OR char_length(external_id) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT ALL ON public.books TO service_role;

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their books" ON public.books;
CREATE POLICY "Users manage their books" ON public.books
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS books_user_status_idx
  ON public.books (user_id, status, finished_on DESC);

DROP TRIGGER IF EXISTS books_touch ON public.books;
CREATE TRIGGER books_touch BEFORE UPDATE ON public.books
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- Storage — bucket privé `book-covers` (photos de couverture perso)
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'book-covers',
  'book-covers',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS book_covers_storage_select_own ON storage.objects;
CREATE POLICY book_covers_storage_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'book-covers'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS book_covers_storage_insert_own ON storage.objects;
CREATE POLICY book_covers_storage_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'book-covers'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS book_covers_storage_update_own ON storage.objects;
CREATE POLICY book_covers_storage_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'book-covers'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'book-covers'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS book_covers_storage_delete_own ON storage.objects;
CREATE POLICY book_covers_storage_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'book-covers'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
