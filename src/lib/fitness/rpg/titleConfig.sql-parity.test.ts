// ============================================================
// Garde-fou anti-divergence SQL ↔ client (même pattern que
// characterLevel.sql-parity.test.ts — voir ce fichier pour l'historique
// des divergences non-attrapées qui ont motivé ce type de test).
//
// STATUT (mis à jour RPG V2 Phase F/G, 29/08/2026) : `public.compute_tier_
// index_from_xp` a été DÉFINITIVEMENT SUPPRIMÉE de la base live par la
// migration 20260829120000_drop_xp_driven_title_path.sql — le Titre n'est
// plus jamais dérivé de l'XP (voir cortexPower.ts / titleProgress.ts pour
// le moteur actuel, basé sur la Puissance Cortex). Ce test ne vérifie donc
// plus une fonction vivante : il lit le texte figé de l'ancienne migration
// 20260725130000_rpg_promotion_history.sql (qui définissait la fonction
// avant sa suppression) et s'assure que cette définition HISTORIQUE
// correspond toujours à XP_THRESHOLDS — un garde-fou anti-réécriture d'une
// migration déjà appliquée, pas une protection contre une divergence live.
// Les 29 lignes de `rank_promotions` qu'elle a datées restent correctes et
// gelées ; aucune nouvelle ligne n'est plus produite par ce chemin. Conservé
// tel quel (inoffensif, aucune valeur à le supprimer) plutôt que retiré.
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
