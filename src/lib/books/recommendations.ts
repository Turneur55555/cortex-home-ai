import { bookKey } from "./validation";
import type { Book, BookSuggestion } from "./types";

/** Profil de goûts envoyé à l'IA : les livres lus les mieux notés + genres + déjà possédés. */
export type TasteProfile = {
  liked: { title: string; author: string | null; rating: number | null; genre: string | null }[];
  disliked: { title: string; author: string | null }[];
  favoriteGenres: string[];
  owned: string[];
};

const MAX_LIKED = 25;
const MAX_OWNED = 150;

export function buildTasteProfile(books: readonly Book[]): TasteProfile {
  const read = books.filter((b) => b.status === "read");
  const liked = read
    .filter((b) => b.rating == null || b.rating >= 4)
    .sort((a, b) => (b.rating ?? 3) - (a.rating ?? 3))
    .slice(0, MAX_LIKED)
    .map((b) => ({ title: b.title, author: b.author, rating: b.rating, genre: b.genre }));
  const disliked = read
    .filter((b) => b.rating != null && b.rating <= 2)
    .slice(0, 10)
    .map((b) => ({ title: b.title, author: b.author }));
  const genres = new Map<string, number>();
  for (const b of read) if (b.genre) genres.set(b.genre, (genres.get(b.genre) ?? 0) + 1);
  const favoriteGenres = [...genres]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([g]) => g);
  const owned = books.slice(0, MAX_OWNED).map((b) => b.title);
  return { liked, disliked, favoriteGenres, owned };
}

/** Parse la réponse JSON de l'edge function ; ignore tout élément mal formé. */
export function parseSuggestions(raw: unknown): BookSuggestion[] {
  const list =
    raw && typeof raw === "object" && Array.isArray((raw as { suggestions?: unknown }).suggestions)
      ? ((raw as { suggestions: unknown[] }).suggestions as unknown[])
      : [];
  const out: BookSuggestion[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const { title, author, why } = item as Record<string, unknown>;
    if (typeof title !== "string" || !title.trim()) continue;
    out.push({
      title: title.trim().slice(0, 300),
      author: typeof author === "string" ? author.trim().slice(0, 300) : "",
      why: typeof why === "string" ? why.trim().slice(0, 400) : "",
    });
  }
  return out;
}

/** Retire les suggestions déjà dans la bibliothèque (quel que soit le statut) et les doublons. */
export function filterNewSuggestions(
  suggestions: readonly BookSuggestion[],
  books: readonly Book[],
): BookSuggestion[] {
  const seen = new Set(books.map((b) => bookKey(b.title, b.author)));
  const out: BookSuggestion[] = [];
  for (const s of suggestions) {
    const k = bookKey(s.title, s.author);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}
