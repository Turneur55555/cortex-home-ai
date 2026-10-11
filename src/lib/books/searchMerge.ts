import { annotateSeries, compareVolume } from "./series";
import { bookKey } from "./validation";
import type { GoogleParsed } from "./googleBooks";
import type { BookSearchResult } from "./types";

/**
 * Fusionne Google Books (meilleures métadonnées : tomes, résumé, genre) et Open Library
 * (couvertures souvent meilleures, sert de secours). Google d'abord ; un résultat Open Library
 * déjà couvert par Google (même titre + auteur) est écarté. Les tomes d'une même saga sont
 * ensuite regroupés et triés dans l'ordre.
 */
export function mergeSearchResults(
  google: readonly GoogleParsed[],
  openLibrary: readonly BookSearchResult[],
): BookSearchResult[] {
  const annotated = annotateSeries<
    BookSearchResult & { subtitle?: string | null; sourceSaysSeries?: boolean }
  >([...google, ...openLibrary.map((r) => ({ ...r, subtitle: null, sourceSaysSeries: false }))]);

  const googleKeys = new Set(
    annotated.filter((r) => r.source === "google").map((r) => bookKey(r.title, r.author)),
  );
  const seen = new Set<string>();
  const merged: BookSearchResult[] = [];
  for (const r of annotated) {
    if (r.source === "openlibrary" && googleKeys.has(bookKey(r.title, r.author))) continue;
    const k = `${bookKey(r.title, r.author)}|${r.volume ?? ""}|${r.source === "openlibrary" ? r.externalId : ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { subtitle, sourceSaysSeries, ...clean } = r as typeof r & {
      subtitle?: unknown;
      sourceSaysSeries?: unknown;
    };
    merged.push(clean);
  }

  // Ordre stable : on garde la pertinence de la recherche, mais les tomes d'une saga
  // se suivent, dans l'ordre, à la place du premier tome rencontré.
  const firstIndex = new Map<string, number>();
  merged.forEach((r, i) => {
    const s = r.series ? bookKey(r.series, r.author) : null;
    if (s && !firstIndex.has(s)) firstIndex.set(s, i);
  });
  return merged
    .map((r, i) => ({ r, i, g: r.series ? (firstIndex.get(bookKey(r.series, r.author)) ?? i) : i }))
    .sort((a, b) => a.g - b.g || (a.r.series ? compareVolume(a.r, b.r) : 0) || a.i - b.i)
    .map((x) => x.r);
}
