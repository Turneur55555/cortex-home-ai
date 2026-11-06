import { describe, expect, it } from "vitest";
import {
  computeHabitualMeals,
  computeTypicalGrams,
  foodIdentity,
  foodKey,
  HABIT_RULES,
  mergeIdentityPrefixes,
  type NutritionHistoryRow,
} from "./habits";
import { MEAL_SLUGS, type MealSlug } from "./meals";
import { startingGrams } from "./weight";

/** Date ISO de `2026-10-31` moins `n` jours. */
function day(n: number): string {
  const d = new Date(Date.UTC(2026, 9, 31 - n));
  return d.toISOString().slice(0, 10);
}

let seq = 0;
/** Ligne de journal : aliment pesé, valeur /100 g connue. */
function row(
  date: string,
  meal: string,
  name: string,
  grams: number | null,
  per100: { kcal: number; p: number; g: number; l: number } | null,
  extra: Partial<NutritionHistoryRow> = {},
): NutritionHistoryRow {
  seq += 1;
  const scale = (v: number) => (grams == null ? null : Math.round(((v * grams) / 100) * 10) / 10);
  return {
    date,
    meal,
    name,
    created_at: `${date}T12:00:${String(seq % 60).padStart(2, "0")}Z`,
    calories: per100 ? scale(per100.kcal) : 120,
    proteins: per100 ? scale(per100.p) : 24,
    carbs: per100 ? scale(per100.g) : 3,
    fats: per100 ? scale(per100.l) : 1,
    base_calories: per100?.kcal ?? null,
    base_proteins: per100?.p ?? null,
    base_carbs: per100?.g ?? null,
    base_fats: per100?.l ?? null,
    serving_count: 1,
    consumed_quantity: grams,
    consumed_unit: grams == null ? null : "g",
    consumed_grams_per_unit: null,
    ...extra,
  };
}

const RIZ = { kcal: 350, p: 7, g: 77, l: 1 };
const POULET = { kcal: 165, p: 31, g: 0, l: 3.6 };
const HARISSA = { kcal: 70, p: 3, g: 10, l: 2 };

describe("foodKey", () => {
  it("ignore la casse et les espaces superflus", () => {
    expect(foodKey("  KIWI ")).toBe("kiwi");
    expect(foodKey("Riz  blanc,   cru")).toBe("riz blanc, cru");
    expect(foodKey(null)).toBe("");
  });
});

describe("foodIdentity — un même aliment sous plusieurs libellés", () => {
  it("ignore parenthèses, ce qui suit la virgule, accents et ligatures", () => {
    expect(foodIdentity("Harissa (sauce au piment), préemballée")).toBe("harissa");
    expect(foodIdentity("Harissa")).toBe("harissa");
    expect(foodIdentity("Riz blanc, cru")).toBe("riz blanc");
    expect(foodIdentity("Riz blanc (cuit)")).toBe("riz blanc");
    expect(foodIdentity("Œuf entier")).toBe("oeuf entier");
    expect(foodIdentity("  KIWI ")).toBe("kiwi");
  });

  it("réunit un libellé court avec l'unique libellé plus précis qui commence par lui", () => {
    const merged = mergeIdentityPrefixes(["kiwi", "kiwi sungold", "banane"]);
    expect(merged.get("kiwi")).toBe("kiwi sungold");
    expect(merged.get("kiwi sungold")).toBe("kiwi sungold");
    expect(merged.get("banane")).toBe("banane");
  });

  it("ambigu (« riz » face à deux riz différents) : rien n'est réuni", () => {
    const merged = mergeIdentityPrefixes(["riz", "riz blanc", "riz a sushi"]);
    expect(merged.get("riz")).toBe("riz");
  });
});

describe("computeHabitualMeals — le cas mesuré en production", () => {
  // Déjeuner : riz 30 g + poulet 150 g presque tous les jours, harissa de temps en temps.
  const rows: NutritionHistoryRow[] = [];
  for (let i = 1; i <= 10; i++) {
    rows.push(row(day(i), "dejeuner", "Riz blanc, cru", 30, RIZ));
    rows.push(row(day(i), "dejeuner", "Poulet (blanc cuit)", 150, POULET));
    if (i % 4 === 0) rows.push(row(day(i), "dejeuner", "Harissa", 30, HARISSA));
  }
  // Petit-déjeuner : caséine saisie en favori, SANS poids ni valeur /100 g.
  for (let i = 1; i <= 6; i++) {
    rows.push(row(day(i), "petit-dej", "Caséine Optinium", null, null));
  }
  // Dîner : seulement 2 journées saisies — trop peu pour parler d'habitude.
  rows.push(row(day(2), "diner", "Œuf entier", 100, { kcal: 140, p: 12, g: 1, l: 10 }));
  rows.push(row(day(5), "diner", "Œuf entier", 100, { kcal: 140, p: 12, g: 1, l: 10 }));

  const habits = computeHabitualMeals(rows);

  it("retient ce qui revient au moins 3 fois sur les 5 derniers repas, écarte l'occasionnel", () => {
    expect(habits.dejeuner?.items.map((it) => it.entry.name)).toEqual([
      "Poulet (blanc cuit)",
      "Riz blanc, cru",
    ]);
  });

  it("propose le poids habituel et recalcule les macros pour ce poids", () => {
    const riz = habits.dejeuner?.items.find((it) => it.key === "riz blanc");
    expect(riz?.grams).toBe(30);
    expect(riz?.entry).toMatchObject({
      calories: 105,
      proteins: 2.1,
      consumed_quantity: 30,
      consumed_unit: "g",
      base_calories: 350,
      percentage_consumed: 100,
    });
    // Riz 350 kcal/100 g × 30 g = 105 ; poulet 165 kcal/100 g × 150 g = 247,5 → 248.
    expect(habits.dejeuner?.totals.calories).toBe(105 + 248);
  });

  it("un aliment saisi sans poids (favori) reprend sa dernière prise telle quelle", () => {
    const caseine = habits["petit-dej"]?.items[0];
    expect(caseine?.grams).toBeNull();
    expect(caseine?.entry).toMatchObject({
      name: "Caséine Optinium",
      calories: 120,
      proteins: 24,
      consumed_quantity: null,
      base_calories: null,
    });
  });

  it(`moins de ${HABIT_RULES.minMealDays} journées saisies pour un repas → aucune suggestion`, () => {
    expect(habits.diner).toBeUndefined();
  });

  it("les créneaux sans aucune saisie restent absents (jamais de repas inventé)", () => {
    expect(habits.gouter).toBeUndefined();
    expect(habits.collation).toBeUndefined();
  });

  it("la journée affichée est exclue du calcul", () => {
    const only3 = rows.filter(
      (r) => r.meal !== "petit-dej" || [day(1), day(2), day(3)].includes(r.date),
    );
    expect(computeHabitualMeals(only3)["petit-dej"]).toBeDefined();
    expect(computeHabitualMeals(only3, { excludeDate: day(1) })["petit-dej"]).toBeUndefined();
  });
});

describe("computeHabitualMeals — l'habitude RÉCENTE prime", () => {
  it(`ne regarde que les ${HABIT_RULES.recentMealDays} dernières journées du repas : une habitude abandonnée disparaît`, () => {
    const rows: NutritionHistoryRow[] = [];
    // Il y a longtemps : riz tous les jours.
    for (let i = 20; i <= 40; i++) rows.push(row(day(i), "dejeuner", "Riz blanc, cru", 30, RIZ));
    // Les dernières journées : patates douces à la place.
    for (let i = 1; i <= 10; i++) {
      rows.push(
        row(day(i), "dejeuner", "Patates douces", 150, { kcal: 86, p: 1.6, g: 20, l: 0.1 }),
      );
    }
    const habits = computeHabitualMeals(rows);
    expect(habits.dejeuner?.mealDays).toBe(HABIT_RULES.recentMealDays);
    expect(habits.dejeuner?.items.map((it) => it.entry.name)).toEqual(["Patates douces"]);
  });

  it("le nom affiché est celui de la prise la plus récente, l'identité ignore la casse", () => {
    const rows = [1, 2, 3, 4].map((i) =>
      row(day(i), "gouter", i === 1 ? "Kiwi" : "KIWI", 120, { kcal: 61, p: 1, g: 15, l: 0.5 }),
    );
    const kiwi = computeHabitualMeals(rows).gouter?.items[0];
    expect(kiwi?.key).toBe("kiwi");
    expect(kiwi?.entry.name).toBe("Kiwi");
    expect(kiwi?.days).toBe(4);
  });
});

describe("computeHabitualMeals — tes vrais repas du 01 au 05/11/2026 (signalement du 06/11)", () => {
  // Valeurs /100 g approchées : seules la présence et les poids comptent ici.
  const P = {
    riz: { kcal: 350, p: 7, g: 77, l: 1 },
    poulet: { kcal: 165, p: 31, g: 0, l: 3.6 },
    harissa: { kcal: 70, p: 3, g: 10, l: 2 },
    edamame: { kcal: 120, p: 11, g: 9, l: 5 },
    patate: { kcal: 86, p: 1.6, g: 20, l: 0.1 },
    sushi: { kcal: 140, p: 3, g: 30, l: 0.4 },
    hipro: { kcal: 60, p: 10, g: 4, l: 0.2 },
    whey: { kcal: 380, p: 80, g: 6, l: 5 },
    kiwi: { kcal: 63, p: 1, g: 13, l: 0.3 },
    banane: { kcal: 89, p: 1.1, g: 23, l: 0.3 },
    crispies: { kcal: 380, p: 60, g: 20, l: 4 },
    myrtille: { kcal: 57, p: 0.7, g: 14, l: 0.3 },
    raisin: { kcal: 70, p: 0.7, g: 17, l: 0.2 },
    beurre: { kcal: 600, p: 25, g: 12, l: 50 },
    cafe: { kcal: 40, p: 2, g: 5, l: 1.5 },
    chocolat: { kcal: 600, p: 9, g: 30, l: 46 },
  };
  // Slugs repris de la source unique (jamais une liste recopiée, cf. meals.sync.test.ts).
  const [, DEJEUNER, GOUTER, DINER] = MEAL_SLUGS;
  const HARISSA_PRE = "Harissa (sauce au piment), préemballée";
  const CRISPIES = "Koro - Céréale Crispies 60 %";
  const rows: NutritionHistoryRow[] = [
    // Déjeuners : 3 « bols » poulet-riz-harissa sur 5, harissa sous deux libellés.
    row("2026-11-05", DEJEUNER, "Riz blanc, cru", 30, P.riz),
    row("2026-11-05", DEJEUNER, "Poulet (blanc cuit)", 150, P.poulet),
    row("2026-11-05", DEJEUNER, "Edamame, frozen, prepared", 75, P.edamame),
    row("2026-11-05", DEJEUNER, HARISSA_PRE, 50, P.harissa),
    row("2026-11-04", DEJEUNER, "Poulet (blanc cuit)", 150, P.poulet),
    row("2026-11-04", DEJEUNER, HARISSA_PRE, 25, P.harissa),
    row("2026-11-04", DEJEUNER, "Edamame, frozen, prepared", 75, P.edamame),
    row("2026-11-04", DEJEUNER, "Riz blanc, cru", 30, P.riz),
    row("2026-11-03", DEJEUNER, "Riz à sushi", 250, P.sushi),
    row("2026-11-02", DEJEUNER, "Poulet (blanc cuit)", 150, P.poulet),
    row("2026-11-02", DEJEUNER, "Riz blanc, cru", 30, P.riz),
    row("2026-11-02", DEJEUNER, "Patates douces", 150, P.patate),
    row("2026-11-02", DEJEUNER, "Harissa", null, null),
    row("2026-11-01", DEJEUNER, "Hipro (160 g)", 160, P.hipro),
    row("2026-11-01", DEJEUNER, "GOLD STANDARD 100% WHEY PROTEIN POWDER DRINK MIX", 20, P.whey),
    // Plus anciens : hors des 5 derniers déjeuners, ils ne décident de rien…
    row("2026-10-19", DEJEUNER, HARISSA_PRE, 50, P.harissa),
    row("2026-10-13", DEJEUNER, HARISSA_PRE, 50, P.harissa),
    // Goûters : 4 goûters « fruits » sur 5, un goûter chocolat.
    row("2026-11-05", GOUTER, CRISPIES, 26, P.crispies),
    row("2026-11-05", GOUTER, "Kiwi SunGold", 120, P.kiwi),
    row("2026-11-05", GOUTER, "Beurre de cacahouète Prosiz", 20, P.beurre),
    row("2026-11-04", GOUTER, "Myrtilles", 100, P.myrtille),
    row("2026-11-04", GOUTER, "Raisin cru (aliment moyen)", 200, P.raisin),
    row("2026-11-04", GOUTER, "Kiwi SunGold", 120, P.kiwi),
    row("2026-11-04", GOUTER, "Banane", 60, P.banane),
    row("2026-11-04", GOUTER, CRISPIES, 30, P.crispies),
    row("2026-11-03", GOUTER, "Café au lait Nescafé Dolce Gusto", 100, P.cafe),
    row("2026-11-03", GOUTER, "Banane", 70, P.banane),
    row("2026-11-03", GOUTER, "Kiwi SunGold", 120, P.kiwi),
    row("2026-11-03", GOUTER, "Beurre de cacahouète Prosiz", 16, P.beurre),
    row("2026-11-02", GOUTER, "Myrtilles", 150, P.myrtille),
    row("2026-11-02", GOUTER, "Kiwi SunGold", 120, P.kiwi),
    row("2026-11-02", GOUTER, "Banane", 70, P.banane),
    row("2026-11-02", GOUTER, CRISPIES, 16, P.crispies),
    row("2026-11-01", GOUTER, "chocolat noir 80 %", 10, P.chocolat),
    // … mais leurs poids comptent pour la quantité habituelle.
    row("2026-10-30", GOUTER, CRISPIES, 20, P.crispies),
    row("2026-10-29", GOUTER, CRISPIES, 20, P.crispies),
    // Dîners : cinq soirs, cinq repas différents.
    row("2026-11-05", DINER, HARISSA_PRE, 50, P.harissa),
    row("2026-11-05", DINER, "Poulet (blanc cuit)", 150, P.poulet),
    row("2026-11-04", DINER, "Salade thaï végétarienne picante", 300, P.patate),
    row("2026-11-03", DINER, "Mozzarella", 70, P.beurre),
    row("2026-11-02", DINER, "Harissa", null, null),
    row("2026-11-02", DINER, "Saumon aux épices tandoori", 350, P.sushi),
    row("2026-11-01", DINER, "Œuf entier", 200, P.beurre),
  ];
  const habits = computeHabitualMeals(rows, { excludeDate: "2026-11-06" });
  const names = (meal: MealSlug) => habits[meal]?.items.map((it) => it.entry.name);

  it(`ne regarde que les ${HABIT_RULES.recentMealDays} derniers repas`, () => {
    expect(HABIT_RULES.recentMealDays).toBe(5);
    expect(habits.dejeuner?.mealDays).toBe(5);
  });

  it("déjeuner : poulet + riz + HARISSA (« Harissa » et « Harissa (…), préemballée » ne font qu'un)", () => {
    expect(names(DEJEUNER)).toEqual(["Poulet (blanc cuit)", "Riz blanc, cru", HARISSA_PRE]);
  });

  it("la harissa garde son poids habituel (50 g), pas la moyenne de deux prises", () => {
    const harissa = habits.dejeuner?.items.find((it) => it.key === "harissa");
    expect(harissa?.grams).toBe(50);
  });

  it("l'edamame, deux déjeuners seulement, n'est pas encore une habitude", () => {
    expect(names(DEJEUNER)).not.toContain("Edamame, frozen, prepared");
  });

  it("goûter : les FRUITS (kiwi, banane) et les crispies ; le goûter chocolat ne s'en mêle pas", () => {
    expect(names(GOUTER)).toEqual(["Kiwi SunGold", CRISPIES, "Banane"]);
    const byKey = new Map(habits.gouter?.items.map((it) => [it.entry.name, it.grams]));
    expect(byKey.get("Kiwi SunGold")).toBe(120);
    expect(byKey.get("Banane")).toBe(70);
    expect(byKey.get(CRISPIES)).toBe(20);
  });

  it("dîner : rien ne revient 3 soirs sur 5 → aucune suggestion plutôt qu'un dîner inventé", () => {
    expect(habits.diner).toBeUndefined();
  });
});

describe("computeTypicalGrams — la quantité habituelle, la même sur tous les appareils", () => {
  it(`médiane des ${HABIT_RULES.quantitySample} dernières prises, tous repas confondus`, () => {
    const per100 = { kcal: 43, p: 1.4, g: 10, l: 0.5 };
    const grams = [210, 50, 100, 120, 90, 500, 500]; // les deux plus anciennes (500) hors échantillon
    const rows = grams.map((g, i) =>
      row(day(i + 1), i % 2 ? "gouter" : "collation", "Mûre (de ronce), crue", g, per100),
    );
    expect(computeTypicalGrams(rows).get("mûre (de ronce), crue")).toBe(100);
  });

  it("convertit les anciennes unités (portion × grammes par portion)", () => {
    const rows = [
      row(
        day(1),
        "petit-dej",
        "Whey",
        1,
        { kcal: 380, p: 80, g: 6, l: 5 },
        {
          consumed_unit: "scoop",
          consumed_grams_per_unit: 30,
        },
      ),
    ];
    expect(computeTypicalGrams(rows).get("whey")).toBe(30);
  });

  it("un aliment jamais pesé n'a pas de quantité habituelle", () => {
    const rows = [row(day(1), "petit-dej", "Caséine Optinium", null, null)];
    expect(computeTypicalGrams(rows).has("caséine optinium")).toBe(false);
  });
});

describe("startingGrams — poids pré-rempli à l'ajout", () => {
  const food = { id: "used:carotte", name: "Carotte (crue)", default_serving: undefined };

  it("la quantité habituelle de l'historique passe en premier", () => {
    expect(startingGrams(food, 215)).toBe(215);
  });

  it("sans historique : portion usuelle, jamais 0 ni NaN", () => {
    expect(startingGrams(food, null)).toBe(100);
    expect(startingGrams(food, Number.NaN)).toBe(100);
    expect(startingGrams({ ...food, name: "Banane" }, undefined)).toBe(120);
  });
});
