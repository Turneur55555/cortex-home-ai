// Pure domain helpers for body tracking (Corps module).
// No React, no Supabase, no UI tokens.

export type BodyField =
  | "chest"
  | "waist"
  | "hips"
  | "left_arm"
  | "right_arm"
  | "left_thigh"
  | "right_thigh";

export type TrendDirection = "good" | "bad" | "neutral";

/**
 * Returns the semantic direction for a measurement field.
 * - "up-is-good"  → muscles (bras, cuisses)
 * - "down-is-good" → waist / hips
 * - "neutral" → poitrine (peut être musculaire ou graisseuse)
 */
export function directionForField(
  field: BodyField,
  delta: number,
): TrendDirection {
  if (delta === 0) return "neutral";
  const up = delta > 0;
  switch (field) {
    case "waist":
    case "hips":
      return up ? "bad" : "good";
    case "left_arm":
    case "right_arm":
    case "left_thigh":
    case "right_thigh":
      return up ? "good" : "bad";
    case "chest":
    default:
      return "neutral";
  }
}

/**
 * Second most recent non-null value for `field` — i.e. the value before the
 * currently displayed "latest" value. Enables correct deltas even when the
 * newest row only fills one field and leaves the others null.
 * Rows are expected sorted by date DESC (as returned by useBodyMeasurements).
 */
export function findPreviousValue<T extends Record<string, unknown>>(
  rows: ReadonlyArray<T> | undefined,
  field: keyof T,
): number | null {
  if (!rows || rows.length < 2) return null;
  let seenLatest = false;
  for (const r of rows) {
    const v = r[field];
    if (typeof v === "number" && Number.isFinite(v)) {
      if (!seenLatest) {
        seenLatest = true;
        continue;
      }
      return v;
    }
  }
  return null;
}

/**
 * Latest non-null value for `field` across all rows (sorted DESC by date).
 * Ensures that adding a measurement for one field doesn't hide the previous
 * values of other fields.
 */
export function findLatestValue<T extends Record<string, unknown>>(
  rows: ReadonlyArray<T> | undefined,
  field: keyof T,
): number | null {
  if (!rows || rows.length === 0) return null;
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i][field];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * 7-day centered/trailing moving average over a series of {date, value}.
 * Trailing window (last N points incl. current) — adapté au mobile.
 */
export function movingAverage(
  series: ReadonlyArray<{ date: string; value: number | null }>,
  windowSize = 7,
): Array<{ date: string; value: number | null; avg: number | null }> {
  const out: Array<{ date: string; value: number | null; avg: number | null }> = [];
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    let sum = 0;
    let n = 0;
    for (let j = start; j <= i; j++) {
      const v = series[j].value;
      if (v != null && Number.isFinite(v)) {
        sum += v;
        n++;
      }
    }
    out.push({
      date: series[i].date,
      value: series[i].value,
      avg: n > 0 ? Math.round((sum / n) * 10) / 10 : null,
    });
  }
  return out;
}

/**
 * Plateau detection: variation faible sur une fenêtre (kg, écart-type).
 * @returns true si stdev < threshold sur les `days` derniers jours
 */
export function detectPlateau(
  rows: ReadonlyArray<{ date: string; weight: number | null }>,
  days = 21,
  threshold = 0.3,
): boolean {
  if (!rows || rows.length < 4) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const recent = rows
    .filter((r) => r.weight != null && new Date(r.date + "T00:00:00") >= cutoff)
    .map((r) => r.weight as number);
  if (recent.length < 4) return false;
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance =
    recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length;
  return Math.sqrt(variance) < threshold;
}

/**
 * Score forme global (0-100), à but motivationnel — pas médical.
 * Combine régularité de saisie + tendance favorable MG/MM.
 */
export function computeFormScore(
  rows: ReadonlyArray<{
    date: string;
    weight: number | null;
    body_fat: number | null;
    muscle_mass: number | null;
  }>,
): { score: number; consistency: number; bodyFat: number; muscle: number } {
  if (!rows || rows.length === 0) {
    return { score: 0, consistency: 0, bodyFat: 0, muscle: 0 };
  }

  // 1) Consistency: nombre de semaines (sur 4) avec au moins une mesure (40 pts max)
  const now = new Date();
  const weeks = new Set<string>();
  for (const r of rows) {
    const d = new Date(r.date + "T00:00:00");
    const diffDays = (now.getTime() - d.getTime()) / 86400000;
    if (diffDays >= 0 && diffDays <= 28) {
      const wk = Math.floor(diffDays / 7);
      weeks.add(String(wk));
    }
  }
  const consistency = Math.min(40, weeks.size * 10);

  // 2) Body fat trend (30 pts) — comparer dernière vs il y a ~30j
  const sortedDesc = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  const bfRecent = sortedDesc.find((r) => r.body_fat != null)?.body_fat ?? null;
  const bfOld =
    sortedDesc.find((r) => {
      const d = new Date(r.date + "T00:00:00");
      const diff = (now.getTime() - d.getTime()) / 86400000;
      return diff >= 21 && r.body_fat != null;
    })?.body_fat ?? null;
  let bodyFat = 15; // neutre si pas de données
  if (bfRecent != null && bfOld != null) {
    bodyFat = bfRecent < bfOld ? 30 : bfRecent === bfOld ? 15 : 5;
  }

  // 3) Muscle mass trend (30 pts)
  const mmRecent = sortedDesc.find((r) => r.muscle_mass != null)?.muscle_mass ?? null;
  const mmOld =
    sortedDesc.find((r) => {
      const d = new Date(r.date + "T00:00:00");
      const diff = (now.getTime() - d.getTime()) / 86400000;
      return diff >= 21 && r.muscle_mass != null;
    })?.muscle_mass ?? null;
  let muscle = 15;
  if (mmRecent != null && mmOld != null) {
    muscle = mmRecent > mmOld ? 30 : mmRecent === mmOld ? 15 : 5;
  }

  return {
    score: Math.round(consistency + bodyFat + muscle),
    consistency,
    bodyFat,
    muscle,
  };
}
