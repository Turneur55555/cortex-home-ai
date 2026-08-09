import { describe, it, expect } from "vitest";
import { exerciseToMuscles, MUSCLE_META, type MuscleId } from "./muscleMapping";

describe("exerciseToMuscles", () => {
  it("mappe 'bench press' vers pectoraux, triceps, épaules", () => {
    const muscles = exerciseToMuscles("bench press");
    expect(muscles).toContain("pectoraux");
    expect(muscles).toContain("triceps");
    expect(muscles).toContain("epaules");
  });

  it("mappe 'développé couché' vers pectoraux, triceps, épaules (accents)", () => {
    const muscles = exerciseToMuscles("développé couché");
    expect(muscles).toContain("pectoraux");
    expect(muscles).toContain("triceps");
    expect(muscles).toContain("epaules");
  });

  it("mappe 'développé militaire' vers épaules et triceps (accents)", () => {
    const muscles = exerciseToMuscles("Développé militaire");
    expect(muscles).toContain("epaules");
    expect(muscles).toContain("triceps");
  });

  it("mappe 'soulevé de terre' vers dos, lombaires, fessiers, ischio (accents)", () => {
    const muscles = exerciseToMuscles("soulevé de terre");
    expect(muscles).toContain("dos");
    expect(muscles).toContain("lombaires");
    expect(muscles).toContain("fessiers");
    expect(muscles).toContain("ischio");
  });

  it("mappe 'élévation latérale' vers épaules uniquement (accents)", () => {
    const muscles = exerciseToMuscles("élévation latérale");
    expect(muscles).toEqual(["epaules"]);
  });

  // Régression audit RPG V2 (29/08/2026) : "Élévations latérales câble"/
  // "Élévations latérales haltères" (72 séries réelles Cortex, les
  // exercices les plus loggués pour les épaules) ne matchaient PAS le
  // pattern original (accord pluriel/féminin manquant) — le muscle
  // épaules perdait silencieusement son signal le plus riche.
  it("mappe 'Élévations latérales câble' au pluriel (régression audit)", () => {
    const muscles = exerciseToMuscles("Élévations latérales câble");
    expect(muscles).toEqual(["epaules"]);
  });

  it("mappe 'Élévation latéral poulie' sans accord féminin (régression audit)", () => {
    const muscles = exerciseToMuscles("Élévation latéral poulie");
    expect(muscles).toEqual(["epaules"]);
  });

  it("mappe 'Élévations frontales' au pluriel (régression audit)", () => {
    const muscles = exerciseToMuscles("Élévations frontales épaule");
    expect(muscles).toEqual(["epaules"]);
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

  // Régression audit RPG V2 Phase H (30/08/2026) : "Rotation externe/interne
  // de l'épaule" (coiffe des rotateurs, 11 séries réelles Cortex) tombait à
  // tort dans le mot-clé générique "rotation" de la règle obliques —
  // aucun bucket obliques/abdos n'a de sens anatomique pour cet exercice.
  it("mappe 'Rotation externe de l'épaule à la poulie' vers épaules, jamais obliques (régression audit)", () => {
    const muscles = exerciseToMuscles("Rotation externe de l’épaule à la poulie");
    expect(muscles).toEqual(["epaules"]);
  });

  it("mappe 'Rotation interne de l'épaule' vers épaules, jamais obliques (régression audit)", () => {
    const muscles = exerciseToMuscles("Rotation interne de l’épaule à 90 degrés");
    expect(muscles).toEqual(["epaules"]);
  });

  it("le mot-clé générique 'rotation' seul ne mappe plus vers obliques (garde-fou)", () => {
    // Une rotation d'épaule ne doit jamais tomber dans obliques ; seule une
    // rotation du tronc/torse/taille (russian twist et équivalents) doit.
    expect(exerciseToMuscles("rotation du poignet")).not.toContain("obliques");
  });

  it("'russian twist' et 'woodchop' restent mappés vers obliques (non-régression)", () => {
    expect(exerciseToMuscles("russian twist")).toEqual(["obliques", "abdos"]);
    expect(exerciseToMuscles("woodchop poulie")).toEqual(["obliques", "abdos"]);
  });

  // Régression audit Phase H : "Dips" (16 séries réelles) ne créditait que
  // les triceps — les dips sont un mouvement de poussée composé (consensus
  // anatomique : pectoraux + triceps + épaules antérieures).
  it("mappe 'Dips' (sans qualificatif) vers pectoraux, triceps, épaules (régression audit)", () => {
    const muscles = exerciseToMuscles("Dips");
    expect(muscles).toEqual(["pectoraux", "triceps", "epaules"]);
  });

  it("mappe 'Développé convergent à la poulie' vers pectoraux/triceps/épaules (régression audit)", () => {
    const muscles = exerciseToMuscles("Développé convergent à la poulie");
    expect(muscles).toContain("pectoraux");
  });

  it("mappe 'Dumbbell Push Press' vers épaules et triceps (régression audit)", () => {
    const muscles = exerciseToMuscles("Dumbbell Push Press");
    expect(muscles).toEqual(["epaules", "triceps"]);
  });

  it("mappe 'Pushdown corde' vers triceps (régression audit)", () => {
    const muscles = exerciseToMuscles("Pushdown corde");
    expect(muscles).toEqual(["triceps"]);
  });

  // Espaces multiples + mot "des" entre "extension" et "triceps" cassaient
  // le pattern d'origine (`.?` = 1 caractère max) — 3 séries réelles.
  it("mappe 'Extension     des triceps à la poulie' malgré les espaces multiples (régression audit)", () => {
    const muscles = exerciseToMuscles("Extension     des triceps à la poulie haute, dos à la poulie");
    expect(muscles).toEqual(["triceps"]);
  });

  it("mappe 'Relevé de jambes suspendu' vers abdos (régression audit)", () => {
    const muscles = exerciseToMuscles("Relevé de jambes suspendu");
    expect(muscles).toEqual(["abdos"]);
  });

  it("mappe 'Wheel rollout' vers abdos (régression audit)", () => {
    const muscles = exerciseToMuscles("Wheel rollout");
    expect(muscles).toEqual(["abdos"]);
  });

  it("mappe 'Extension dos' vers lombaires (régression audit)", () => {
    const muscles = exerciseToMuscles("Extension dos");
    expect(muscles).toEqual(["lombaires"]);
  });

  it("mappe 'Y-Raise poulie' vers épaules et trapèzes (régression audit)", () => {
    const muscles = exerciseToMuscles("Y-Raise poulie");
    expect(muscles).toEqual(["epaules", "trapeze"]);
  });

  it("mappe 'Farmer's Carry' vers trapèzes et avant-bras (régression audit)", () => {
    const muscles = exerciseToMuscles("Farmer’s Carry");
    expect(muscles).toEqual(["trapeze", "avant-bras"]);
  });

  it("mappe 'thruster' vers quadriceps/fessiers/épaules/triceps (mouvement hybride, régression audit)", () => {
    const muscles = exerciseToMuscles("thruster haltère");
    expect(muscles).toEqual(["quadriceps", "fessiers", "epaules", "triceps"]);
  });

  // Cas ambigus (audit Phase H) — volontairement laissés NON mappés plutôt
  // que forcés vers une classification arbitraire (consigne explicite).
  it("laisse 'Pull over' non mappé (ambigu dos/pectoraux, non tranché)", () => {
    expect(exerciseToMuscles("Pull over poulie haute")).toEqual([]);
  });

  it("laisse 'Wall Balls' non mappé (mouvement composé ambigu)", () => {
    expect(exerciseToMuscles("Wall Balls")).toEqual([]);
  });
});

describe("MUSCLE_META", () => {
  it("contient tous les 14 muscles attendus", () => {
    const expectedMuscles: MuscleId[] = [
      "pectoraux",
      "dos",
      "epaules",
      "biceps",
      "triceps",
      "abdos",
      "obliques",
      "quadriceps",
      "ischio",
      "fessiers",
      "mollets",
      "trapeze",
      "avant-bras",
      "lombaires",
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
    const shortRecovery: MuscleId[] = [
      "biceps",
      "triceps",
      "abdos",
      "obliques",
      "mollets",
      "avant-bras",
    ];
    for (const id of shortRecovery) {
      expect(MUSCLE_META[id].recoveryHours).toBe(48);
    }
  });

  it("les muscles à récupération longue ont 72h", () => {
    // pectoraux, dos, epaules, quadriceps, ischio, fessiers, trapeze, lombaires sont à 72h
    const longRecovery: MuscleId[] = [
      "pectoraux",
      "dos",
      "epaules",
      "quadriceps",
      "ischio",
      "fessiers",
      "trapeze",
      "lombaires",
    ];
    for (const id of longRecovery) {
      expect(MUSCLE_META[id].recoveryHours).toBe(72);
    }
  });
});
