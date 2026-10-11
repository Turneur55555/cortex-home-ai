import { useMemo } from "react";
import { computeReadingStats } from "@/lib/books/stats";
import type { Book } from "@/lib/books/types";

export function ReadingStats({ books }: { books: readonly Book[] }) {
  const s = useMemo(() => computeReadingStats(books), [books]);
  if (s.readCount === 0) return null;
  const tiles = [
    { label: "lus", value: String(s.readCount) },
    { label: "pages", value: s.totalPages ? s.totalPages.toLocaleString("fr-FR") : "—" },
    { label: "note moy.", value: s.averageRating != null ? `${s.averageRating}/5` : "—" },
  ];
  return (
    <section className="mb-5">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-2xl border border-white/5 bg-gradient-to-b from-card/95 to-card/70 px-3 py-3 text-center shadow-card"
          >
            <p className="text-lg font-semibold tabular-nums">{t.value}</p>
            <p className="text-[11px] text-muted-foreground">{t.label}</p>
          </div>
        ))}
      </div>
      {(s.byYear.length > 0 || s.topGenres.length > 0) && (
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">
          {s.byYear
            .slice(0, 3)
            .map((y) => `${y.count} en ${y.year}`)
            .join(" · ")}
          {s.byYear.length > 0 && s.topGenres.length > 0 ? " — " : ""}
          {s.topGenres.map((g) => g.genre).join(", ")}
        </p>
      )}
    </section>
  );
}
