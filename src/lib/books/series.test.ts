import { describe, expect, it } from "vitest";
import {
  annotateSeries,
  formatVolume,
  groupBySeries,
  parseExplicitVolume,
  parseTrailingNumber,
} from "./series";
import { googleCoverUrl, mapGenre, parseGoogleBooks, stripHtml } from "./googleBooks";
import { mergeSearchResults } from "./searchMerge";
import type { BookSearchResult } from "./types";

describe("parseExplicitVolume", () => {
  it.each([
    ["Harry Potter, Tome 1 : Harry Potter à l'école des sorciers", "Harry Potter", 1],
    ["One Piece T03", "One Piece", 3],
    ["La Horde du Contrevent - Vol. 2", "La Horde du Contrevent", 2],
    ["Dune (Dune Chronicles, #1)", "Dune Chronicles", 1],
    ["The Primal Hunter (The Primal Hunter #4)", "The Primal Hunter", 4],
    ["Mistborn Book 2", "Mistborn", 2],
    ["Cradle #3", "Cradle", 3],
    ["Les Rois maudits, tome 2,5", "Les Rois maudits", 2.5],
  ])("%s", (title, series, volume) => {
    expect(parseExplicitVolume(title)).toEqual({ series, volume });
  });

  it("ne voit pas de tome dans un titre ordinaire", () => {
    expect(parseExplicitVolume("L'Étranger")).toBeNull();
    expect(parseExplicitVolume("1984")).toBeNull();
    expect(parseExplicitVolume("Le Petit Prince")).toBeNull();
  });
});

describe("parseTrailingNumber", () => {
  it("repère un numéro final", () => {
    expect(parseTrailingNumber("The Primal Hunter 2")).toEqual({
      base: "The Primal Hunter",
      volume: 2,
    });
  });
  it("ignore les années et les titres numériques", () => {
    expect(parseTrailingNumber("1984")).toBeNull();
    expect(parseTrailingNumber("Paris 1900")).toBeNull();
  });
});

describe("annotateSeries", () => {
  const r = (
    title: string,
    extra: Partial<{ sourceSaysSeries: boolean; subtitle: string }> = {},
  ) => ({
    title,
    series: null as string | null,
    volume: null as number | null,
    ...extra,
  });

  it("corrobore les numéros de fin de titre entre résultats", () => {
    const out = annotateSeries([
      r("The Primal Hunter"),
      r("The Primal Hunter 2"),
      r("The Primal Hunter 3"),
    ]);
    expect(out.map((o) => [o.series, o.volume])).toEqual([
      ["The Primal Hunter", null],
      ["The Primal Hunter", 2],
      ["The Primal Hunter", 3],
    ]);
  });

  it("n'invente pas de saga pour un numéro isolé non corroboré", () => {
    expect(annotateSeries([r("Catch 22")])[0]).toMatchObject({ series: null, volume: null });
  });

  it("accepte un numéro isolé quand la source annonce une saga", () => {
    expect(annotateSeries([r("Cradle 4", { sourceSaysSeries: true })])[0]).toMatchObject({
      series: "Cradle",
      volume: 4,
    });
  });

  it("lit le tome dans le sous-titre et prend le titre comme saga", () => {
    expect(annotateSeries([r("Les Misérables", { subtitle: "Tome 2" })])[0]).toMatchObject({
      series: "Les Misérables",
      volume: 2,
    });
  });
});

describe("groupBySeries", () => {
  it("regroupe et ordonne les tomes, laisse les livres seuls à part", () => {
    const b = (series: string | null, volume: number | null) => ({ series, volume });
    const { series, standalone } = groupBySeries([
      b("Cradle", 3),
      b("cradle", 1),
      b(null, null),
      b("Dune", 1),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].books.map((x) => x.volume)).toEqual([1, 3]);
    expect(standalone).toHaveLength(2);
  });
});

describe("formatVolume", () => {
  it("formate les tomes entiers et décimaux", () => {
    expect(formatVolume(2)).toBe("Tome 2");
    expect(formatVolume(2.5)).toBe("Tome 2,5");
    expect(formatVolume(null)).toBeNull();
  });
});

describe("Google Books", () => {
  it("normalise un volume, son tome, son genre, son résumé et sa couverture", () => {
    const [g] = parseGoogleBooks({
      items: [
        {
          id: "abc",
          volumeInfo: {
            title: "The Primal Hunter 2",
            subtitle: "A LitRPG Adventure",
            authors: ["Zogarth"],
            publishedDate: "2022-05-03",
            pageCount: 714,
            categories: ["Fiction / Fantasy / Epic"],
            imageLinks: {
              thumbnail: "http://books.google.com/books/content?id=abc&zoom=1&edge=curl",
            },
            industryIdentifiers: [{ type: "ISBN_13", identifier: "9781039400000" }],
            description: "<p>Jake <b>continues</b>.</p>",
            seriesInfo: { bookDisplayNumber: "2" },
          },
        },
        { volumeInfo: { title: "" } },
      ],
    });
    expect(g).toMatchObject({
      source: "google",
      title: "The Primal Hunter 2",
      author: "Zogarth",
      year: 2022,
      pages: 714,
      volume: 2,
      genre: "Fantasy",
      description: "Jake continues.",
      isbn: "9781039400000",
      sourceSaysSeries: true,
    });
    expect(g.coverUrl).toBe("https://books.google.com/books/content?id=abc&zoom=1&fife=w480-h720");
  });

  it("mapGenre et stripHtml", () => {
    expect(mapGenre(["Fiction / Science Fiction / General"])).toBe("Science-fiction");
    expect(mapGenre(undefined)).toBeNull();
    expect(stripHtml("a<br>b &amp; c")).toBe("a\nb & c");
    expect(googleCoverUrl(null)).toBeNull();
  });
});

describe("mergeSearchResults", () => {
  const ol = (title: string, id: string): BookSearchResult => ({
    externalId: id,
    source: "openlibrary",
    title,
    author: "Zogarth",
    year: 2022,
    pages: null,
    isbn: null,
    coverUrl: null,
    series: null,
    volume: null,
    genre: null,
    description: null,
  });

  it("met les tomes d'une saga à la suite et dans l'ordre, écarte les doublons Open Library", () => {
    const google = parseGoogleBooks({
      items: [
        { id: "3", volumeInfo: { title: "The Primal Hunter 3", authors: ["Zogarth"] } },
        { id: "1", volumeInfo: { title: "The Primal Hunter", authors: ["Zogarth"] } },
        { id: "x", volumeInfo: { title: "Dungeon Crawler Carl", authors: ["Matt Dinniman"] } },
        { id: "2", volumeInfo: { title: "The Primal Hunter 2", authors: ["Zogarth"] } },
      ],
    });
    const out = mergeSearchResults(google, [ol("The Primal Hunter", "/w/1"), ol("Autre", "/w/2")]);
    expect(out.map((o) => `${o.title}|${o.volume ?? ""}`)).toEqual([
      "The Primal Hunter 2|2",
      "The Primal Hunter 3|3",
      "The Primal Hunter|",
      "Dungeon Crawler Carl|",
      "Autre|",
    ]);
    expect(out[0].series).toBe("The Primal Hunter");
  });

  it("sans Google, garde les résultats Open Library (couvertures différentes)", () => {
    const out = mergeSearchResults(
      [],
      [ol("The Primal Hunter", "/w/1"), ol("The Primal Hunter", "/w/2")],
    );
    expect(out).toHaveLength(2);
  });
});
