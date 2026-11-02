import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GARDE-FOU (INVARIANTS §1.10) — le parcours de séance n'est JAMAIS chargé en différé.
 *
 * Le chargement différé (`components/shared/lazyWithPreload.ts`) allège la page Séances, mais un
 * morceau différé jamais encore chargé est INTROUVABLE si le réseau tombe (la salle). Démarrer,
 * saisir, se reposer, terminer et voir sa récompense doivent donc rester dans le paquet initial.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf-8");

const SESSION_PATH_FILES = [
  "src/components/fitness/ActiveWorkoutView.tsx",
  "src/components/fitness/session/ActiveGenericSessionView.tsx",
  "src/components/fitness/session/SessionClosureSheet.tsx",
  "src/components/fitness/exerciseCard/ActiveExerciseCard.tsx",
  "src/components/fitness/RestTimerInline.tsx",
  "src/components/fitness/session/SessionRewardScreen.tsx",
  "src/components/fitness/session/SessionRecapScreen.tsx",
  "src/components/fitness/StartWorkoutSheet.tsx",
];

/** Composants du parcours que SeancesTab doit importer statiquement. */
const SEANCES_TAB_EAGER = [
  "ActiveWorkoutView",
  "ActiveGenericSessionView",
  "SessionRewardScreen",
  "SessionRecapScreen",
  "StartWorkoutSheet",
  "NewSessionSheet",
  "RepeatLiveConfirmDialog",
];

describe("Parcours de séance chargé immédiatement (hors connexion à la salle)", () => {
  it.each(SESSION_PATH_FILES)("%s n'utilise aucun import différé", (path) => {
    const source = read(path);
    expect(source).not.toMatch(/lazyWithPreload\(|React\.lazy\(|\blazy\(|import\(/);
  });

  it.each(SEANCES_TAB_EAGER)("SeancesTab importe %s statiquement", (name) => {
    const source = read("src/routes/_authenticated/fitness/SeancesTab.tsx");
    expect(source).toMatch(new RegExp(`^import \\{[^}]*\\b${name}\\b[^}]*\\} from "[^"]+";$`, "m"));
    expect(source).not.toMatch(new RegExp(`import\\([^)]*${name}`));
  });
});
