
-- SEC-5: Supprimer la policy SELECT publique sur le bucket paie-documents
DROP POLICY IF EXISTS "lecture publique paie-documents" ON storage.objects;
