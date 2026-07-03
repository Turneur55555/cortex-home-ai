/**
 * Dates LOCALES (fuseau de l'appareil) au format yyyy-MM-dd.
 * Ne jamais utiliser toISOString() pour une date "métier" : il convertit en UTC
 * et décale d'un jour entre minuit et ~2h du matin en France.
 */
export function localDateYMD(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Lundi de la semaine courante, en date locale. */
export function localWeekStartYMD(d: Date = new Date()): string {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  return localDateYMD(copy);
}
