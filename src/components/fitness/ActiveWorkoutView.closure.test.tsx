// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * CHANTIER 9 (B1/B2), verrouillé par le CHANTIER FINAL (AUD-09, test 2) —
 * `closureBusy` DÉSACTIVE RÉELLEMENT TOUS LES DÉCLENCHEURS DE CLÔTURE.
 *
 * Il y a TROIS chemins pour clore une séance, et ils n'ont pas la même
 * visibilité : le bouton « Terminer » du bandeau, l'entrée « Annuler la
 * séance » du menu ⋮, et le bouton « Annuler » du dialogue de confirmation.
 * Une clôture déjà en vol doit tous les neutraliser — en oublier un, c'est
 * exactement le scénario qui produit deux clôtures pour une même séance.
 *
 * CE QUE CE TEST NE REMPLACE PAS : la garde qui compte est INTERNE à la
 * mutation (`runExclusiveSessionClosure`, `lib/fitness/sessionClosure.ts`,
 * couverte par `lib/fitness/sessionClosure.test.ts`). `closureBusy` ne fait
 * que refléter le verrou à l'écran. Ce test vérifie ce reflet, et vérifie
 * aussi qu'il ne se contente pas d'être grisé : le gestionnaire lui-même
 * refuse de relancer une clôture.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mutations = vi.hoisted(() => ({
  finishPending: false,
  cancelPending: false,
  finish: vi.fn(async (_input?: unknown) => undefined),
  cancel: vi.fn(async () => undefined),
  previewMinutes: 39 as number | undefined,
}));

const emptyQuery = vi.hoisted(() => () => ({ data: undefined }));
const emptyMutation = vi.hoisted(() => () => ({
  mutate: () => undefined,
  mutateAsync: async () => undefined,
  isPending: false,
}));

vi.mock("@/hooks/use-fitness", () => ({
  useFinishWorkout: () => ({
    mutateAsync: mutations.finish,
    mutate: mutations.finish,
    isPending: mutations.finishPending,
  }),
  useCancelWorkout: () => ({
    mutateAsync: mutations.cancel,
    mutate: mutations.cancel,
    isPending: mutations.cancelPending,
  }),
  useAddExerciseToActiveWorkout: emptyMutation,
  useReorderActiveExercises: emptyMutation,
  useExerciseImageUrls: emptyQuery,
  useWorkouts: emptyQuery,
  useClosureDurationPreview: () => ({ data: mutations.previewMinutes }),
}));

vi.mock("@/hooks/useGenericActiveSession", () => ({
  HYBRID_BLOCKS_KEY: ["fitness", "hybrid_blocks"],
  useActiveWorkoutSegments: emptyQuery,
  useAddGenericSegment: emptyMutation,
}));

vi.mock("@/hooks/useLastExerciseSession", () => ({ useLastExerciseSessions: () => new Map() }));
vi.mock("@/hooks/useUserExercisePhotos", () => ({
  useUserExercisePhotos: emptyQuery,
  resolveCustomExerciseMuscles: async () => undefined,
}));
vi.mock("@/hooks/useExerciseCatalogEntry", () => ({ useExerciseMediaForExercises: emptyQuery }));
vi.mock("@/hooks/useBodyTracking", () => ({ useBodyMeasurements: emptyQuery }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u-1" } }) }));

// Enfants lourds hors sujet — le flux de clôture ne dépend d'aucun d'eux.
vi.mock("./exerciseCard/ActiveExerciseCard", () => ({ ActiveExerciseCard: () => <div /> }));
vi.mock("./ExercisePickerSheet", () => ({ ExercisePickerSheet: () => null }));
vi.mock("./ExerciseSheet", () => ({ ExerciseSheet: () => null }));
vi.mock("./session/SegmentAnalysisSheet", () => ({ SegmentAnalysisSheet: () => null }));
// C13 : l'objectif de séance lit l'historique et les modèles — sans rapport avec la clôture testée ici.
vi.mock("./session/SessionGoalBar", () => ({ SessionGoalBar: () => null }));

import { ActiveWorkoutView } from "./ActiveWorkoutView";
import type { ActiveWorkout } from "@/hooks/use-fitness";

const WORKOUT: ActiveWorkout = {
  id: "w-1",
  name: "Push Day",
  gym_location: "Salle Neptune",
  created_at: "2026-09-07T08:00:00Z",
  exercises: [],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mutations.finishPending = false;
  mutations.cancelPending = false;
  mutations.finish.mockClear();
  mutations.cancel.mockClear();
  mutations.previewMinutes = 39;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render() {
  act(() => {
    root.render(<ActiveWorkoutView workout={WORKOUT} onFinished={() => undefined} />);
  });
}

/** Les déclencheurs vivent dans des portails : on cherche dans tout le
 *  document, pas seulement dans le conteneur monté. */
function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === text,
  );
}

function finishButton() {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes("Terminer"),
  );
}

function openMenu() {
  const menuButton = document.querySelector<HTMLButtonElement>('[aria-label="Menu séance"]');
  act(() => {
    menuButton?.click();
  });
}

function openCancelDialog() {
  openMenu();
  act(() => {
    buttonByText("Annuler la séance")?.click();
  });
}

describe("ActiveWorkoutView — verrou de clôture reflété à l'écran (AUD-09, test 2)", () => {
  it("au repos, les trois déclencheurs sont actifs", () => {
    render();
    expect(finishButton()?.disabled).toBe(false);

    openMenu();
    expect(buttonByText("Annuler la séance")?.disabled).toBe(false);

    act(() => {
      buttonByText("Annuler la séance")?.click();
    });
    expect(buttonByText("Annuler")?.disabled).toBe(false);
  });

  it("clôture EN COURS (finish) → « Terminer » désactivé", () => {
    mutations.finishPending = true;
    render();
    expect(finishButton()?.disabled).toBe(true);
  });

  it("clôture EN COURS (finish) → l'entrée « Annuler la séance » du menu est désactivée", () => {
    mutations.finishPending = true;
    render();
    openMenu();
    expect(buttonByText("Annuler la séance")?.disabled).toBe(true);
  });

  it("clôture EN COURS (finish) → le bouton du dialogue de confirmation est désactivé", () => {
    // Le dialogue est ouvert AVANT que la clôture ne démarre : c'est le cas
    // réel où l'utilisateur hésite, puis tape « Terminer » dans le bandeau.
    render();
    openCancelDialog();
    expect(buttonByText("Annuler")?.disabled).toBe(false);

    act(() => {
      mutations.finishPending = true;
      root.render(<ActiveWorkoutView workout={WORKOUT} onFinished={() => undefined} />);
    });
    expect(buttonByText("Annuler")?.disabled).toBe(true);
  });

  it("ANNULATION en cours → les trois déclencheurs sont désactivés", () => {
    mutations.cancelPending = true;
    render();
    expect(finishButton()?.disabled).toBe(true);
    openCancelDialog();
    expect(buttonByText("Annuler la séance")?.disabled).toBe(true);
  });

  it("le gestionnaire lui-même refuse : un clic forcé pendant la clôture ne relance RIEN", () => {
    mutations.finishPending = true;
    render();

    // On force le clic malgré `disabled` (un déclencheur reprogrammé, un
    // double événement tactile) : `handleFinish` doit s'arrêter sur
    // `closureBusy`, pas seulement compter sur l'attribut HTML.
    const button = finishButton();
    button?.removeAttribute("disabled");
    act(() => {
      button?.click();
    });

    expect(mutations.finish).not.toHaveBeenCalled();
  });

  it("le gestionnaire d'annulation refuse lui aussi pendant une clôture en vol", () => {
    render();
    openCancelDialog();

    act(() => {
      mutations.finishPending = true;
      root.render(<ActiveWorkoutView workout={WORKOUT} onFinished={() => undefined} />);
    });

    const button = buttonByText("Annuler");
    button?.removeAttribute("disabled");
    act(() => {
      button?.click();
    });

    expect(mutations.cancel).not.toHaveBeenCalled();
  });
});

// ─── Récap de clôture (01/11/2026) ──────────────────────────────────────────
// « Terminer » n'enregistre plus directement : il ouvre le récap (séries saisies mais pas
// cochées, durée confirmable) et c'est le récap qui clôt. La règle est dans
// `lib/fitness/closureReview.ts` (testée à part) ; ici, le branchement et le reflet du verrou.

const WORKOUT_WITH_SETS: ActiveWorkout = {
  ...WORKOUT,
  exercises: [
    {
      id: "e-1",
      name: "Pushdown corde",
      image_path: null,
      sets: null,
      reps: null,
      weight: null,
      exercise_sets: [
        { id: "s-1", set_number: 1, reps: 10, weight: 20, completed: true },
        { id: "s-2", set_number: 2, reps: 10, weight: 20, completed: false },
        { id: "s-3", set_number: 3, reps: null, weight: null, completed: false },
      ],
    } as ActiveWorkout["exercises"][number],
  ],
};

function renderWith(workout: ActiveWorkout, onFinished: (w: ActiveWorkout) => void = () => {}) {
  act(() => {
    root.render(<ActiveWorkoutView workout={workout} onFinished={onFinished} />);
  });
}

function openReview() {
  act(() => {
    finishButton()?.click();
  });
}

function typeDuration(value: string) {
  const input = document.querySelector<HTMLInputElement>("#closure-duration");
  if (!input) throw new Error("champ durée absent");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ActiveWorkoutView — récap de clôture", () => {
  it("« Terminer » ouvre le récap, sans rien enregistrer", () => {
    renderWith(WORKOUT);
    openReview();
    expect(document.body.textContent).toContain("Terminer la séance");
    expect(mutations.finish).not.toHaveBeenCalled();
  });

  it("sans série en suspens : clôture avec la durée affichée", async () => {
    const onFinished = vi.fn();
    renderWith(WORKOUT, onFinished);
    openReview();
    expect(document.querySelector<HTMLInputElement>("#closure-duration")?.value).toBe("39");
    await act(async () => {
      buttonByText("Terminer la séance")?.click();
    });
    expect(mutations.finish).toHaveBeenCalledTimes(1);
    expect(mutations.finish.mock.calls[0]?.[0]).toMatchObject({
      id: "w-1",
      closure: { validateSetIds: [], removeSetIds: [], durationMinutes: 39 },
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("« Les compter et terminer » : la série en suspens est validée, la vide retirée", async () => {
    const onFinished = vi.fn();
    renderWith(WORKOUT_WITH_SETS, onFinished);
    openReview();
    expect(document.body.textContent).toContain("1 série saisie mais pas cochée");
    expect(document.body.textContent).toContain("20 kg × 10");
    await act(async () => {
      buttonByText("Les compter et terminer")?.click();
    });
    expect(mutations.finish.mock.calls[0]?.[0]).toMatchObject({
      closure: { validateSetIds: ["s-2"], removeSetIds: ["s-3"] },
    });
    // L'écran de fin lit l'instantané TRANCHÉ : s-2 cochée, s-3 absente.
    const snapshot = onFinished.mock.calls[0]?.[0] as ActiveWorkout;
    expect(snapshot.exercises[0].exercise_sets.map((s) => [s.id, s.completed])).toEqual([
      ["s-1", true],
      ["s-2", true],
    ]);
  });

  it("« Terminer sans elles » : la série en suspens et la vide sont retirées", async () => {
    renderWith(WORKOUT_WITH_SETS);
    openReview();
    await act(async () => {
      buttonByText("Terminer sans elles")?.click();
    });
    expect(mutations.finish.mock.calls[0]?.[0]).toMatchObject({
      closure: { validateSetIds: [], removeSetIds: ["s-2", "s-3"] },
    });
  });

  it("durée corrigée (« 1h10 ») transmise ; durée illisible = clôture impossible", async () => {
    renderWith(WORKOUT);
    openReview();
    typeDuration("abc");
    expect(buttonByText("Terminer la séance")?.disabled).toBe(true);
    typeDuration("1h10");
    await act(async () => {
      buttonByText("Terminer la séance")?.click();
    });
    expect(mutations.finish.mock.calls[0]?.[0]).toMatchObject({
      closure: { durationMinutes: 70 },
    });
  });

  it("durée implausible (séance restée ouverte) : champ vide, la clôture calcule elle-même", async () => {
    mutations.previewMinutes = 600;
    renderWith(WORKOUT);
    openReview();
    expect(document.querySelector<HTMLInputElement>("#closure-duration")?.value).toBe("");
    await act(async () => {
      buttonByText("Terminer la séance")?.click();
    });
    const input = mutations.finish.mock.calls[0]?.[0] as { closure: { durationMinutes?: number } };
    expect(input.closure.durationMinutes).toBeUndefined();
  });

  it("clôture en vol : les boutons du récap sont désactivés ET refusent un clic forcé", () => {
    renderWith(WORKOUT_WITH_SETS);
    openReview();
    act(() => {
      mutations.finishPending = true;
      root.render(<ActiveWorkoutView workout={WORKOUT_WITH_SETS} onFinished={() => undefined} />);
    });
    for (const label of ["Les compter et terminer", "Terminer sans elles"]) {
      const button = buttonByText(label);
      expect(button?.disabled).toBe(true);
      button?.removeAttribute("disabled");
      act(() => {
        button?.click();
      });
    }
    expect(mutations.finish).not.toHaveBeenCalled();
  });
});
