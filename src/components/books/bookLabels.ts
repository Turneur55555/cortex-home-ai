import { formatVolume } from "@/lib/books/series";

/** « The Primal Hunter · Tome 2 » (ou l'un des deux seulement). */
export function seriesLine(series: string | null, volume: number | null): string | null {
  const v = formatVolume(volume);
  if (series && v) return `${series} · ${v}`;
  return series ?? v;
}

/** Badge court pour une couverture : « T2 ». */
export function volumeBadge(volume: number | null): string | null {
  if (volume == null) return null;
  return `T${Number.isInteger(volume) ? volume : String(volume).replace(".", ",")}`;
}

export const RATING_WORDS = ["", "Décevant", "Moyen", "Bon", "Très bon", "Coup de cœur"];
