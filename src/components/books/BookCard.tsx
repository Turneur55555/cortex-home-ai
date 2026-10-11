import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import type { BookWithCover } from "@/hooks/useBooks";
import { BookCover } from "./BookCover";

export function BookCard({ book }: { book: BookWithCover }) {
  return (
    <Link
      to="/livres/$id"
      params={{ id: book.id }}
      className="group flex flex-col gap-1.5 transition-opacity active:opacity-80"
    >
      <BookCover src={book.coverSrc} title={book.title} />
      <div className="px-0.5">
        <p className="line-clamp-2 text-xs font-semibold leading-tight">{book.title}</p>
        {book.author && (
          <p className="line-clamp-1 text-[11px] text-muted-foreground">{book.author}</p>
        )}
        {book.rating != null && (
          <p className="mt-0.5 flex items-center gap-0.5 text-[11px] text-primary">
            <Star className="h-3 w-3 fill-current" />
            <span className="tabular-nums">{book.rating}/5</span>
          </p>
        )}
      </div>
    </Link>
  );
}
