import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHANTIER 3 / CRIT-05 — TEST 2 : garde-fou de convention.
 *
 * Le comportement offline des queries locales tient à UNE ligne
 * (`...OFFLINE_FIRST_QUERY_OPTIONS`, cf. `lib/offline/offlineQuery.ts`). Une
 * query ajoutée demain qui lit un repository offline SANS ce marqueur serait
 * silencieusement mise en pause hors connexion — exactement le bug CRIT-05,
 * réintroduit sans que rien ne le signale.
 *
 * Ce test relit donc les sources : pour chaque hook branché sur
 * `createOfflineRepository`, toute `useQuery` qui lit le store local DOIT
 * porter le marqueur, sauf exception explicitement justifiée ci-dessous. Il
 * n'y a AUCUNE seconde liste de queries à maintenir : la liste est dérivée
 * du code réel à chaque exécution.
 */

const HOOKS_DIR = join(process.cwd(), "src/hooks");
const MARKER = "...OFFLINE_FIRST_QUERY_OPTIONS";

/**
 * Queries qui vivent dans un fichier offline-first mais qui sont RÉELLEMENT
 * online-only : elles n'ont aucune représentation IndexedDB et doivent le
 * rester (cf. phase 3 du chantier). Clé = nom du hook exporté.
 */
const ONLINE_ONLY_EXCEPTIONS: Record<string, string> = {
  useNutritionRange:
    "Moteur TDEE observé : n'a de sens que sur des données serveur consolidées (choix documenté dans useNutritionData.ts).",
  useSupplementHistory:
    "`supplement_logs` n'a pas de repository offline — historique purement serveur.",
  useRecipeCollections:
    "`recipe_collection_recipes` reste online-only (note d'en-tête useCollections.ts).",
  useCollectionRecipeIds:
    "`recipe_collection_recipes` reste online-only (note d'en-tête useCollections.ts).",
  useExerciseImageUrls: "URLs signées Supabase Storage — inutilisables hors ligne.",
};

interface QueryBlock {
  hookName: string;
  text: string;
  marked: boolean;
}

/** Découpe un fichier en blocs `useQuery({ ... })` avec le hook qui les contient. */
function extractQueryBlocks(source: string): QueryBlock[] {
  const lines = source.split("\n");
  const blocks: QueryBlock[] = [];
  let currentHook = "<module>";
  for (let i = 0; i < lines.length; i++) {
    const fnMatch = lines[i].match(/^(?:export )?function (\w+)/);
    if (fnMatch) currentHook = fnMatch[1];
    if (!lines[i].includes("useQuery({")) continue;
    let depth = 0;
    let end = i;
    for (let j = i; j < lines.length && j - i < 200; j++) {
      for (const ch of lines[j]) {
        if (ch === "(" || ch === "{") depth++;
        else if (ch === ")" || ch === "}") depth--;
      }
      end = j;
      if (depth <= 0) break;
    }
    const text = lines.slice(i, end + 1).join("\n");
    blocks.push({ hookName: currentHook, text, marked: text.includes(MARKER) });
  }
  return blocks;
}

/**
 * Identifiants du fichier qui signalent une lecture du store local : les
 * repositories eux-mêmes, plus les fonctions locales qui en lisent un
 * (`refreshFromServer` + `repo.list()` sont souvent extraits dans un helper).
 */
function localReadIdentifiers(source: string): string[] {
  const ids = new Set<string>();
  for (const m of source.matchAll(
    /(?:const|let|export const)\s+(\w+)\s*=\s*createOfflineRepository/g,
  )) {
    ids.add(m[1]);
  }
  // Helpers locaux dont le corps touche un repository.
  const fnRegex = /^(?:export )?async function (\w+)\([\s\S]*?\n\}/gm;
  for (const m of source.matchAll(fnRegex)) {
    for (const repo of ids) {
      if (m[0].includes(`${repo}.`)) {
        ids.add(m[1]);
        break;
      }
    }
  }
  // Repositories importés d'un autre hook (use-fitness expose les siens).
  for (const m of source.matchAll(/\b(\w+Repo)\b/g)) ids.add(m[1]);
  for (const m of source.matchAll(/\b(refresh\w*FromServer)\b/g)) ids.add(m[1]);
  return [...ids];
}

function offlineFirstHookFiles(): string[] {
  return readdirSync(HOOKS_DIR)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .filter((f) => !f.includes(".test."))
    .filter((f) => {
      const src = readFileSync(join(HOOKS_DIR, f), "utf8");
      return src.includes("createOfflineRepository") || src.includes("Repo.list(");
    });
}

describe("CRIT-05 — convention offline-first des queries", () => {
  it("TEST 2 — toute query qui lit IndexedDB est déclarée offline-first", () => {
    const violations: string[] = [];

    for (const file of offlineFirstHookFiles()) {
      const source = readFileSync(join(HOOKS_DIR, file), "utf8");
      const localIds = localReadIdentifiers(source);
      for (const block of extractQueryBlocks(source)) {
        const readsLocal = localIds.some(
          (id) => block.text.includes(`${id}.`) || block.text.includes(`${id}(`),
        );
        if (!readsLocal) continue;
        if (block.marked) continue;
        if (ONLINE_ONLY_EXCEPTIONS[block.hookName]) continue;
        violations.push(`${file} → ${block.hookName}()`);
      }
    }

    expect(violations, `Queries lisant IndexedDB sans '${MARKER}'`).toEqual([]);
  });

  it("TEST 2 — chaque module à données locales expose au moins une query offline-first", () => {
    // Les modules cités par le chantier 3, avec le fichier qui porte leur
    // lecture locale. Si un module disparaît de cette table, c'est que son
    // fichier a été renommé : le test doit le signaler, pas se taire.
    const MODULES: Record<string, string> = {
      Fitness: "use-fitness.ts",
      "Fitness — séance générique": "useGenericActiveSession.ts",
      "Fitness — modèles": "useWorkoutTemplates.ts",
      "Fitness — bilans": "useWorkoutAnalyses.ts",
      Nutrition: "useNutritionData.ts",
      "Nutrition — aliments perso": "useCustomFoods.ts",
      "Nutrition — favoris": "use-nutrition-favorites.ts",
      "Nutrition — repas enregistrés": "use-saved-meals.ts",
      "Nutrition — planning": "useMealPlan.ts",
      Recettes: "useRecipes.ts",
      "Shopping List": "useShoppingList.ts",
      Collections: "useCollections.ts",
      Objectifs: "usePhysicalGoal.ts",
      Compléments: "use-supplements.ts",
    };

    const missing: string[] = [];
    for (const [module, file] of Object.entries(MODULES)) {
      const source = readFileSync(join(HOOKS_DIR, file), "utf8");
      const marked = extractQueryBlocks(source).filter((b) => b.marked);
      if (marked.length === 0) missing.push(`${module} (${file})`);
    }

    expect(missing, "Modules sans aucune query offline-first").toEqual([]);
  });

  it("TEST 3 — aucune query online-only n'a été marquée offline-first par erreur", () => {
    // Les queries hors fichiers offline-first ne doivent jamais porter le
    // marqueur : il n'y a pas de store local derrière elles.
    const wrongly: string[] = [];
    const offlineFiles = new Set(offlineFirstHookFiles());
    for (const file of readdirSync(HOOKS_DIR)) {
      if (!/\.(ts|tsx)$/.test(file) || file.includes(".test.")) continue;
      if (offlineFiles.has(file)) continue;
      const source = readFileSync(join(HOOKS_DIR, file), "utf8");
      if (source.includes(MARKER)) wrongly.push(file);
    }
    expect(wrongly, "Marqueur offline-first posé hors d'un module à store local").toEqual([]);
  });
});
