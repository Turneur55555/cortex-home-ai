// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ActiveWorkout } from "@/hooks/use-fitness";

/**
 * Le bilan IA ne reçoit JAMAIS une durée inventée. Avant : `maintenant − début` — une séance restée
 * ouverte une nuit envoyait « 1 440 min » à l'IA, qui commentait une séance de 24 heures et
 * persistait ce commentaire dans les Chroniques.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const invoke = vi.hoisted(() => vi.fn());
const stored = vi.hoisted(() => ({
  row: undefined as { duration_minutes: number | null } | undefined,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
vi.mock("@/hooks/use-fitness", () => ({ workoutsRepo: { get: async () => stored.row } }));
vi.mock("@/hooks/useWorkoutAnalyses", () => ({
  WORKOUT_ANALYSES_QUERY_ROOT: ["workout_analyses"],
}));
vi.mock("./WorkoutAnalysisContent", () => ({
  AnalysisSheetShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  WorkoutAnalysisContent: () => <div data-testid="analysis" />,
}));

import { PostWorkoutAnalysisSheet } from "./PostWorkoutAnalysisSheet";

const WORKOUT = {
  id: "w1",
  name: "Pectoraux",
  // Démarrée il y a 24 h : l'ancien calcul aurait envoyé 1 440.
  created_at: new Date(Date.now() - 24 * 3_600_000).toISOString(),
  exercises: [
    {
      id: "e1",
      name: "Développé couché",
      exercise_sets: [{ id: "s1", reps: 5, weight: 100, completed: true }],
    },
  ],
} as unknown as ActiveWorkout;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  invoke.mockReset().mockResolvedValue({ data: { headline: "ok" }, error: null });
  stored.row = undefined;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function open() {
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PostWorkoutAnalysisSheet workout={WORKOUT} workoutId="w1" onClose={() => undefined} />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const sentDuration = () => {
  const [, options] = invoke.mock.calls[0];
  return (options as { body: { workout: { duration_minutes: unknown } } }).body.workout
    .duration_minutes;
};

describe("PostWorkoutAnalysisSheet — la durée envoyée à l'IA", () => {
  it("la durée ENREGISTRÉE à la clôture, pas maintenant − début", async () => {
    stored.row = { duration_minutes: 62 };
    await open();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(sentDuration()).toBe(62);
  });

  it("une durée implausible (plafond de 600 min) n'est jamais transmise : null", async () => {
    stored.row = { duration_minutes: 600 };
    await open();
    expect(sentDuration()).toBeNull();
  });

  it("séance introuvable dans le store local ou sans durée : null, jamais un chiffre calculé", async () => {
    stored.row = undefined;
    await open();
    expect(sentDuration()).toBeNull();
  });

  it("l'ancien calcul (24 h = 1 440 min) n'est transmis sous aucune forme", async () => {
    stored.row = { duration_minutes: 600 };
    await open();
    expect(sentDuration()).not.toBe(1440);
  });
});
