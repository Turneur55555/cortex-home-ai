# Migration Nutrition : Open Food Facts → USDA + Gemini + Base Icortex

## Objectif

Remplacer Open Food Facts par une architecture hybride **USDA FoodData Central** (source officielle) + **Gemini** (intelligence) + **base Supabase propriétaire** (cache progressif), sans casser le module Nutrition pendant la migration.

---

## Phase 1 — Audit (préalable, sans modification)

Cartographier toutes les références OFF :
- `src/services/openFoodFacts.ts` (service principal)
- `src/hooks/useFoodSearch.ts`, `src/components/FoodAutocomplete.tsx`, `BarcodeScannerSheet.tsx`
- Edge Functions (`scan-meal`, `scan-fridge`, `recipe-assistant`…) qui appellent OFF
- Composants Nutrition consommateurs : `NutritionSheet`, `MealScanSheet`, `PortionSelector`, `RecipeMacros`, `MacroProgress`
- Hooks dérivés : `useNutritionCalculator`, `use-nutrition-favorites`, `useMealPlan`
- Tables Supabase actuelles : `nutrition`, `nutrition_goals` (pas de table aliments → à créer)

Livrable : rapport `docs/migration-nutrition.md` listant fichiers/dépendances/impacts.

---

## Phase 2 — Schéma Supabase (base alimentaire Icortex)

Migration unique créant :

```text
foods                 — aliment canonique (nom, marque, source, macros /100g, micros JSONB)
food_barcodes         — code-barres → food_id (lookup O(1))
food_brands           — marques normalisées
food_categories       — taxonomie (USDA + Icortex)
food_synonyms         — alias FR/EN ("steack" → steak haché)
food_servings         — portions standard (1 scoop = 30g, 1 œuf = 55g…)
food_search_history   — historique par user (boost ranking)
food_favorites        — favoris user
food_custom_foods     — aliments perso user
food_quality_scores   — quality_score + confidence_score + flags
```

Index trigram (`pg_trgm`) sur `foods.name` + `food_synonyms.alias` pour recherche < 300 ms.

RLS :
- `foods`, `food_barcodes`, `food_brands`, `food_categories`, `food_synonyms`, `food_servings`, `food_quality_scores` → lecture publique (`authenticated` + `anon`), écriture `service_role` uniquement (alimenté par edge functions)
- `food_search_history`, `food_favorites`, `food_custom_foods` → scoped `auth.uid()`

GRANTS explicites conformément aux règles Cloud.

---

## Phase 3 — Connecteur USDA

Edge function `usda-lookup` :
- Recherche par nom (`/foods/search`) et par FDC ID (`/food/{fdcId}`)
- Récupération barcode (UPC) via `dataType=Branded`
- Normalisation macros → /100g, micros → JSONB
- Calcul automatique `quality_score` (kcal théoriques vs déclarées, complétude)
- Upsert dans `foods` + `food_barcodes` + `food_quality_scores`
- Cache : si `food` déjà présent → retour direct sans appel USDA

Secret requis : `USDA_API_KEY` (à demander à l'utilisateur — gratuit sur api.data.gov).

---

## Phase 4 — Couche Gemini intelligente

Edge function `smart-food-search` :
- Input : requête utilisateur brute ("steack 5", "banne", "escalope")
- Gemini → correction + expansion synonymes + intention (ne JAMAIS inventer macros)
- Recherche FTS dans `foods` + `food_synonyms`
- Si rien trouvé → fallback `usda-lookup` puis ré-indexation
- Output : liste classée [favoris user > historique > base Icortex > USDA importable]

Edge function `estimate-portion` (Gemini vision) : photo → unité + grammage estimé, macros prises de `foods`.

Garde-fou : tout résultat Gemini sans correspondance `food_id` est marqué 🔴 et non sauvegardé.

---

## Phase 5 — Refactor frontend (sans toucher au design)

- `src/services/usda.ts` (nouveau) — client HTTP vers edge function
- `src/services/foodCatalog.ts` (nouveau) — façade unifiée recherche/barcode/favoris
- `src/hooks/useFoodSearch.ts` — réécrit pour pointer sur `foodCatalog` (mêmes signatures)
- `src/components/FoodAutocomplete.tsx`, `BarcodeScannerSheet.tsx` — branchés sur nouveau hook
- Affichage badges qualité (🟢🟠🔴) dans la ligne résultat
- React Query : `staleTime: 5min` sur recherches, `Infinity` sur lookup barcode

---

## Phase 6 — Suppression Open Food Facts

Une fois la nouvelle chaîne validée (tests manuels whey/riz/œuf/scan barcode) :
- `rm src/services/openFoodFacts.ts`
- Retirer toutes occurrences `fetch('https://world.openfoodfacts.org')` dans edge functions
- Nettoyer imports + `package.json` (si dépendance dédiée)
- `rg -i "openfoodfacts|open.food.facts"` doit retourner 0 résultat

---

## Phase 7 — Vérification & rapport

- `tsc` clean, build Vite clean
- Test e2e manuel : recherche "whey" → ajout 33g → macros correctes
- Test scan barcode produit connu + inconnu
- Rapport final `docs/migration-nutrition.md` mis à jour (avant/après, dette, risques)

---

## Détails techniques

**Stack** : React Query, Supabase, Edge Functions Deno, Gemini via `GEMINI_API_KEY` (déjà configuré selon `MEMORY.md`), USDA via `USDA_API_KEY` (à provisionner).

**Risque principal** : volumétrie USDA (~600k aliments) — on n'importe pas en masse, on alimente à la demande via cache.

**Points qui nécessitent ta validation avant exécution** :
1. Tu confirmes la création du secret `USDA_API_KEY` (clé gratuite, je te guiderai) ?
2. Tu veux que je conserve **temporairement** OFF en fallback pendant la phase de validation, ou suppression directe Phase 6 ?
3. Migration en **une seule grosse PR** ou découpée phase par phase avec validation à chaque étape (recommandé) ?
