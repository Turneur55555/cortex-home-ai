import { createFileRoute, Link } from "@tanstack/react-router";
import { Camera, ChevronLeft, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dressing/ajouter")({
  head: () => ({
    meta: [
      { title: "Ajouter une pièce — ICORTEX" },
      {
        name: "description",
        content: "Prépare l'ajout d'une pièce à ton dressing ICORTEX.",
      },
      { property: "og:title", content: "Ajouter une pièce — ICORTEX" },
      {
        property: "og:description",
        content: "Prépare l'ajout d'une pièce à ton dressing ICORTEX.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AddWardrobeItemPage,
});

function AddWardrobeItemPage() {
  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <header className="mb-6">
        <Link
          to="/dressing"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Mon dressing
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Ajouter une pièce</h1>
      </header>

      <section className="rounded-3xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-7 text-center shadow-card backdrop-blur-xl">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Camera className="h-6 w-6" />
        </span>
        <p className="mt-3 text-sm font-semibold">Étape suivante : la photo</p>
        <p className="mx-auto mt-1.5 max-w-[19rem] text-xs leading-relaxed text-muted-foreground">
          Bientôt, tu prendras ton vêtement en photo et ICORTEX le détourera, le classera
          automatiquement et l'ajoutera à ton dressing.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" />
          Analyse photo en préparation
        </div>
      </section>

      <Link
        to="/dressing"
        className="mt-5 flex items-center justify-center rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold transition-colors hover:border-primary/40"
      >
        Retour au dressing
      </Link>
    </main>
  );
}
