#!/usr/bin/env node
/**
 * check-offline-repository-contract.mjs
 *
 * GARDE-FOU : vérifie que TOUTE table branchée sur `createOfflineRepository`
 * (src/lib/offline/repository.ts) respecte le contrat que ce repository
 * impose en base — `id`, `user_id`, `created_at`, `updated_at`.
 *
 * Pourquoi ce contrôle existe : `repository.ts::create()` ajoute
 * inconditionnellement `id`/`user_id`/`created_at`/`updated_at` à CHAQUE
 * payload. Une table à qui il manque une de ces colonnes fait échouer tous
 * ses `create` en 400 PGRST204 ("column not found in the schema cache"), en
 * boucle, sans que rien ne le signale au développeur. C'est arrivé DEUX fois
 * en prod : `exercises` (bug "31 actions en échec", migration
 * 20260829130000) puis `shopping_list` (audit du 30/08, migration
 * 20260831090000). Ce script empêche une troisième fois.
 *
 * Deux sources de vérité, aucune liste maintenue à la main :
 *   - la liste des tables offline est DÉRIVÉE DU CODE (les appels réels à
 *     `createOfflineRepository` dans `src/`) ;
 *   - le schéma est lu dans `src/integrations/supabase/types.ts`, artefact
 *     GÉNÉRÉ depuis la base et dont la conformité à la base est déjà
 *     garantie en CI (`supabase-types.yml`, étape finale de `migrate.yml`,
 *     cf. docs/architecture/supabase-types-source-of-truth.md).
 *
 * Complémentaire (pas redondant) avec le garde-fou de TYPE
 * `OfflineCompatibleTableName` de repository.ts : celui-ci casse `tsc` (donc
 * `typecheck.yml`) dès qu'une table incompatible est branchée, mais avec un
 * message TypeScript générique. Ce script, lui, nomme la table ET la colonne
 * manquante, et reste lisible dans un log CI.
 *
 * Usage :
 *   node scripts/check-offline-repository-contract.mjs
 *
 * Exit codes :
 *   0 — toutes les tables offline respectent le contrat
 *   1 — au moins une table ne le respecte pas
 *   2 — le contrôle lui-même n'a pas pu s'exécuter (scan vide, types.ts illisible)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC_DIR = join(ROOT, "src");
const TYPES_FILE = join(ROOT, "src/integrations/supabase/types.ts");

/** Colonnes exigées par le contrat générique — cf. `OFFLINE_CONTRACT_COLUMNS` (repository.ts). */
export const OFFLINE_CONTRACT_COLUMNS = ["id", "user_id", "created_at", "updated_at"];

/**
 * Extrait les tables passées à `createOfflineRepository(...)`. Gère la forme
 * générique (`createOfflineRepository<Row>("t")`), l'appel sur plusieurs
 * lignes, et le second argument optionnel (table Supabase réelle) — c'est ce
 * dernier qui compte pour le schéma quand il est présent.
 *
 * @param {{ path: string, content: string }[]} files
 * @returns {{ table: string, source: string }[]}
 */
/**
 * Constantes `const NOM = "littéral"` déclarées dans le même fichier —
 * `createOfflineRepository(TABLE)` est un style parfaitement légitime
 * (utilisé par `syncQueueResilience.test.ts`), le contrôle doit le résoudre
 * plutôt qu'imposer le littéral en ligne.
 */
function collectStringConstants(content) {
  const constants = new Map();
  for (const match of content.matchAll(/\bconst\s+(\w+)\s*(?::[^=]+)?=\s*["'`]([^"'`]+)["'`]/g)) {
    constants.set(match[1], match[2]);
  }
  return constants;
}

export function extractOfflineRepositoryTables(files) {
  const usages = [];
  const unresolved = [];
  // `function` capturé pour écarter la DÉCLARATION de la fonction elle-même
  // (repository.ts) ; le générique optionnel `<Row>` est autorisé entre le
  // nom et la parenthèse, mais rien d'autre — sinon une simple mention de
  // `createOfflineRepository` dans un commentaire suivi d'une parenthèse
  // plus loin dans le texte serait prise pour un appel.
  const callPattern = /(\bfunction\s+)?createOfflineRepository\s*(?:<[^<>()]*>)?\s*\(([^)]*)\)/g;
  const stringPattern = /["'`]([^"'`]+)["'`]/g;

  const identifierPattern = /^\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?$/;

  for (const file of files) {
    const constants = collectStringConstants(file.content);
    for (const call of file.content.matchAll(callPattern)) {
      if (call[1]) continue; // déclaration, pas un appel
      let literals = [...call[2].matchAll(stringPattern)].map((m) => m[1]);

      // Argument(s) passé(s) par constante locale : on les résout.
      if (literals.length === 0) {
        const byIdentifier = identifierPattern.exec(call[2]);
        if (byIdentifier) {
          const resolved = [byIdentifier[1], byIdentifier[2]]
            .filter(Boolean)
            .map((name) => constants.get(name));
          if (resolved.length > 0 && resolved.every(Boolean)) literals = resolved;
        }
      }

      if (literals.length === 0) {
        // Nom de table calculé : ce contrôle ne peut rien en dire, et le
        // laisser passer silencieusement rouvrirait exactement le trou qu'il
        // est censé fermer.
        unresolved.push({ source: file.path, args: call[2].trim() });
        continue;
      }
      // Second argument (table Supabase réelle) prioritaire sur le premier
      // (nom logique local), exactement comme `getSupabaseTableName()`.
      usages.push({ table: literals[literals.length - 1], source: file.path });
    }
  }
  return { usages, unresolved };
}

/**
 * Colonnes de chaque table `public` d'après `types.ts` (bloc `Row`, qui
 * reflète les colonnes réelles de la base). On ne lit QUE la section
 * `Tables` : les vues (`Views`) ne sont pas des tables écrivables.
 *
 * @param {string} typesSource contenu de types.ts
 * @returns {Record<string, string[]>}
 */
export function parseSupabaseTableColumns(typesSource) {
  const tablesStart = typesSource.indexOf("\n    Tables: {");
  if (tablesStart === -1) throw new Error("Section `Tables:` introuvable dans types.ts");
  const viewsStart = typesSource.indexOf("\n    Views: {", tablesStart);
  const section = typesSource.slice(tablesStart, viewsStart === -1 ? undefined : viewsStart);

  /** @type {Record<string, string[]>} */
  const schema = {};
  let currentTable = null;
  let inRow = false;

  for (const line of section.split("\n")) {
    const tableMatch = /^ {6}(\w+): \{$/.exec(line);
    if (tableMatch) {
      currentTable = tableMatch[1];
      schema[currentTable] = [];
      inRow = false;
      continue;
    }
    if (!currentTable) continue;
    if (/^ {8}Row: \{$/.test(line)) {
      inRow = true;
      continue;
    }
    if (inRow) {
      if (/^ {8}\}$/.test(line)) {
        inRow = false;
        continue;
      }
      const columnMatch = /^ {10}(\w+)\??:/.exec(line);
      if (columnMatch) schema[currentTable].push(columnMatch[1]);
    }
  }
  return schema;
}

/**
 * @param {{ usages: { table: string, source: string }[], schema: Record<string, string[]> }} input
 * @returns {{ table: string, missing: string[], sources: string[], unknownTable: boolean }[]}
 */
export function checkOfflineRepositoryContract({ usages, schema }) {
  /** @type {Map<string, Set<string>>} */
  const byTable = new Map();
  for (const usage of usages) {
    if (!byTable.has(usage.table)) byTable.set(usage.table, new Set());
    byTable.get(usage.table).add(usage.source);
  }

  const violations = [];
  for (const [table, sources] of [...byTable].sort(([a], [b]) => a.localeCompare(b))) {
    const columns = schema[table];
    if (!columns) {
      violations.push({
        table,
        missing: [...OFFLINE_CONTRACT_COLUMNS],
        sources: [...sources].sort(),
        unknownTable: true,
      });
      continue;
    }
    const missing = OFFLINE_CONTRACT_COLUMNS.filter((column) => !columns.includes(column));
    if (missing.length > 0) {
      violations.push({ table, missing, sources: [...sources].sort(), unknownTable: false });
    }
  }
  return violations;
}

/**
 * Message d'échec explicite : quelle table, quelle colonne, quel fichier, et
 * quoi faire — un log CI doit suffire à corriger sans relire le script.
 *
 * @param {ReturnType<typeof checkOfflineRepositoryContract>} violations
 */
export function formatContractViolations(violations) {
  const lines = [
    `❌ ${violations.length} table(s) branchée(s) sur createOfflineRepository ne respectent pas le contrat offline.`,
    "",
  ];
  for (const violation of violations) {
    lines.push(`   • ${violation.table}`);
    lines.push(
      violation.unknownTable
        ? "     table absente de src/integrations/supabase/types.ts (n'existe pas en base ?)"
        : `     colonne(s) manquante(s) : ${violation.missing.join(", ")}`,
    );
    lines.push(`     utilisée par : ${violation.sources.join(", ")}`);
  }
  lines.push(
    "",
    "   Le repository générique ajoute id/user_id/created_at/updated_at à CHAQUE",
    "   payload créé : sans ces colonnes, tous les `create` de cette table échouent",
    "   en 400 PGRST204 et sont retentés en boucle par la sync queue.",
    "",
    "   → Corriger par une MIGRATION additive (jamais en éditant types.ts à la main),",
    "     puis régénérer les types : npm run gen:types",
  );
  return lines.join("\n");
}

/** Liste récursive des fichiers TypeScript de `src/`. */
function listSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      files.push({ path: relative(ROOT, full), content: readFileSync(full, "utf8") });
    }
  }
  return files;
}

function main() {
  const files = listSourceFiles(SRC_DIR);
  const { usages, unresolved } = extractOfflineRepositoryTables(files);

  if (unresolved.length > 0) {
    console.error(
      "❌ Appel(s) à createOfflineRepository dont le nom de table n'est pas un littéral — contrat invérifiable :",
    );
    for (const item of unresolved) console.error(`   • ${item.source} : (${item.args})`);
    process.exit(2);
  }

  if (usages.length === 0) {
    console.error(
      "❌ Aucun appel à createOfflineRepository trouvé dans src/ — le contrôle est cassé (refactor ?), il ne peut pas garantir le contrat.",
    );
    process.exit(2);
  }

  let schema;
  try {
    schema = parseSupabaseTableColumns(readFileSync(TYPES_FILE, "utf8"));
  } catch (err) {
    console.error(`❌ Lecture de ${relative(ROOT, TYPES_FILE)} impossible : ${err.message}`);
    process.exit(2);
  }

  const violations = checkOfflineRepositoryContract({ usages, schema });
  if (violations.length > 0) {
    console.error(formatContractViolations(violations));
    process.exit(1);
  }

  const tables = [...new Set(usages.map((u) => u.table))].sort();
  console.log(
    `✅ Contrat offline respecté par les ${tables.length} tables branchées sur createOfflineRepository :`,
  );
  console.log(tables.map((t) => `   - ${t}`).join("\n"));
}

// N'exécute `main()` que lancé directement — jamais lors d'un `import`
// depuis les tests (scripts/check-offline-repository-contract.test.mjs).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
