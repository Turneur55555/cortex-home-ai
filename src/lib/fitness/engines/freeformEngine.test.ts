import { describe, expect, it } from "vitest";
import { FreeformActivityEngine } from "./freeformEngine";
import type { WorkoutTemplate } from "./types";

describe("FreeformActivityEngine.questions", () => {
  it("pose une question 'activity' en texte libre — c'est tout le principe du moteur", () => {
    const activityQuestion = FreeformActivityEngine.questions.find((q) => q.id === "activity");
    expect(activityQuestion?.type).toBe("text");
    expect(activityQuestion?.options).toBeUndefined();
  });

  it("expose niveau/intensité/durée, dans cet ordre", () => {
    const ids = FreeformActivityEngine.questions.map((q) => q.id);
    expect(ids).toEqual(["activity", "level", "intensity", "duration_minutes"]);
  });

  it("l'intensité suit les 3 valeurs acceptées par l'edge function coach-workout (mode 'autre')", () => {
    const intensityQuestion = FreeformActivityEngine.questions.find((q) => q.id === "intensity");
    expect(intensityQuestion?.options?.map((o) => o.value)).toEqual([
      "légère",
      "modérée",
      "intense",
    ]);
    expect(intensityQuestion?.defaultValue).toBe("modérée");
  });
});

describe("FreeformActivityEngine.generate — validation avant tout appel réseau", () => {
  it("rejette une activité vide/trop courte sans appeler l'edge function", async () => {
    await expect(FreeformActivityEngine.generate({ activity: "" })).rejects.toThrow(
      "Décris l'activité",
    );
    await expect(FreeformActivityEngine.generate({ activity: "a" })).rejects.toThrow(
      "Décris l'activité",
    );
  });
});

describe("FreeformActivityEngine.toWorkoutRecord / toSessionView", () => {
  const template: WorkoutTemplate = {
    name: "Escalade en salle",
    exercises: [],
    segments: [
      {
        label: "Bloc voies faciles",
        stats: [
          { label: "Tours/séries", value: "3" },
          { label: "Durée du bloc", value: "15 min" },
        ],
      },
    ],
    notes: "Muscles sollicités : avant-bras, dos.\nÉchauffe bien les doigts.",
  };
  const answers = {
    activity: "Escalade en salle",
    level: "intermédiaire",
    intensity: "intense",
    duration_minutes: 60,
  };

  it("ne produit jamais exerciseRows/gym_location — tout vit dans metadata", () => {
    const draft = FreeformActivityEngine.toWorkoutRecord(template, answers);

    expect(draft.discipline).toBe("autre");
    expect(draft.name).toBe("Escalade en salle");
    expect(draft.duration_minutes).toBe(60);
    expect(draft.exerciseRows).toBeUndefined();
    expect(draft.gym_location).toBeUndefined();
    expect(draft.metadata).toEqual({
      activity: "Escalade en salle",
      level: "intermédiaire",
      intensity: "intense",
      segments: template.segments,
    });
  });

  it("retombe sur 45 minutes si duration_minutes est absent des réponses", () => {
    const draft = FreeformActivityEngine.toWorkoutRecord(template, {
      activity: "Escalade en salle",
    });
    expect(draft.duration_minutes).toBe(45);
  });

  it("toSessionView relit activité/intensité depuis metadata et les segments tels quels", () => {
    const draft = FreeformActivityEngine.toWorkoutRecord(template, answers);
    const view = FreeformActivityEngine.toSessionView(draft);

    expect(view.title).toBe("Escalade en salle");
    expect(view.segments).toEqual(template.segments);
    expect(view.summaryStats).toEqual(
      expect.arrayContaining([
        { label: "Durée", value: "60 min" },
        { label: "Activité", value: "Escalade en salle" },
        { label: "Intensité", value: "intense" },
      ]),
    );
  });

  it("feedsRankEngine=false et cardVariant='metric-grid' — jamais de rang/badge pour une activité libre", () => {
    expect(FreeformActivityEngine.feedsRankEngine).toBe(false);
    expect(FreeformActivityEngine.historyPresentation.cardVariant).toBe("metric-grid");
  });
});
