// ============================================================
// Garde-fou anti-divergence SQL ↔ client.
//
// L'historique du projet a fait diverger `compute_level_from_xp` du serveur
// de la courbe client À TROIS REPRISES (migrations 20260529061501 → /50+1,
// 20260602083143 → /50+1, 20260704110408 → /100 SANS +1) sans qu'aucun test
// ne l'attrape, puisque le test d'équivalence existant ne comparait la
// courbe client qu'à une réplique JS locale de la formule — jamais au texte
// réel de la dernière migration SQL appliquée.
//
// Ce test lit la DERNIÈRE définition de `compute_level_from_xp` dans
// `supabase/migrations/` (triée par nom de fichier, donc par ordre
// chronologique d'application) et vérifie qu'elle correspond exactement à
// la formule canonique mirée par `characterLevel.ts`. Toute PR qui
// réintroduit une divergence (nouvelle migration avec une autre formule)
// fait échouer ce test.
// ============================================================
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { characterLevelForXp, XP_LEVEL_DIVISOR } from "./characterLevel";

const MIGRATIONS_DIR = resolve(__dirname, "../../../../supabase/migrations");

/** Formule canonique attendue, telle qu'écrite dans les migrations SQL. */
const CANONICAL_SQL_FORMULA = "GREATEST(1, FLOOR(SQRT(GREATEST(_xp,0)::numeric / 50.0))::int + 1)";

function findLastComputeLevelDefinition(): { file: string; body: string } | null {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // les noms de fichiers sont préfixés par un timestamp trié lexicographiquement

  let last: { file: string; body: string } | null = null;
  const re =
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.compute_level_from_xp[\s\S]*?\$(?:function\$|\$)([\s\S]*?)\$(?:function\$|\$)/gi;

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

describe("compute_level_from_xp — parité SQL ↔ client (anti-régression)", () => {
  it("une définition de compute_level_from_xp existe dans les migrations", () => {
    const found = findLastComputeLevelDefinition();
    expect(found).not.toBeNull();
  });

  it("la DERNIÈRE définition SQL appliquée est la formule canonique (sqrt(xp/50)+1)", () => {
    const found = findLastComputeLevelDefinition();
    expect(found).not.toBeNull();
    const normalized = found!.body.replace(/\s+/g, " ").trim();
    expect(normalized).toContain(CANONICAL_SQL_FORMULA);
  });

  it("le diviseur client correspond au diviseur canonique (50)", () => {
    expect(XP_LEVEL_DIVISOR).toBe(50);
  });

  it("la formule canonique, évaluée en JS, coïncide avec characterLevelForXp sur un large échantillon", () => {
    const canonicalJs = (xp: number) =>
      Math.max(1, Math.floor(Math.sqrt(Math.max(xp, 0) / 50)) + 1);
    for (let xp = 0; xp <= 20_000; xp += 37) {
      expect(characterLevelForXp(xp)).toBe(canonicalJs(xp));
    }
  });
});
