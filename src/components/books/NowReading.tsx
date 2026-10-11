import { Link } from "@tanstack/react-router";
import type { BookWithCover } from "@/hooks/useBooks";
import { BookCover } from "./BookCover";
import { seriesLine } from "./bookLabels";

/** Encart « En ce moment » : le livre en cours, sur fond de sa propre couverture. */
export function NowReading({ books }: { books: readonly BookWithCover[] }) {
  const [book, ...others] = books;
  if (!book) return null;
  const line = seriesLine(book.series, book.volume);
  return (
    <Link
      to="/livres/$id"
      params={{ id: book.id }}
      className="relative isolate mb-6 flex items-center gap-4 overflow-hidden rounded-3xl border border-white/10 p-4 shadow-card active:scale-[0.99]"
    >
      {book.coverSrc ? (
        <img
          src={book.coverSrc}
          alt=""
          aria-hidden
          className="absolute inset-0 -z-10 h-full w-full scale-150 object-cover opacity-50 blur-2xl"
        />
      ) : (
        <div aria-hidden className="absolute inset-0 -z-10 bg-primary/15" />
      )}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-r from-background/60 to-background/85"
      />
      <div className="w-20 shrink-0">
        <BookCover src={book.coverSrc} title={book.title} author={book.author} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
          En ce moment
        </p>
        <p className="mt-1 line-clamp-2 font-serif text-xl font-semibold leading-tight">
          {book.title}
        </p>
        {book.author && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{book.author}</p>
        )}
        {line && <p className="mt-1 truncate text-xs text-muted-foreground/80">{line}</p>}
        {others.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            + {others.length} autre{others.length > 1 ? "s" : ""} en cours
          </p>
        )}
      </div>
    </Link>
  );
}
