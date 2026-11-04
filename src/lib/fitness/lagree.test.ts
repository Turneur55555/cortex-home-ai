import { describe, expect, it } from "vitest";
import {
  LAGREE_DEFAULT_ZONES,
  buildLagreeMetadata,
  isLagreeWorkout,
  readMuscleZones,
  toggleZone,
} from "./lagree";

describe("lagree", () => {
  it("propose par défaut gainage, abdos, fessiers, jambes, épaules et bras", () => {
    for (const z of ["abdos", "fessiers", "quadriceps", "epaules", "biceps", "triceps"]) {
      expect(LAGREE_DEFAULT_ZONES).toContain(z);
    }
  });
  it("stocke les zones et l'activité dans les métadonnées", () => {
    const m = buildLagreeMetadata(50, ["abdos", "abdos", "fessiers"]);
    expect(m.activity).toBe("Pilates Lagree");
    expect(m.muscleZones).toEqual(["abdos", "fessiers"]);
    expect(m.caloriesEstimate).toBe(300);
  });
  it("ignore les zones inconnues à la lecture", () => {
    expect(readMuscleZones({ muscleZones: ["abdos", "nope", 3] })).toEqual(["abdos"]);
    expect(readMuscleZones(null)).toEqual([]);
  });
  it("distingue une séance Lagree d'une séance de musculation", () => {
    expect(
      isLagreeWorkout({ discipline: "guided", metadata: { activity: "Pilates Lagree" } }),
    ).toBe(true);
    expect(isLagreeWorkout({ discipline: "muscu", metadata: {} })).toBe(false);
  });
  it("ajoute ou retire une zone", () => {
    expect(toggleZone(["abdos"], "dos")).toEqual(["abdos", "dos"]);
    expect(toggleZone(["abdos", "dos"], "abdos")).toEqual(["dos"]);
  });
});
