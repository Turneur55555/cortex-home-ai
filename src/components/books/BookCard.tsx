import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import type { BookWithCover } from "@/hooks/useBooks";
import { BookCover } from "./BookCover";
import { volumeBadge } from "./bookLabels";

export function BookCard({ book, className }: { book: BookWithCover; className?: string }) {
  return (
    <Link
      to="/livres/$id"
      params={{ id: book.id }}
      className={`group flex flex-col gap-2 transition-transform active:scale-[0.97] ${className ?? ""}`}
    >
      <BookCover
        src={book.coverSrc}
        title={book.title}
        author={book.author}
        badge={volumeBadge(book.volume)}
      />
      <div className="px-0.5">
        <p className="line-clamp-2 font-serif text-[13px] font-semibold leading-tight">
          {book.title}
        </p>
        {book.author && (
          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{book.author}</p>
        )}
        {book.status === "read" && book.rating != null && (
          <p className="mt-1 flex items-center gap-0.5" aria-label={`Note ${book.rating} sur 5`}>
            {Array.from({ length: book.rating }).map((_, i) => (
              <Star key={i} className="h-2.5 w-2.5 fill-primary text-primary" />
            ))}
          </p>
        )}
      </div>
    </Link>
  );
}
