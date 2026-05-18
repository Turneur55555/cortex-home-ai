-- health_data_imports: tracks raw image analysis records (separate from documents/PDF pipeline)
CREATE TABLE public.health_data_imports (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_path  TEXT        NOT NULL,
  image_url   TEXT,
  ocr_text    TEXT,
  parsed_data JSONB,
  data_type   TEXT,
  status      TEXT        NOT NULL DEFAULT 'completed',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.health_data_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own their health imports"
  ON public.health_data_imports
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Storage bucket for health images (service role uploads bypass RLS)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'health-images',
  'health-images',
  false,
  15728640,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Users can read their own images
CREATE POLICY "Users can view own health images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'health-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can delete their own images
CREATE POLICY "Users can delete own health images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'health-images' AND auth.uid()::text = (storage.foldername(name))[1]);
