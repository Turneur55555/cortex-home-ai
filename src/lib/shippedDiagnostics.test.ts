import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ============================================================
// Garde-fou — aucun échafaudage de diagnostic dans le code livré
// (invariant 5, docs/INVARIANTS.md).
//
// Le 31/07/2026, un diagnostic de l'illustration de rang sur iOS Safari a été
// mené directement sur `main` : mode DEBUG, puis « test temporaire » qui
// remplaçait `RankIllustration` par deux <img> bruts sur fond vert dont un
// chargé depuis un domaine tiers (placehold.co). L'enquête n'a jamais été
// refermée : pendant plus de deux mois, l'affiche de rang partagée par les
// utilisateurs affichait ce montage — panneau de mesures compris — et
// émettait une requête vers ce domaine. Rien ne l'a signalé : ni la CI, ni
// aucun test.
//
// Ce test ne devine pas l'intention : il cherche les marqueurs que ces
// montages portent par construction. Un diagnostic légitime se mène sur une
// branche ou derrière une variable d'environnement, jamais en dur dans `src/`.
// ============================================================

const SRC = resolve(process.cwd(), "src");

/** Ce fichier décrit les marqueurs qu'il cherche : il se retire du scan. */
const SELF = resolve(__dirname, "shippedDiagnostics.test.ts");

const SCANNED_EXTENSIONS = [".ts", ".tsx"];

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  {
    label: "un mode DEBUG activé en dur (DEBUG_MODE = true)",
    pattern: /\bDEBUG_MODE\s*=\s*true\b/,
  },
  { label: "un bandeau « MODE DEBUG TEMPORAIRE »", pattern: /MODE DEBUG TEMPORAIRE/ },
  { label: "un bloc « TEST TEMPORAIRE »", pattern: /TEST TEMPORAIRE/ },
  { label: "une image de contrôle externe (placehold.co)", pattern: /placehold\.co/ },
  { label: "un fond « lime » de repérage", pattern: /background:\s*["']lime["']/ },
];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue;
    if (full === SELF) continue;
    out.push(full);
  }
  return out;
}

describe("Aucun échafaudage de diagnostic livré (invariant 5)", () => {
  const files = listSourceFiles(SRC);

  it("le scan couvre bien l'arborescence source", () => {
    // Si ce chiffre s'effondre (mauvais chemin, extension oubliée), les tests
    // ci-dessous passeraient À VIDE sans rien vérifier.
    expect(files.length).toBeGreaterThan(200);
  });

  it.each(FORBIDDEN)("aucun fichier de src/ ne contient : $label", ({ pattern }) => {
    const offenders = files
      .filter((file) => pattern.test(readFileSync(file, "utf-8")))
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });

  it.each([
    "const DEBUG_MODE = true;",
    "export const DEBUG_MODE=true",
    "// MODE DEBUG TEMPORAIRE — diagnostic",
    "{/* TEST TEMPORAIRE — RankIllustration écarté */}",
    'src="https://placehold.co/600x800/png"',
    'background: "lime",',
  ])("les marqueurs sont bien reconnus : %s", (text) => {
    expect(FORBIDDEN.some(({ pattern }) => pattern.test(text))).toBe(true);
  });

  it.each([
    "const DEBUG_MODE = false;",
    "const isDebug = import.meta.env.DEV;",
    'background: "limegreen"',
  ])("un code ordinaire n'est pas pris pour un échafaudage : %s", (text) => {
    expect(FORBIDDEN.some(({ pattern }) => pattern.test(text))).toBe(false);
  });
});
