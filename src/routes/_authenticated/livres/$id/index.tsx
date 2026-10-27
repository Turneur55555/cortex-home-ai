import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, Loader2, Pencil, Plus } from "lucide-react";
import { useBook, useBooks } from "@/hooks/useBooks";
import { BOOK_STATUS_SINGULAR } from "@/lib/books/types";
import { compareVolume } from "@/lib/books/series";
import { bookKey } from "@/lib/books/validation";
import { BookBackdrop, BookCover } from "@/components/books/BookCover";
import { StarRating } from "@/components/books/StarRating";
import { seriesLine, volumeBadge } from "@/components/books/bookLabels";

export const Route = createFileRoute("/_authenticated/livres/$id/")({
  head: () => ({ meta: [{ title: "Livre — ICORTEX" }] }),
  component: LivrePage,
});

const fmt = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { dateStyle: "long" }) : null;

function LivrePage() {
  const { id } = Route.useParams();
  const { data: book, isLoading } = useBook(id);
  const { data: all = [] } = useBooks();
  const [showSummary, setShowSummary] = useState(false);

  const saga = useMemo(() => {
    if (!book?.series) return [];
    const k = bookKey(book.series, null);
    return all.filter((b) => b.series && bookKey(b.series, null) === k).sort(compareVolume);
  }, [all, book?.series]);

  if (isLoading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!book) {
    return (
      <main className="flex flex-1 flex-col px-5 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.5rem))]">
        <Link to="/livres" className="mb-4 text-xs text-muted-foreground">
          ← Bibliothèque
        </Link>
        <p className="text-sm text-muted-foreground">Ce livre n'existe plus.</p>
      </main>
    );
  }

  const line = seriesLine(book.series, book.volume);
  const lastVolume = saga.reduce((m, b) => Math.max(m, b.volume ?? 0), 0);
  const nextVolume = book.series && lastVolume > 0 ? Math.floor(lastVolume) + 1 : null;
  const facts = [
    book.pages ? `${book.pages} pages` : null,
    book.published_year ? String(book.published_year) : null,
    book.genre,
  ].filter(Boolean) as string[];
  const dates = [
    book.started_on && `Commencé le ${fmt(book.started_on)}`,
    book.status === "read" && book.finished_on && `Terminé le ${fmt(book.finished_on)}`,
  ].filter(Boolean);

  return (
    <main className="relative isolate flex flex-1 flex-col px-5 pb-32 pt-[max(1.25rem,calc(env(safe-area-inset-top)+0.5rem))]">
      <BookBackdrop src={book.coverSrc} />

      <div className="mb-4 flex items-center justify-between">
        <Link
          to="/livres"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Bibliothèque
        </Link>
        <Link
          to="/livres/$id/modifier"
          params={{ id: book.id }}
          aria-label="Modifier"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-background/50 backdrop-blur-md"
        >
          <Pencil className="h-4 w-4" />
        </Link>
      </div>

      <div className="flex flex-col items-center text-center">
        <div className="w-40">
          <BookCover
            src={book.coverSrc}
            title={book.title}
            author={book.author}
            className="shadow-[0_24px_50px_-18px_rgba(0,0,0,0.95)]"
          />
        </div>
        {line && (
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            {line}
          </p>
        )}
        <h1
          className={`${line ? "mt-1" : "mt-6"} font-serif text-[26px] font-semibold leading-tight`}
        >
          {book.title}
        </h1>
        {book.author && <p className="mt-1 text-sm text-muted-foreground">{book.author}</p>}

        <span className="mt-4 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {BOOK_STATUS_SINGULAR[book.status]}
        </span>
        {book.status === "read" && book.rating != null && (
          <div className="mt-3">
            <StarRating value={book.rating} />
          </div>
        )}
        {facts.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">{facts.join(" · ")}</p>
        )}
        {dates.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground/80">{dates.join(" · ")}</p>
        )}
      </div>

      {book.review && (
        <section className="relative mt-8 rounded-2xl border border-white/10 bg-card/70 p-5 backdrop-blur">
          <span
            aria-hidden
            className="absolute -top-4 left-4 font-serif text-6xl leading-none text-primary/60"
          >
            “
          </span>
          <p className="whitespace-pre-wrap font-serif text-[16px] italic leading-relaxed">
            {book.review}
          </p>
        </section>
      )}

      {book.description && (
        <section className="mt-6">
          <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Résumé
          </h2>
          <div className="rounded-2xl border border-white/10 bg-card/70 p-4 backdrop-blur">
            <p
              className={`whitespace-pre-line text-sm leading-relaxed text-muted-foreground ${
                showSummary ? "" : "line-clamp-5"
              }`}
            >
              {book.description}
            </p>
            {book.description.length > 260 && (
              <button
                type="button"
                onClick={() => setShowSummary((v) => !v)}
                className="mt-2 text-xs font-semibold text-primary"
              >
                {showSummary ? "Réduire" : "Lire la suite"}
              </button>
            )}
          </div>
        </section>
      )}

      {book.series && (
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="font-serif text-lg font-semibold italic">{book.series}</h2>
            <span className="text-xs text-muted-foreground">
              {saga.length} {saga.length > 1 ? "tomes" : "tome"}
            </span>
          </div>
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
            {saga.map((b) => (
              <Link
                key={b.id}
                to="/livres/$id"
                params={{ id: b.id }}
                className={`w-24 shrink-0 transition-opacity ${b.id === book.id ? "" : "opacity-80"}`}
              >
                <BookCover
                  src={b.coverSrc}
                  title={b.title}
                  author={b.author}
                  badge={volumeBadge(b.volume)}
                  className={b.id === book.id ? "ring-2 ring-primary" : ""}
                />
                <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
                  {BOOK_STATUS_SINGULAR[b.status]}
                </p>
              </Link>
            ))}
            {nextVolume != null && (
              <Link
                to="/livres/ajouter"
                search={{ q: `${book.series} ${nextVolume}`, statut: "to_read" }}
                className="flex aspect-[2/3] w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-[6px] border border-dashed border-white/20 text-center text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Plus className="h-5 w-5" />
                <span className="px-2 text-[11px] font-medium leading-tight">
                  Tome {nextVolume}
                </span>
              </Link>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
