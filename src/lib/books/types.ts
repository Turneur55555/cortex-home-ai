/** Types du domaine « Bibliothèque ». Logique pure : zéro React, zéro Supabase. */

export const BOOK_STATUSES = ["reading", "read", "to_read"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  reading: "En cours",
  read: "Lus",
  to_read: "À lire",
};

export type Book = {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  status: BookStatus;
  rating: number | null;
  started_on: string | null;
  finished_on: string | null;
  genre: string | null;
  pages: number | null;
  review: string | null;
  cover_url: string | null;
  cover_path: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Champs saisissables (le reste est géré par le repository offline). */
export type BookInput = {
  title: string;
  author?: string | null;
  isbn?: string | null;
  status: BookStatus;
  rating?: number | null;
  started_on?: string | null;
  finished_on?: string | null;
  genre?: string | null;
  pages?: number | null;
  review?: string | null;
  cover_url?: string | null;
  cover_path?: string | null;
  external_id?: string | null;
};

/** Résultat normalisé d'une recherche externe (Open Library). */
export type BookSearchResult = {
  externalId: string;
  title: string;
  author: string | null;
  year: number | null;
  pages: number | null;
  isbn: string | null;
  coverUrl: string | null;
};

export type BookSuggestion = {
  title: string;
  author: string;
  why: string;
};
