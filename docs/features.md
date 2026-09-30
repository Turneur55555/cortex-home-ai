# Features existantes

> ⚠️ **Document partiellement daté (juin 2026).** Il n'a pas suivi l'évolution de l'app et ne doit
> pas être lu comme un inventaire à jour. Seule la section « Coach IA » ci-dessous a été corrigée le
> 30/09/2026, parce qu'elle décrivait des systèmes supprimés depuis (périodisation, RPE). Pour
> l'état réel du produit, lire le code et `MEMORY.md`.

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

## Coach IA — Sensei (corrigé le 30/09/2026)
- Le Coach IA s'appelle **Sensei** et génère **une séance à la fois**, par discipline, à partir d'un
  questionnaire déclaré par chaque moteur (`ENGINE_REGISTRY`) — voir `CoachSheet.tsx` et
  `lib/fitness/engines/`.
- **Supprimé, ne pas réintroduire** : les programmes multi-semaines à périodisation (linéaire /
  ondulatoire / bloc), l'aperçu de courbe d'intensité, et toute notion de **RPE / RIR**
  (voir `docs/INVARIANTS.md` §3.4). `periodization.ts`, `loadRecommendation.ts`, `usePrograms.ts` et
  `ProgramSheet` n'existent plus ; les tables `training_programs` / `program_weeks` sont droppées par
  `supabase/migrations/20260930090000_drop_seasons_and_dead_tables.sql`.

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
- Récap narratif IA mensuel. Import Apple Health : livré (fichier d'export Santé, `lib/health/importAppleHealth.ts`).
- **Abandonnés** : comparaison communauté, périodisation adaptative, RPE, Saisons.
