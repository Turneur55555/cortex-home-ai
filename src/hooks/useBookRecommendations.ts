import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildTasteProfile,
  filterNewSuggestions,
  parseSuggestions,
} from "@/lib/books/recommendations";
import { searchBooks } from "@/hooks/useBookSearch";
import type { Book, BookSuggestion } from "@/lib/books/types";

export type EnrichedSuggestion = BookSuggestion & { coverUrl: string | null; pages: number | null };

/** Demande des idées de lecture à l'IA, retire les doublons, puis ajoute les couvertures. */
export function useBookRecommendations() {
  return useMutation({
    mutationFn: async ({
      books,
      wish,
    }: {
      books: readonly Book[];
      wish?: string;
    }): Promise<EnrichedSuggestion[]> => {
      const profile = buildTasteProfile(books);
      const { data, error } = await supabase.functions.invoke("book-recommendations", {
        body: { ...profile, wish: wish?.trim() || undefined },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const fresh = filterNewSuggestions(parseSuggestions(data), books).slice(0, 8);
      return Promise.all(
        fresh.map(async (s) => {
          try {
            const [hit] = await searchBooks(`${s.title} ${s.author}`);
            return { ...s, coverUrl: hit?.coverUrl ?? null, pages: hit?.pages ?? null };
          } catch {
            return { ...s, coverUrl: null, pages: null };
          }
        }),
      );
    },
  });
}
