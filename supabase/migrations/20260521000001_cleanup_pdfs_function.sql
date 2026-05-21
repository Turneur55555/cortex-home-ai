-- Fonction de nettoyage des PDFs et documents IA anciens (> 90 jours)
CREATE OR REPLACE FUNCTION cleanup_old_pdfs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  cutoff_date TIMESTAMPTZ := NOW() - INTERVAL '90 days';
  deleted_count INTEGER := 0;
BEGIN
  -- 1. Supprimer les entrées de la table user_pdfs
  DELETE FROM user_pdfs
  WHERE created_at < cutoff_date;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- 2. Supprimer les objets storage orphelins du bucket 'pdfs'
  -- (fichiers dont il n'y a plus d'entrée dans user_pdfs)
  DELETE FROM storage.objects
  WHERE bucket_id = 'pdfs'
    AND created_at < cutoff_date;

  -- 3. Supprimer les documents IA anciens si la table 'documents' existe
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'documents') THEN
    DELETE FROM documents
    WHERE created_at < cutoff_date;
  END IF;

  RAISE LOG 'cleanup_old_pdfs: supprimé % entrées user_pdfs', deleted_count;
END;
$$;

-- Accorder l'exécution uniquement au service role
REVOKE ALL ON FUNCTION cleanup_old_pdfs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_old_pdfs() TO service_role;

COMMENT ON FUNCTION cleanup_old_pdfs() IS
  'Supprime les PDFs et documents IA de plus de 90 jours. Appelée par cron ou edge function.';
