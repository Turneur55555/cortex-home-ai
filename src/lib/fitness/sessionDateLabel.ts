// ============================================================
// Libellé de date d'une séance dans l'historique — logique PURE.
//
// `workouts.date` est une date SANS heure (colonne Postgres `date`) : la
// formater avec « HH'h'mm » affichait minuit pour toutes les séances
// (« MERCREDI 4 NOVEMBRE • 00H00 », signalé par Nathan le 04/11/2026).
// L'heure vient de `created_at` (début de la séance), mais seulement quand
// elle tombe le même jour que `date` : une séance saisie après coup
// (« Je l'ai faite », date corrigée) n'a pas d'heure connue — on n'en invente
// pas, on affiche la date seule.
// ============================================================

import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

export function sessionDateLabel(date: string, createdAt?: string | null): string {
  const day = format(parseISO(date), "EEEE d MMMM", { locale: fr });
  if (!createdAt) return day;
  const started = new Date(createdAt);
  if (Number.isNaN(started.getTime())) return day;
  if (format(started, "yyyy-MM-dd") !== date) return day;
  return `${day} • ${format(started, "HH'h'mm")}`;
}
