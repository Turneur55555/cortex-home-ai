import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { googleBooksSearchUrl, parseGoogleBooks, type GoogleParsed } from "@/lib/books/googleBooks";
import { openLibrarySearchUrl, parseOpenLibrary } from "@/lib/books/openLibrary";
import { mergeSearchResults } from "@/lib/books/searchMerge";
import type { BookSearchResult } from "@/lib/books/types";

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Recherche de livres (titre, auteur, saga ou ISBN), en ligne uniquement. Google Books
 * (tomes, résumé, genre) et Open Library sont interrogés en parallèle : l'un peut tomber
 * sans priver l'autre. Échoue seulement si les deux échouent.
 */
export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const [google, openLibrary] = await Promise.allSettled([
    fetchJson(googleBooksSearchUrl(q)).then(parseGoogleBooks),
    fetchJson(openLibrarySearchUrl(q)).then(parseOpenLibrary),
  ]);
  if (google.status === "rejected" && openLibrary.status === "rejected") {
    throw new Error("Recherche indisponible pour le moment.");
  }
  return mergeSearchResults(
    google.status === "fulfilled" ? (google.value as GoogleParsed[]) : [],
    openLibrary.status === "fulfilled" ? openLibrary.value : [],
  );
}

/** Recherche « au fil de la frappe » (anti-rebond 350 ms, résultats mis en cache 5 min). */
export function useBookSearch(query: string) {
  const [debounced, setDebounced] = useState(query.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);
  const result = useQuery({
    queryKey: ["book-search", debounced.toLowerCase()],
    queryFn: () => searchBooks(debounced),
    enabled: debounced.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { ...result, isTyping: query.trim() !== debounced };
}
