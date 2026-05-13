import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Activity, Apple, Dumbbell } from "lucide-react";
import { CorpsTab } from "./CorpsTab";
import { SeancesTab } from "./SeancesTab";
import { NutritionTab } from "./NutritionTab";

export const Route = createFileRoute("/_authenticated/fitness/")({
  head: () => ({
    meta: [
      { title: "Fitness — ICORTEX" },
      { name: "description", content: "Suivi corps, séances et nutrition." },
    ],
  }),
  component: FitnessPage,
});

type Tab = "corps" | "seances" | "nutrition";

function FitnessPage() {
  const [tab, setTab] = useState<Tab>("corps");

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
