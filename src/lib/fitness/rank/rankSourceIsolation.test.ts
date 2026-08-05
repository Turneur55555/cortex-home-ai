import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Garde-fou anti-régression — Musculation hybride (2026-08-19) : les blocs
// métriques (course/HYROX/cardio) ajoutés à une séance muscu vivent dans
// `workout_segments`, JAMAIS dans `exercises`/`exercise_sets`. Le moteur de
// Rang/Maîtrise ne doit donc jamais lire `workout_segments` — s'il
// commençait à le faire, une séance hybride pourrait faire progresser le
// Rang avec des blocs course/HYROX comme s'ils étaient des séries de force,
// ce que les règles du projet interdisent explicitement. Ce test verrouille
// la frontière au niveau du code source (aucun de ces fichiers ne doit
// jamais mentionner "workout_segments"), plutôt que de dépendre d'un
// scénario d'intégration complet.
const RANK_ENGINE_SOURCES = [
  "src/lib/fitness/rank/engine.ts",
  "src/lib/fitness/rank/config.ts",
  "src/utils/fitness/exercise-stats.ts",
];

describe("Isolation moteur Rang — jamais de lecture de workout_segments", () => {
  it.each(RANK_ENGINE_SOURCES)("%s ne référence jamais workout_segments", (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), relativePath), "utf-8");
    expect(source).not.toMatch(/workout_segments/);
  });
});
