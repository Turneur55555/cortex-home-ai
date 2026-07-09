import { describe, expect, it } from "vitest";
import { CourseWorkoutEngine } from "./courseEngine";
import type { SenseiAnswers, SenseiContext } from "./types";

function visibleQuestionIds(answers: SenseiAnswers): string[] {
  return CourseWorkoutEngine.questions.filter((q) => !q.when || q.when(answers)).map((q) => q.id);
}

describe("CourseWorkoutEngine.questions", () => {
  it("branche vers la bonne sous-question selon l'objectif", () => {
    expect(visibleQuestionIds({ objective: "endurance" })).toContain("endurance_type");
    expect(visibleQuestionIds({ objective: "speed" })).toContain("speed_type");
    expect(visibleQuestionIds({ objective: "race_prep" })).toContain("race_distance");
    expect(visibleQuestionIds({ objective: "target_pace" })).toContain("target_pace_min_per_km");

    // Une seule sous-question visible à la fois.
    const ids = visibleQuestionIds({ objective: "endurance" });
    expect(ids).not.toContain("speed_type");
    expect(ids).not.toContain("race_distance");
    expect(ids).not.toContain("target_pace_min_per_km");
  });

  it("aucune question 'lieu' — la course se pratique dehors, pas en salle", () => {
    expect(CourseWorkoutEngine.questions.some((q) => q.id === "gym_location")).toBe(false);
  });

  it("la FC max est optionnelle : ne bloque jamais la progression", () => {
    const q = CourseWorkoutEngine.questions.find((q) => q.id === "max_heart_rate");
    expect(q?.optional).toBe(true);
  });

  it("niveau et durée sont toujours visibles quel que soit l'objectif", () => {
    for (const objective of ["endurance", "speed", "race_prep", "target_pace"]) {
      const ids = visibleQuestionIds({ objective });
      expect(ids).toContain("level");
      expect(ids).toContain("duration_minutes");
    }
  });
});

describe("CourseWorkoutEngine.generate — vocabulaire 100% course, jamais séries/répétitions musculation", () => {
  it("endurance fondamentale : distance dérivée de la durée, zone Z2, pas de charge ni de séries", async () => {
    const tpl = await CourseWorkoutEngine.generate({
      objective: "endurance",
      endurance_type: "endurance_fondamentale",
      level: "intermédiaire",
      duration_minutes: 30,
    });
    expect(tpl.exercises).toEqual([]);
    expect(tpl.segments).toHaveLength(1);
    const stats = tpl.segments![0].stats;
    const labels = stats.map((s) => s.label);
    expect(labels).toEqual(["Distance", "Allure cible", "Zone FC cible"]);
    expect(labels).not.toContain("Charge");
    expect(labels).not.toContain("Séries");
    expect(stats.find((s) => s.label === "Distance")?.value).toBe("5.0 km"); // 30min / 6.0 min/km
  });

  it("footing récupération : allure plus lente que l'endurance fondamentale, zone Z1", async () => {
    const tpl = await CourseWorkoutEngine.generate({
      objective: "endurance",
      endurance_type: "footing_recuperation",
      level: "intermédiaire",
      duration_minutes: 30,
    });
    const zone = tpl.segments![0].stats.find((s) => s.label === "Zone FC cible")?.value;
    expect(zone).toContain("Z1");
  });

  it("fractionné : alterne effort et récupération, quantité de répétitions dérivée de la durée", async () => {
    const tpl = await CourseWorkoutEngine.generate({
      objective: "speed",
      speed_type: "fractionne",
      level: "avancé",
      duration_minutes: 48,
    });
    const labels = tpl.segments!.map((s) => s.label);
    expect(labels[0]).toContain("400m rapide");
    expect(labels[1]).toBe("Récupération trottinée");
    expect(labels.filter((l) => l.startsWith("400m rapide"))).toHaveLength(8); // clamp(48/6, 4, 12)
  });

  it("travail en côtes : expose 'Dénivelé+', pas d'allure (non pertinente en pente)", async () => {
    const tpl = await CourseWorkoutEngine.generate({
      objective: "speed",
      speed_type: "cotes",
      level: "intermédiaire",
      duration_minutes: 30,
    });
    const montee = tpl.segments!.find((s) => s.label.startsWith("Montée"));
    expect(montee?.stats.map((s) => s.label)).toContain("Dénivelé+");
    expect(montee?.stats.map((s) => s.label)).not.toContain("Allure cible");
  });

  it("les 4 préparations de course (5km/10km/semi/marathon) génèrent des séances distinctes", async () => {
    const results = await Promise.all(
      (["prep_5k", "prep_10k", "prep_semi", "prep_marathon"] as const).map((race_distance) =>
        CourseWorkoutEngine.generate({
          objective: "race_prep",
          race_distance,
          level: "intermédiaire",
          duration_minutes: 45,
        }),
      ),
    );
    const names = results.map((r) => r.name);
    expect(new Set(names).size).toBe(4); // 4 noms distincts
    expect(names).toEqual([
      "Préparation 5 km",
      "Préparation 10 km",
      "Préparation Semi-Marathon",
      "Préparation Marathon",
    ]);
  });

  it("allure spécifique : utilise l'allure cible donnée par l'utilisateur, sans zone FC imposée", async () => {
    const tpl = await CourseWorkoutEngine.generate({
      objective: "target_pace",
      target_pace_min_per_km: 4.5,
      level: "avancé",
      duration_minutes: 30,
    });
    const stats = tpl.segments![0].stats;
    expect(stats.find((s) => s.label === "Allure cible")?.value).toBe("4:30 /km");
    expect(stats.some((s) => s.label === "Zone FC cible")).toBe(false);
  });

  it("consomme une FC max fournie par un futur contexte wearable, sans connecteur réel", async () => {
    const context: SenseiContext = { wearable: { maxHeartRate: 190 } };
    const tpl = await CourseWorkoutEngine.generate(
      {
        objective: "endurance",
        endurance_type: "endurance_fondamentale",
        level: "intermédiaire",
        duration_minutes: 30,
      },
      context,
    );
    const zone = tpl.segments![0].stats.find((s) => s.label === "Zone FC cible")?.value;
    expect(zone).toBe("Z2 — Endurance fondamentale (114-133 bpm)");
  });
});

describe("CourseWorkoutEngine.toWorkoutRecord / toSessionView", () => {
  it("ne produit jamais exerciseRows, ni gym_location ; transporte cadence et récupération estimée", async () => {
    const answers: SenseiAnswers = {
      objective: "speed",
      speed_type: "seuil",
      level: "avancé",
      duration_minutes: 30,
    };
    const template = await CourseWorkoutEngine.generate(answers);
    const draft = CourseWorkoutEngine.toWorkoutRecord(template, answers);

    expect(draft.discipline).toBe("course");
    expect(draft.exerciseRows).toBeUndefined();
    expect(draft.gym_location).toBeUndefined();
    expect(draft.metadata).toMatchObject({ sessionType: "seuil", level: "avancé" });

    const view = CourseWorkoutEngine.toSessionView(draft);
    expect(view.segments).toEqual(template.segments);
    expect(view.summaryStats).toEqual(
      expect.arrayContaining([
        { label: "Type de séance", value: "Seuil" },
        { label: "Cadence cible", value: "170-185 pas/min" },
      ]),
    );
    expect(view.summaryStats.some((s) => s.label === "Récupération estimée")).toBe(true);
  });
});

describe("CourseWorkoutEngine.buildLiveSegments / formatLiveSegment (édition live, phase pilote)", () => {
  it("supportsLiveTracking est activé", () => {
    expect(CourseWorkoutEngine.supportsLiveTracking).toBe(true);
  });

  it("produit des segments structurés cohérents avec les segments d'affichage pour une séance continue", async () => {
    const answers: SenseiAnswers = {
      objective: "endurance",
      endurance_type: "endurance_fondamentale",
      level: "intermédiaire",
      duration_minutes: 40,
    };
    const template = await CourseWorkoutEngine.generate(answers);
    const draft = CourseWorkoutEngine.toWorkoutRecord(template, answers);

    const live = CourseWorkoutEngine.buildLiveSegments!(template, draft);
    expect(live).toHaveLength(1);
    expect(live[0].label).toBe("Endurance fondamentale");
    expect(live[0].metrics.distance_m).toBeGreaterThan(0);
    expect(live[0].metrics.pace_min_per_km).toBeGreaterThan(0);
    expect(live[0].metricKey).toBe("distance_m");
  });

  it("produit des segments effort/récupération alternés pour une séance fractionnée", async () => {
    const answers: SenseiAnswers = {
      objective: "speed",
      speed_type: "fractionne",
      level: "intermédiaire",
      duration_minutes: 30,
    };
    const template = await CourseWorkoutEngine.generate(answers);
    const draft = CourseWorkoutEngine.toWorkoutRecord(template, answers);
    const live = CourseWorkoutEngine.buildLiveSegments!(template, draft);

    expect(live.length).toBeGreaterThan(2);
    expect(live.length % 2).toBe(0);
    expect(live[0].label).toContain("400m rapide");
    expect(live[0].metricKey).toBe("pace_min_per_km");
    expect(live[1].label).toBe("Récupération trottinée");
    expect(live[1].metricKey).toBeUndefined();
  });

  it("respecte l'allure cible explicitement saisie par l'utilisateur (allure_specifique)", async () => {
    const answers: SenseiAnswers = {
      objective: "target_pace",
      target_pace_min_per_km: 5.5,
      level: "intermédiaire",
      duration_minutes: 30,
    };
    const template = await CourseWorkoutEngine.generate(answers);
    const draft = CourseWorkoutEngine.toWorkoutRecord(template, answers);
    expect(draft.metadata?.targetPaceMinPerKm).toBe(5.5);

    const live = CourseWorkoutEngine.buildLiveSegments!(template, draft);
    expect(live[0].metrics.pace_min_per_km).toBe(5.5);
  });

  it("reformate un segment live modifié par l'utilisateur en SessionSegment d'affichage", () => {
    const formatted = CourseWorkoutEngine.formatLiveSegment!({
      id: "seg-1",
      label: "Endurance fondamentale",
      metrics: { distance_m: 6200, pace_min_per_km: 5.8 },
      metricKey: "distance_m",
      completed: true,
      position: 0,
    });
    expect(formatted.label).toBe("Endurance fondamentale");
    expect(formatted.stats).toEqual(
      expect.arrayContaining([
        { label: "Distance", value: "6.20 km" },
        { label: "Statut", value: "Réalisé" },
      ]),
    );
  });

  it("formatLiveSegment affiche telle quelle une métrique inconnue (robustesse future)", () => {
    const formatted = CourseWorkoutEngine.formatLiveSegment!({
      id: "seg-2",
      label: "Segment personnalisé",
      metrics: { effort_note: "dur mais faisable" },
      metricKey: undefined,
      completed: false,
      position: 1,
    });
    expect(formatted.stats).toEqual([{ label: "effort_note", value: "dur mais faisable" }]);
  });
});
