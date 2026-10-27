import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { BookEditor } from "@/components/books/BookEditor";
import { BOOK_STATUSES } from "@/lib/books/types";

export const Route = createFileRoute("/_authenticated/livres/ajouter")({
  head: () => ({ meta: [{ title: "Ajouter un livre — ICORTEX" }] }),
  validateSearch: z.object({
    statut: z.enum(BOOK_STATUSES).optional().catch(undefined),
    q: z.string().max(200).optional().catch(undefined),
  }),
  component: AjouterLivrePage,
});

function AjouterLivrePage() {
  const { statut, q } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <main className="relative isolate flex flex-1 flex-col px-5 pb-32 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.5rem))]">
      <Link
        to="/livres"
        className="mb-5 inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Bibliothèque
      </Link>
      <BookEditor
        initialStatus={statut ?? "read"}
        initialQuery={q}
        onSaved={(id) => void navigate({ to: "/livres/$id", params: { id }, replace: true })}
      />
    </main>
  );
}
