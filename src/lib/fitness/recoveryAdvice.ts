// Logique pure « recovery-aware coach » (V3) : à partir de la carte de récupération
// musculaire, déterminer quels muscles sélectionnés sont encore fatigués / en récup,
// proposer des alternatives prêtes, et construire le contexte transmis à l'IA.
// Zéro import React, zéro couleur — domaine pur.
import type { MuscleId } from "./muscleMapping";
import type { MuscleRecovery, RecoveryStatus } from "./recovery";

/** Sévérité : plus la valeur est haute, moins le muscle est récupéré. */
const SEVERITY: Record<RecoveryStatus, number> = {
  fatigued: 3,
  recovering: 2,
  unknown: 1,
  ready: 0,
};

/**
 * Nom de groupe musculaire attendu par l'edge function `coach-workout`
 * (minuscules, accentué — cf. ALLOWED_MUSCLES côté serveur).
 * Plusieurs muscles fins du domaine se replient sur un groupe « gros plan ».
 */
export const MUSCLE_AI_NAME: Record<MuscleId, string> = {
  pectoraux: "pectoraux",
  dos: "dos",
  epaules: "épaules",
  biceps: "biceps",
  triceps: "triceps",
  abdos: "abdos",
  obliques: "abdos",
  quadriceps: "jambes",
  ischio: "jambes",
  fessiers: "fessiers",
  mollets: "mollets",
  trapeze: "trapèzes",
  "avant-bras": "avant-bras",
  lombaires: "lombaires",
};

/** Statut le plus défavorable parmi un ensemble de muscles (groupe UI agrégé). */
export function worstStatus(
  ids: MuscleId[],
  map: Map<MuscleId, MuscleRecovery>,
): RecoveryStatus {
  let worst: RecoveryStatus | null = null;
  for (const id of ids) {
    const rec = map.get(id);
    if (!rec) continue;
    if (worst === null || SEVERITY[rec.status] > SEVERITY[worst]) worst = rec.status;
  }
  return worst ?? "unknown";
}

export type RecoveryNote = { label: string; hoursRemaining: number | null };

/** Muscles sélectionnés encore fatigués / en récupération, dédupliqués par label. */
export function selectionRecovery(
  ids: MuscleId[],
  map: Map<MuscleId, MuscleRecovery>,
): { fatigued: RecoveryNote[]; recovering: RecoveryNote[] } {
  const fatigued: RecoveryNote[] = [];
  const recovering: RecoveryNote[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const rec = map.get(id);
    if (!rec || seen.has(rec.label)) continue;
    if (rec.status === "fatigued") {
      fatigued.push({ label: rec.label, hoursRemaining: rec.hoursRemaining });
      seen.add(rec.label);
    } else if (rec.status === "recovering") {
      recovering.push({ label: rec.label, hoursRemaining: rec.hoursRemaining });
      seen.add(rec.label);
    }
  }
  return { fatigued, recovering };
}

/** Parmi des groupes candidats, ceux qui sont 'ready' — alternatives à proposer. */
export function readyAlternatives(
  candidates: MuscleId[],
  map: Map<MuscleId, MuscleRecovery>,
): Array<{ id: MuscleId; label: string }> {
  const out: Array<{ id: MuscleId; label: string }> = [];
  const seen = new Set<MuscleId>();
  for (const id of candidates) {
    if (seen.has(id)) continue;
    seen.add(id);
    const rec = map.get(id);
    if (rec && rec.status === "ready") out.push({ id, label: rec.label });
  }
  return out;
}

export type AiRecoveryItem = {
  muscle: string; // nom AI (minuscule)
  status: Extract<RecoveryStatus, "fatigued" | "recovering">;
  hours_remaining: number | null;
};

/**
 * Contexte de récupération compact pour l'IA, agrégé par nom AI.
 * On ne garde que les muscles non récupérés (fatigued/recovering) : l'IA sait
 * lesquels éviter (fatigued) ou alléger (recovering).
 */
export function buildAiRecoveryContext(
  ids: MuscleId[],
  map: Map<MuscleId, MuscleRecovery>,
): AiRecoveryItem[] {
  const byName = new Map<string, AiRecoveryItem>();
  for (const id of ids) {
    const rec = map.get(id);
    if (!rec || (rec.status !== "fatigued" && rec.status !== "recovering")) continue;
    const name = MUSCLE_AI_NAME[id];
    const existing = byName.get(name);
    if (!existing || SEVERITY[rec.status] > SEVERITY[existing.status]) {
      byName.set(name, { muscle: name, status: rec.status, hours_remaining: rec.hoursRemaining });
    }
  }
  return [...byName.values()];
}
