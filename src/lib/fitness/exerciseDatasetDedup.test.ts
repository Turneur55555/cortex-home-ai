import { describe, expect, it } from "vitest";
import {
  stripDemoQualifiers,
  deduplicateDatasetRecords,
  type DedupInput,
} from "./exerciseDatasetDedup";

describe("stripDemoQualifiers", () => {
  it("retire les marqueurs d'angle caméra", () => {
    expect(stripDemoQualifiers("barbell full squat (back pov)")).toBe("barbell full squat");
    expect(stripDemoQualifiers("barbell full squat (side pov)")).toBe("barbell full squat");
  });

  it("retire les marqueurs de version", () => {
    expect(stripDemoQualifiers("inchworm v. 2")).toBe("inchworm");
    expect(stripDemoQualifiers("dumbbell decline shrug v.2")).toBe("dumbbell decline shrug");
  });

  it("retire les marqueurs de genre du modèle", () => {
    expect(stripDemoQualifiers("twisted leg raise (female)")).toBe("twisted leg raise");
  });

  it("ne modifie pas un nom sans marqueur", () => {
    expect(stripDemoQualifiers("barbell bench press")).toBe("barbell bench press");
  });
});

describe("deduplicateDatasetRecords", () => {
  function record(overrides: Partial<DedupInput> = {}): DedupInput {
    return { id: "1", name: "Exercise", equipment: "barbell", ...overrides };
  }

  it("détecte les doublons réels trouvés dans le dataset (analyse du 2026-07-30)", () => {
    const records = [
      record({ id: "a", name: "barbell full squat" }),
      record({ id: "b", name: "barbell full squat (back pov)" }),
      record({ id: "c", name: "barbell full squat (side pov)" }),
      record({ id: "d", name: "inchworm", equipment: "body weight" }),
      record({ id: "e", name: "inchworm v. 2", equipment: "body weight" }),
    ];
    const { kept, skipped } = deduplicateDatasetRecords(records);
    expect(kept.map((r) => r.id)).toEqual(["a", "d"]);
    expect(skipped).toHaveLength(3);
    expect(skipped.map((s) => s.record.id)).toEqual(["b", "c", "e"]);
    expect(skipped[0].duplicateOfId).toBe("a");
  });

  it("ne fusionne jamais deux exercices dont le nom diffère au-delà des marqueurs de démo", () => {
    const records = [
      record({ id: "a", name: "barbell hack squat" }),
      record({ id: "b", name: "barbell zercher squat" }),
    ];
    const { kept, skipped } = deduplicateDatasetRecords(records);
    expect(kept).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });

  it("distingue deux exercices au même nom mais équipement différent (pas un doublon)", () => {
    const records = [
      record({ id: "a", name: "full squat", equipment: "barbell" }),
      record({ id: "b", name: "full squat", equipment: "smith machine" }),
    ];
    const { kept } = deduplicateDatasetRecords(records);
    expect(kept).toHaveLength(2);
  });

  it("retourne tout tel quel sur une liste sans doublon", () => {
    const records = [record({ id: "a", name: "one" }), record({ id: "b", name: "two" })];
    const { kept, skipped } = deduplicateDatasetRecords(records);
    expect(kept).toHaveLength(2);
    expect(skipped).toHaveLength(0);
  });
});
