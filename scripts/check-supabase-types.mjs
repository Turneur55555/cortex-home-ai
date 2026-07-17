#!/usr/bin/env node
// ============================================================
// Vérifie que `src/integrations/supabase/types.ts` est CONFORME à la base
// de données Supabase (source de vérité unique).
//
// Génère les types officiels depuis la base (`supabase gen types`) puis
// compare, au niveau SÉMANTIQUE (tables + colonnes), avec le fichier commité.
// Tolérant au formatage (ordre/espaces/commentaires) : seule compte la
// présence des tables et de leurs colonnes. Échoue avec un message EXPLICITE
// listant ce qui manque / est en trop, sans jamais modifier le dépôt.
//
// Voir docs/architecture/supabase-types-source-of-truth.md
//
// Usage :
//   node scripts/check-supabase-types.mjs
//     → génère depuis la base (SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF)
//   SUPABASE_TYPES_FRESH_FILE=<path> node scripts/check-supabase-types.mjs
//     → compare au contenu d'un fichier (tests / usage hors ligne)
// ============================================================

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TARGET = "src/integrations/supabase/types.ts";
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "bcwfvpwxzlmkxobvbtzp";

/**
 * Extrait { table: Set<colonnes> } de la section `Tables:` d'un fichier de
 * types Supabase généré. Line-based, robuste au formatage standard du
 * générateur (6 espaces pour un nom de table, 10 pour une colonne de Row).
 */
function parseTables(source) {
  const lines = source.split(/\r?\n/);
  const tables = new Map();

  let inTables = false;
  let depthAtTables = 0;
  let currentTable = null;
  let inRow = false;

  for (const line of lines) {
    // Entrée dans la section Tables du schéma public.
    if (!inTables) {
      if (/^\s{4}Tables:\s*\{\s*$/.test(line)) {
        inTables = true;
        depthAtTables = 0;
      }
      continue;
    }

    // Nom de table : 6 espaces, identifiant, ": {".
    const tableMatch = line.match(/^\s{6}([A-Za-z0-9_]+):\s*\{\s*$/);
    if (tableMatch && !currentTable) {
      currentTable = tableMatch[1];
      if (!tables.has(currentTable)) tables.set(currentTable, new Set());
      inRow = false;
      continue;
    }

    if (currentTable) {
      // Début du bloc Row (les colonnes de vérité de la table).
      if (/^\s{8}Row:\s*\{\s*$/.test(line)) {
        inRow = true;
        continue;
      }
      if (inRow) {
        // Fin du bloc Row.
        if (/^\s{8}\}\s*$/.test(line)) {
          inRow = false;
          continue;
        }
        const colMatch = line.match(/^\s{10}([A-Za-z0-9_]+)\??:\s/);
        if (colMatch) tables.get(currentTable).add(colMatch[1]);
        continue;
      }
      // Fin du bloc de la table (6 espaces + "}").
      if (/^\s{6}\}\s*$/.test(line)) {
        currentTable = null;
        continue;
      }
    }

    // Fin de la section Tables (4 espaces + "}" au niveau du schéma).
    if (!currentTable && /^\s{4}\}\s*$/.test(line)) {
      // On borne : la première accolade de niveau 4 après Tables ferme Tables.
      // (Views/Functions viennent après, hors périmètre.)
      if (depthAtTables === 0) break;
    }
  }

  return tables;
}

function generateFromDb() {
  try {
    return execFileSync(
      "supabase",
      ["gen", "types", "typescript", "--project-id", PROJECT_REF, "--schema", "public"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (e) {
    console.error("❌ Échec de `supabase gen types` (base injoignable ou CLI absente).");
    console.error("   " + (e.stderr?.toString?.() || e.message || e));
    console.error("   Vérifie SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF et la CLI Supabase.");
    process.exit(2);
  }
}

function main() {
  const fixture = process.env.SUPABASE_TYPES_FRESH_FILE;
  const fresh = fixture ? readFileSync(fixture, "utf8") : generateFromDb();
  const committed = readFileSync(TARGET, "utf8");

  const dbTables = parseTables(fresh);
  const fileTables = parseTables(committed);

  if (dbTables.size === 0) {
    console.error(
      "❌ Aucune table détectée dans les types générés — génération suspecte, on arrête.",
    );
    process.exit(2);
  }

  const missingTables = [];
  const extraTables = [];
  const columnDiffs = [];

  for (const [table, cols] of dbTables) {
    if (!fileTables.has(table)) {
      missingTables.push(table);
      continue;
    }
    const fileCols = fileTables.get(table);
    const missingCols = [...cols].filter((c) => !fileCols.has(c));
    const extraCols = [...fileCols].filter((c) => !cols.has(c));
    if (missingCols.length || extraCols.length) {
      columnDiffs.push({ table, missingCols, extraCols });
    }
  }
  for (const table of fileTables.keys()) {
    if (!dbTables.has(table)) extraTables.push(table);
  }

  const hasDrift = missingTables.length || extraTables.length || columnDiffs.length;

  if (!hasDrift) {
    console.log(
      `✅ ${TARGET} est conforme à la base Supabase (${dbTables.size} tables vérifiées).`,
    );
    process.exit(0);
  }

  console.error("═══════════════════════════════════════════════════════════════");
  console.error("❌ types.ts NE CORRESPOND PLUS à la base de données Supabase.");
  console.error("   La base est la source de vérité. Ne PAS éditer types.ts à la main.");
  console.error("═══════════════════════════════════════════════════════════════");
  if (missingTables.length) {
    console.error("\n  ▸ Tables présentes en base mais ABSENTES de types.ts :");
    for (const t of missingTables) console.error(`      - ${t}`);
    console.error("    (typiquement effacées par une régénération Lovable)");
  }
  if (extraTables.length) {
    console.error("\n  ▸ Tables dans types.ts mais ABSENTES de la base :");
    for (const t of extraTables) console.error(`      - ${t}`);
  }
  for (const d of columnDiffs) {
    console.error(`\n  ▸ Colonnes divergentes sur « ${d.table} » :`);
    if (d.missingCols.length) console.error(`      manquantes : ${d.missingCols.join(", ")}`);
    if (d.extraCols.length) console.error(`      en trop     : ${d.extraCols.join(", ")}`);
  }
  console.error("\n  ➜ Correction : régénère les types depuis la base, puis committe :");
  console.error("       npm run gen:types");
  console.error("     (voir docs/architecture/supabase-types-source-of-truth.md)\n");
  process.exit(1);
}

main();
