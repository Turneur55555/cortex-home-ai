/**
 * LA SÉANCE À REFAIRE AUJOURD'HUI : LA RÈGLE, EN PUR.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro couleur).
 *
 * ── Le constat (production, octobre 2026) ──
 * La Carte du jour d'un joueur sans plan — c'est le cas de tout le monde tant qu'il n'a pas
 * planifié sa semaine — se réduisait à « Quoi faire aujourd'hui ? » : une question renvoyée à
 * quelqu'un qui compte 600 séances d'historique. Or l'historique dit déjà quoi faire. Zéro
 * réglage, un seul geste : « Refaire ».
 *
 * ── Ce que la règle propose : un FAIT, pas une estimation ──
 * Parmi les séances HABITUELLES — un même nom, au moins `MIN_OCCURRENCES` fois sur les
 * `WINDOW_DAYS` derniers jours —, celle qu'on n'a pas faite depuis le plus longtemps. Rien n'est
 * calculé sur la récupération, la fatigue ou la forme (décision du 30/09/2026) : « la plus
 * ancienne de tes séances habituelles » se lit dans les dates.
 *
 * Garde-fous, chacun pour une raison :
 *  - une séance faite il y a moins de `MIN_DAYS_SINCE` jours n'est pas proposée : suggérer ce
 *    qu'on a fait hier n'aide personne ;
 *  - il faut de quoi REFAIRE : la référence est la dernière séance de ce nom qui porte des
 *    séries (`lastSameNamedSession`) — une séance importée sans exercice n'est pas répétable ;
 *  - un seul nom d'historique ne fait pas un rythme : sans au moins une séance habituelle, pas de
 *    suggestion (la carte retombe sur son invitation).
 */

import { isCountedWorkout } from "@/lib/fitness/weeklyPlan";
import {
  daysBetweenYMD,
  lastSameNamedSession,
  type SessionReference,
  type TodayWorkout,
} from "@/lib/fitness/todayCard";
import { addDaysYMD } from "@/lib/dates";

/** Fenêtre de l'historique qui définit « habituelle » : huit semaines. */
export const WINDOW_DAYS = 56;
/** Au moins deux fois dans la fenêtre : une séance isolée n'est pas un rythme. */
export const MIN_OCCURRENCES = 2;
/** Pas de suggestion pour ce qui a été fait hier ou aujourd'hui. */
export const MIN_DAYS_SINCE = 2;

export interface SessionSuggestion {
  /** Nom d'affichage (celui de la séance la plus récente de ce nom). */
  name: string;
  /** La séance à refaire : la dernière de ce nom qui porte des séries. */
  reference: SessionReference;
  /** Jours depuis la dernière séance de ce nom — qu'elle soit répétable ou non. */
  daysSince: number;
  /** Combien de fois dans la fenêtre. */
  occurrences: number;
}

/** Casse, espaces ET accents ignorés : « Épaules » et « epaules » sont la même séance. */
function nameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

export function suggestSessionToRepeat(
  workouts: readonly TodayWorkout[],
  todayDate: string,
): SessionSuggestion | null {
  const windowStart = addDaysYMD(todayDate, -WINDOW_DAYS);

  const byName = new Map<string, TodayWorkout[]>();
  for (const workout of workouts) {
    if (!isCountedWorkout(workout)) continue;
    if (workout.date < windowStart || workout.date >= todayDate) continue;
    const key = nameKey(workout.name ?? "");
    if (key === "") continue;
    const list = byName.get(key);
    if (list) list.push(workout);
    else byName.set(key, [workout]);
  }

  let best: SessionSuggestion | null = null;
  for (const sessions of byName.values()) {
    if (sessions.length < MIN_OCCURRENCES) continue;
    const latest = sessions.reduce((a, b) => (b.date > a.date ? b : a));
    const daysSince = daysBetweenYMD(latest.date, todayDate);
    if (daysSince < MIN_DAYS_SINCE) continue;
    const reference = lastSameNamedSession(workouts, latest.name);
    if (reference === null) continue;

    const candidate: SessionSuggestion = {
      name: latest.name.trim(),
      reference,
      daysSince,
      occurrences: sessions.length,
    };
    if (
      best === null ||
      candidate.daysSince > best.daysSince ||
      (candidate.daysSince === best.daysSince && candidate.occurrences > best.occurrences) ||
      // Départage final stable : jamais dépendant de l'ordre de l'historique.
      (candidate.daysSince === best.daysSince &&
        candidate.occurrences === best.occurrences &&
        nameKey(candidate.name) < nameKey(best.name))
    ) {
      best = candidate;
    }
  }
  return best;
}
