import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ============================================================
// Garde-fou — un seul chemin de capture d'image (invariant 5, docs/INVARIANTS.md).
//
// Avant G28, la fin de séance et l'affiche de rang portaient chacune leur propre copie de la
// capture → partage → téléchargement, avec deux comportements qui divergeaient en silence
// (l'une taisait ses échecs, l'autre révoquait l'URL de téléchargement trop tôt). Une carte de
// plus aurait fait une troisième copie. Toute image exportée passe désormais par
// `lib/share/shareImage.ts` ; ce test échoue si un autre fichier importe `html-to-image`.
// ============================================================

const SRC = resolve(process.cwd(), "src");
const ALLOWED = [
  resolve(SRC, "lib/share/shareImage.ts"),
  // Les tests qui simulent la bibliothèque la nomment : ils ne la capturent pas.
  resolve(SRC, "lib/share/shareImage.test.ts"),
  resolve(SRC, "lib/share/singleCapturePath.test.ts"),
];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("Un seul chemin de capture d'image (invariant 5)", () => {
  const files = listSourceFiles(SRC);

  it("le scan couvre bien l'arborescence source", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("seul lib/share/shareImage.ts importe html-to-image", () => {
    const offenders = files
      .filter((file) => !ALLOWED.includes(file))
      .filter((file) =>
        /from\s+["']html-to-image["']|import\(["']html-to-image["']\)/.test(
          readFileSync(file, "utf-8"),
        ),
      )
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });

  it("le chemin autorisé existe bel et bien (sinon le test passerait à vide)", () => {
    expect(readFileSync(ALLOWED[0], "utf-8")).toMatch(/from\s+["']html-to-image["']/);
  });

  it("aucun fichier ne réécrit la capture à la main (toPng)", () => {
    const offenders = files
      .filter((file) => !ALLOWED.includes(file))
      .filter((file) => /\btoPng\s*\(/.test(readFileSync(file, "utf-8")))
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });
});
