import { createFileRoute } from "@tanstack/react-router";
import { SeancesTab } from "./fitness/SeancesTab";

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
  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-12">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Séances</h1>
      </header>

      <SeancesTab />
    </main>
  );
}
