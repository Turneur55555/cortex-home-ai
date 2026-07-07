// ============================================================
// Vérifie les invariants de fondation : toutes les disciplines
// prévues existent, muscu/cardio/hyrox sont les moteurs réels (phase 4),
// et aucune discipline "comingSoon" n'alimente le moteur de Rang.
// ============================================================

import { describe, expect, it } from "vitest";
import { ENGINE_REGISTRY, listEngines } from "./registry";
import { isReadyEngine } from "./types";
import { StrengthWorkoutEngine } from "./strengthEngine";
import { CardioWorkoutEngine } from "./cardioEngine";
import { HyroxWorkoutEngine } from "./hyroxEngine";

describe("ENGINE_REGISTRY", () => {
  it("expose les 5 disciplines prévues pour les phases 1 à 6", () => {
    expect(Object.keys(ENGINE_REGISTRY).sort()).toEqual(
      ["cardio", "course", "guided", "hyrox", "muscu"].sort(),
    );
  });

  it("muscu, cardio et hyrox sont les moteurs prêts (phase 4)", () => {
    const ready = listEngines().filter(isReadyEngine);
    expect(ready.map((e) => e.id).sort()).toEqual(["cardio", "hyrox", "muscu"]);
    expect(ENGINE_REGISTRY.muscu).toBe(StrengthWorkoutEngine);
    expect(ENGINE_REGISTRY.cardio).toBe(CardioWorkoutEngine);
    expect(ENGINE_REGISTRY.hyrox).toBe(HyroxWorkoutEngine);
  });

  it("aucune discipline comingSoon n'alimente le moteur de Rang", () => {
    for (const entry of listEngines()) {
      if (entry.comingSoon) {
        expect(entry.feedsRankEngine).toBe(false);
      }
    }
  });

  it("toutes les disciplines à venir sont marquées comingSoon", () => {
    for (const id of ["course", "guided"] as const) {
      expect(ENGINE_REGISTRY[id].comingSoon).toBe(true);
    }
  });
});

describe("StrengthWorkoutEngine.toWorkoutRecord", () => {
  it("traduit un WorkoutTemplate en brouillon de persistance fidèle à l'existant", () => {
    const template = {
      name: "Push intense",
      notes: "Muscles sollicités : pectoraux, triceps.\nÉchauffe bien les épaules.",
      exercises: [
        { name: "Développé couché", sets: "4", reps: "8", weight: "60", image_path: null },
        { name: "Pompes", sets: "3", reps: "15", weight: "", image_path: null },
      ],
    };
    const answers = {
      duration_minutes: 45,
      gym_location: "Keep Cool",
      muscles: ["pectoraux"],
    };

    const draft = StrengthWorkoutEngine.toWorkoutRecord(template, answers);

    expect(draft.discipline).toBe("muscu");
    expect(draft.name).toBe("Push intense");
    expect(draft.duration_minutes).toBe(45);
    expect(draft.gym_location).toBe("Keep Cool");
    expect(draft.exerciseRows).toEqual([
      { name: "Développé couché", sets: 4, reps: 8, weight: 60, image_path: null },
      { name: "Pompes", sets: 3, reps: 15, weight: null, image_path: null },
    ]);
  });

  it("retombe sur 45 minutes si duration_minutes est absent des réponses", () => {
    const draft = StrengthWorkoutEngine.toWorkoutRecord({ name: "X", exercises: [] }, {});
    expect(draft.duration_minutes).toBe(45);
  });
});
describe("StrengthWorkoutEngine.questions", () => {
  it("expose une question 'gym_location' dont les options suivent GYMS", () => {
    const q = StrengthWorkoutEngine.questions.find((q) => q.id === "gym_location");
    expect(q).toBeDefined();
    expect(q?.type).toBe("location");
    expect(q?.options?.map((o) => o.value)).toEqual([
      "Maison",
      "Keep Cool",
      "On Air",
      "Fitness Park",
    ]);
  });

  it("la question 'muscles' n'a pas d'options (rendu confié au widget custom recovery-aware)", () => {
    const q = StrengthWorkoutEngine.questions.find((q) => q.id === "muscles");
    expect(q?.type).toBe("multi-choice");
    expect(q?.options).toBeUndefined();
  });
});
