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

## V3 — Différenciation premium (juin 14)

### Coach recovery-aware (vague 1, livré)
- Le Coach IA tient compte de la récupération musculaire : pastille de statut (fatigué / en récup / prêt) sur chaque groupe dans CoachSheet, avertissement « Encore fatigué : X (récup ~Yh) » et suggestion des muscles prêts.
- Le contexte de récupération est transmis à l'edge function `coach-workout`, dont le prompt évite les muscles fatigués (<48h) et allège les muscles en récupération. Testé en live : pectoraux fatigués → séance générée sans aucun exercice pectoraux.
- Correctif au passage : CoachSheet envoyait des noms de muscles capitalisés rejetés par l'edge (validation en minuscules) → la génération muscu était cassée ; désormais noms normalisés en minuscules + dédup + cardio.
- Domaine pur : lib/fitness/recoveryAdvice.ts (+ tests). UI : CoachSheet.tsx, SeancesTab.tsx (passe recoveryMap). Edge : supabase/functions/coach-workout (lecture de body.recovery, normalisation des muscles).

### À venir (V3)
- Périodisation adaptative (deload auto 4-6 sem), récap narratif IA mensuel, import Apple Health (fichier d'export Santé). Comparaison communauté : abandonnée.
