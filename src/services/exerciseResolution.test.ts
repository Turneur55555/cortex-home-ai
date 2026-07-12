import { describe, expect, it } from "vitest";
import { canonicalizeExerciseLabel } from "./exerciseResolution";

describe("canonicalizeExerciseLabel", () => {
  it("retire un suffixe de fraction i/reps", () => {
    expect(canonicalizeExerciseLabel("Fractionné 1/8")).toBe("Fractionné");
    expect(canonicalizeExerciseLabel("Sprint 3 / 10")).toBe("Sprint");
    expect(canonicalizeExerciseLabel("Montée (1/8)")).toBe("Montée");
  });

  it("retire un suffixe série/set/tour/rep", () => {
    expect(canonicalizeExerciseLabel("Farmer Carry série 1")).toBe("Farmer Carry");
    expect(canonicalizeExerciseLabel("Farmer Carry serie 2")).toBe("Farmer Carry");
    expect(canonicalizeExerciseLabel("Wall Ball set 3")).toBe("Wall Ball");
    expect(canonicalizeExerciseLabel("Montée tour 4")).toBe("Montée");
    expect(canonicalizeExerciseLabel("Burpees rep 5")).toBe("Burpees");
    expect(canonicalizeExerciseLabel("Burpees répétition 6")).toBe("Burpees");
  });

  it("retire un suffixe #N", () => {
    expect(canonicalizeExerciseLabel("Exercice #3")).toBe("Exercice");
  });

  it("gère les suffixes composés en les retirant tous", () => {
    expect(canonicalizeExerciseLabel("Montée 1/8 tour 2")).toBe("Montée");
  });

  it("laisse inchangé un libellé sans suffixe de contexte", () => {
    expect(canonicalizeExerciseLabel("Développé couché")).toBe("Développé couché");
    expect(canonicalizeExerciseLabel("Footing récupération")).toBe("Footing récupération");
    expect(canonicalizeExerciseLabel("Squat barre")).toBe("Squat barre");
  });

  it("trim les espaces superflus", () => {
    expect(canonicalizeExerciseLabel("  Squat barre  ")).toBe("Squat barre");
  });

  it("ne renvoie jamais une chaîne vide (filet de sécurité)", () => {
    expect(canonicalizeExerciseLabel("1/8")).toBe("1/8");
    expect(canonicalizeExerciseLabel("")).toBe("");
    expect(canonicalizeExerciseLabel("   ")).toBe("");
  });

  it("ne modifie pas un nombre qui ne suit pas un mot-clé de contexte connu", () => {
    // pas de faux positif sur un nom hypothétique se terminant par un nombre
    // sans mot-clé de contexte (aucun cas réel actuellement dans le catalogue)
    expect(canonicalizeExerciseLabel("Tabata 20")).toBe("Tabata 20");
  });
});
