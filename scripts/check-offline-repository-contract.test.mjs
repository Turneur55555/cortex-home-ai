import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  OFFLINE_CONTRACT_COLUMNS,
  checkOfflineRepositoryContract,
  extractOfflineRepositoryTables,
  formatContractViolations,
  parseSupabaseTableColumns,
} from "./check-offline-repository-contract.mjs";

/**
 * Couvre le garde-fou de non-régression du contrat offline (audit du
 * 30/08) : plus aucune table ne doit pouvoir être branchée sur
 * `createOfflineRepository` sans les colonnes id/user_id/created_at/
 * updated_at — le trou exact par lequel `exercises` puis `shopping_list`
 * sont passées en prod.
 */

const ROOT = resolve(import.meta.dirname, "..");

function validSchema(extra = {}) {
  return {
    shopping_list: [
      "added_at",
      "category",
      "created_at",
      "done",
      "id",
      "name",
      "updated_at",
      "user_id",
    ],
    ...extra,
  };
}

describe("extraction des tables offline depuis le code", () => {
  it("relève les appels réels, y compris génériques, multi-lignes et à deux arguments", () => {
    const { usages, unresolved } = extractOfflineRepositoryTables([
      {
        path: "src/hooks/useShoppingList.ts",
        content: `const repo = createOfflineRepository<ShoppingListItem>("shopping_list");`,
      },
      {
        path: "src/hooks/useWorkoutTemplates.ts",
        content: `export const r = createOfflineRepository<Row>(\n  "workout_template_exercises",\n);`,
      },
      {
        // Second argument = table Supabase réelle : c'est elle qui porte le contrat.
        path: "src/hooks/useAlias.ts",
        content: `const r = createOfflineRepository<Row>("local_name", "recipes");`,
      },
    ]);

    expect(unresolved).toEqual([]);
    expect(usages.map((u) => u.table)).toEqual([
      "shopping_list",
      "workout_template_exercises",
      "recipes",
    ]);
  });

  it("ignore la déclaration de la fonction et ses mentions en commentaire", () => {
    const { usages, unresolved } = extractOfflineRepositoryTables([
      {
        path: "src/lib/offline/repository.ts",
        content: [
          "/**",
          " * `createOfflineRepository<T>` expose un CRUD (état local",
          " * `syncStatus: 'pending'`, reflété instantanément).",
          " */",
          "export function createOfflineRepository<T extends BaseRow>(",
          "  table: OfflineCompatibleTableName,",
          "  supabaseTableName: OfflineCompatibleTableName = table,",
          "): OfflineRepository<T> {}",
        ].join("\n"),
      },
    ]);

    expect(usages).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it("signale un appel dont le nom de table n'est pas un littéral (contrat invérifiable)", () => {
    const { usages, unresolved } = extractOfflineRepositoryTables([
      { path: "src/hooks/useDynamic.ts", content: `const r = createOfflineRepository(tableName);` },
    ]);

    expect(usages).toEqual([]);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].source).toBe("src/hooks/useDynamic.ts");
  });
});

describe("lecture du schéma depuis types.ts (artefact généré = source de vérité)", () => {
  it("extrait les colonnes du bloc Row de chaque table, sans confondre avec les vues", () => {
    const schema = parseSupabaseTableColumns(
      [
        "  public: {",
        "    Tables: {",
        "      shopping_list: {",
        "        Row: {",
        "          created_at: string",
        "          id: string",
        "          updated_at: string",
        "          user_id: string",
        "        }",
        "        Insert: {",
        "          created_at?: string",
        "        }",
        "        Relationships: []",
        "      }",
        "    }",
        "    Views: {",
        "      une_vue: {",
        "        Row: {",
        "          colonne_de_vue: string",
        "        }",
        "      }",
        "    }",
        "  }",
      ].join("\n"),
    );

    expect(schema.shopping_list).toEqual(["created_at", "id", "updated_at", "user_id"]);
    expect(schema.une_vue).toBeUndefined();
  });
});

// ─── TEST 6 : une table conforme passe ──────────────────────────────────

describe("vérification automatique du contrat des tables", () => {
  it("une table offline conforme ne produit aucune violation", () => {
    const violations = checkOfflineRepositoryContract({
      usages: [{ table: "shopping_list", source: "src/hooks/useShoppingList.ts" }],
      schema: validSchema(),
    });

    expect(violations).toEqual([]);
  });

  // ─── TEST 7 : une table sans colonne obligatoire échoue explicitement ──

  it("une table offline sans created_at fait échouer le contrôle, en nommant table, colonne et fichier", () => {
    const schema = validSchema();
    schema.shopping_list = schema.shopping_list.filter((c) => c !== "created_at");

    const violations = checkOfflineRepositoryContract({
      usages: [
        { table: "shopping_list", source: "src/hooks/useShoppingList.ts" },
        { table: "shopping_list", source: "src/hooks/useMealPlan.ts" },
      ],
      schema,
    });

    expect(violations).toEqual([
      {
        table: "shopping_list",
        missing: ["created_at"],
        sources: ["src/hooks/useMealPlan.ts", "src/hooks/useShoppingList.ts"],
        unknownTable: false,
      },
    ]);

    const report = formatContractViolations(violations);
    expect(report).toContain("shopping_list");
    expect(report).toContain("created_at");
    expect(report).toContain("src/hooks/useShoppingList.ts");
  });

  it("chaque colonne du contrat est bien exigée, une par une", () => {
    for (const column of OFFLINE_CONTRACT_COLUMNS) {
      const schema = validSchema();
      schema.shopping_list = schema.shopping_list.filter((c) => c !== column);
      const violations = checkOfflineRepositoryContract({
        usages: [{ table: "shopping_list", source: "src/hooks/useShoppingList.ts" }],
        schema,
      });
      expect(violations, `colonne ${column} non exigée`).toHaveLength(1);
      expect(violations[0].missing).toEqual([column]);
    }
  });

  it("une table absente de types.ts (donc de la base) échoue aussi, explicitement", () => {
    const violations = checkOfflineRepositoryContract({
      usages: [{ table: "table_fantome", source: "src/hooks/useFantome.ts" }],
      schema: validSchema(),
    });

    expect(violations).toHaveLength(1);
    expect(violations[0].unknownTable).toBe(true);
    expect(formatContractViolations(violations)).toContain("absente de");
  });
});

// ─── Le dépôt réel doit passer le contrôle ──────────────────────────────

function listSourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listSourceFiles(full));
    else if (/\.tsx?$/.test(entry))
      files.push({ path: relative(ROOT, full), content: readFileSync(full, "utf8") });
  }
  return files;
}

describe("le dépôt réel respecte le contrat", () => {
  it("toutes les tables branchées sur createOfflineRepository ont les 4 colonnes", () => {
    const { usages, unresolved } = extractOfflineRepositoryTables(
      listSourceFiles(join(ROOT, "src")),
    );
    const schema = parseSupabaseTableColumns(
      readFileSync(join(ROOT, "src/integrations/supabase/types.ts"), "utf8"),
    );

    expect(unresolved).toEqual([]);
    // Le scan doit trouver quelque chose : un scan vide passerait le
    // contrôle sans rien vérifier.
    expect(usages.length).toBeGreaterThan(10);
    expect(usages.map((u) => u.table)).toContain("shopping_list");

    const violations = checkOfflineRepositoryContract({ usages, schema });
    expect(violations.length === 0 ? "" : formatContractViolations(violations)).toBe("");
  });
});
