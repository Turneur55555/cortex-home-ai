import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";

export const Route = createFileRoute("/_authenticated/stocks")({
  head: () => ({
    meta: [
      { title: "Stocks — ICORTEX" },
      { name: "description", content: "Inventaire intelligent : alimentation, habits, pharmacie, ménager." },
    ],
  }),
  component: StocksPage,
});

function StocksPage() {
  return <ComingSoon title="Stocks" subtitle="Frigo, garde-robe, pharmacie, ménager — bientôt disponible." />;
}

export function ComingSoon({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-elevated">
        <Construction className="h-7 w-7 text-primary" />
      </div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">{subtitle}</p>
      <p className="mt-6 inline-flex rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-medium text-muted-foreground">
        Phase 2 · à venir
      </p>
    </main>
  );
}
