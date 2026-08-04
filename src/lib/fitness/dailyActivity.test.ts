import { describe, expect, it } from "vitest";
import { mergeDailyActivityRows, type DailyActivityRow } from "./dailyActivity";

function row(partial: Partial<DailyActivityRow> & { source: string }): DailyActivityRow {
  return {
    date: "2026-08-03",
    steps: null,
    active_calories: null,
    avg_hr: null,
    resting_hr: null,
    hrv_ms: null,
    ...partial,
  };
}

describe("mergeDailyActivityRows (Phase 10 §5/§6/§7)", () => {
  it("aucune ligne → null, jamais un objet fabriqué", () => {
    expect(mergeDailyActivityRows([])).toBeNull();
  });

  it("une seule source → valeurs reprises telles quelles avec leur provenance", () => {
    const merged = mergeDailyActivityRows([row({ source: "manual", steps: 8000, resting_hr: 58 })]);
    expect(merged?.steps).toEqual({ value: 8000, source: "manual" });
    expect(merged?.restingHr).toEqual({ value: 58, source: "manual" });
    expect(merged?.hrvMs).toBeNull();
  });

  it("manuel + apple_health même jour → le manuel gagne champ par champ quand renseigné", () => {
    const merged = mergeDailyActivityRows([
      row({ source: "apple_health", steps: 10234, avg_hr: 72, resting_hr: 60 }),
      row({ source: "manual", resting_hr: 55 }),
    ]);
    // Le manuel ne renseigne QUE resting_hr → il gagne sur ce champ...
    expect(merged?.restingHr).toEqual({ value: 55, source: "manual" });
    // ...mais steps/avg_hr manquent côté manuel → repli sur apple_health, provenance conservée.
    expect(merged?.steps).toEqual({ value: 10234, source: "apple_health" });
    expect(merged?.avgHr).toEqual({ value: 72, source: "apple_health" });
  });

  it("aucune source ne renseigne un champ → null pour ce champ, jamais 0", () => {
    const merged = mergeDailyActivityRows([row({ source: "manual", steps: 5000 })]);
    expect(merged?.hrvMs).toBeNull();
    expect(merged?.avgHr).toBeNull();
  });

  it("HRV toujours associée à sa source — jamais fusionnée entre méthodes/appareils différents", () => {
    const merged = mergeDailyActivityRows([
      row({ source: "apple_health", hrv_ms: 45 }),
      row({ source: "manual", hrv_ms: 52 }),
    ]);
    // Le manuel gagne, mais la source retenue reste explicite pour l'affichage.
    expect(merged?.hrvMs).toEqual({ value: 52, source: "manual" });
  });
});
