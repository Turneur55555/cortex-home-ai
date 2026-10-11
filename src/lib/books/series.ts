/**
 * Détection saga / tome à partir d'un titre de livre. Logique pure.
 *
 * Deux niveaux de confiance :
 * - motifs explicites (« Tome 2 », « T.3 », « Vol. 4 », « Book 5 », « (Saga, #2) ») : fiables seuls ;
 * - numéro en fin de titre (« The Primal Hunter 2 ») : ambigu (« Catch 22 »), donc
 *   seulement accepté s'il est corroboré (même base vue ailleurs, ou source qui annonce une saga).
 */

export type SeriesGuess = { series: string; volume: number };

const VOLUME_WORD = String.raw`(?:tome|t\.?|vol(?:ume)?\.?|book|livre|part(?:ie)?|episode|épisode|cycle|n°|no\.?)`;
const NUM = String.raw`(\d{1,4}(?:[.,]\d)?)`;

const toNumber = (s: string): number | null => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 9999 ? n : null;
};

const tidySeries = (s: string): string =>
  s
    .replace(/[\s,:;\-–—.(]+$/u, "")
    .replace(/^[\s,:;\-–—.)]+/u, "")
    .trim();

/** Motifs explicites. Renvoie null si rien de sûr. */
export function parseExplicitVolume(text: string): SeriesGuess | null {
  const t = text.trim();
  // « Titre (Saga, #2) » / « Titre (Saga #2) » / « Titre (Saga, Tome 2) »
  const paren = t.match(
    new RegExp(String.raw`\(([^()]+?)[\s,]*(?:#|${VOLUME_WORD}\s*)${NUM}\)\s*$`, "iu"),
  );
  if (paren) {
    const volume = toNumber(paren[2]);
    const series = tidySeries(paren[1]);
    if (volume != null && series) return { series, volume };
  }
  // « Saga, Tome 2 : sous-titre » / « Saga T02 » / « Saga - Book 3 »
  const word = t.match(new RegExp(String.raw`^(.+?)[\s,:\-–—.]*\b${VOLUME_WORD}\s*${NUM}\b`, "iu"));
  if (word) {
    const volume = toNumber(word[2]);
    const series = tidySeries(word[1]);
    if (volume != null && series) return { series, volume };
  }
  // « Saga #2 »
  const hash = t.match(new RegExp(String.raw`^(.+?)\s*#\s*${NUM}\b`, "u"));
  if (hash) {
    const volume = toNumber(hash[2]);
    const series = tidySeries(hash[1]);
    if (volume != null && series) return { series, volume };
  }
  return null;
}

/** Sous-titre réduit au numéro : « Tome 2 », « Vol. 3 », « Book 4 ». */
export function parseBareVolume(text: string): number | null {
  const m = text.trim().match(new RegExp(String.raw`^${VOLUME_WORD}\s*${NUM}$`, "iu"));
  return m ? toNumber(m[1]) : null;
}

/** « The Primal Hunter 2 » → { base: "The Primal Hunter", volume: 2 } (sans garantie : à corroborer). */
export function parseTrailingNumber(text: string): { base: string; volume: number } | null {
  const m = text.trim().match(/^(.*\p{L}.*?)\s+(\d{1,3})$/u);
  if (!m) return null;
  const volume = toNumber(m[2]);
  const base = tidySeries(m[1]);
  if (volume == null || volume < 1 || volume > 99 || !base) return null;
  return { base, volume };
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Annotatable = {
  title: string;
  subtitle?: string | null;
  series: string | null;
  volume: number | null;
  /** La source annonce une saga (ex. Google Books `seriesInfo`). */
  sourceSaysSeries?: boolean;
};

/**
 * Complète `series`/`volume` d'une liste de résultats, en corroborant les numéros de fin de titre
 * entre eux : « The Primal Hunter », « The Primal Hunter 2 », « The Primal Hunter 3 » → une saga.
 */
export function annotateSeries<T extends Annotatable>(items: readonly T[]): T[] {
  const trailing = items.map((i) => parseTrailingNumber(i.title));
  const baseCount = new Map<string, number>();
  items.forEach((i, idx) => {
    const base = trailing[idx]?.base ?? i.title;
    const k = norm(base);
    baseCount.set(k, (baseCount.get(k) ?? 0) + 1);
  });

  return items.map((item, idx) => {
    if (item.series && item.volume != null) return item;
    const explicit =
      parseExplicitVolume(item.title) ??
      (item.subtitle ? parseExplicitVolume(item.subtitle) : null);
    if (explicit) {
      return {
        ...item,
        series: item.series ?? explicit.series,
        volume: item.volume ?? explicit.volume,
      };
    }
    // Sous-titre réduit au numéro (« Tome 2 ») : la saga est le titre.
    const bare = item.subtitle ? parseBareVolume(item.subtitle) : null;
    if (bare != null) {
      return {
        ...item,
        series: item.series ?? tidySeries(item.title),
        volume: item.volume ?? bare,
      };
    }
    const tr = trailing[idx];
    if (tr && (item.sourceSaysSeries || (baseCount.get(norm(tr.base)) ?? 0) >= 2)) {
      return { ...item, series: item.series ?? tr.base, volume: item.volume ?? tr.volume };
    }
    // Titre nu d'une saga corroborée (« The Primal Hunter » au milieu des tomes 2 et 3).
    if (
      !item.series &&
      (baseCount.get(norm(item.title)) ?? 0) >= 2 &&
      trailing.some((t) => t && norm(t.base) === norm(item.title))
    ) {
      return { ...item, series: item.title };
    }
    return item;
  });
}

/** « Tome 2 », « Tome 2,5 ». */
export function formatVolume(volume: number | null | undefined): string | null {
  if (volume == null) return null;
  return `Tome ${Number.isInteger(volume) ? volume : String(volume).replace(".", ",")}`;
}

/** Trie des livres d'une même saga : tome croissant, sans tome à la fin. */
export function compareVolume(a: { volume: number | null }, b: { volume: number | null }): number {
  if (a.volume == null && b.volume == null) return 0;
  if (a.volume == null) return 1;
  if (b.volume == null) return -1;
  return a.volume - b.volume;
}

/** Regroupe par saga (clé normalisée) ; renvoie les sagas d'au moins `min` livres et le reste. */
export function groupBySeries<T extends { series: string | null; volume: number | null }>(
  books: readonly T[],
  min = 2,
): { series: { name: string; books: T[] }[]; standalone: T[] } {
  const groups = new Map<string, { name: string; books: T[] }>();
  const standalone: T[] = [];
  for (const b of books) {
    if (!b.series?.trim()) {
      standalone.push(b);
      continue;
    }
    const k = norm(b.series);
    const g = groups.get(k) ?? { name: b.series.trim(), books: [] };
    g.books.push(b);
    groups.set(k, g);
  }
  const series: { name: string; books: T[] }[] = [];
  for (const g of groups.values()) {
    if (g.books.length >= min) series.push({ ...g, books: [...g.books].sort(compareVolume) });
    else standalone.push(...g.books);
  }
  return { series, standalone };
}
