import { createFileRoute } from "@tanstack/react-router";
import { NutritionTab } from "./fitness/NutritionTab";

export const Route = createFileRoute("/_authenticated/nutrition")({
  head: () => ({
    meta: [
      { title: "Nutrition — ICORTEX" },
      { name: "description", content: "Tes macros, repas et objectifs nutritionnels." },
    ],
  }),
  component: NutritionPage,
});

function NutritionPage() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Nutrition</h1>
      </header>

      <NutritionTab />
    </main>
  );
}
