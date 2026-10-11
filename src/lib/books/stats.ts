import type { Book } from "./types";

export type ReadingStats = {
  readCount: number;
  readingCount: number;
  toReadCount: number;
  averageRating: number | null;
  totalPages: number;
  byYear: { year: number; count: number }[];
  topGenres: { genre: string; count: number }[];
};

export function computeReadingStats(books: readonly Book[]): ReadingStats {
  const read = books.filter((b) => b.status === "read");
  const rated = read.filter((b) => b.rating != null);
  const years = new Map<number, number>();
  const genres = new Map<string, number>();
  for (const b of read) {
    const y = b.finished_on ? Number(b.finished_on.slice(0, 4)) : NaN;
    if (Number.isFinite(y)) years.set(y, (years.get(y) ?? 0) + 1);
    if (b.genre) genres.set(b.genre, (genres.get(b.genre) ?? 0) + 1);
  }
  return {
    readCount: read.length,
    readingCount: books.filter((b) => b.status === "reading").length,
    toReadCount: books.filter((b) => b.status === "to_read").length,
    averageRating: rated.length
      ? Math.round((rated.reduce((s, b) => s + (b.rating ?? 0), 0) / rated.length) * 10) / 10
      : null,
    totalPages: read.reduce((s, b) => s + (b.pages ?? 0), 0),
    byYear: [...years].map(([year, count]) => ({ year, count })).sort((a, b) => b.year - a.year),
    topGenres: [...genres]
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre))
      .slice(0, 3),
  };
}

/** Tri de l'étagère : lus par date de fin récente, sinon par ajout récent. */
export function sortBooks(books: readonly Book[]): Book[] {
  return [...books].sort((a, b) => {
    const da = a.finished_on ?? a.created_at ?? "";
    const db = b.finished_on ?? b.created_at ?? "";
    return db.localeCompare(da);
  });
}
