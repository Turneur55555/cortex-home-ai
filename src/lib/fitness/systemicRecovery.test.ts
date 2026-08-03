import { describe, expect, it } from "vitest";
import { evaluateSystemicRecovery, SYSTEMIC_RECOVERY_THRESHOLDS } from "./systemicRecovery";

function series(values: number[], startDate = "2026-07-01"): { date: string; restingHr: number }[] {
  const d = new Date(`${startDate}T00:00:00Z`);
  return values.map((restingHr, i) => {
    const day = new Date(d);
    day.setUTCDate(d.getUTCDate() + i);
    return { date: day.toISOString().slice(0, 10), restingHr };
  });
}

describe("evaluateSystemicRecovery (Phase 10 §8)", () => {
  it("aucune mesure → insufficient_data, jamais une valeur inventée", () => {
    const r = evaluateSystemicRecovery([]);
    expect(r.status).toBe("insufficient_data");
    expect(r.baselineRestingHr).toBeNull();
  });

  it("moins de 5 mesures antérieures → insufficient_data même si une mesure récente existe", () => {
    const r = evaluateSystemicRecovery(series([60, 61, 59, 60, 62]));
    expect(r.status).toBe("insufficient_data");
    expect(r.latestRestingHr).toBe(62);
    expect(r.baselineSampleCount).toBe(4);
  });

  it("baseline suffisante + FC repos proche de la moyenne → normal", () => {
    const r = evaluateSystemicRecovery(series([60, 61, 59, 60, 61, 60]));
    expect(r.status).toBe("normal");
    expect(r.baselineSampleCount).toBe(5);
  });

  it("FC repos significativement élevée vs baseline → reduced", () => {
    const r = evaluateSystemicRecovery(series([60, 60, 60, 60, 60, 65]));
    expect(r.status).toBe("reduced");
    expect(r.deltaBpm).toBe(5);
  });

  it("FC repos significativement basse vs baseline → recovered", () => {
    const r = evaluateSystemicRecovery(series([60, 60, 60, 60, 60, 55]));
    expect(r.status).toBe("recovered");
    expect(r.deltaBpm).toBe(-5);
  });

  it("écart sous le seuil (±2 bpm) → normal, pas de faux signal sur du bruit", () => {
    const r = evaluateSystemicRecovery(series([60, 60, 60, 60, 60, 62]));
    expect(r.status).toBe("normal");
  });

  it("ne dépasse jamais la fenêtre de baseline (14 j) même avec un historique plus long", () => {
    const values = Array.from({ length: 20 }, () => 60);
    values.push(65);
    const r = evaluateSystemicRecovery(series(values));
    expect(r.baselineSampleCount).toBe(SYSTEMIC_RECOVERY_THRESHOLDS.BASELINE_WINDOW_SIZE);
  });

  it("valeurs invalides (0, négatives) ignorées sans planter le moteur", () => {
    const r = evaluateSystemicRecovery([
      { date: "2026-07-01", restingHr: 0 },
      { date: "2026-07-02", restingHr: -5 },
      ...series([60, 60, 60, 60, 60, 60], "2026-07-10"),
    ]);
    expect(r.status).toBe("normal");
  });
});
