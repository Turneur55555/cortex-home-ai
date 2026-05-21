import { describe, it, expect } from "vitest";
import { exerciseToMuscles, MUSCLE_META, type MuscleId } from "./muscleMapping";

describe("exerciseToMuscles", () => {
  it("mappe 'bench press' vers pectoraux, triceps, épaules", () => {
    const muscles = exerciseToMuscles("bench press");
    expect(muscles).toContain("pectoraux");
    expect(muscles).toContain("triceps");
    expect(muscles).toContain("epaules");
  });

  it("retourne [] pour 'développé couché' (noms français non reconnus par la fonction)", () => {
    // exerciseToMuscles opère sur des noms d'exercices en anglais/translittérés
    const muscles = exerciseToMuscles("développé couché");
    expect(muscles).toEqual([]);
  });

  it("mappe 'squat' vers quadriceps et fessiers", () => {
    const muscles = exerciseToMuscles("squat");
    expect(muscles).toContain("quadriceps");
    expect(muscles).toContain("fessiers");
  });

  it("mappe 'deadlift' vers dos, lombaires, fessiers, ischio", () => {
    const muscles = exerciseToMuscles("deadlift");
    expect(muscles).toContain("dos");
    expect(muscles).toContain("lombaires");
    expect(muscles).toContain("fessiers");
    expect(muscles).toContain("ischio");
  });

  it("mappe 'curl bicep' vers biceps et avant-bras", () => {
    const muscles = exerciseToMuscles("curl bicep");
    expect(muscles).toContain("biceps");
    expect(muscles).toContain("avant-bras");
  });

  it("mappe 'plank' vers abdos", () => {
    const muscles = exerciseToMuscles("plank");
    expect(muscles).toContain("abdos");
  });

  it("mappe 'russian twist' vers obliques et abdos", () => {
    const muscles = exerciseToMuscles("russian twist");
    expect(muscles).toContain("obliques");
    expect(muscles).toContain("abdos");
  });

  it("retourne un tableau vide pour un exercice inconnu", () => {
    const muscles = exerciseToMuscles("exercice_totalement_inconnu_xyz");
    expect(muscles).toEqual([]);
  });

  it("retourne un tableau vide pour une chaîne vide", () => {
    const muscles = exerciseToMuscles("");
    expect(muscles).toEqual([]);
  });

  it("ignore la casse (majuscules)", () => {
    const lower = exerciseToMuscles("squat");
    const upper = exerciseToMuscles("SQUAT");
    expect(lower).toEqual(upper);
  });

  it("ignore la casse quel que soit l'exercice connu", () => {
    const lower = exerciseToMuscles("bench press");
    const mixed = exerciseToMuscles("Bench Press");
    expect(lower).toEqual(mixed);
    expect(lower.length).toBeGreaterThan(0);
  });

  it("mappe 'tirage' vers dos et biceps", () => {
    const muscles = exerciseToMuscles("tirage poulie haute");
    expect(muscles).toContain("dos");
    expect(muscles).toContain("biceps");
  });

  it("mappe 'shrug' vers trapèze uniquement", () => {
    const muscles = exerciseToMuscles("shrug");
    expect(muscles).toContain("trapeze");
    expect(muscles).not.toContain("dos");
  });
});

describe("MUSCLE_META", () => {
  it("contient tous les 14 muscles attendus", () => {
    const expectedMuscles: MuscleId[] = [
      "pectoraux", "dos", "epaules", "biceps", "triceps",
      "abdos", "obliques", "quadriceps", "ischio", "fessiers",
      "mollets", "trapeze", "avant-bras", "lombaires",
    ];
    for (const muscleId of expectedMuscles) {
      expect(MUSCLE_META).toHaveProperty(muscleId);
    }
  });

  it("chaque muscle a une fenêtre de récupération positive", () => {
    for (const [, meta] of Object.entries(MUSCLE_META)) {
      expect(meta.recoveryHours).toBeGreaterThan(0);
    }
  });

  it("chaque muscle a un label non vide", () => {
    for (const [, meta] of Object.entries(MUSCLE_META)) {
      expect(meta.label).toBeTruthy();
      expect(typeof meta.label).toBe("string");
    }
  });

  it("chaque muscle a une vue valide (front, back ou both)", () => {
    const validViews = new Set(["front", "back", "both"]);
    for (const [, meta] of Object.entries(MUSCLE_META)) {
      expect(validViews.has(meta.view)).toBe(true);
    }
  });

  it("les muscles à récupération courte ont 48h", () => {
    // biceps, triceps, abdos, obliques, mollets, avant-bras sont à 48h
    const shortRecovery: MuscleId[] = ["biceps", "triceps", "abdos", "obliques", "mollets", "avant-bras"];
    for (const id of shortRecovery) {
      expect(MUSCLE_META[id].recoveryHours).toBe(48);
    }
  });

  it("les muscles à récupération longue ont 72h", () => {
    // pectoraux, dos, epaules, quadriceps, ischio, fessiers, trapeze, lombaires sont à 72h
    const longRecovery: MuscleId[] = ["pectoraux", "dos", "epaules", "quadriceps", "ischio", "fessiers", "trapeze", "lombaires"];
    for (const id of longRecovery) {
      expect(MUSCLE_META[id].recoveryHours).toBe(72);
    }
  });
});
