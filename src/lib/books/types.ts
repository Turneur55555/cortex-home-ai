/** Types du domaine « Bibliothèque ». Logique pure : zéro React, zéro Supabase. */

export const BOOK_STATUSES = ["reading", "read", "to_read"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

/** Libellés des onglets de l'étagère (pluriel). */
export const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  reading: "En cours",
  read: "Lus",
  to_read: "À lire",
};

/** Libellé du statut d'UN livre (fiche, éditeur). */
export const BOOK_STATUS_SINGULAR: Record<BookStatus, string> = {
  to_read: "À lire",
  reading: "En cours",
  read: "Lu",
};

/** Ordre de saisie : du désir à la lecture terminée. */
export const BOOK_STATUS_EDIT_ORDER: readonly BookStatus[] = ["to_read", "reading", "read"];

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
  series: string | null;
  volume: number | null;
  description: string | null;
  published_year: number | null;
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
  series?: string | null;
  volume?: number | null;
  description?: string | null;
  published_year?: number | null;
};

/** Résultat normalisé d'une recherche externe (Google Books ou Open Library). */
export type BookSearchResult = {
  externalId: string;
  source: "google" | "openlibrary";
  title: string;
  author: string | null;
  year: number | null;
  pages: number | null;
  isbn: string | null;
  coverUrl: string | null;
  series: string | null;
  volume: number | null;
  genre: string | null;
  description: string | null;
};

export type BookSuggestion = {
  title: string;
  author: string;
  why: string;
};
