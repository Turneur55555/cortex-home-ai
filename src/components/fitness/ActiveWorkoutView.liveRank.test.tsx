// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Rang pendant la séance (01/11/2026) — branchement de `lib/fitness/rank/liveRank.ts` dans
 * l'écran de séance : le fanion suit les séries validées, la carte reçoit la ligne « prochain
 * grade », une montée de grade déclenche la cinématique et un record le toast — une seule fois,
 * jamais à la reprise d'une séance. La règle elle-même est testée dans `liveRank.test.ts`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  workouts: [] as unknown[],
  cardProps: [] as Array<Record<string, unknown>>,
  overlayRanks: [] as unknown[],
  toastSuccess: vi.fn(),
}));

const emptyQuery = vi.hoisted(() => () => ({ data: undefined }));
const emptyMutation = vi.hoisted(() => () => ({
  mutate: () => undefined,
  mutateAsync: async () => undefined,
  isPending: false,
}));

vi.mock("@/hooks/use-fitness", () => ({
  useFinishWorkout: emptyMutation,
  useCancelWorkout: emptyMutation,
  useAddExerciseToActiveWorkout: emptyMutation,
  useReorderActiveExercises: emptyMutation,
  useExerciseImageUrls: emptyQuery,
  useWorkouts: () => ({ data: h.workouts }),
  useClosureDurationPreview: () => ({ data: 30 }),
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
vi.mock("@/hooks/useBodyTracking", () => ({
  useBodyMeasurements: () => ({ data: [{ weight: 80 }] }),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u-live" } }) }));
vi.mock("sonner", () => ({ toast: { success: h.toastSuccess, error: vi.fn() } }));
vi.mock("./exerciseCard/ActiveExerciseCard", () => ({
  ActiveExerciseCard: (props: Record<string, unknown>) => {
    h.cardProps.push(props);
    return null;
  },
}));
vi.mock("./RankUpOverlay", () => ({
  RankUpOverlay: ({ rank }: { rank: unknown }) => {
    // L'overlay reste monté tant qu'il joue : on compte les célébrations DISTINCTES.
    if (rank && !h.overlayRanks.includes(rank)) h.overlayRanks.push(rank);
    return null;
  },
}));
vi.mock("./ExercisePickerSheet", () => ({ ExercisePickerSheet: () => null }));
vi.mock("./ExerciseSheet", () => ({ ExerciseSheet: () => null }));
vi.mock("./session/SegmentAnalysisSheet", () => ({ SegmentAnalysisSheet: () => null }));
vi.mock("./session/SessionGoalBar", () => ({ SessionGoalBar: () => null }));

import { ActiveWorkoutView } from "./ActiveWorkoutView";
import type { ActiveWorkout } from "@/hooks/use-fitness";

/** Chest press à 40 kg × 10, une fois par semaine — grade sans confirmation requise. */
const HISTORY = ["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23"].map((date, i) => ({
  id: `past-${i}`,
  date,
  status: "completed",
  exercises: [
    {
      name: "Chest press",
      exercise_reference_id: null,
      // Colonnes résumé (écrites à la clôture) : c'est d'elles que le record d'avant est lu.
      sets: 2,
      reps: 10,
      weight: 40,
      exercise_sets: [
        { reps: 10, weight: 40, completed: true },
        { reps: 10, weight: 40, completed: true },
      ],
    },
  ],
}));

function workoutWith(
  sets: Array<{ id: string; reps: number; weight: number; completed: boolean }>,
) {
  return {
    id: "active",
    name: "Pectoraux",
    gym_location: "Salle",
    created_at: new Date().toISOString(),
    exercises: [
      {
        id: "e-1",
        name: "Chest press",
        image_path: null,
        sets: null,
        reps: null,
        weight: null,
        exercise_reference_id: null,
        exercise_sets: sets.map((s, i) => ({ ...s, set_number: i + 1 })),
      },
    ],
  } as unknown as ActiveWorkout;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  h.workouts = HISTORY;
  h.cardProps = [];
  h.overlayRanks = [];
  h.toastSuccess.mockClear();
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(workout: ActiveWorkout) {
  act(() => {
    root.render(<ActiveWorkoutView workout={workout} onFinished={() => undefined} />);
  });
}

const lastCard = () =>
  h.cardProps[h.cardProps.length - 1] as {
    rank: { tierIndex: number } | null;
    nextRank: { title: string; detail: string } | null;
  };

describe("ActiveWorkoutView — le Rang pendant la séance", () => {
  it("la carte reçoit le grade du jour et la ligne « prochain grade » à charge précise", () => {
    render(workoutWith([{ id: "s1", reps: 10, weight: 40, completed: true }]));
    const card = lastCard();
    expect(card.rank).not.toBeNull();
    expect(card.nextRank?.title).toMatch(/^Prochain grade : /);
    expect(card.nextRank?.detail).toMatch(/^à \d+(,\d)? kg × 10$/);
  });

  it("une série validée qui franchit un grade : cinématique UNE fois, puis plus rien", () => {
    render(workoutWith([{ id: "s1", reps: 10, weight: 40, completed: true }]));
    const before = lastCard().rank?.tierIndex ?? -1;
    expect(h.overlayRanks).toHaveLength(0);

    const promoted = workoutWith([
      { id: "s1", reps: 10, weight: 40, completed: true },
      { id: "s2", reps: 10, weight: 50, completed: true },
    ]);
    render(promoted);
    expect(lastCard().rank?.tierIndex ?? -1).toBeGreaterThan(before);
    expect(h.overlayRanks).toHaveLength(1);
    // La montée de grade passe AVANT le record : pas de toast en plus.
    expect(h.toastSuccess).not.toHaveBeenCalled();
    // Mémorisé : la fiche d'exercice ne la rejouera pas.
    expect(localStorage.getItem("exrank:seen:u-live:Chest press")).not.toBeNull();

    // Même état re-rendu : aucune nouvelle célébration.
    render(promoted);
    expect(h.overlayRanks).toHaveLength(1);
  });

  it("un nouveau record sans changement de grade : toast « Nouveau record »", () => {
    render(workoutWith([{ id: "s1", reps: 10, weight: 40, completed: true }]));
    // Grade déjà célébré plus haut sur cet appareil : seule la charge record se fête.
    localStorage.setItem("exrank:seen:u-live:Chest press", "29");
    render(
      workoutWith([
        { id: "s1", reps: 10, weight: 40, completed: true },
        { id: "s2", reps: 10, weight: 42.5, completed: true },
      ]),
    );
    expect(h.toastSuccess).toHaveBeenCalledTimes(1);
    expect(h.toastSuccess.mock.calls[0]?.[0]).toBe("Nouveau record · Chest press");
  });

  it("reprise d'une séance où le grade est déjà franchi : aucune célébration au chargement", () => {
    render(
      workoutWith([
        { id: "s1", reps: 10, weight: 40, completed: true },
        { id: "s2", reps: 10, weight: 50, completed: true },
      ]),
    );
    expect(h.overlayRanks).toHaveLength(0);
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });

  it("série saisie mais non cochée : ni grade ni record ne bougent", () => {
    render(workoutWith([{ id: "s1", reps: 10, weight: 40, completed: true }]));
    const before = lastCard().rank?.tierIndex;
    render(
      workoutWith([
        { id: "s1", reps: 10, weight: 40, completed: true },
        { id: "s2", reps: 10, weight: 60, completed: false },
      ]),
    );
    expect(lastCard().rank?.tierIndex).toBe(before);
    expect(h.overlayRanks).toHaveLength(0);
    expect(h.toastSuccess).not.toHaveBeenCalled();
  });
});
