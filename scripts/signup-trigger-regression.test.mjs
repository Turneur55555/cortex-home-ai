// Test de non-régression (Phase 9C, §59 du brief) — le bug historique
// signup cassé : `on_auth_user_created_home_categories` (trigger sur
// `auth.users`) appelait `seed_default_home_categories()` qui écrivait
// dans `public.home_categories`, une table supprimée dans une migration
// antérieure qui avait oublié de supprimer aussi le trigger/les fonctions
// — cassant TOUT nouveau signup avec `relation "public.home_categories"
// does not exist`. Corrigé par
// `20260810090000_fix_signup_broken_home_categories_trigger.sql`
// (DROP TRIGGER + DROP FUNCTION ... CASCADE).
//
// Ce test ne recrée AUCUNE infrastructure lourde (pas de pgTAP, pas
// d'instance Supabase locale, §59 du brief) — analyse statique des
// migrations, même esprit que `scripts/validate-supabase.mjs`. Il échoue
// si une migration POSTÉRIEURE à la correction recrée le trigger/les
// fonctions sans les supprimer à nouveau — un signal fort qu'une
// régression a été réintroduite.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIG_DIR = join(process.cwd(), "supabase/migrations");
const FIX_VERSION = "20260810090000";

const TRIGGER_NAME = "on_auth_user_created_home_categories";
const SEED_FUNCTIONS = ["seed_default_home_categories", "_seed_home_categories_for_user"];

function migrations() {
  return readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      version: name.match(/^(\d+)/)?.[1] ?? "",
      sql: readFileSync(join(MIG_DIR, name), "utf8"),
    }));
}

describe("Non-régression signup — trigger home_categories (Phase 9C §59)", () => {
  it("la migration de correction existe bien et supprime le trigger + les fonctions", () => {
    const fixMigration = migrations().find((m) => m.version === FIX_VERSION);
    expect(fixMigration, `Migration ${FIX_VERSION} introuvable`).toBeDefined();
    expect(fixMigration.sql).toMatch(new RegExp(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME}`, "i"));
    for (const fn of SEED_FUNCTIONS) {
      expect(fixMigration.sql).toMatch(new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}`, "i"));
    }
  });

  it("aucune migration postérieure à la correction ne recrée le trigger sans le supprimer à nouveau", () => {
    const after = migrations().filter((m) => m.version > FIX_VERSION);
    for (const m of after) {
      const createsTrigger = new RegExp(`CREATE TRIGGER\\s+${TRIGGER_NAME}\\b`, "i").test(m.sql);
      if (!createsTrigger) continue;
      const alsoDrops = new RegExp(`DROP TRIGGER IF EXISTS ${TRIGGER_NAME}`, "i").test(m.sql);
      expect(
        alsoDrops,
        `${m.name} recrée ${TRIGGER_NAME} sans DROP TRIGGER IF EXISTS immédiat — régression probable du bug signup historique`,
      ).toBe(true);
    }
  });

  it("aucune migration postérieure ne recrée les fonctions seed sans référence à une table existante", () => {
    const after = migrations().filter((m) => m.version > FIX_VERSION);
    for (const fn of SEED_FUNCTIONS) {
      for (const m of after) {
        const createsFn = new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${fn}\\b`, "i").test(
          m.sql,
        );
        if (!createsFn) continue;
        // Si la fonction est recréée, elle ne doit plus référencer
        // `public.home_categories` (table supprimée) — sinon même bug.
        expect(
          m.sql.includes("public.home_categories"),
          `${m.name} recrée ${fn} en référençant encore public.home_categories (table supprimée) — régression probable`,
        ).toBe(false);
      }
    }
  });
});
