-- Refonte du journal alimentaire : le gramme devient l'unique unité de
-- saisie/calcul/affichage côté client (WeightSelector/WeightEditModal
-- remplacent PortionSelector/PortionEditModal). Migration purement
-- documentaire : AUCUNE ligne existante n'est modifiée, aucune colonne
-- n'est supprimée — la compatibilité des données historiques (repas,
-- favoris, repas enregistrés, recettes, imports) est totale.
--
-- Contrat canonique à partir de maintenant (appliqué par le client, pas
-- par une contrainte DB, pour ne rien casser sur les lignes historiques
-- qui ne le respectent pas encore) :
--   - consumed_quantity = poids consommé en grammes
--   - consumed_unit     = toujours 'g'
--   - consumed_grams_per_unit = non utilisé pour les nouvelles écritures
--     (conservé en lecture pour convertir d'anciennes lignes scoop/pot/
--     tranche vers un grammage réel — voir lib/nutrition/weight.ts:
--     resolveConsumedGrams)
--   - base_calories/proteins/carbs/fats = toujours des valeurs POUR 100 G
--     (avant cette bascule, certaines lignes — ancien mode "portion" du
--     journal, repas de recette, scan code-barres — y stockaient des
--     valeurs par portion/unité. Le client les réinterprète à la volée à
--     chaque édition et les réécrit sous la forme canonique, sans jamais
--     modifier les macros déjà affichés à l'utilisateur.)
--   - serving_count = toujours 1 pour les nouvelles lignes du journal
--     (le nombre de portions d'une RECETTE reste un concept séparé et
--     intact : recipes.servings / recipe_ingredients / useRecipes)

comment on column public.nutrition.consumed_quantity is
  'Poids consommé en grammes (unique unité de saisie du journal depuis la bascule "grammes uniquement"). Pour les lignes historiques dans une autre unité, voir consumed_grams_per_unit et lib/nutrition/weight.ts::resolveConsumedGrams.';

comment on column public.nutrition.consumed_unit is
  'Toujours ''g'' pour les lignes écrites depuis la bascule "grammes uniquement". Les valeurs historiques (scoop, pot, tranche, portion...) restent lisibles mais ne sont plus produites.';

comment on column public.nutrition.consumed_grams_per_unit is
  'Déprécié pour les nouvelles écritures (toujours NULL) — conservé uniquement pour convertir en grammes les lignes historiques écrites en unité non-g/ml.';

comment on column public.nutrition.base_calories is
  'Valeur pour 100 g (convention canonique unique). Réécrite automatiquement à chaque édition du poids pour les lignes historiques qui suivaient une autre convention (ex. valeur par portion).';

comment on column public.nutrition.serving_count is
  'Toujours 1 pour les lignes du journal depuis la bascule "grammes uniquement". Sans lien avec le nombre de portions d''une recette (recipes.servings), qui reste un domaine séparé.';

comment on column public.saved_meal_items.consumed_quantity is
  'Poids consommé en grammes — même convention que public.nutrition.consumed_quantity.';

comment on column public.saved_meal_items.consumed_unit is
  'Toujours ''g'' pour les nouvelles écritures — même convention que public.nutrition.consumed_unit.';

comment on column public.saved_meal_items.base_calories is
  'Valeur pour 100 g (convention canonique unique) — même convention que public.nutrition.base_calories.';

comment on table public.food_servings is
  'Métadonnées internes de grammage par aliment (ex. "1 pot" = 125 g). Utilisées uniquement pour suggérer des grammages pertinents côté client (WeightSelector) — ne constituent jamais un mode de saisie par unité visible pour l''utilisateur.';
