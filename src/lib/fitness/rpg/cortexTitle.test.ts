import { describe, expect, it } from "vitest";
import { titleForCortexPower } from "./cortexTitle";

describe("titleForCortexPower", () => {
  it("0 muscle évalué → non classé (jamais Mortel par défaut)", () => {
    const r = titleForCortexPower({ status: "partial", evaluatedCount: 0 });
    expect(r.status).toBe("not_ranked");
  });

  it("1 à 4 muscles évalués → partiel", () => {
    const r = titleForCortexPower({ status: "partial", evaluatedCount: 3 });
    expect(r.status).toBe("partial");
  });

  it("tierIndex 0 → Mortel, premier grade", () => {
    const r = titleForCortexPower({ status: "complete", tierIndex: 0, evaluatedCount: 8 });
    if (r.status !== "ranked") throw new Error("expected ranked");
    expect(r.title.key).toBe("mortel");
    expect(r.gradeIndex).toBe(0);
    expect(r.isMax).toBe(false);
  });

  it("tierIndex 12 → Héros (bande 10-14)", () => {
    const r = titleForCortexPower({ status: "complete", tierIndex: 12, evaluatedCount: 8 });
    if (r.status !== "ranked") throw new Error("expected ranked");
    expect(r.title.key).toBe("heros");
  });

  it("tierIndex 29 → Titan, grade suprême, isMax", () => {
    const r = titleForCortexPower({ status: "complete", tierIndex: 29, evaluatedCount: 8 });
    if (r.status !== "ranked") throw new Error("expected ranked");
    expect(r.title.key).toBe("titan");
    expect(r.gradeIndex).toBe(4);
    expect(r.isMax).toBe(true);
  });

  it("les 6 titres couvrent bien 0-29 sans trou ni chevauchement", () => {
    const seen = new Set<string>();
    for (let t = 0; t <= 29; t++) {
      const r = titleForCortexPower({ status: "complete", tierIndex: t, evaluatedCount: 8 });
      if (r.status !== "ranked") throw new Error("expected ranked");
      seen.add(r.title.key);
    }
    expect(seen.size).toBe(6);
  });
});
