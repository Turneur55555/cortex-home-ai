import { describe, expect, it } from "vitest";
import { buildSenseiBriefing } from "./senseiBriefing";
import type { MuscleRecovery } from "@/lib/fitness/recovery";
import type { MuscleId } from "@/lib/fitness/muscleMapping";

function recovery(
  id: MuscleId,
  label: string,
  status: MuscleRecovery["status"],
  hoursRemaining: number | null,
): MuscleRecovery {
  return {
    id,
    label,
    status,
    lastTrained: null,
    hoursSinceLast: null,
    recoveryWindowHours: 48,
    hoursRemaining,
  };
}

describe("buildSenseiBriefing", () => {
  it("déduplique les disciplines récentes en gardant l'ordre (plus récent d'abord), max 3", () => {
    const briefing = buildSenseiBriefing({
      workouts: [
        { date: "2026-07-07", discipline: "hyrox" },
        { date: "2026-07-06", discipline: "hyrox" },
        { date: "2026-07-05", discipline: "muscu" },
        { date: "2026-07-04", discipline: "course" },
        { date: "2026-07-03", discipline: "cardio" },
        { date: "2026-07-02", discipline: "guided" },
      ],
      bestPR: null,
      recoveryMap: new Map(),
    });
    expect(briefing.recentDisciplines).toEqual([
      { discipline: "hyrox", lastDate: "2026-07-07" },
      { discipline: "muscu", lastDate: "2026-07-05" },
      { discipline: "course", lastDate: "2026-07-04" },
    ]);
  });

  it("traite une discipline absente comme 'muscu' (compatibilité lignes historiques)", () => {
    const briefing = buildSenseiBriefing({
      workouts: [{ date: "2026-07-07" }],
      bestPR: null,
      recoveryMap: new Map(),
    });
    expect(briefing.recentDisciplines).toEqual([{ discipline: "muscu", lastDate: "2026-07-07" }]);
  });

  it("résume la récupération musculaire sans jamais l'inventer pour d'autres disciplines", () => {
    const map = new Map<MuscleId, MuscleRecovery>([
      ["pectoraux", recovery("pectoraux", "Pectoraux", "fatigued", 30)],
      ["dos", recovery("dos", "Dos", "ready", null)],
      ["quadriceps", recovery("quadriceps", "Quadriceps", "recovering", 10)],
    ]);
    const briefing = buildSenseiBriefing({
      workouts: [],
      bestPR: null,
      recoveryMap: map,
    });
    expect(briefing.recovery.readyCount).toBe(1);
    expect(briefing.recovery.fatiguedCount).toBe(2);
    expect(briefing.recovery.mostFatigued).toEqual(["Pectoraux", "Quadriceps"]);
  });

  it("transporte le meilleur PR musculation tel quel (jamais de record inventé pour les autres disciplines)", () => {
    const briefing = buildSenseiBriefing({
      workouts: [],
      bestPR: { name: "Développé couché", weight: 100 },
      recoveryMap: new Map(),
    });
    expect(briefing.bestPR).toEqual({ name: "Développé couché", weight: 100 });
  });
});
