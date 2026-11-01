import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  averageOverCompleteDays,
  completeDates,
  completeDatesFromSeries,
  dayCompletion,
  DAY_COMPLETING_MEAL,
  isCompleteDay,
  shouldWarnBeforeCopying,
  type DayTotals,
} from "./dayCompletion";

describe("dayCompletion", () => {
  it("aucun aliment → empty, même bouclée (une journée vide n'est jamais « 0 kcal »)", () => {
    expect(dayCompletion({ hasEntries: false, hasDinner: false, closed: true })).toBe("empty");
  });

  it("bouclée → closed, avec ou sans dîner", () => {
    expect(dayCompletion({ hasEntries: true, hasDinner: false, closed: true })).toBe("closed");
    expect(dayCompletion({ hasEntries: true, hasDinner: true, closed: true })).toBe("closed");
  });

  it("dîner saisi sans clôture → dinner (complète)", () => {
    expect(dayCompletion({ hasEntries: true, hasDinner: true, closed: false })).toBe("dinner");
  });

  it("entamée, ni dîner ni clôture → open (exclue des moyennes)", () => {
    expect(dayCompletion({ hasEntries: true, hasDinner: false, closed: false })).toBe("open");
  });

  it("seules closed et dinner sont complètes", () => {
    expect(isCompleteDay("closed")).toBe(true);
    expect(isCompleteDay("dinner")).toBe(true);
    expect(isCompleteDay("open")).toBe(false);
    expect(isCompleteDay("empty")).toBe(false);
  });

  it("le repas qui complète une journée est le dîner", () => {
    expect(DAY_COMPLETING_MEAL).toBe("diner");
  });

  it("on ne prévient avant de copier QUE pour une journée entamée et incomplète", () => {
    expect(shouldWarnBeforeCopying("open")).toBe(true);
    expect(shouldWarnBeforeCopying("closed")).toBe(false);
    expect(shouldWarnBeforeCopying("dinner")).toBe(false);
    expect(shouldWarnBeforeCopying("empty")).toBe(false);
  });
});

describe("completeDates", () => {
  // Un seul slug « ordinaire » suffit : seule la présence du dîner compte.
  const rows = [
    { date: "2026-10-28", meal: "dejeuner" },
    { date: "2026-10-28", meal: "dejeuner" },
    { date: "2026-10-29", meal: "dejeuner" },
    { date: "2026-10-29", meal: DAY_COMPLETING_MEAL },
    { date: "2026-10-30", meal: "dejeuner" },
  ];

  it("dîner saisi OU journée bouclée ; une journée entamée sans les deux est exclue", () => {
    const closed = new Set(["2026-10-30"]);
    expect([...completeDates(rows, closed)].sort()).toEqual(["2026-10-29", "2026-10-30"]);
  });

  it("une date bouclée sans aucun aliment n'est pas complète", () => {
    expect(completeDates(rows, new Set(["2026-10-31"])).has("2026-10-31")).toBe(false);
  });

  it("completeDatesFromSeries applique exactement la même règle sur une série agrégée", () => {
    const series = [
      { date: "2026-10-28", calories: 900, hasDinner: false },
      { date: "2026-10-29", calories: 1750, hasDinner: true },
      { date: "2026-10-30", calories: 700, hasDinner: false },
      { date: "2026-10-31", calories: 0, hasDinner: false },
    ];
    const closed = new Set(["2026-10-30", "2026-10-31"]);
    expect([...completeDatesFromSeries(series, closed)].sort()).toEqual([
      "2026-10-29",
      "2026-10-30",
    ]);
  });
});

describe("averageOverCompleteDays", () => {
  // Les vrais chiffres de la mesure du 01/11/2026 : journées avec dîner 1 735 et
  // 1 764 kcal, journées sans dîner 759 à 986 kcal.
  const series: DayTotals[] = [
    { date: "2026-10-25", calories: 0, proteins: 0, carbs: 0, fats: 0 },
    { date: "2026-10-26", calories: 1764, proteins: 167, carbs: 120, fats: 60 },
    { date: "2026-10-27", calories: 986, proteins: 96, carbs: 70, fats: 30 },
    { date: "2026-10-28", calories: 947, proteins: 106, carbs: 60, fats: 28 },
    { date: "2026-10-29", calories: 1735, proteins: 184, carbs: 110, fats: 58 },
    { date: "2026-10-30", calories: 759, proteins: 62, carbs: 55, fats: 25 },
    { date: "2026-10-31", calories: 0, proteins: 0, carbs: 0, fats: 0 },
  ];
  const complete = new Set(["2026-10-26", "2026-10-29"]);

  it("ne moyenne que les journées complètes et compte les journées exclues", () => {
    const avg = averageOverCompleteDays(series, 7, complete);
    expect(avg.calories).toBe(Math.round((1764 + 1735) / 2));
    expect(avg.proteins).toBe(Math.round((167 + 184) / 2));
    expect(avg.completeDays).toBe(2);
    expect(avg.excludedDays).toBe(3);
  });

  it("une journée sans aucun aliment n'est ni comptée ni « exclue »", () => {
    const avg = averageOverCompleteDays(series, 7, new Set([...complete, "2026-10-31"]));
    expect(avg.completeDays).toBe(2);
    expect(avg.excludedDays).toBe(3);
  });

  it("la fenêtre porte sur les n derniers jours de la série", () => {
    const avg = averageOverCompleteDays(series, 3, complete);
    expect(avg.completeDays).toBe(1);
    expect(avg.calories).toBe(1735);
    expect(avg.excludedDays).toBe(1);
  });

  it("aucune journée complète → zéros explicites, jamais une moyenne de journées incomplètes", () => {
    const avg = averageOverCompleteDays(series, 7, new Set());
    expect(avg).toEqual({
      calories: 0,
      proteins: 0,
      carbs: 0,
      fats: 0,
      completeDays: 0,
      excludedDays: 5,
    });
  });
});

describe("migration nutrition_day_closures — ce qu'elle ne doit JAMAIS contenir (INVARIANTS §1.7)", () => {
  /** La migration sans ses commentaires : ils expliquent justement pourquoi ces mots en sont absents. */
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261101120000_nutrition_day_closures.sql"),
    "utf-8",
  )
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("aucune contrainte UNIQUE : une violation inconnue du moteur de sync deviendrait une opération blocked", () => {
    // Deux appareils qui bouclent la même journée hors ligne donneraient un 23505
    // classé « définitif » (classifyUniqueViolation) : opération blocked et point
    // d'attention du Profil pour un simple geste de fin de journée.
    expect(sql).not.toMatch(/\bUNIQUE\b/i);
  });

  it("aucune colonne d'état : la complétude se dérive à la lecture, elle n'est jamais stockée", () => {
    const create =
      /CREATE TABLE IF NOT EXISTS public\.nutrition_day_closures \(([\s\S]*?)\n\);/.exec(sql);
    expect(create).not.toBeNull();
    const columns = [...create![1].matchAll(/^\s*(\w+)\s+[a-z]/gim)].map((m) => m[1]);
    expect(columns).toEqual(["id", "user_id", "date", "created_at", "updated_at"]);
  });

  it("RLS propriétaire et trigger set_updated_at (contrat offline)", () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/USING \(auth\.uid\(\) = user_id\)/);
    expect(sql).toMatch(/WITH CHECK \(auth\.uid\(\) = user_id\)/);
    expect(sql).toMatch(/EXECUTE FUNCTION public\.set_updated_at\(\)/);
  });
});
