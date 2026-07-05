-- Suppression complète de Stack B Nutrition (tables vides, jamais branchées au front).
-- Stack A (nutrition, foods, recipes, recipe_ingredients, meal_plans, nutrition_goals) PRÉSERVÉ.
DROP VIEW IF EXISTS daily_nutrition CASCADE;
DROP TABLE IF EXISTS meal_template_items CASCADE;
DROP TABLE IF EXISTS meal_templates CASCADE;
DROP TABLE IF EXISTS favorite_recipes CASCADE;
DROP TABLE IF EXISTS recipe_history CASCADE;
DROP TABLE IF EXISTS food_logs CASCADE;
DROP TABLE IF EXISTS meal_logs CASCADE;
DROP TABLE IF EXISTS recipe_categories CASCADE;
DROP FUNCTION IF EXISTS trg_food_log_fill() CASCADE;
DROP FUNCTION IF EXISTS search_foods(text, integer) CASCADE;
DROP FUNCTION IF EXISTS search_foods_advanced(text, text, numeric, numeric, boolean, integer) CASCADE;
DROP FUNCTION IF EXISTS compute_nutrition_targets(text) CASCADE;
NOTIFY pgrst, 'reload schema';
