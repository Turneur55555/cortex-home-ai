// ============================================================
// Comparaison de la dernière séance aux précédentes (domaine pur).
// Évolution charge / reps / volume / 1RM + records + état global
// (progression / stagnation / régression) avec explication du « pourquoi ».
// Réutilise les primitives de sets.ts (tonnage, 1RM, top set).
// ============================================================

import { bestEstimated1RM, setsTonnage, topSet, type WorkingSet } from "../sets";
import type {
  ComparisonReport,
  MetricComparison,
  ProgressState,
  Trend,
} from "./types";

export interface SessionLike {
  date: string;
  sets: WorkingSet[];
}

interface SessionSummary {
  date: string;
  topWeight: number | null;
  topReps: number | null;
  volume: number;
  best1RM: number | null;
  setCount: number;
}

function summarize(s: SessionLike): SessionSummary {
  const ts = topSet(s.sets);
  const valid = s.sets.filter(
    (x) => x.reps != null && x.weight != null && (x.reps as number) > 0,
  );
  return {
    date: s.date,
    topWeight: ts?.weight ?? null,
    topReps: ts?.reps ?? null,
    volume: Math.round(setsTonnage(s.sets)),
    best1RM: bestEstimated1RM(s.sets),
    setCount: valid.length,
  };
}

function pctDelta(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function trendOf(current: number | null, previous: number | null): Trend {
  if (current == null && previous == null) return "none";
  if (current == null || previous == null) return "none";
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

/**
 * Construit le rapport de comparaison. `sessions` doit être trié par date
 * croissante (comme useExerciseSetHistory). Si une seule séance existe, l'état
 * est « nouveau » et l'analyse reste renseignée.
 */
export function buildComparison(sessions: ReadonlyArray<SessionLike>): ComparisonReport {
  const summaries = sessions.map(summarize).filter((s) => s.setCount > 0);

  if (summaries.length === 0) {
    return {
      state: "nouveau",
      metrics: [],
      prsBroken: [],
      explanation:
        "Aucune série exploitable pour l'instant. Enregistre tes charges et répétitions pour débloquer l'analyse d'évolution.",
    };
  }

  const current = summaries[summaries.length - 1];
  const previous = summaries.length >= 2 ? summaries[summaries.length - 2] : null;

  const metrics: MetricComparison[] = [
    {
      key: "charge",
      label: "Charge (top set)",
      current: current.topWeight,
      previous: previous?.topWeight ?? null,
      deltaPct: pctDelta(current.topWeight, previous?.topWeight ?? null),
      trend: trendOf(current.topWeight, previous?.topWeight ?? null),
    },
    {
      key: "reps",
      label: "Répétitions (top set)",
      current: current.topReps,
      previous: previous?.topReps ?? null,
      deltaPct: pctDelta(current.topReps, previous?.topReps ?? null),
      trend: trendOf(current.topReps, previous?.topReps ?? null),
    },
    {
      key: "volume",
      label: "Volume total",
      current: current.volume,
      previous: previous?.volume ?? null,
      deltaPct: pctDelta(current.volume, previous?.volume ?? null),
      trend: trendOf(current.volume, previous?.volume ?? null),
    },
    {
      key: "1rm",
      label: "1RM estimé",
      current: current.best1RM,
      previous: previous?.best1RM ?? null,
      deltaPct: pctDelta(current.best1RM, previous?.best1RM ?? null),
      trend: trendOf(current.best1RM, previous?.best1RM ?? null),
    },
  ];

  // Records battus : comparaison au meilleur historique AVANT la dernière séance.
  const priorBest = {
    weight: Math.max(0, ...summaries.slice(0, -1).map((s) => s.topWeight ?? 0)),
    volume: Math.max(0, ...summaries.slice(0, -1).map((s) => s.volume)),
    oneRM: Math.max(0, ...summaries.slice(0, -1).map((s) => s.best1RM ?? 0)),
  };
  const prsBroken: string[] = [];
  if ((current.topWeight ?? 0) > priorBest.weight && priorBest.weight > 0) {
    prsBroken.push(`Charge max : ${current.topWeight} kg`);
  }
  if (current.volume > priorBest.volume && priorBest.volume > 0) {
    prsBroken.push(`Volume : ${current.volume} kg`);
  }
  if ((current.best1RM ?? 0) > priorBest.oneRM && priorBest.oneRM > 0) {
    prsBroken.push(`1RM estimé : ${Math.round(current.best1RM as number)} kg`);
  }

  const { state, explanation } = classify(current, previous, prsBroken.length > 0);

  return { state, metrics, prsBroken, explanation };
}

function classify(
  current: SessionSummary,
  previous: SessionSummary | null,
  hasPr: boolean,
): { state: ProgressState; explanation: string } {
  if (!previous) {
    return {
      state: "nouveau",
      explanation:
        "Première séance de référence enregistrée. Les prochaines séances seront comparées à celle-ci.",
    };
  }

  const w = current.topWeight ?? 0;
  const pw = previous.topWeight ?? 0;
  const vol = current.volume;
  const pvol = previous.volume;
  const orm = current.best1RM ?? 0;
  const porm = previous.best1RM ?? 0;

  const gained = w > pw || vol > pvol || orm > porm;
  const lost = w < pw && vol < pvol && orm <= porm;

  if (hasPr || (gained && vol >= pvol)) {
    const bits: string[] = [];
    if (w > pw) bits.push(`charge +${Math.round(w - pw)} kg`);
    if (orm > porm) bits.push(`1RM +${Math.round(orm - porm)} kg`);
    if (vol > pvol) bits.push(`volume +${Math.round(vol - pvol)} kg`);
    return {
      state: "progression",
      explanation: `Tu progresses : ${bits.join(", ") || "amélioration globale"} par rapport à la séance précédente${
        hasPr ? ", avec au moins un record battu" : ""
      }.`,
    };
  }

  if (lost) {
    return {
      state: "regression",
      explanation:
        "Recul sur charge, volume et 1RM par rapport à la dernière fois. Souvent lié à une récupération incomplète, une fatigue accumulée ou un jour sans — à surveiller si cela se répète.",
    };
  }

  return {
    state: "stagnation",
    explanation:
      "Performances stables par rapport à la séance précédente : ni gain ni recul net. C'est le moment d'introduire une variable de surcharge (charge, répétition, série ou tempo) pour relancer la progression.",
  };
}

/** Moyenne des répétitions du top set sur l'historique (pour le profil). */
export function averageTopReps(sessions: ReadonlyArray<SessionLike>): number | null {
  const reps: number[] = [];
  for (const s of sessions) {
    const ts = topSet(s.sets);
    if (ts?.reps != null && (ts.reps as number) > 0) reps.push(ts.reps as number);
  }
  if (reps.length === 0) return null;
  return Math.round((reps.reduce((a, b) => a + b, 0) / reps.length) * 10) / 10;
}
