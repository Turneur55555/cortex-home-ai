
-- Optimisation RLS initplan : (select auth.uid()) évalué une fois au lieu de par ligne.
-- Transformation sémantiquement identique. Tables cortex (fitness/nutrition) uniquement.

ALTER POLICY "exercise_catalog_delete" ON public.exercise_catalog USING ((select auth.uid()) IS NOT NULL);
ALTER POLICY "exercise_catalog_insert" ON public.exercise_catalog WITH CHECK ((select auth.uid()) IS NOT NULL);
ALTER POLICY "exercise_catalog_select" ON public.exercise_catalog USING ((select auth.uid()) IS NOT NULL);
ALTER POLICY "exercise_catalog_update" ON public.exercise_catalog USING ((select auth.uid()) IS NOT NULL);

ALTER POLICY "users manage own custom foods" ON public.food_custom_foods USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "users manage own favorites" ON public.food_favorites USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "users manage own search history" ON public.food_search_history USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "foods_delete_own" ON public.foods USING (user_id = (select auth.uid()));
ALTER POLICY "foods_insert_own" ON public.foods WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "foods_select_public_or_own" ON public.foods USING ((user_id IS NULL) OR (user_id = (select auth.uid())));
ALTER POLICY "foods_update_own" ON public.foods USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users manage own meal plans" ON public.meal_plans USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "fav_delete_own" ON public.nutrition_favorites USING ((select auth.uid()) = user_id);
ALTER POLICY "fav_insert_own" ON public.nutrition_favorites WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "fav_select_own" ON public.nutrition_favorites USING ((select auth.uid()) = user_id);

ALTER POLICY "Users manage own program exercises" ON public.program_exercises USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Users manage own program sessions" ON public.program_sessions USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Users manage own program weeks" ON public.program_weeks USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users manage own recipe ingredients" ON public.recipe_ingredients USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "recipes_modify_own" ON public.recipes USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "recipes_select_own_or_public" ON public.recipes USING ((user_id = (select auth.uid())) OR is_public);

ALTER POLICY "saved_meal_items_delete_own" ON public.saved_meal_items USING (EXISTS (SELECT 1 FROM saved_meals m WHERE m.id = saved_meal_items.saved_meal_id AND m.user_id = (select auth.uid())));
ALTER POLICY "saved_meal_items_insert_own" ON public.saved_meal_items WITH CHECK (EXISTS (SELECT 1 FROM saved_meals m WHERE m.id = saved_meal_items.saved_meal_id AND m.user_id = (select auth.uid())));
ALTER POLICY "saved_meal_items_select_own" ON public.saved_meal_items USING (EXISTS (SELECT 1 FROM saved_meals m WHERE m.id = saved_meal_items.saved_meal_id AND m.user_id = (select auth.uid())));
ALTER POLICY "saved_meal_items_update_own" ON public.saved_meal_items USING (EXISTS (SELECT 1 FROM saved_meals m WHERE m.id = saved_meal_items.saved_meal_id AND m.user_id = (select auth.uid())));

ALTER POLICY "saved_meals_delete_own" ON public.saved_meals USING (user_id = (select auth.uid()));
ALTER POLICY "saved_meals_insert_own" ON public.saved_meals WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "saved_meals_select_own" ON public.saved_meals USING (user_id = (select auth.uid()));
ALTER POLICY "saved_meals_update_own" ON public.saved_meals USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users manage own training programs" ON public.training_programs USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Users manage own exercise illustrations" ON public.user_exercise_illustrations USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Users see own reports" ON public.weekly_reports USING ((select auth.uid()) = user_id);
ALTER POLICY "Users manage own workout analyses" ON public.workout_analyses USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
