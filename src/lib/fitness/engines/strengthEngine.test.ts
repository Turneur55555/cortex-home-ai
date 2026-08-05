import { describe, expect, it, vi } from "vitest";

// Musculation hybride (2026-08-19) — generate() appelle l'edge function
// coach-workout via supabase.functions.invoke ; on la mocke pour tester le
// branchement training_mode sans réseau, comme un contrat pur : entrée
// (answers) → sortie (template.segments), le reste (payload envoyé,
// exercices renvoyés) est déjà couvert implicitement.
const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(async (..._args: unknown[]) => ({
    data: {
      name: "Push",
      notes: "",
      muscles_worked: ["pectoraux"],
      exercises: [{ name: "Développé couché", sets: 4, reps: 8, weight: 60 }],
    },
    error: null,
  })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: invokeMock },
  },
}));

import { StrengthWorkoutEngine, blockDisciplineForTrainingMode } from "./strengthEngine";
import type { SenseiAnswers } from "./types";

const BASE_ANSWERS: SenseiAnswers = {
  muscles: ["pectoraux"],
  gym_location: "Keep Cool",
  duration_minutes: 45,
  equipment: "salle complète",
};

describe("StrengthWorkoutEngine.questions — training_mode", () => {
  it("expose une question training_mode à 3 choix, 'force' par défaut", () => {
    const q = StrengthWorkoutEngine.questions.find((q) => q.id === "training_mode");
    expect(q).toBeDefined();
    expect(q?.type).toBe("single-choice");
    expect(q?.defaultValue).toBe("force");
    expect(q?.options?.map((o) => o.value).sort()).toEqual(
      ["force", "force_cardio", "hyrox_prep"].sort(),
    );
  });
});

describe("blockDisciplineForTrainingMode", () => {
  it("force → aucun bloc (undefined)", () => {
    expect(blockDisciplineForTrainingMode("force")).toBeUndefined();
  });
  it("force_cardio → course", () => {
    expect(blockDisciplineForTrainingMode("force_cardio")).toBe("course");
  });
  it("hyrox_prep → hyrox", () => {
    expect(blockDisciplineForTrainingMode("hyrox_prep")).toBe("hyrox");
  });
});

describe("StrengthWorkoutEngine.generate — force pure (régression, comportement inchangé)", () => {
  it("training_mode absent ou 'force' : template.segments reste undefined, exercices inchangés", async () => {
    const template = await StrengthWorkoutEngine.generate(BASE_ANSWERS);
    expect(template.segments).toBeUndefined();
    expect(template.exercises).toEqual([
      { name: "Développé couché", sets: "4", reps: "8", weight: "60", image_path: null },
    ]);

    const templateExplicit = await StrengthWorkoutEngine.generate({
      ...BASE_ANSWERS,
      training_mode: "force",
    });
    expect(templateExplicit.segments).toBeUndefined();
  });
});

describe("StrengthWorkoutEngine.generate — musculation hybride", () => {
  it("force_cardio compose un bloc Course (Running) en plus des exercices de force", async () => {
    const template = await StrengthWorkoutEngine.generate({
      ...BASE_ANSWERS,
      training_mode: "force_cardio",
    });
    expect(template.exercises.length).toBeGreaterThan(0); // force toujours présente
    expect(template.segments).toBeDefined();
    expect(template.segments!.length).toBe(1);
    expect(template.segments![0].label).toBe("Running");
  });

  it("hyrox_prep compose course + 2 postes HYROX représentatifs", async () => {
    const template = await StrengthWorkoutEngine.generate({
      ...BASE_ANSWERS,
      training_mode: "hyrox_prep",
    });
    expect(template.segments).toBeDefined();
    expect(template.segments!.length).toBe(3);
    expect(template.segments![0].label).toBe("Running");
    // Les postes réutilisent les standards de charge/distance HYROX
    // (stationSegment) — jamais une valeur inventée dans strengthEngine.
    for (const seg of template.segments!) {
      expect(seg.stats.length).toBeGreaterThan(0);
    }
  });
});

describe("StrengthWorkoutEngine.toWorkoutRecord — musculation hybride", () => {
  it("force pure : metadata reste absent (comportement 100% inchangé)", () => {
    const template = {
      name: "Push",
      exercises: [
        { name: "Développé couché", sets: "4", reps: "8", weight: "60", image_path: null },
      ],
    };
    const draft = StrengthWorkoutEngine.toWorkoutRecord(template, {
      ...BASE_ANSWERS,
      training_mode: "force",
    });
    expect(draft.discipline).toBe("muscu");
    expect(draft.metadata).toBeUndefined();
    expect(draft.exerciseRows).toEqual([
      { name: "Développé couché", sets: 4, reps: 8, weight: 60, image_path: null },
    ]);
  });

  it("hybride : metadata porte segments + sessionType 'hybrid' + blockDiscipline, discipline reste 'muscu'", () => {
    const template = {
      name: "Push + Course",
      exercises: [
        { name: "Développé couché", sets: "4", reps: "8", weight: "60", image_path: null },
      ],
      segments: [{ label: "Running", stats: [{ label: "Distance", value: "1000 m" }] }],
    };
    const draft = StrengthWorkoutEngine.toWorkoutRecord(template, {
      ...BASE_ANSWERS,
      training_mode: "force_cardio",
    });
    expect(draft.discipline).toBe("muscu");
    expect(draft.exerciseRows?.length).toBe(1); // les segments n'alimentent jamais exerciseRows
    const metadata = draft.metadata as Record<string, unknown>;
    expect(metadata.sessionType).toBe("hybrid");
    expect(metadata.blockDiscipline).toBe("course");
    expect(metadata.segments).toEqual(template.segments);
  });
});
