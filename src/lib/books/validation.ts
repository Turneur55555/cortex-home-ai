import type { BookInput } from "./types";
import { BOOK_STATUSES } from "./types";

const trimOrNull = (v: string | null | undefined, max: number): string | null => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};

/** Nettoie une saisie : bornes alignées sur les CHECK de la migration `books`. */
export function normalizeBookInput(input: BookInput): BookInput {
  const status = BOOK_STATUSES.includes(input.status) ? input.status : "to_read";
  const rating =
    input.rating != null && Number.isFinite(input.rating)
      ? Math.min(5, Math.max(1, Math.round(input.rating)))
      : null;
  const pages =
    input.pages != null && Number.isFinite(input.pages) && input.pages > 0
      ? Math.min(20000, Math.round(input.pages))
      : null;
  const finished = status === "read" ? (input.finished_on ?? null) : null;
  return {
    title: input.title.trim().slice(0, 300),
    author: trimOrNull(input.author, 300),
    isbn: trimOrNull(input.isbn, 32),
    status,
    // Une note n'a de sens que pour un livre lu.
    rating: status === "read" ? rating : null,
    started_on: status === "to_read" ? null : (input.started_on ?? null),
    finished_on: finished,
    genre: trimOrNull(input.genre, 100),
    pages,
    review: trimOrNull(input.review, 5000),
    cover_url: trimOrNull(input.cover_url, 1000),
    cover_path: trimOrNull(input.cover_path, 500),
    external_id: trimOrNull(input.external_id, 100),
  };
}

export function validateBookInput(input: BookInput): string | null {
  if (!input.title.trim()) return "Le titre est obligatoire.";
  if (input.started_on && input.finished_on && input.finished_on < input.started_on) {
    return "La date de fin précède la date de début.";
  }
  return null;
}

/** Clé de comparaison tolérante (casse, accents, ponctuation) pour détecter les doublons. */
export function bookKey(title: string, author: string | null | undefined): string {
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${clean(title)}|${clean(author ?? "")}`;
}
