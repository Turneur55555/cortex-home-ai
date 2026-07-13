import { createFileRoute } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { NutritionTab } from "./fitness/NutritionTab";
import { useAuth } from "@/hooks/use-auth";
import { useProfile } from "@/hooks/useProfile";
import { useActivityStreak } from "@/hooks/useActivityStreak";

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
  const { user } = useAuth();
  const fallback = user?.email?.split("@")[0] ?? "Toi";
  const { pseudo } = useProfile(fallback);
  const { current: streak } = useActivityStreak();

  return (
    <main
      className="flex flex-1 flex-col px-5 pb-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.25rem)" }}
    >
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold leading-tight tracking-tight">
          Bonjour <span className="text-primary">{pseudo}</span>{" "}
          <span className="inline-block">👋</span>
        </h1>
        {streak > 0 && (
          <div className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-semibold">
            <Flame className="h-3.5 w-3.5 text-warning" />
            <span>{streak}</span>
          </div>
        )}
      </header>

      <NutritionTab />
    </main>
  );
}
