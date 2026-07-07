import { describe, expect, it } from "vitest";
import { HyroxWorkoutEngine } from "./hyroxEngine";
import type { SenseiAnswers } from "./types";

function visibleQuestionIds(answers: SenseiAnswers): string[] {
  return HyroxWorkoutEngine.questions.filter((q) => !q.when || q.when(answers)).map((q) => q.id);
}

describe("HyroxWorkoutEngine.questions", () => {
  it("la question 'station' n'apparaît que pour l'objectif 'specific'", () => {
    expect(visibleQuestionIds({ objective: "specific" })).toContain("station");
    expect(visibleQuestionIds({ objective: "simulation_complete" })).not.toContain("station");
    expect(visibleQuestionIds({ objective: "grip" })).not.toContain("station");
  });

  it("niveau, durée et lieu sont toujours visibles", () => {
    for (const objective of [
      "simulation_complete",
      "specific",
      "grip",
      "endurance",
      "power",
      "recovery",
      "competition_prep",
    ]) {
      const ids = visibleQuestionIds({ objective });
      expect(ids).toContain("level");
      expect(ids).toContain("duration_minutes");
      expect(ids).toContain("gym_location");
    }
  });

  it("le choix de poste couvre les 9 mouvements HYROX, pas seulement les 7 cités en exemple", () => {
    const stationQuestion = HyroxWorkoutEngine.questions.find((q) => q.id === "station");
    expect(stationQuestion?.options?.map((o) => o.value)).toEqual([
      "Running",
      "SkiErg",
      "Rameur",
      "Sled Push",
      "Sled Pull",
      "Farmer Carry",
      "Sandbag Lunges",
      "Burpee Broad Jump",
      "Wall Balls",
    ]);
  });
});

describe("HyroxWorkoutEngine.generate — jamais de séries/répétitions musculation hors de propos", () => {
  it("simulation complète : 8 postes + 8 footings de 1000m dans l'ordre officiel, aucune notion de 'sets'", async () => {
    const tpl = await HyroxWorkoutEngine.generate({
      objective: "simulation_complete",
      level: "intermédiaire",
      duration_minutes: 60,
    });
    expect(tpl.exercises).toEqual([]);
    expect(tpl.segments).toHaveLength(16); // 8 x (Running + poste)
    const labels = tpl.segments!.map((s) => s.label);
    expect(labels.filter((l) => l === "Running")).toHaveLength(8);
    expect(labels).toContain("Wall Balls");
    expect(labels).toContain("Sled Push");
    // Aucune stat "Séries" ou "poids du corps" (vocabulaire musculation) ne doit apparaître.
    const allStatLabels = tpl.segments!.flatMap((s) => s.stats.map((st) => st.label));
    expect(allStatLabels).not.toContain("Séries");
  });

  it("simulation réduite si la durée est courte (< 40 min)", async () => {
    const tpl = await HyroxWorkoutEngine.generate({
      objective: "simulation_complete",
      level: "intermédiaire",
      duration_minutes: 25,
    });
    expect(tpl.segments).toHaveLength(8); // 4 x (Running + poste), format réduit
    expect(tpl.name).toContain("réduit");
  });

  it("travail spécifique : un seul poste, avec un nombre de tours dérivé de la durée", async () => {
    const tpl = await HyroxWorkoutEngine.generate({
      objective: "specific",
      station: "Farmer Carry",
      level: "avancé",
      duration_minutes: 25,
    });
    expect(tpl.segments).toHaveLength(1);
    expect(tpl.segments![0].label).toBe("Farmer Carry");
    expect(tpl.segments![0].stats).toEqual(
      expect.arrayContaining([
        { label: "Charge (par main)", value: "32 kg" },
        { label: "Tours", value: "5" },
      ]),
    );
  });

  it("Running en travail spécifique n'a ni charge ni répétitions, seulement une distance", async () => {
    const tpl = await HyroxWorkoutEngine.generate({
      objective: "specific",
      station: "Running",
      level: "intermédiaire",
      duration_minutes: 30,
    });
    const stats = tpl.segments![0].stats;
    expect(stats.map((s) => s.label)).toEqual(["Distance", "Tours"]);
  });

  it("séance orientée préhension : postes à dominante préhension uniquement", async () => {
    const tpl = await HyroxWorkoutEngine.generate({
      objective: "grip",
      level: "intermédiaire",
      duration_minutes: 30,
    });
    const labels = tpl.segments!.map((s) => s.label);
    expect(labels).toEqual(["Farmer Carry", "Sandbag Lunges", "Sled Pull", "Wall Balls"]);
  });

  it("séance récupération : intensité basse, un seul tour même si la durée est longue", async () => {
    const tpl = await HyroxWorkoutEngine.generate({
      objective: "recovery",
      level: "avancé",
      duration_minutes: 90,
    });
    for (const seg of tpl.segments!) {
      expect(seg.stats.some((s) => s.label === "Tours")).toBe(false); // 1 tour = pas de stat "Tours"
    }
    expect(tpl.notes).toContain("récupération");
  });

  it("préparation compétition : postes clés à allure cible, footings raccourcis à 500m", async () => {
    const tpl = await HyroxWorkoutEngine.generate({
      objective: "competition_prep",
      level: "intermédiaire",
      duration_minutes: 45,
    });
    const runningSegments = tpl.segments!.filter((s) => s.label === "Running");
    expect(runningSegments.length).toBeGreaterThan(0);
    for (const seg of runningSegments) {
      expect(seg.stats).toEqual([{ label: "Distance", value: "500 m" }]);
    }
  });
});

describe("HyroxWorkoutEngine.toWorkoutRecord / toSessionView", () => {
  it("ne produit jamais exerciseRows (feedsRankEngine=false) et transporte les segments via metadata", async () => {
    const answers: SenseiAnswers = {
      objective: "specific",
      station: "Wall Balls",
      level: "débutant",
      duration_minutes: 20,
      gym_location: "On Air",
    };
    const template = await HyroxWorkoutEngine.generate(answers);
    const draft = HyroxWorkoutEngine.toWorkoutRecord(template, answers);

    expect(draft.discipline).toBe("hyrox");
    expect(draft.exerciseRows).toBeUndefined();
    expect(draft.gym_location).toBe("On Air");
    expect(draft.metadata).toMatchObject({
      objective: "specific",
      station: "Wall Balls",
      level: "débutant",
    });

    const view = HyroxWorkoutEngine.toSessionView(draft);
    expect(view.segments).toEqual(template.segments);
    expect(view.summaryStats).toEqual(
      expect.arrayContaining([
        { label: "Type de séance", value: "Travail spécifique sur un poste" },
      ]),
    );
  });
});
