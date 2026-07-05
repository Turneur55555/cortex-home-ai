CREATE TABLE weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}',
  fitness_data JSONB NOT NULL DEFAULT '{}',
  nutrition_data JSONB NOT NULL DEFAULT '{}',
  body_data JSONB NOT NULL DEFAULT '{}',
  ai_analysis JSONB NOT NULL DEFAULT '{}',
  pdf_url TEXT,
  status TEXT DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);

ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own reports" ON weekly_reports FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_weekly_reports_user_week ON weekly_reports(user_id, week_start DESC);

NOTIFY pgrst, 'reload schema';
