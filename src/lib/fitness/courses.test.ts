import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COURSES,
  buildCourseMetadata,
  courseCaloriesEstimate,
  courseOfMetadata,
  courseOfTemplate,
  genericFinishDurationMinutes,
  muscleZonesOfMetadata,
  templateSessionShape,
} from "./courses";
import { MUSCLE_META } from "./muscleMapping";

describe("cours — Lagree", () => {
  it("dure toujours 50 minutes, à Keep Cool, avec ses 5 zones", () => {
    const lagree = COURSES.lagree;
    expect(lagree.durationMinutes).toBe(50);
    expect(lagree.location).toBe("Keep Cool");
    expect(lagree.zones).toEqual(["abdos", "obliques", "fessiers", "quadriceps", "ischio"]);
  });

  it("chaque zone de chaque cours est un muscle connu de la carte de récupération", () => {
    for (const course of Object.values(COURSES)) {
      for (const z of course.zones) expect(z in MUSCLE_META).toBe(true);
    }
  });

  it("estime 300 kcal pour 50 min (profil déclaré, 6 kcal/min)", () => {
    expect(courseCaloriesEstimate(COURSES.lagree)).toBe(300);
  });
});

describe("cours — lecture", () => {
  it("un modèle sans course_key est un modèle de musculation", () => {
    expect(courseOfTemplate({ course_key: null })).toBeNull();
    expect(courseOfTemplate({})).toBeNull();
    expect(courseOfTemplate({ course_key: "inconnu" })).toBeNull();
    expect(courseOfTemplate({ course_key: "lagree" })?.name).toBe("Lagree");
  });

  it("les métadonnées de séance portent le cours, l'activité et les zones", () => {
    const meta = buildCourseMetadata(COURSES.lagree);
    expect(meta.course).toBe("lagree");
    expect(meta.activity).toBe("Pilates Lagree");
    expect(meta.caloriesEstimate).toBe(300);
    expect(courseOfMetadata(meta)?.key).toBe("lagree");
    expect(muscleZonesOfMetadata(meta)).toEqual(COURSES.lagree.zones);
  });

  it("ignore les zones inconnues et les doublons, sans planter sur une métadonnée vide", () => {
    expect(muscleZonesOfMetadata({ muscleZones: ["abdos", "jambes", "abdos", 3] })).toEqual([
      "abdos",
    ]);
    expect(muscleZonesOfMetadata(null)).toEqual([]);
    expect(muscleZonesOfMetadata({})).toEqual([]);
    expect(courseOfMetadata({ activity: "Pilates Lagree" })).toBeNull();
  });
});

describe("cours — démarrage et clôture", () => {
  it("un modèle de cours démarre une activité accompagnée Lagree, à Keep Cool", () => {
    const shape = templateSessionShape({ course_key: "lagree" });
    expect(shape.discipline).toBe("guided");
    expect(shape.gymLocation).toBe("Keep Cool");
    expect(shape.metadata.course).toBe("lagree");
    expect(shape.metadata.muscleZones).toEqual(COURSES.lagree.zones);
  });

  it("un modèle de musculation est inchangé", () => {
    expect(templateSessionShape({ course_key: null })).toEqual({
      discipline: "muscu",
      gymLocation: "Salle inconnue",
      metadata: {},
    });
  });

  it("un cours se clôt toujours à 50 min, quel que soit le temps écoulé", () => {
    const meta = buildCourseMetadata(COURSES.lagree);
    expect(genericFinishDurationMinutes(meta, 3 * 60_000)).toBe(50);
    expect(genericFinishDurationMinutes(meta, 500 * 60_000)).toBe(50);
  });

  it("une autre séance générique garde le temps écoulé, borné à [1, 600]", () => {
    expect(genericFinishDurationMinutes({}, 42 * 60_000)).toBe(42);
    expect(genericFinishDurationMinutes({}, 0)).toBe(1);
    expect(genericFinishDurationMinutes({}, 900 * 60_000)).toBe(600);
  });
});

describe("cours — économie du cours (INVARIANTS §3.3)", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261104150000_course_templates_and_xp.sql"),
    "utf8",
  );

  it("50 XP par cours, plafond 100 par semaine", () => {
    expect(sql).toMatch(/'workout_course',\s*50,\s*100,/);
  });

  it("un cours ne verse ni séance muscu ni série : la branche cours précède la musculation", () => {
    expect(sql).toMatch(/is_muscu := \(NOT is_course\)/);
    expect(sql.indexOf("IF is_course THEN")).toBeLessThan(sql.indexOf("ELSIF is_muscu THEN"));
  });

  it("chaque cours du catalogue est connu du serveur (CHECK et trigger)", () => {
    for (const key of Object.keys(COURSES)) {
      expect(sql).toContain(`course_key IN ('${key}')`);
      expect(sql).toContain(`IN ('${key}')`);
    }
  });
});
