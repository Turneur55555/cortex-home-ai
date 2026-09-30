import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// ============================================================
// Garde-fou anti-réintroduction — invariant 3.4 (docs/INVARIANTS.md).
//
// Deux systèmes ont été retirés de CORTEX sur décision explicite de
// Nathan, et ne doivent jamais revenir :
//
//  - le RPE / RIR (ressenti d'effort), supprimé le 02/07/2026 — la
//    colonne `exercise_sets.rpe` a été droppée alors qu'elle ne portait
//    aucune valeur non nulle ;
//  - les Saisons (Points de Saison, paliers, track saisonnier),
//    abandonnées le 30/09/2026 — elles n'ont jamais tourné en
//    production, aucun PS n'a été versé.
//
// Sans ce test, la seule trace de ces décisions serait de la
// documentation : un futur chantier pourrait les réintroduire de bonne
// foi. Ici, toute réapparition dans `src/` fait échouer la suite.
//
// ⚠️ Volontairement lexical, et volontairement PRÉCIS : on cherche les
// identifiants propres à ces systèmes, jamais un mot isolé. « season »
// seul est un faux positif garanti — le Dressing gère de vraies saisons
// vestimentaires (`seasons: string[]` sur un vêtement), qui n'ont aucun
// rapport avec le RPG et doivent continuer d'exister.
// ============================================================

const SRC = resolve(process.cwd(), "src");

/** Ce fichier se décrit lui-même : il se retire du scan. */
const SELF = resolve(__dirname, "abandonedSystems.test.ts");

const SCANNED_EXTENSIONS = [".ts", ".tsx"];

interface ForbiddenPattern {
  /** Ce qui est interdit, en clair — sert de message d'échec. */
  label: string;
  pattern: RegExp;
}

/**
 * Borne de mot **consciente des accents**.
 *
 * ⚠️ PIÈGE : `\b` en JavaScript ne connaît que `[A-Za-z0-9_]`. Une lettre
 * accentuée compte donc comme un séparateur, et `/\brir\b/` matche la fin
 * de « gué**rir** », « conqué**rir** », « acqué**rir** » — des mots
 * parfaitement légitimes dans des commentaires français. Le garde-fou
 * aurait échoué au premier « guérir » écrit dans `src/`, et aurait fini
 * supprimé par le chantier suivant au lieu d'être corrigé.
 *
 * On encadre donc le terme par des lookarounds sur `\p{L}` (toute lettre
 * Unicode), ce qui laisse passer « guérir » et attrape bien « RIR 8 ».
 */
function standaloneTerm(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}_])${term}(?![\\p{L}\\p{N}_])`, "iu");
}

const FORBIDDEN: ForbiddenPattern[] = [
  // ── RPE / RIR ───────────────────────────────────────────────────
  // `exercise_sets.rpe` et un champ `rpe:` sont les formes réelles que
  // prendrait une réintroduction.
  { label: "RPE (ressenti d'effort)", pattern: standaloneTerm("rpe") },
  { label: "RIR (répétitions en réserve)", pattern: standaloneTerm("rir") },

  // ── Saisons RPG ─────────────────────────────────────────────────
  // Identifiants de base et de domaine, jamais le mot « season » seul
  // (cf. Dressing).
  { label: "table sp_events (Points de Saison)", pattern: /\bsp_events\b/ },
  { label: "table user_season_progress", pattern: /\buser_season_progress\b/ },
  { label: "fonction compute_season_tier", pattern: /\bcompute_season_tier\b/ },
  { label: "fonction award_season_points", pattern: /\baward_season_points\b/ },
  { label: "hook useActiveSeason", pattern: /\buseActiveSeason\b/ },
  { label: "composant SeasonTrackCard", pattern: /\bSeasonTrackCard\b/ },
  { label: "domaine seasonTierProgress", pattern: /\bseasonTierProgress\b/ },
  { label: "« Points de Saison »", pattern: /points de saison/i },
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

describe("Systèmes abandonnés — jamais réintroduits (invariant 3.4)", () => {
  const files = listSourceFiles(SRC);

  it("le scan couvre bien l'arborescence source", () => {
    // Si ce chiffre s'effondre (mauvais chemin, extension oubliée), les
    // tests ci-dessous passeraient À VIDE sans rien vérifier.
    expect(files.length).toBeGreaterThan(200);
  });

  it.each(FORBIDDEN)("aucun fichier de src/ ne réintroduit : $label", ({ pattern }) => {
    const offenders = files
      .filter((file) => pattern.test(readFileSync(file, "utf-8")))
      .map((file) => relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });

  // Verrouille la correction du piège `\b` (voir standaloneTerm) : sans
  // ces cas, une régression vers `/\brir\b/` repasserait inaperçue ici et
  // ne se manifesterait que par un échec incompréhensible, le jour où
  // quelqu'un écrirait « guérir » dans un commentaire.
  describe("les bornes de mot ne se déclenchent pas sur des mots français accentués", () => {
    const rir = FORBIDDEN.find((f) => f.label.startsWith("RIR"))!.pattern;

    it.each(["guérir", "conquérir", "acquérir", "s'enquérir", "courir"])(
      "« %s » n'est pas un RIR",
      (word) => {
        expect(rir.test(word)).toBe(false);
      },
    );

    it.each(["RIR 8", "cible rir", "rir=2"])("« %s » est bien détecté", (text) => {
      expect(rir.test(text)).toBe(true);
    });
  });
});
