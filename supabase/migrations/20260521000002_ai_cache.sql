-- Cache des résultats IA pour éviter les re-appels Gemini
CREATE TABLE IF NOT EXISTS ai_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,      -- hash du contenu (storage_path ou hash image)
  function_name TEXT NOT NULL,          -- 'analyze-pdf', 'scan-meal', etc.
  result JSONB NOT NULL,               -- résultat JSON retourné par l'IA
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL      -- TTL configurable par function
);

-- Index pour lookup rapide par clé
CREATE INDEX IF NOT EXISTS ai_cache_key_idx ON ai_cache(cache_key);
CREATE INDEX IF NOT EXISTS ai_cache_expires_idx ON ai_cache(expires_at);
CREATE INDEX IF NOT EXISTS ai_cache_function_idx ON ai_cache(function_name);

-- Nettoyage automatique des entrées expirées
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM ai_cache WHERE expires_at < NOW();
$$;

-- RLS
ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;

-- Un user ne peut voir que son propre cache
DROP POLICY IF EXISTS "Users can read own cache" ON ai_cache;
CREATE POLICY "Users can read own cache"
  ON ai_cache FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Seul le service role peut insérer/supprimer (depuis les edge functions)
DROP POLICY IF EXISTS "Service role manages cache" ON ai_cache;
CREATE POLICY "Service role manages cache"
  ON ai_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE ai_cache IS 'Cache des résultats IA - évite les re-appels Gemini pour le même contenu';
