import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Loader2, Pencil, Star, Trash2 } from "lucide-react";
import { useBook, useDeleteBook } from "@/hooks/useBooks";
import { BOOK_STATUS_LABEL } from "@/lib/books/types";
import { BookCover } from "@/components/books/BookCover";
import { BookEditor } from "@/components/books/BookEditor";
import { AppSheet } from "@/components/profile/AppSheet";

export const Route = createFileRoute("/_authenticated/livres/$id")({
  head: () => ({ meta: [{ title: "Livre — ICORTEX" }] }),
  component: LivrePage,
});

const fmt = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { dateStyle: "long" }) : null;

function LivrePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: book, isLoading } = useBook(id);
  const del = useDeleteBook();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const back = (
    <Link
      to="/livres"
      className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      Bibliothèque
    </Link>
  );

  if (!book) {
    return (
      <main className="flex flex-1 flex-col px-5 pt-[max(2.5rem,env(safe-area-inset-top))]">
        {back}
        <p className="text-sm text-muted-foreground">Ce livre n'existe plus.</p>
      </main>
    );
  }

  const dates = [
    fmt(book.started_on) && `Commencé le ${fmt(book.started_on)}`,
    fmt(book.finished_on) && `Terminé le ${fmt(book.finished_on)}`,
  ].filter(Boolean);

  return (
    <main className="flex flex-1 flex-col px-5 pb-32 pt-[max(2.5rem,env(safe-area-inset-top))]">
      {back}

      <div className="mx-auto mb-5 w-44">
        <BookCover src={book.coverSrc} title={book.title} />
      </div>

      <h1 className="text-center text-xl font-bold leading-tight">{book.title}</h1>
      {book.author && (
        <p className="mt-1 text-center text-sm text-muted-foreground">{book.author}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
        <span className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-medium text-primary">
          {BOOK_STATUS_LABEL[book.status]}
        </span>
        {book.genre && (
          <span className="rounded-full border border-border px-3 py-1">{book.genre}</span>
        )}
        {book.pages && (
          <span className="rounded-full border border-border px-3 py-1">{book.pages} pages</span>
        )}
      </div>

      {book.rating != null && (
        <div className="mt-4 flex justify-center gap-1" aria-label={`Note ${book.rating} sur 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`h-6 w-6 ${n <= (book.rating ?? 0) ? "fill-primary text-primary" : "text-muted-foreground/40"}`}
            />
          ))}
        </div>
      )}

      {dates.length > 0 && (
        <p className="mt-4 text-center text-xs text-muted-foreground">{dates.join(" · ")}</p>
      )}

      {book.review && (
        <section className="mt-6 rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 p-4 shadow-card">
          <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Mon avis
          </h2>
          <p className="whitespace-pre-wrap text-sm">{book.review}</p>
        </section>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-semibold text-primary-foreground"
        >
          <Pencil className="h-4 w-4" /> Modifier
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-destructive/40 text-sm font-semibold text-destructive"
        >
          <Trash2 className="h-4 w-4" /> Supprimer
        </button>
      </div>

      <AppSheet open={editing} onOpenChange={setEditing} title="Modifier le livre">
        <div className="max-h-[78vh] overflow-y-auto px-5 pb-4">
          <BookEditor book={book} onDone={() => setEditing(false)} />
        </div>
      </AppSheet>

      <AppSheet
        open={confirming}
        onOpenChange={setConfirming}
        title="Supprimer ce livre ?"
        size="compact"
      >
        <div className="space-y-3 px-5 pb-4">
          <p className="text-sm text-muted-foreground">
            « {book.title} » sera retiré de ta bibliothèque.
          </p>
          <button
            type="button"
            disabled={del.isPending}
            onClick={() =>
              del.mutate(book, {
                onSuccess: () => void navigate({ to: "/livres" }),
              })
            }
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-destructive text-sm font-semibold text-destructive-foreground disabled:opacity-50"
          >
            {del.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Supprimer définitivement
          </button>
        </div>
      </AppSheet>
    </main>
  );
}
