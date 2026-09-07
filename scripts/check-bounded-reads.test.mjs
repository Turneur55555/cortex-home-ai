import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aggregateUnbounded,
  blankCommentsAndStrings,
  chainAfter,
  compareWithBaseline,
  enclosingCallees,
  extractReads,
  listSourceFiles,
} from "./check-bounded-reads.mjs";

/**
 * Tests du GARDE-FOU des lectures serveur bornées (chantier A).
 *
 * Un garde-fou n'a de valeur que si on démontre les DEUX moitiés de son
 * contrat : qu'il échoue sur une vraie régression, ET qu'il n'échoue pas sur
 * les requêtes légitimes. Un contrôle trop strict est désactivé au premier
 * faux positif ; un contrôle trop laxiste ne protège de rien.
 */

/** Fabrique un faux fichier source pour l'analyseur. */
const file = (content, path = "src/hooks/useFake.ts") => [{ path, content }];

/** `true` si l'unique lecture du source est classée bornée. */
function isBounded(content) {
  const reads = extractReads(file(content));
  expect(reads).toHaveLength(1);
  return reads[0].bounded;
}

describe("extractReads — ce qui compte comme lecture", () => {
  it("détecte une lecture PostgREST simple", () => {
    const reads = extractReads(file(`const r = await supabase.from("workouts").select("id");`));
    expect(reads).toHaveLength(1);
    expect(reads[0].table).toBe("workouts");
    expect(reads[0].chain).toEqual(["select"]);
  });

  it("ignore Array.from(...) — aucun select dans la chaîne", () => {
    expect(extractReads(file(`const a = Array.from(new Set(x)).map((v) => v);`))).toHaveLength(0);
  });

  it("ignore les écritures, même suivies d'un select() de retour", () => {
    const write = `await supabase.from("workouts").insert({ name: "x" }).select();`;
    expect(extractReads(file(write))).toHaveLength(0);
  });

  it("voit à travers un cast local `(supabase as any)`", () => {
    const reads = extractReads(file(`await (supabase as any).from("exercise_media").select("*");`));
    expect(reads).toHaveLength(1);
    expect(reads[0].table).toBe("exercise_media");
  });

  it("voit à travers l'enveloppe locale `pagedFrom(...)`", () => {
    const reads = extractReads(file(`await pagedFrom(table).select("*").eq("user_id", u);`));
    expect(reads).toHaveLength(1);
  });

  it("conserve un nom de table calculé au lieu de l'ignorer", () => {
    // Une lecture dont la table est dynamique reste une lecture : la passer
    // sous silence rouvrirait exactement le trou que ce contrôle ferme.
    const reads = extractReads(file(`await supabase.from(supabaseTable).select("*").eq("id", i);`));
    expect(reads).toHaveLength(1);
    expect(reads[0].table).toBe("supabaseTable");
    expect(reads[0].bounded).toBe(false);
  });

  it("n'est pas trompé par du code cité dans un commentaire", () => {
    const source = `
      // Avant : await supabase.from("workouts").select("*");
      /* et aussi supabase.from("nutrition").select("*") */
      const label = 'supabase.from("recipes").select("*")';
    `;
    expect(extractReads(file(source))).toHaveLength(0);
  });
});

describe("classification — les lectures NON bornées échouent", () => {
  it("refuse un select sans aucune borne", () => {
    expect(isBounded(`await supabase.from("workouts").select("id, date");`)).toBe(false);
  });

  it("refuse un select filtré mais non borné (un filtre n'est pas une borne)", () => {
    // `.eq(...)` restreint le jeu, il ne plafonne pas sa cardinalité :
    // 1 477 lignes muscu passaient déjà ce filtre-là.
    expect(
      isBounded(
        `await supabase.from("exercise_reference").select("*").eq("discipline_id", "muscu");`,
      ),
    ).toBe(false);
  });

  it("refuse un `.in(...)` non borné", () => {
    expect(
      isBounded(`await supabase.from("exercise_sets").select("*").in("exercise_id", ids);`),
    ).toBe(false);
  });

  it("refuse un `order(...)` seul — trier n'est pas borner", () => {
    expect(isBounded(`await supabase.from("recipes").select("*").order("name");`)).toBe(false);
  });

  it('refuse un `count: "exact"` sans pagination', () => {
    // Demander le total ne borne rien : la réponse reste rabotée à max-rows.
    expect(
      isBounded(`await supabase.from("workouts").select("*", { count: "exact" }).eq("u", u);`),
    ).toBe(false);
  });
});

describe("classification — les lectures légitimes sont acceptées", () => {
  it("accepte maybeSingle()", () => {
    expect(
      isBounded(`await supabase.from("user_stats").select("*").eq("id", i).maybeSingle();`),
    ).toBe(true);
  });

  it("accepte single()", () => {
    expect(isBounded(`await supabase.from("recipes").select("*").eq("id", i).single();`)).toBe(
      true,
    );
  });

  it("accepte limit(n)", () => {
    expect(isBounded(`await supabase.from("workouts").select("*").order("date").limit(200);`)).toBe(
      true,
    );
  });

  it("accepte range(a, b)", () => {
    expect(isBounded(`await supabase.from("workouts").select("*").range(0, 499);`)).toBe(true);
  });

  it("accepte un comptage seul (head: true) — aucune ligne renvoyée", () => {
    expect(
      isBounded(
        `await supabase.from("workouts").select("id", { count: "exact", head: true }).eq("d", d);`,
      ),
    ).toBe(true);
  });

  it("accepte une lecture enveloppée par fetchAllRows(...)", () => {
    const source = `
      const rows = await fetchAllRows(
        () => supabase.from("exercise_reference").select("id", { count: "exact" }).order("id"),
        { label: "exercise_reference" },
      );`;
    expect(isBounded(source)).toBe(true);
  });

  it("accepte fetchAllRows AVEC argument de type générique", () => {
    // Régression réelle rencontrée en écrivant ce contrôle : le générique
    // masquait le nom du helper, et TOUTES ses lectures étaient signalées.
    const source = `
      const rows = await fetchAllRows<CatalogSelectRow>(
        () => supabase.from("exercise_reference").select(COLS, { count: "exact" }).order("id"),
      );`;
    expect(isBounded(source)).toBe(true);
  });

  it("accepte fetchAllRowsForIds avec un générique inline complexe", () => {
    const source = `
      const sets = await fetchAllRowsForIds<{ exercise_id: string; reps: number | null }>(
        exIds,
        (idChunk) =>
          supabase.from("exercise_sets").select("*", { count: "exact" }).in("exercise_id", idChunk),
      );`;
    expect(isBounded(source)).toBe(true);
  });

  it("n'accepte PAS une fonction quelconque qui n'est pas un helper de pagination", () => {
    const source = `
      const rows = await Promise.all([
        supabase.from("workouts").select("id"),
      ]);`;
    expect(isBounded(source)).toBe(false);
  });
});

describe("helpers d'analyse", () => {
  it("blankCommentsAndStrings préserve la longueur et les lignes", () => {
    const source = `const a = "x";\n// c\nconst b = 1;`;
    const blanked = blankCommentsAndStrings(source);
    expect(blanked).toHaveLength(source.length);
    expect(blanked.split("\n")).toHaveLength(source.split("\n").length);
    expect(blanked).toContain("const b = 1;");
  });

  it("chainAfter s'arrête à la fin de l'expression", () => {
    const source = `x.select("a").eq("b", c); y.limit(3);`;
    expect(chainAfter(source, 1).map((m) => m.name)).toEqual(["select", "eq"]);
  });

  it("chainAfter ne déborde pas sur l'élément suivant d'un tableau", () => {
    const source = `[a.select("x").eq("y", z), b.limit(2)]`;
    expect(chainAfter(source, 2).map((m) => m.name)).toEqual(["select", "eq"]);
  });

  it("enclosingCallees remonte les appels englobants", () => {
    const source = `outer(inner(() => supabase.from("t")))`;
    const index = source.indexOf(".from(");
    expect(enclosingCallees(source, index)).toContain("inner");
    expect(enclosingCallees(source, index)).toContain("outer");
  });
});

describe("baseline — cliquet dans les deux sens", () => {
  it("signale une lecture non bornée NOUVELLE", () => {
    const counts = aggregateUnbounded([{ file: "src/a.ts", table: "t", bounded: false }]);
    const { added, stale } = compareWithBaseline(counts, {});
    expect(added).toEqual([{ key: "src/a.ts::t", count: 1, allowed: 0 }]);
    expect(stale).toEqual([]);
  });

  it("signale une lecture SUPPLÉMENTAIRE au même endroit", () => {
    const counts = aggregateUnbounded([
      { file: "src/a.ts", table: "t", bounded: false },
      { file: "src/a.ts", table: "t", bounded: false },
    ]);
    const { added } = compareWithBaseline(counts, { "src/a.ts::t": 1 });
    expect(added).toEqual([{ key: "src/a.ts::t", count: 2, allowed: 1 }]);
  });

  it("tolère exactement ce que la baseline annonce", () => {
    const counts = aggregateUnbounded([{ file: "src/a.ts", table: "t", bounded: false }]);
    expect(compareWithBaseline(counts, { "src/a.ts::t": 1 })).toEqual({ added: [], stale: [] });
  });

  it("signale une entrée PÉRIMÉE quand la lecture a été bornée", () => {
    const counts = aggregateUnbounded([{ file: "src/a.ts", table: "t", bounded: true }]);
    const { added, stale } = compareWithBaseline(counts, { "src/a.ts::t": 1 });
    expect(added).toEqual([]);
    expect(stale).toEqual([{ key: "src/a.ts::t", actual: 0, allowed: 1 }]);
  });

  it("ne compte jamais une lecture bornée", () => {
    expect(aggregateUnbounded([{ file: "src/a.ts", table: "t", bounded: true }]).size).toBe(0);
  });
});

describe("état réel du dépôt", () => {
  const reads = extractReads(listSourceFiles());
  const baseline = JSON.parse(
    readFileSync(join(import.meta.dirname, "bounded-reads-baseline.json"), "utf8"),
  ).allowed;

  it("l'analyseur voit toujours le code (auto-cohérence)", () => {
    // Si ce plancher tombe, c'est l'analyseur qui est cassé, pas le dépôt
    // qui s'est vidé : un garde-fou aveugle doit crier, pas réussir.
    expect(reads.length).toBeGreaterThanOrEqual(60);
  });

  it("le dépôt est conforme à sa baseline", () => {
    expect(compareWithBaseline(aggregateUnbounded(reads), baseline)).toEqual({
      added: [],
      stale: [],
    });
  });

  it("les quatre hooks du chantier A n'ont plus AUCUNE lecture non bornée", () => {
    const inScope = reads.filter(
      (r) =>
        !r.bounded &&
        /useExerciseCatalog\.ts|useExerciseCatalogEntry\.ts|useExerciseSetHistory\.ts|useSegmentHistory\.ts/.test(
          r.file,
        ),
    );
    expect(inScope).toEqual([]);
  });

  it("la baseline ne couvre aucun fichier du chantier A", () => {
    const covered = Object.keys(baseline).filter((k) =>
      /useExerciseCatalog\.ts|useExerciseCatalogEntry\.ts|useExerciseSetHistory\.ts|useSegmentHistory\.ts/.test(
        k,
      ),
    );
    expect(covered).toEqual([]);
  });
});
