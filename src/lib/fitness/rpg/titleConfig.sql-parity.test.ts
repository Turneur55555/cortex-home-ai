// ============================================================
// Garde-fou anti-divergence SQL ↔ client (même pattern que
// characterLevel.sql-parity.test.ts — voir ce fichier pour l'historique
// des divergences non-attrapées qui ont motivé ce type de test).
//
// `public.compute_tier_index_from_xp` (migration
// 20260725130000_rpg_promotion_history.sql) est une copie SQL en LECTURE
// SEULE de `tierForXp`/`XP_THRESHOLDS` (titleConfig.ts / titleProgress.ts),
// utilisée UNIQUEMENT pour dater automatiquement les promotions déjà
// survenues (`rank_promotions`) — jamais pour l'affichage (titleProgress.ts
// reste l'unique moteur consommé par l'UI). Ce test lit la DERNIÈRE
// définition SQL appliquée dans `supabase/migrations/` et vérifie qu'elle
// encode exactement la même table de seuils que XP_THRESHOLDS, pour que
// toute future rééquilibrage des seuils côté TS sans mise à jour de la
// copie SQL fasse échouer la CI plutôt que de dater silencieusement les
// promotions au mauvais palier.
// ============================================================
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { XP_THRESHOLDS, TOTAL_TIERS } from "./titleConfig";

const MIGRATIONS_DIR = resolve(__dirname, "../../../../supabase/migrations");

function findLastComputeTierDefinition(): { file: string; body: string } | null {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let last: { file: string; body: string } | null = null;
  const re =
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.compute_tier_index_from_xp[\s\S]*?\$(?:function\$|\$)([\s\S]*?)\$(?:function\$|\$)/gi;

  for (const file of files) {
    const content = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      last = { file, body: match[1] };
    }
  }
  return last;
}

/** Extrait les nombres du littéral `ARRAY[...]` du corps SQL. */
function extractThresholdArray(body: string): number[] {
  const match = body.match(/ARRAY\[([\s\S]*?)\]/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number);
}

describe("compute_tier_index_from_xp — parité SQL ↔ client (anti-régression)", () => {
  it("une définition de compute_tier_index_from_xp existe dans les migrations", () => {
    const found = findLastComputeTierDefinition();
    expect(found).not.toBeNull();
  });

  it("la table de seuils SQL correspond exactement à XP_THRESHOLDS", () => {
    const found = findLastComputeTierDefinition();
    expect(found).not.toBeNull();
    const sqlThresholds = extractThresholdArray(found!.body);
    expect(sqlThresholds).toEqual([...XP_THRESHOLDS]);
    expect(sqlThresholds).toHaveLength(TOTAL_TIERS);
  });
});
