import type { BookSearchResult } from "./types";

type OpenLibraryDoc = {
  key?: unknown;
  title?: unknown;
  author_name?: unknown;
  first_publish_year?: unknown;
  number_of_pages_median?: unknown;
  isbn?: unknown;
  cover_i?: unknown;
};

export const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";

export function openLibrarySearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query.trim().slice(0, 200),
    limit: "12",
    fields: "key,title,author_name,first_publish_year,number_of_pages_median,isbn,cover_i",
  });
  return `${OPEN_LIBRARY_SEARCH_URL}?${params.toString()}`;
}

export function openLibraryCoverUrl(coverId: number, size: "S" | "M" | "L" = "M"): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

/** Normalise la réponse Open Library ; ignore les documents sans titre. */
export function parseOpenLibrary(raw: unknown): BookSearchResult[] {
  const docs =
    raw && typeof raw === "object" && Array.isArray((raw as { docs?: unknown }).docs)
      ? ((raw as { docs: unknown[] }).docs as OpenLibraryDoc[])
      : [];
  const out: BookSearchResult[] = [];
  for (const d of docs) {
    if (!d || typeof d.title !== "string" || !d.title.trim()) continue;
    const authors = Array.isArray(d.author_name) ? d.author_name : [];
    const isbns = Array.isArray(d.isbn) ? d.isbn : [];
    out.push({
      externalId: typeof d.key === "string" ? d.key : d.title,
      title: d.title.trim(),
      author: typeof authors[0] === "string" ? authors[0] : null,
      year: typeof d.first_publish_year === "number" ? d.first_publish_year : null,
      pages: typeof d.number_of_pages_median === "number" ? d.number_of_pages_median : null,
      isbn: typeof isbns[0] === "string" ? isbns[0] : null,
      coverUrl: typeof d.cover_i === "number" ? openLibraryCoverUrl(d.cover_i) : null,
    });
  }
  return out;
}
