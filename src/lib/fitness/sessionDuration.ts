/**
 * LA DURÉE D'UNE SÉANCE : LA RÈGLE, EN PUR.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro couleur).
 *
 * ── Le constat (production, septembre 2026) ──
 * La durée était `now − début de la séance`, plafonnée à 600 minutes. Une séance démarrée puis
 * terminée bien plus tard (l'écran reste ouvert, on oublie « Terminer ») s'enregistrait donc à 600
 * — le plafond — alors que les séries validées tenaient dans une vingtaine de minutes : **4 des 7
 * dernières séances étaient à 600 min**, pour une fenêtre réelle de 21, 23, 205 min… et une
 * séance sans aucune série validée. Cette valeur nourrissait ensuite le « Temps » du bilan de
 * semaine, la Chronique, la comparaison d'intensité : un « 30 h 40 » sur une semaine de 4 séances.
 *
 * ── Deux règles, jamais mélangées ──
 *  1. À LA CLÔTURE (`sessionDurationOnFinish`) : une séance reste « active » tant qu'on n'a pas
 *     validé de série ; si le temps écoulé AVANT la première série validée, ou APRÈS la dernière,
 *     dépasse `IDLE_GAP_MINUTES`, ce temps n'est pas de l'entraînement et n'est pas compté.
 *     Sans aucune série validée, rien ne permet de rogner : on garde `now − début` (inchangé).
 *  2. À L'AFFICHAGE (`plausibleDurationMinutes`) : une durée supérieure à
 *     `MAX_PLAUSIBLE_SESSION_MINUTES` — dont toutes les séances déjà enregistrées au plafond — est
 *     INCONNUE, jamais affichée comme un fait. La donnée stockée n'est pas réécrite : la règle est
 *     dérivée, donc rétroactive pour tout l'historique.
 */

/** Au-delà, une séance de musculation n'est plus plausible : on n'en affiche pas la durée. */
export const MAX_PLAUSIBLE_SESSION_MINUTES = 240;

/** Plafond historique de la clôture (conservé : c'est la borne du stockage, pas une valeur à afficher). */
export const FINISH_DURATION_CAP_MINUTES = 600;

/**
 * Un trou d'inactivité plus long que ça (avant la première série validée, ou après la dernière)
 * n'est pas de l'entraînement : séance démarrée longtemps avant de s'entraîner, ou « Terminer »
 * oublié. 90 minutes couvrent un long repos entre deux exercices lourds sans jamais confondre une
 * pause avec un oubli.
 */
export const IDLE_GAP_MINUTES = 90;

const MS_PER_MINUTE = 60_000;

function toMs(value: string | number | Date | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export interface FinishDurationInput {
  /** Début de la séance (`created_at`). */
  startedAt: string | number | Date;
  /** Maintenant — l'instant de la clôture. */
  now: string | number | Date;
  /** Horodatages de validation des séries VALIDÉES de la séance (jamais celles non cochées). */
  validatedSetTimes?: ReadonlyArray<string | number | Date | null | undefined>;
}

/** Durée à enregistrer à la clôture, en minutes entières, entre 1 et 600. */
export function sessionDurationOnFinish(input: FinishDurationInput): number {
  const startMs = toMs(input.startedAt);
  const nowMs = toMs(input.now);
  if (startMs === null || nowMs === null) return 1;

  const idleMs = IDLE_GAP_MINUTES * MS_PER_MINUTE;
  const times = (input.validatedSetTimes ?? [])
    .map(toMs)
    // Une série « validée avant le début » ou « après maintenant » vient d'une horloge décalée :
    // elle ne dit rien d'exploitable, on l'ignore plutôt que de produire une durée négative.
    .filter((t): t is number => t !== null && t >= startMs && t <= nowMs);

  let from = startMs;
  let to = nowMs;
  if (times.length > 0) {
    const firstSet = Math.min(...times);
    const lastSet = Math.max(...times);
    if (firstSet - startMs > idleMs) from = firstSet;
    if (nowMs - lastSet > idleMs) to = lastSet;
  }

  const minutes = Math.round((to - from) / MS_PER_MINUTE);
  return Math.min(FINISH_DURATION_CAP_MINUTES, Math.max(1, minutes));
}

/**
 * La durée telle qu'on peut l'AFFICHER : `null` (inconnue) si absente, nulle, ou implausible.
 * Une séance enregistrée au plafond n'a pas « duré 10 h » : on ne sait pas combien elle a duré.
 */
export function plausibleDurationMinutes(minutes: number | null | undefined): number | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return null;
  if (minutes <= 0 || minutes > MAX_PLAUSIBLE_SESSION_MINUTES) return null;
  return minutes;
}

/**
 * Les horodatages de validation des séries validées d'UNE séance, lus dans le store local (la
 * clôture ne s'appuie jamais sur le snapshot React, qui peut être en retard d'une invalidation).
 * Une série non cochée n'est pas de l'entraînement : elle n'entre jamais ici.
 */
export function validatedSetTimesForWorkout(
  workoutId: string,
  exercises: ReadonlyArray<{ id: string; workout_id: string }>,
  sets: ReadonlyArray<{ exercise_id: string; completed: boolean | null; updated_at: string }>,
): string[] {
  const exerciseIds = new Set(
    exercises.filter((ex) => ex.workout_id === workoutId).map((ex) => ex.id),
  );
  return sets
    .filter((set) => set.completed === true && exerciseIds.has(set.exercise_id))
    .map((set) => set.updated_at);
}
