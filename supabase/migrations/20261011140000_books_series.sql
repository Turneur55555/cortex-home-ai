-- Bibliothèque : sagas et tomes, résumé, année de parution.
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS series text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS volume numeric(5,1);
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS published_year smallint;

ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_series_length;
ALTER TABLE public.books ADD CONSTRAINT books_series_length
  CHECK (series IS NULL OR char_length(series) <= 300);
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_volume_range;
ALTER TABLE public.books ADD CONSTRAINT books_volume_range
  CHECK (volume IS NULL OR (volume >= 0 AND volume <= 9999));
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_description_length;
ALTER TABLE public.books ADD CONSTRAINT books_description_length
  CHECK (description IS NULL OR char_length(description) <= 5000);
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_published_year_range;
ALTER TABLE public.books ADD CONSTRAINT books_published_year_range
  CHECK (published_year IS NULL OR published_year BETWEEN 0 AND 2100);

CREATE INDEX IF NOT EXISTS books_user_series_idx
  ON public.books (user_id, series, volume) WHERE series IS NOT NULL;
