
-- Table user_pdfs
CREATE TABLE IF NOT EXISTS public.user_pdfs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_pdfs_user_id ON public.user_pdfs(user_id, created_at DESC);

ALTER TABLE public.user_pdfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own pdfs" ON public.user_pdfs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own pdfs" ON public.user_pdfs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own pdfs" ON public.user_pdfs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Bucket pdfs (privé)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pdfs', 'pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies : chaque utilisateur gère son propre dossier
CREATE POLICY "Users read own pdfs in storage" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users upload own pdfs to storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own pdfs from storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
