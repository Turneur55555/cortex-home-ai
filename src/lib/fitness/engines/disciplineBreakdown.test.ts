import { describe, expect, it } from "vitest";
import { computeDisciplineBreakdown } from "./disciplineBreakdown";

describe("computeDisciplineBreakdown", () => {
  it("regroupe séances/durée/dernière date par discipline", () => {
    const result = computeDisciplineBreakdown([
      { date: "2026-07-01", duration_minutes: 45, discipline: "muscu" },
      { date: "2026-07-03", duration_minutes: 30, discipline: "hyrox" },
      { date: "2026-07-05", duration_minutes: 50, discipline: "muscu" },
    ]);
    const muscu = result.find((r) => r.discipline === "muscu");
    expect(muscu).toEqual({
      discipline: "muscu",
      sessionsCount: 2,
      totalDurationMinutes: 95,
      lastSessionDate: "2026-07-05",
    });
  });

  it("traite une discipline absente/null comme 'muscu' (compatibilité lignes historiques pré-Phase 1)", () => {
    const result = computeDisciplineBreakdown([{ date: "2026-01-01", duration_minutes: 20 }]);
    expect(result).toEqual([
      {
        discipline: "muscu",
        sessionsCount: 1,
        totalDurationMinutes: 20,
        lastSessionDate: "2026-01-01",
      },
    ]);
  });

  it("trie par nombre de séances décroissant", () => {
    const result = computeDisciplineBreakdown([
      { date: "2026-07-01", duration_minutes: 10, discipline: "course" },
      { date: "2026-07-02", duration_minutes: 10, discipline: "muscu" },
      { date: "2026-07-03", duration_minutes: 10, discipline: "muscu" },
    ]);
    expect(result.map((r) => r.discipline)).toEqual(["muscu", "course"]);
  });

  it("gère une liste vide/absente sans planter", () => {
    expect(computeDisciplineBreakdown([])).toEqual([]);
    expect(computeDisciplineBreakdown(null)).toEqual([]);
    expect(computeDisciplineBreakdown(undefined)).toEqual([]);
  });
});
