import { useMemo } from "react";
import { computeReadingStats } from "@/lib/books/stats";
import type { Book } from "@/lib/books/types";

export function ReadingStats({ books }: { books: readonly Book[] }) {
  const s = useMemo(() => computeReadingStats(books), [books]);
  if (s.readCount === 0) return null;
  const thisYear = s.byYear.find((y) => y.year === new Date().getFullYear())?.count ?? 0;
  const tiles = [
    { value: String(s.readCount), label: s.readCount > 1 ? "livres lus" : "livre lu" },
    { value: String(thisYear), label: "cette année" },
    {
      value:
        s.totalPages >= 1000
          ? `${(Math.round(s.totalPages / 100) / 10).toLocaleString("fr-FR")} k`
          : String(s.totalPages || "—"),
      label: "pages",
    },
  ];
  return (
    <section className="mb-6 grid grid-cols-3 divide-x divide-white/5 rounded-2xl border border-white/10 bg-card/60 py-3 backdrop-blur">
      {tiles.map((t) => (
        <div key={t.label} className="text-center">
          <p className="font-serif text-2xl font-semibold tabular-nums">{t.value}</p>
          <p className="text-[11px] text-muted-foreground">{t.label}</p>
        </div>
      ))}
    </section>
  );
}
