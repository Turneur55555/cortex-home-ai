import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Brain } from "lucide-react";
import { SeancesTab } from "./fitness/SeancesTab";
import { ProgramSheet } from "@/components/fitness/ProgramSheet";

export const Route = createFileRoute("/_authenticated/seances")({
  head: () => ({
    meta: [
      { title: "Séances — ICORTEX" },
      { name: "description", content: "Tes séances d'entraînement et ton Coach IA." },
    ],
  }),
  component: SeancesPage,
});

function SeancesPage() {
  const [coachOpen, setCoachOpen] = useState(false);

  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Module
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Séances</h1>
        </div>
        <button
          type="button"
          onClick={() => setCoachOpen(true)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/5 px-3 text-xs font-semibold text-primary"
        >
          <Brain className="h-3.5 w-3.5" />
          Coach IA
        </button>
      </header>

      <SeancesTab />

      {coachOpen && <ProgramSheet onClose={() => setCoachOpen(false)} />}
    </main>
  );
}
