import { describe, it, expect } from "vitest";
import { computeRecovery, type Workout } from "./recovery";
import {
  MUSCLE_AI_NAME,
  worstStatus,
  selectionRecovery,
  readyAlternatives,
  buildAiRecoveryContext,
} from "./recoveryAdvice";

const NOW = new Date("2026-05-21T12:00:00Z");

function daysAgo(days: number): string {
  const d = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// Pectoraux entraînés il y a 1j (<48h → fatigued), dos il y a 4j (>72h → ready).
const workouts: Workout[] = [
  { date: daysAgo(1), exercises: [{ name: "bench press" }] },
  { date: daysAgo(4), exercises: [{ name: "rowing barre" }] },
];
const map = computeRecovery(workouts, NOW);

describe("worstStatus", () => {
  it("retourne le statut le plus défavorable du groupe", () => {
    // jambes = quadriceps/ischio/fessiers, jamais entraînés → unknown
    expect(worstStatus(["quadriceps", "ischio", "fessiers"], map)).toBe("unknown");
    expect(worstStatus(["pectoraux"], map)).toBe("fatigued");
    expect(worstStatus(["dos"], map)).toBe("ready");
  });
  it("priorise fatigued sur ready dans un groupe mixte", () => {
    expect(worstStatus(["dos", "pectoraux"], map)).toBe("fatigued");
  });
  it("retourne unknown pour un groupe vide", () => {
    expect(worstStatus([], map)).toBe("unknown");
  });
});

describe("selectionRecovery", () => {
  it("liste les muscles fatigués sélectionnés", () => {
    const r = selectionRecovery(["pectoraux", "dos"], map);
    expect(r.fatigued.map((f) => f.label)).toEqual(["Pectoraux"]);
    expect(r.recovering).toEqual([]);
  });
  it("dédoublonne par label", () => {
    const r = selectionRecovery(["pectoraux", "pectoraux"], map);
    expect(r.fatigued).toHaveLength(1);
  });
});

describe("readyAlternatives", () => {
  it("ne renvoie que les muscles prêts", () => {
    const alts = readyAlternatives(["pectoraux", "dos"], map);
    expect(alts.map((a) => a.id)).toEqual(["dos"]);
  });
});

describe("buildAiRecoveryContext", () => {
  it("ne garde que fatigued/recovering, mappés en noms AI", () => {
    const ctx = buildAiRecoveryContext(["pectoraux", "dos", "quadriceps"], map);
    expect(ctx).toHaveLength(1);
    expect(ctx[0].muscle).toBe("pectoraux");
    expect(ctx[0].status).toBe("fatigued");
  });
  it("agrège les muscles fins sous un même nom AI", () => {
    // quadriceps + ischio → 'jambes' ; si tous deux fatigués → une seule entrée
    const w: Workout[] = [{ date: daysAgo(1), exercises: [{ name: "squat" }, { name: "leg curl" }] }];
    const m = computeRecovery(w, NOW);
    const ctx = buildAiRecoveryContext(["quadriceps", "ischio"], m);
    const jambes = ctx.filter((c) => c.muscle === "jambes");
    expect(jambes).toHaveLength(1);
  });
});

describe("MUSCLE_AI_NAME", () => {
  it("ne produit que des noms autorisés par l'edge", () => {
    const allowed = new Set([
      "pectoraux", "dos", "épaules", "biceps", "triceps", "jambes",
      "fessiers", "abdos", "cardio", "avant-bras", "mollets", "trapèzes", "lombaires",
    ]);
    for (const name of Object.values(MUSCLE_AI_NAME)) {
      expect(allowed.has(name)).toBe(true);
    }
  });
});
