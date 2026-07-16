// Garde-fou anti-dérive — voir docs/architecture/nutrition-meal-slugs.md.
//
// Empêche trois régressions précises qui se sont déjà toutes produites en
// production sur ce module :
//   1. Le frontend et les Edge Functions définissent chacun leur propre
//      liste de slugs, qui divergent silencieusement (bug "Goûter" du
//      16/07/2026 : scan-meal avait sa propre liste, sans "gouter").
//   2. MEAL_SLUGS gagne une nouvelle valeur côté code mais aucune migration
//      SQL ne met à jour la contrainte CHECK nutrition_meal_check → toute
//      insertion avec la nouvelle valeur échoue en production (code 23514).
//   3. Une liste dupliquée de slugs de repas réapparaît ailleurs dans le
//      repo (copier-coller) au lieu de réutiliser la source unique.
//
// Ce test échoue si l'une de ces trois situations se produit.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { MEAL_SLUGS as FRONTEND_MEAL_SLUGS } from "@/lib/nutrition/meals";
// Import direct de la source canonique (pas de réexport intermédiaire) pour
// garantir que ce test compare bien deux résolutions de module indépendantes.
import { MEAL_SLUGS as EDGE_MEAL_SLUGS } from "../../../supabase/functions/_shared/meals.ts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

const KNOWN_MEAL_WORDS = [
  "petit-dej",
  "petit-dejeuner",
  "dejeuner",
  "gouter",
  "diner",
  "collation",
];

/** Chemins qui ont légitimement le droit de mentionner plusieurs slugs de
 *  repas dans un même tableau : les deux sources canoniques elles-mêmes,
 *  ce fichier de test, les migrations SQL (historique), et la doc. */
const ALLOWLISTED_SUBSTRINGS = [
  "supabase/functions/_shared/meals.ts",
  "src/lib/nutrition/meals.ts",
  "src/lib/nutrition/meals.sync.test.ts",
  "src/lib/nutrition/meals.test.ts",
  "supabase/migrations/",
  "docs/architecture/nutrition-meal-slugs.md",
];

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === "node_modules" ||
      entry.name.startsWith(".") ||
      entry.name === "dist" ||
      entry.name === ".output"
    ) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Extrait le tableau ARRAY[...] de la dernière migration qui touche
 *  nutrition_meal_check (les fichiers de migration sont préfixés par un
 *  timestamp, donc le tri lexicographique donne bien le plus récent). */
function latestMealCheckConstraintValues(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8").includes("nutrition_meal_check"));

  expect(
    files.length,
    "aucune migration ne définit nutrition_meal_check — la contrainte a-t-elle été renommée ?",
  ).toBeGreaterThan(0);

  const latest = files[files.length - 1];
  const sql = readFileSync(join(MIGRATIONS_DIR, latest), "utf8");

  const match = sql.match(/nutrition_meal_check[\s\S]*?ARRAY\s*\[([^\]]+)\]/);
  expect(match, `impossible de parser le CHECK ARRAY[...] dans ${latest}`).not.toBeNull();

  return [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("meal slugs — source unique de vérité", () => {
  it("le frontend et les Edge Functions résolvent EXACTEMENT la même liste", () => {
    expect(FRONTEND_MEAL_SLUGS).toEqual(EDGE_MEAL_SLUGS);
  });

  it("MEAL_SLUGS n'est pas vide et ne contient pas de doublons", () => {
    expect(FRONTEND_MEAL_SLUGS.length).toBeGreaterThan(0);
    expect(new Set(FRONTEND_MEAL_SLUGS).size).toBe(FRONTEND_MEAL_SLUGS.length);
  });

  it("chaque valeur de MEAL_SLUGS est acceptée par la contrainte SQL la plus récente", () => {
    const dbValues = latestMealCheckConstraintValues();
    const missing = FRONTEND_MEAL_SLUGS.filter((slug) => !dbValues.includes(slug));

    expect(
      missing,
      `Ces valeurs de MEAL_SLUGS ne sont PAS autorisées par nutrition_meal_check : ${missing.join(", ")}.\n` +
        `Ajoute une migration supabase/migrations/*.sql qui recrée la contrainte avec ces valeurs ` +
        `(voir docs/architecture/nutrition-meal-slugs.md), puis applique-la en production.`,
    ).toEqual([]);
  });

  it("aucune liste dupliquée de slugs de repas n'existe ailleurs dans le repo", () => {
    const offenders: string[] = [];

    for (const file of listSourceFiles(REPO_ROOT)) {
      const rel = file.slice(REPO_ROOT.length + 1);
      if (ALLOWLISTED_SUBSTRINGS.some((allowed) => rel.includes(allowed))) continue;

      const content = readFileSync(file, "utf8");
      for (const bracket of content.matchAll(/\[[^[\]]*\]/g)) {
        const hitCount = KNOWN_MEAL_WORDS.filter(
          (word) => bracket[0].includes(`"${word}"`) || bracket[0].includes(`'${word}'`),
        ).length;
        if (hitCount >= 3) offenders.push(`${rel}: ${bracket[0].slice(0, 120)}`);
      }
    }

    expect(
      offenders,
      `Liste(s) de slugs de repas dupliquée(s) détectée(s) hors des sources canoniques :\n${offenders.join("\n")}\n` +
        `Importe MEAL_SLUGS depuis supabase/functions/_shared/meals.ts (ou src/lib/nutrition/meals.ts côté frontend) au lieu de recopier la liste.`,
    ).toEqual([]);
  });
});
