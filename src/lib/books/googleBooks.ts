import type { BookSearchResult } from "./types";

export const GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes";

export function googleBooksSearchUrl(query: string): string {
  const params = new URLSearchParams({
    q: query.trim().slice(0, 200),
    maxResults: "20",
    printType: "books",
    fields:
      "items(id,volumeInfo(title,subtitle,authors,publishedDate,pageCount,categories,imageLinks,industryIdentifiers,description,seriesInfo))",
  });
  return `${GOOGLE_BOOKS_URL}?${params.toString()}`;
}

/** Vignettes Google en https, sans l'effet « page cornée », en meilleure définition. */
export function googleCoverUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let u = raw.replace(/^http:\/\//, "https://").replace(/&edge=curl/g, "");
  if (!/[?&]fife=/.test(u)) u += "&fife=w480-h720";
  return u;
}

const GENRE_MAP: [RegExp, string][] = [
  [/science fiction/i, "Science-fiction"],
  [/fantasy/i, "Fantasy"],
  [/thriller|suspense/i, "Thriller"],
  [/mystery|detective|crime/i, "Polar"],
  [/horror/i, "Horreur"],
  [/romance/i, "Romance"],
  [/biography|autobiography/i, "Biographie"],
  [/history/i, "Histoire"],
  [/self-help|personal growth/i, "Développement personnel"],
  [/business|economics/i, "Business"],
  [/psychology/i, "Psychologie"],
  [/philosophy/i, "Philosophie"],
  [/health|fitness|sports/i, "Sport & santé"],
  [/comics|graphic novels|manga/i, "BD & manga"],
  [/poetry/i, "Poésie"],
  [/fiction/i, "Roman"],
];

export function mapGenre(categories: unknown): string | null {
  if (!Array.isArray(categories)) return null;
  const all = categories.filter((c): c is string => typeof c === "string").join(" / ");
  if (!all) return null;
  for (const [re, label] of GENRE_MAP) if (re.test(all)) return label;
  const last = all.split("/").pop()?.trim();
  return last ? last.slice(0, 100) : null;
}

/** Retire le HTML des résumés Google (balises, entités courantes). */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type GoogleItem = {
  id?: unknown;
  volumeInfo?: {
    title?: unknown;
    subtitle?: unknown;
    authors?: unknown;
    publishedDate?: unknown;
    pageCount?: unknown;
    categories?: unknown;
    imageLinks?: { thumbnail?: unknown; smallThumbnail?: unknown };
    industryIdentifiers?: unknown;
    description?: unknown;
    seriesInfo?: { bookDisplayNumber?: unknown };
  };
};

export type GoogleParsed = BookSearchResult & {
  subtitle: string | null;
  sourceSaysSeries: boolean;
};

export function parseGoogleBooks(raw: unknown): GoogleParsed[] {
  const items =
    raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)
      ? ((raw as { items: unknown[] }).items as GoogleItem[])
      : [];
  const out: GoogleParsed[] = [];
  for (const it of items) {
    const v = it?.volumeInfo;
    if (!v || typeof v.title !== "string" || !v.title.trim()) continue;
    const authors = Array.isArray(v.authors) ? v.authors : [];
    const ids = Array.isArray(v.industryIdentifiers)
      ? (v.industryIdentifiers as { type?: unknown; identifier?: unknown }[])
      : [];
    const isbn =
      ids.find((i) => i.type === "ISBN_13")?.identifier ??
      ids.find((i) => i.type === "ISBN_10")?.identifier;
    const year =
      typeof v.publishedDate === "string" ? Number(v.publishedDate.slice(0, 4)) || null : null;
    const display = v.seriesInfo?.bookDisplayNumber;
    const volume =
      typeof display === "string" && /^\d+([.,]\d)?$/.test(display)
        ? Number(display.replace(",", "."))
        : null;
    const thumb = v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail;
    out.push({
      externalId: `gb:${typeof it.id === "string" ? it.id : v.title}`,
      source: "google",
      title: v.title.trim(),
      subtitle: typeof v.subtitle === "string" ? v.subtitle.trim() : null,
      author: typeof authors[0] === "string" ? authors[0] : null,
      year,
      pages: typeof v.pageCount === "number" && v.pageCount > 0 ? v.pageCount : null,
      isbn: typeof isbn === "string" ? isbn : null,
      coverUrl: googleCoverUrl(typeof thumb === "string" ? thumb : null),
      series: null,
      volume,
      genre: mapGenre(v.categories),
      description:
        typeof v.description === "string" ? stripHtml(v.description).slice(0, 5000) : null,
      sourceSaysSeries: !!v.seriesInfo,
    });
  }
  return out;
}
