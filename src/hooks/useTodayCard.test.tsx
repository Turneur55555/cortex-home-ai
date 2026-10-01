// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { makeWeekPlanView } from "@/components/fitness/plan/weekPlanTestFixtures";
import type { TodayCardView } from "@/hooks/useTodayCard";

/**
 * Le hook ne contient aucune règle (elle est dans `resolveTodayCard`) : il
 * compose le plan, les séances et la séance en cours. Ce qu'on vérifie ici, c'est
 * qu'il attend les TROIS avant de se dire prêt, et qu'il transmet les bonnes
 * données à la règle.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sources = vi.hoisted(() => ({
  plan: null as unknown,
  active: { data: null as unknown, isLoading: false },
  workouts: { data: [] as unknown[] | undefined, isLoading: false },
}));

vi.mock("@/hooks/useWeekPlanView", () => ({ useWeekPlanView: () => sources.plan }));
vi.mock("@/hooks/use-fitness", () => ({
  useActiveWorkout: () => sources.active,
  useWorkouts: () => sources.workouts,
}));

import { useTodayCard } from "@/hooks/useTodayCard";

let container: HTMLDivElement;
let root: Root;
let seen: TodayCardView;

function Probe() {
  seen = useTodayCard();
  return null;
}

beforeEach(() => {
  sources.plan = makeWeekPlanView();
  sources.active = { data: null, isLoading: false };
  sources.workouts = { data: [], isLoading: false };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = () => act(() => root.render(<Probe />));

describe("useTodayCard", () => {
  it("prêt quand le plan, la séance en cours ET les séances sont lus", () => {
    mount();
    expect(seen.isLoading).toBe(false);
  });

  it.each([
    ["le plan", () => (sources.plan = makeWeekPlanView({ isLoading: true }))],
    ["la séance en cours", () => (sources.active = { data: null, isLoading: true })],
    ["les séances", () => (sources.workouts = { data: undefined, isLoading: true })],
  ])("pas prêt tant que %s n'est pas lu", (_name, makeLoading) => {
    makeLoading();
    mount();
    expect(seen.isLoading).toBe(true);
  });

  it("une séance en cours transmise à la règle : la carte devient « active »", () => {
    sources.active = {
      data: { id: "w", name: "Push Day", created_at: new Date(2026, 8, 30, 9, 5).toISOString() },
      isLoading: false,
    };
    mount();
    expect(seen.state).toMatchObject({ kind: "active", title: "Push Day" });
  });

  it("utilise la date de la vue du plan, jamais sa propre horloge", () => {
    sources.plan = makeWeekPlanView({ today: "2026-10-01" });
    mount();
    expect(seen.state.kicker).toBe("Jeudi 1 octobre · aujourd'hui");
  });

  it("les séances terminées d'aujourd'hui sont transmises : la carte dit « faite »", () => {
    const today = "2026-10-01";
    const workouts = [
      { id: "w", date: today, name: "A", status: "completed", discipline: "muscu", exercises: [] },
    ];
    sources.plan = makeWeekPlanView({ today, workouts });
    sources.workouts = { data: workouts, isLoading: false };
    mount();
    expect(seen.state.kind).toBe("done");
  });
});
