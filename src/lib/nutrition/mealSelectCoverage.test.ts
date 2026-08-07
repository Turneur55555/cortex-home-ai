import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Garde-fou anti-régression : chaque écran qui journalise un aliment/repas
// doit rendre le sélecteur Repas partagé (<MealSelect>, unique implémentation
// — voir src/components/fitness/MealSelect.tsx). La régression du 26/07/2026
// (onglet "Repas" de FoodLibrarySheet journalisant sans sélecteur, faute de
// test couvrant ce point) est passée inaperçue car aucun test ne vérifiait
// la présence de <MealSelect> dans ces écrans — ce test comble ce trou.
const SCREENS_THAT_MUST_RENDER_MEAL_SELECT = [
  "src/components/fitness/NutritionSheet.tsx", // Ajout manuel / création d'un aliment
  "src/components/BarcodeScannerSheet.tsx", // Scanner un code-barres
  "src/components/fitness/VoiceLogSheet.tsx", // Saisie vocale
  "src/components/fitness/MealScanSheet.tsx", // Scanner un repas (photo)
  "src/components/fitness/RecipeDetailSheet.tsx", // Fiche recette (module Recettes) — ajout au journal
  "src/components/fitness/MealPlanSheet.tsx", // Planning de repas
  "src/components/fitness/FavoritesSheet.tsx", // Favoris
  "src/components/fitness/FoodLibrarySheet.tsx", // Bibliothèque d'aliments (Tous/Mes aliments/Favoris/Repas)
  "src/components/fitness/SavedMealsList.tsx", // Repas enregistrés — implémentation partagée
  "src/components/fitness/MealEditor.tsx", // Éditeur de repas (création/édition unifiées)
];

describe("Sélecteur Repas — présence sur tous les écrans de journalisation", () => {
  it.each(SCREENS_THAT_MUST_RENDER_MEAL_SELECT)("%s rend <MealSelect>", (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf-8");
    expect(source).toMatch(/<MealSelect\b/);
  });
});
