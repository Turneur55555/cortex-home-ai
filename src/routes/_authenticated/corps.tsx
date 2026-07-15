import { createFileRoute } from "@tanstack/react-router";
import { CorpsTab } from "./fitness/CorpsTab";

export const Route = createFileRoute("/_authenticated/corps")({
  head: () => ({
    meta: [
      { title: "Corps — ICORTEX" },
      { name: "description", content: "Suivi de ta composition corporelle et de tes mensurations." },
    ],
  }),
  component: CorpsPage,
});

function CorpsPage() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-6 pt-[max(2.75rem,calc(env(safe-area-inset-top)+0.75rem))]">
      <header className="mb-6">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Module
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Corps</h1>
      </header>

      <CorpsTab />
    </main>
  );
}
