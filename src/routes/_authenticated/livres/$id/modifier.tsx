import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useBook, useDeleteBook } from "@/hooks/useBooks";
import { BookEditor } from "@/components/books/BookEditor";
import { AppSheet } from "@/components/profile/AppSheet";

export const Route = createFileRoute("/_authenticated/livres/$id/modifier")({
  head: () => ({ meta: [{ title: "Modifier le livre — ICORTEX" }] }),
  component: ModifierLivrePage,
});

function ModifierLivrePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: book, isLoading } = useBook(id);
  const del = useDeleteBook();
  const [confirming, setConfirming] = useState(false);

  return (
    <main className="relative isolate flex flex-1 flex-col px-5 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Link
        to="/livres/$id"
        params={{ id }}
        className="mb-5 inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Retour
      </Link>

      {isLoading ? (
        <Loader2 className="mx-auto mt-20 h-5 w-5 animate-spin text-muted-foreground" />
      ) : !book ? (
        <p className="text-sm text-muted-foreground">Ce livre n'existe plus.</p>
      ) : (
        <>
          <BookEditor
            book={book}
            onSaved={() => void navigate({ to: "/livres/$id", params: { id }, replace: true })}
            onDelete={() => setConfirming(true)}
          />
          <AppSheet
            open={confirming}
            onOpenChange={setConfirming}
            title="Supprimer ce livre ?"
            size="compact"
          >
            <div className="space-y-3 pb-4">
              <p className="text-sm text-muted-foreground">
                « {book.title} » sera retiré de ta bibliothèque.
              </p>
              <button
                type="button"
                disabled={del.isPending}
                onClick={() =>
                  del.mutate(book, {
                    onSuccess: () => void navigate({ to: "/livres", replace: true }),
                  })
                }
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-destructive text-sm font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {del.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Supprimer définitivement
              </button>
            </div>
          </AppSheet>
        </>
      )}
    </main>
  );
}
