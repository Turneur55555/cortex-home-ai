/**
 * C13 — L'OBJECTIF DE SÉANCE : LA RÈGLE, EN PUR.
 *
 * Logique PURE (zéro React, zéro Supabase, zéro IndexedDB, zéro couleur), conformément
 * à `/src/lib`. Dans le bandeau de la séance en cours, sous le nom : où en est-on par
 * rapport à la dernière séance du même nom.
 *
 * ── Une référence, ou rien ──
 * L'objectif n'existe QUE s'il y a une référence : la dernière séance de musculation
 * TERMINÉE portant le même nom (`lastSameNamedSession`, la même qu'affiche la Carte du
 * jour de l'Accueil). Première fois, séance libre : `null`, RIEN ne s'affiche. On
 * n'invente jamais une cible — décision validée avec la maquette (30/09/2026).
 *
 * ── La cible est un miroir du passé, jamais une consigne ──
 * Elle ne dit pas « soulève X » : elle dit « voilà ce que tu as fait la dernière fois ».
 * Aucune suggestion de charge n'en découle, nulle part.
 *
 * ── Deux chiffres, pour deux questions ──
 * - la BARRE (séries validées sur séries prévues) dit où tu en es ;
 * - le VOLUME dit si tu fais mieux. Le volume seul monte même en bâclant ; les séries
 *   seules ne disent rien de la progression.
 *
 * ── D'où vient chaque chiffre ──
 * - séries prévues : celles de la séance sauvegardée du même nom quand elle est connue
 *   avec certitude (`setsComplete`) et UNIQUE — c'est le même nombre que la Carte du jour
 *   et le plan de la semaine (B06) ; sinon, celles de la référence ;
 * - séries faites : celles que le joueur a COCHÉES (`completed === true`). Une série
 *   saisie mais pas cochée n'est pas faite ;
 * - volume fait : le tonnage des séries cochées et exploitables (`setsTonnage` :
 *   répétitions ET charge strictement positives) ;
 * - volume à battre : celui de la référence, tel que la carte récap de fin de séance le
 *   comptait (`buildSessionRecap`). Sans charge renseignée (poids de corps), pas de
 *   volume à battre : l'objectif se réduit aux séries.
 */

import { formatKg, lastSameNamedSession, type TodayWorkout } from "@/lib/fitness/todayCard";
import { setsTonnage, type CompletableSet } from "@/lib/fitness/sets";
import type { TemplateSummary } from "@/lib/fitness/weeklyPlan";

export interface SessionGoalInput {
  /** Le nom de la séance en cours. */
  name: string;
  /** Ses exercices, avec leurs séries telles qu'elles sont saisies. */
  exercises: ReadonlyArray<{ exercise_sets?: ReadonlyArray<CompletableSet> | null }>;
  /** L'historique (séances terminées). La séance en cours n'y compte pas : elle n'est pas « terminée ». */
  history: readonly TodayWorkout[];
  /** Les séances sauvegardées. `[]` ou liste partielle : on retombe alors sur la référence. */
  templates: readonly TemplateSummary[];
}

export interface SessionGoal {
  /** « Objectif de séance », ou « Objectif dépassé » une fois la référence battue. */
  label: string;
  setsDone: number;
  setsTarget: number;
  /** 0..1 — séries faites sur séries prévues, plafonné à 1. */
  progress: number;
  volumeKg: number;
  /** Le volume de la référence ; `null` si elle n'a aucune charge renseignée. */
  volumeTargetKg: number | null;
  beaten: boolean;
  /** « 2 980 kg soulevés · encore 860 kg pour battre ta dernière Épaules A ». */
  note: string;
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("fr-FR");
}

const sets = (n: number) => `${n} série${n > 1 ? "s" : ""}`;

/** Les séries prévues : la séance sauvegardée du même nom si elle est UNIQUE et complète, sinon la référence. */
function plannedSets(
  name: string,
  templates: readonly TemplateSummary[],
  referenceSets: number,
): number {
  const wanted = normalizeName(name);
  const matching = templates.filter((t) => normalizeName(t.name) === wanted);
  if (matching.length === 1 && matching[0].setsComplete && matching[0].sets > 0) {
    return matching[0].sets;
  }
  return referenceSets;
}

export function resolveSessionGoal(input: SessionGoalInput): SessionGoal | null {
  const reference = lastSameNamedSession(input.history, input.name);
  if (reference === null) return null;

  const allSets = input.exercises.flatMap((exercise) => exercise.exercise_sets ?? []);
  const ticked = allSets.filter((s) => s.completed === true);
  const setsDone = ticked.length;
  const volumeKg = Math.round(setsTonnage(ticked));

  const setsTarget = plannedSets(input.name, input.templates, reference.sets);
  if (setsTarget <= 0) return null; // jamais de barre sans cible : « 0 / 0 » ne dit rien
  const volumeTargetKg = reference.volumeKg > 0 ? reference.volumeKg : null;

  // « Battre » la référence : son tonnage quand elle en a un, sinon ses séries.
  const beaten = volumeTargetKg !== null ? volumeKg > volumeTargetKg : setsDone > setsTarget;
  const name = reference.name.trim();
  const started = setsDone > 0 || volumeKg > 0;

  let note: string;
  if (volumeTargetKg !== null) {
    if (!started) {
      note = `Objectif : ${sets(setsTarget)} · ${formatKg(volumeTargetKg)} kg`;
    } else if (beaten) {
      note = `${formatKg(volumeKg)} kg · +${formatKg(volumeKg - volumeTargetKg)} kg au-dessus de ta dernière ${name}`;
    } else if (volumeKg === volumeTargetKg) {
      note = `${formatKg(volumeKg)} kg · à égalité avec ta dernière ${name}`;
    } else {
      note = `${formatKg(volumeKg)} kg soulevés · encore ${formatKg(volumeTargetKg - volumeKg)} kg pour battre ta dernière ${name}`;
    }
  } else if (!started) {
    note = `Objectif : ${sets(setsTarget)}`;
  } else if (beaten) {
    note = `${sets(setsDone)} · +${setsDone - setsTarget} de plus que prévu`;
  } else {
    note = `Ta dernière ${name} : ${sets(reference.sets)}`;
  }

  return {
    label: beaten ? "Objectif dépassé" : "Objectif de séance",
    setsDone,
    setsTarget,
    progress: Math.min(1, setsDone / setsTarget),
    volumeKg,
    volumeTargetKg,
    beaten,
    note,
  };
}
