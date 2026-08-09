-- ⚠️ À DÉPLACER DANS supabase/migrations/20260829090000_recipe_import_cache_language_version.sql
-- (l'environnement Lovable bloque l'écriture directe dans supabase/migrations ;
-- la base de vérité est bcwfvpwxzlmkxobvbtzp, appliquée par .github/workflows/migrate.yml).
--
-- Versionnement de la RÈGLE DE LANGUE du cache global d'import de recettes.
--
-- Problème : les entrées de `recipe_import_cache` écrites AVANT la garantie de
-- francisation peuvent contenir une fiche restée en anglais/espagnol
-- ("Carrots", "Smoked Paprika", "Method"...). Réutilisées telles quelles, elles
-- ressortent une fiche non conforme sans jamais repasser par l'IA.
--
-- Stratégie (aucun hack frontend) : chaque entrée porte la version de la règle
-- de langue avec laquelle elle a été produite. Le pipeline ne lit que les
-- entrées `language_rule_version >= LANGUAGE_RULE_VERSION` courante
-- (supabase/functions/_shared/recipe-language.ts). Les entrées héritées restent
-- en base (traçabilité) mais sont invisibles : le premier import suivant les
-- réanalyse une fois avec le pipeline courant, puis les REMPLACE par la version
-- française via l'upsert sur (source_kind, source_url). Les imports suivants
-- repartent du cache, sans appel IA.
--
-- Prochaine évolution de la règle : incrémenter LANGUAGE_RULE_VERSION côté code
-- — aucune nouvelle migration n'est nécessaire.

ALTER TABLE public.recipe_import_cache
  ADD COLUMN IF NOT EXISTS language_rule_version smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.recipe_import_cache.language_rule_version IS
  'Version de la règle de langue (recipe-language.ts LANGUAGE_RULE_VERSION) ayant produit cette fiche. 0 = héritée, antérieure à la garantie de francisation : ignorée en lecture et réanalysée une fois.';

CREATE INDEX IF NOT EXISTS recipe_import_cache_language_rule_version_idx
  ON public.recipe_import_cache (source_kind, source_url, language_rule_version);
