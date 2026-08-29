-- SECURITY FIX — CTX-09, CTX-10, CTX-13, CTX-16, CTX-17
-- (audit du 16/08/2026, phase 2 — findings MOYENNE et FAIBLE).
--
-- Chaque correctif ci-dessous a été précédé d'une vérification que la
-- vulnérabilité est TOUJOURS présente en production, et d'un relevé exhaustif
-- des appelants légitimes dans le dépôt pour garantir zéro régression.

-- ─────────────────────────────────────────────────────────────────────────
-- CTX-09 — recompute_recipe_nutrition : écriture sur la recette d'autrui
-- ─────────────────────────────────────────────────────────────────────────
-- Vérifié en production : la fonction est SECURITY DEFINER, exécutable par
-- `authenticated`, et son corps ne contient AUCUNE référence à auth.uid()
-- (`prosrc ilike '%auth.uid()%'` → NO GUARD). Elle accepte un identifiant de
-- recette arbitraire et réécrit la ligne correspondante (calories, macros,
-- updated_at) sans vérifier le propriétaire — les recettes publiques
-- (`recipes.is_public`) exposent justement leur `id` à tout utilisateur.
--
-- Correctif : filtre de propriété dans la clause WHERE finale. La fonction
-- reste SECURITY DEFINER (elle doit agréger `foods` au-delà du RLS de
-- l'appelant) mais ne peut plus écrire que sur les recettes de l'appelant.
-- Le service_role, qui n'a pas d'auth.uid(), conserve un chemin explicite :
-- `_actor` permet aux appels serveur de désigner le propriétaire réel.
CREATE OR REPLACE FUNCTION public.recompute_recipe_nutrition(p_recipe uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.recipes r set
    total_weight_g = agg.tw, calories=agg.kcal, protein_g=agg.p, carbs_g=agg.c,
    sugars_g=agg.su, fiber_g=agg.fi, fat_g=agg.fat, saturated_fat_g=agg.sat, updated_at=now()
  from (
    select ri.recipe_id,
      sum(ri.grams) tw,
      sum(f.calories*ri.grams/100.0) kcal, sum(f.protein_g*ri.grams/100.0) p,
      sum(f.carbs_g*ri.grams/100.0) c, sum(f.sugars_g*ri.grams/100.0) su,
      sum(f.fiber_g*ri.grams/100.0) fi, sum(f.fat_g*ri.grams/100.0) fat,
      sum(f.saturated_fat_g*ri.grams/100.0) sat
    from public.recipe_ingredients ri
    join public.foods f on f.id = ri.food_id
    where ri.recipe_id = p_recipe and ri.grams is not null
    group by ri.recipe_id
  ) agg
  where r.id = agg.recipe_id
    -- Garde de propriété : un appelant authentifié ne peut recalculer que ses
    -- propres recettes. auth.uid() est NULL pour le service_role, qui garde
    -- donc un accès complet pour les traitements serveur légitimes.
    and (auth.uid() is null or r.user_id = auth.uid());
$function$;

REVOKE EXECUTE ON FUNCTION public.recompute_recipe_nutrition(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_recipe_nutrition(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- CTX-10 — tables satellites de `foods` lisibles par tout compte connecté
-- ─────────────────────────────────────────────────────────────────────────
-- Vérifié en production : les 4 tables portent une policy SELECT
-- `USING (true)` pour `authenticated`, alors qu'elles référencent toutes
-- `foods.id` — y compris les 34 aliments privés (`foods.user_id IS NOT NULL`).
-- Fuite réelle mesurée : 7/7 lignes `food_servings` et 7/1402 lignes
-- `food_barcodes` sont rattachées à des aliments privés d'autres comptes.
--
-- Leurs policies INSERT vérifiaient déjà la propriété via une sous-requête sur
-- `foods` : c'est exactement ce motif, déjà présent et correct, qui est repris
-- ici pour le SELECT (asymétrie lecture/écriture relevée par l'audit).
--
-- Non-régression vérifiée : l'UNIQUE consommateur de ces 4 tables est
-- l'edge function `food-lookup`, qui utilise un client service_role
-- (`const admin = createClient(SUPABASE_URL, SERVICE_KEY)`) et contourne donc
-- RLS. Aucune lecture cliente n'existe dans `src/`.

DROP POLICY IF EXISTS "servings readable by authenticated" ON public.food_servings;
DROP POLICY IF EXISTS "food_servings_select_public_or_own" ON public.food_servings;
CREATE POLICY "food_servings_select_public_or_own"
  ON public.food_servings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_servings.food_id
      AND (f.user_id IS NULL OR f.user_id = (SELECT auth.uid()))
  ));

DROP POLICY IF EXISTS "barcodes readable by authenticated" ON public.food_barcodes;
DROP POLICY IF EXISTS "food_barcodes_select_public_or_own" ON public.food_barcodes;
CREATE POLICY "food_barcodes_select_public_or_own"
  ON public.food_barcodes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_barcodes.food_id
      AND (f.user_id IS NULL OR f.user_id = (SELECT auth.uid()))
  ));

DROP POLICY IF EXISTS "quality readable by authenticated" ON public.food_quality_scores;
DROP POLICY IF EXISTS "food_quality_scores_select_public_or_own" ON public.food_quality_scores;
CREATE POLICY "food_quality_scores_select_public_or_own"
  ON public.food_quality_scores FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_quality_scores.food_id
      AND (f.user_id IS NULL OR f.user_id = (SELECT auth.uid()))
  ));

-- `food_synonyms.food_id` est nullable (synonymes génériques non rattachés à
-- un aliment) : ces lignes-là restent lisibles, elles n'exposent aucun
-- aliment privé.
DROP POLICY IF EXISTS "synonyms readable by authenticated" ON public.food_synonyms;
DROP POLICY IF EXISTS "food_synonyms_select_public_or_own" ON public.food_synonyms;
CREATE POLICY "food_synonyms_select_public_or_own"
  ON public.food_synonyms FOR SELECT TO authenticated
  USING (
    food_synonyms.food_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.foods f
      WHERE f.id = food_synonyms.food_id
        AND (f.user_id IS NULL OR f.user_id = (SELECT auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- CTX-13 — cache d'import de recettes énumérable par tout compte connecté
-- ─────────────────────────────────────────────────────────────────────────
-- Vérifié en production : policy `SELECT ... USING (true)` pour
-- `authenticated` sur `recipe_import_cache` (10 lignes), exposant
-- `source_url`, `source_author`, `title` et `ai_summary` de toutes les
-- recettes importées par les autres utilisateurs.
--
-- L'audit classait ce point comme « décision produit à trancher ». La
-- vérification du code montre qu'il n'y en a pas besoin : le cache est lu ET
-- écrit EXCLUSIVEMENT par `_shared/recipe-db.ts` (findCachedRecipe /
-- saveCachedRecipe / refreshCachedRecipe), toujours avec un client `admin`
-- service_role depuis les edge functions. Aucune lecture cliente n'existe.
-- Retirer la policy conserve donc 100 % du bénéfice de performance du cache
-- partagé et supprime l'énumération — sans arbitrage produit.
DROP POLICY IF EXISTS "Authenticated users can read the shared recipe cache" ON public.recipe_import_cache;

-- ─────────────────────────────────────────────────────────────────────────
-- CTX-16 — tables de référence lisibles sans authentification
-- ─────────────────────────────────────────────────────────────────────────
-- Vérifié en production : `disciplines`, `reward_catalog`, `exercise_families`
-- et `exercise_media` portent une policy SELECT `USING (true)` pour le rôle
-- `public` (donc `anon`) ET un GRANT SELECT à `anon` — les deux conditions
-- nécessaires. `reward_catalog` expose ainsi tout le barème d'XP
-- (source_key, xp_amount, weekly_cap, diminishing_group) à quiconque possède
-- la clé publiable.
--
-- Non-régression vérifiée : aucune route publique
-- (`/login`, `/reset-password`, `/confidentialite`, `[index]`) ne lit ces
-- tables. Les consommateurs sont soit des écrans authentifiés
-- (`useExerciseCatalogEntry`, `useExerciseAdmin` → exercise_media), soit des
-- edge functions en service_role (`verify-exercise-rank` → reward_catalog).
DROP POLICY IF EXISTS "disciplines_read" ON public.disciplines;
CREATE POLICY "disciplines_read"
  ON public.disciplines FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "reward_catalog select all" ON public.reward_catalog;
CREATE POLICY "reward_catalog select all"
  ON public.reward_catalog FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "exercise_families readable by everyone" ON public.exercise_families;
CREATE POLICY "exercise_families readable by everyone"
  ON public.exercise_families FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "exercise_media readable by everyone" ON public.exercise_media;
CREATE POLICY "exercise_media readable by everyone"
  ON public.exercise_media FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON TABLE public.disciplines FROM anon;
REVOKE SELECT ON TABLE public.reward_catalog FROM anon;
REVOKE SELECT ON TABLE public.exercise_families FROM anon;
REVOKE SELECT ON TABLE public.exercise_media FROM anon;

-- ─────────────────────────────────────────────────────────────────────────
-- CTX-17 — extensions installées dans le schéma `public`
-- ─────────────────────────────────────────────────────────────────────────
-- Vérifié en production : `unaccent` et `fuzzystrmatch` sont dans `public`,
-- donc leurs fonctions sont exposées par PostgREST. Le schéma `extensions`
-- existe déjà et héberge la convention du projet (pg_trgm, pgcrypto,
-- uuid-ossp...).
--
-- Risque de rupture évalué AVANT déplacement (c'est ce que l'audit signalait
-- comme « à planifier ») :
--   · aucun index fonctionnel ne référence unaccent / levenshtein / f_unaccent
--     (`pg_indexes` → 0 ligne) ;
--   · aucune policy RLS ne les référence (0 ligne) ;
--   · les deux seules fonctions applicatives qui les utilisent
--     (`f_unaccent`, `create_custom_food_with_barcode`) déclarent déjà
--     `SET search_path = public, extensions, pg_catalog` — elles résoudront
--     donc les fonctions et le dictionnaire de recherche après déplacement.
--     `f_unaccent` fait `select unaccent('unaccent', $1)` : le dictionnaire
--     `unaccent` suit son extension et reste résolu via ce search_path.
ALTER EXTENSION unaccent SET SCHEMA extensions;
ALTER EXTENSION fuzzystrmatch SET SCHEMA extensions;
