import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { GoalsManager } from "@/components/profile/GoalsManager";

export const Route = createFileRoute("/_authenticated/quetes")({
  head: () => ({
    meta: [
      { title: "Quêtes — ICORTEX" },
      { name: "description", content: "Toutes tes quêtes en cours et accomplies." },
    ],
  }),
  component: QuetesPage,
});

function QuetesPage() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="mb-2">
        <Link
          to="/profil"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Profil
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Quêtes</h1>
      </header>

      <GoalsManager />
    </main>
  );
}
