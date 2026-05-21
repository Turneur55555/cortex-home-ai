
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS image_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise-images', 'exercise-images', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users read own exercise images" ON storage.objects;
CREATE POLICY "Users read own exercise images"
ON storage.objects FOR SELECT
USING (bucket_id = 'exercise-images' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users upload own exercise images" ON storage.objects;
CREATE POLICY "Users upload own exercise images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'exercise-images' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users update own exercise images" ON storage.objects;
CREATE POLICY "Users update own exercise images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'exercise-images' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own exercise images" ON storage.objects;
CREATE POLICY "Users delete own exercise images"
ON storage.objects FOR DELETE
USING (bucket_id = 'exercise-images' AND auth.uid()::text = (storage.foldername(name))[1]);
