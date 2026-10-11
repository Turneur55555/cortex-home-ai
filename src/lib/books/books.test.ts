import { describe, expect, it } from "vitest";
import { computeReadingStats, sortBooks } from "./stats";
import { buildTasteProfile, filterNewSuggestions, parseSuggestions } from "./recommendations";
import { parseOpenLibrary, openLibrarySearchUrl } from "./openLibrary";
import { bookKey, normalizeBookInput, validateBookInput } from "./validation";
import type { Book } from "./types";

const mk = (o: Partial<Book>): Book => ({
  id: o.id ?? "1",
  user_id: "u",
  title: "T",
  author: null,
  isbn: null,
  status: "read",
  rating: null,
  started_on: null,
  finished_on: null,
  genre: null,
  pages: null,
  review: null,
  cover_url: null,
  cover_path: null,
  external_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...o,
});

describe("validation", () => {
  it("exige un titre", () => {
    expect(validateBookInput({ title: "  ", status: "read" })).toMatch(/titre/i);
  });
  it("refuse une fin avant le début", () => {
    expect(
      validateBookInput({
        title: "x",
        status: "read",
        started_on: "2026-05-02",
        finished_on: "2026-05-01",
      }),
    ).toMatch(/date/i);
  });
  it("ne garde la note et la date de fin que pour un livre lu", () => {
    const n = normalizeBookInput({
      title: " x ",
      status: "to_read",
      rating: 5,
      finished_on: "2026-01-01",
    });
    expect(n.title).toBe("x");
    expect(n.rating).toBeNull();
    expect(n.finished_on).toBeNull();
  });
  it("borne la note entre 1 et 5", () => {
    expect(normalizeBookInput({ title: "x", status: "read", rating: 9 }).rating).toBe(5);
  });
  it("bookKey ignore casse et accents", () => {
    expect(bookKey("L'Étranger", "Albert Camus")).toBe(bookKey("l etranger", "albert  camus"));
  });
});

describe("stats", () => {
  it("calcule compteurs, moyenne, années et genres", () => {
    const s = computeReadingStats([
      mk({ id: "1", rating: 5, finished_on: "2026-02-01", genre: "SF", pages: 300 }),
      mk({ id: "2", rating: 4, finished_on: "2025-02-01", genre: "SF", pages: 200 }),
      mk({ id: "3", status: "reading" }),
      mk({ id: "4", status: "to_read" }),
    ]);
    expect(s.readCount).toBe(2);
    expect(s.readingCount).toBe(1);
    expect(s.toReadCount).toBe(1);
    expect(s.averageRating).toBe(4.5);
    expect(s.totalPages).toBe(500);
    expect(s.byYear[0]).toEqual({ year: 2026, count: 1 });
    expect(s.topGenres[0]).toEqual({ genre: "SF", count: 2 });
  });
  it("trie du plus récent au plus ancien", () => {
    const sorted = sortBooks([
      mk({ id: "a", finished_on: "2024-01-01" }),
      mk({ id: "b", finished_on: "2026-01-01" }),
    ]);
    expect(sorted.map((b) => b.id)).toEqual(["b", "a"]);
  });
});

describe("recommandations", () => {
  it("le profil sépare aimés / pas aimés et liste les livres possédés", () => {
    const p = buildTasteProfile([
      mk({ id: "1", title: "A", rating: 5, genre: "SF" }),
      mk({ id: "2", title: "B", rating: 1 }),
      mk({ id: "3", title: "C", status: "to_read" }),
    ]);
    expect(p.liked.map((l) => l.title)).toEqual(["A"]);
    expect(p.disliked.map((l) => l.title)).toEqual(["B"]);
    expect(p.owned).toEqual(["A", "B", "C"]);
    expect(p.favoriteGenres).toEqual(["SF"]);
  });
  it("parseSuggestions ignore les éléments mal formés", () => {
    const r = parseSuggestions({
      suggestions: [{ title: "Dune", author: "Herbert", why: "SF" }, { title: "" }, 3, null],
    });
    expect(r).toEqual([{ title: "Dune", author: "Herbert", why: "SF" }]);
    expect(parseSuggestions("nope")).toEqual([]);
  });
  it("filterNewSuggestions retire les livres déjà présents et les doublons", () => {
    const r = filterNewSuggestions(
      [
        { title: "dune", author: "frank herbert", why: "" },
        { title: "Neuromancien", author: "Gibson", why: "" },
        { title: "Neuromancien", author: "Gibson", why: "" },
      ],
      [mk({ title: "Dune", author: "Frank Herbert" })],
    );
    expect(r.map((s) => s.title)).toEqual(["Neuromancien"]);
  });
});

describe("openLibrary", () => {
  it("normalise la réponse et construit l'URL de couverture", () => {
    const r = parseOpenLibrary({
      docs: [
        {
          key: "/works/OL1W",
          title: "Dune",
          author_name: ["Frank Herbert"],
          first_publish_year: 1965,
          number_of_pages_median: 412,
          isbn: ["9780441013593"],
          cover_i: 123,
        },
        { title: "" },
        { nothing: true },
      ],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ title: "Dune", author: "Frank Herbert", year: 1965, pages: 412 });
    expect(r[0].coverUrl).toBe("https://covers.openlibrary.org/b/id/123-M.jpg");
  });
  it("encode la requête", () => {
    expect(openLibrarySearchUrl("le petit prince")).toContain("q=le+petit+prince");
  });
});
