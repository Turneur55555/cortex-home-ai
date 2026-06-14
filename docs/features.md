# Features existantes

## Fitness
- Suivi des séances d'entraînement
- Carte de récupération musculaire (MuscleMap SVG)
- Calcul de récupération par muscle
- Historique d'entraînement

## Nutrition
- Suivi des macros alimentaires

## Profil
- Authentification Supabase
- Profil utilisateur avec pseudo

## Coach IA V2 (juin 14)
- Programmes multi-semaines avec périodisation (linéaire / ondulatoire / bloc) et semaines de décharge automatiques
- Aperçu live de la courbe intensité / RPE cible / volume par semaine
- Recommandation de charge auto-régulée par le RPE (reps en réserve, Epley inverse) et la récupération musculaire
- ProgramSheet, ouvert via le bouton « Coach IA » dans l'en-tête Fitness
- Tables : training_programs, program_weeks, program_sessions, program_exercises
- Domaine pur : lib/fitness/periodization.ts, lib/fitness/loadRecommendation.ts ; hooks/usePrograms.ts

## Nutrition V2 (juin 14)
- Recettes avec macros calculées depuis les ingrédients (champs *_per_100g de la table items)
- Planning de repas sur la semaine
- Génération de la liste de courses depuis le stock (besoins du planning moins le stock courant)
- MealPlanSheet, ouvert via le bouton « Planning de la semaine » dans l'onglet Nutrition
- Tables : recipes, recipe_ingredients, meal_plans (réutilise items et shopping_list)
- Domaine pur : lib/nutrition/recipes.ts, lib/nutrition/shoppingList.ts ; hooks/useRecipes.ts, hooks/useMealPlan.ts
