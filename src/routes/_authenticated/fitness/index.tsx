import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity, Apple, Dumbbell } from "lucide-react";
import { z } from "zod";
import { CorpsTab } from "./CorpsTab";
import { SeancesTab } from "./SeancesTab";
import { NutritionTab } from "./NutritionTab";

const tabSchema = z.enum(["corps", "seances", "nutrition"]).catch("corps");
type Tab = z.infer<typeof tabSchema>;

const searchSchema = z.object({
  tab: tabSchema.optional(),
});

export const Route = createFileRoute("/_authenticated/fitness/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Fitness — ICORTEX" },
      { name: "description", content: "Suivi corps, séances et nutrition." },
    ],
  }),
  component: FitnessPage,
});

function FitnessPage() {
  const { tab = "corps" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setTab = (next: Tab) => {
    navigate({ search: { tab: next }, replace: true });
  };

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Fitness</h1>
      </header>

      <nav className="mb-6 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface p-1">
        <TabButton
          active={tab === "corps"}
          onClick={() => setTab("corps")}
          icon={<Activity className="h-4 w-4" />}
          label="Corps"
        />
        <TabButton
          active={tab === "seances"}
          onClick={() => setTab("seances")}
          icon={<Dumbbell className="h-4 w-4" />}
          label="Séances"
        />
        <TabButton
          active={tab === "nutrition"}
          onClick={() => setTab("nutrition")}
          icon={<Apple className="h-4 w-4" />}
          label="Nutrition"
        />
      </nav>

      {tab === "corps" && <CorpsTab />}
      {tab === "seances" && <SeancesTab />}
      {tab === "nutrition" && <NutritionTab />}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all " +
        (active
          ? "bg-gradient-primary text-primary-foreground shadow-glow"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {icon}
      {label}
    </button>
  );
}
