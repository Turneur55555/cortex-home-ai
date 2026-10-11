import { useMutation } from "@tanstack/react-query";
import { openLibrarySearchUrl, parseOpenLibrary } from "@/lib/books/openLibrary";
import type { BookSearchResult } from "@/lib/books/types";

/** Recherche de livres (titre, auteur ou ISBN) sur Open Library — sans clé, en ligne uniquement. */
export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(openLibrarySearchUrl(q), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error("Recherche indisponible pour le moment.");
  return parseOpenLibrary(await res.json());
}

export function useBookSearch() {
  return useMutation({ mutationFn: searchBooks });
}
