// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReportWorkout } from "@/lib/fitness/weeklyReport";

/**
 * Le hook ne contient aucune règle (elle est dans `lib/fitness/weeklyReport.ts`) : il
 * alimente la règle avec les séances, le plan et la date du jour. On vérifie qu'il attend
 * les deux lectures et qu'il transmet bien ses sources.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sources = vi.hoisted(() => ({
  workouts: { data: [] as unknown, isLoading: false },
  plan: { data: [] as unknown, isLoading: false },
  today: "2026-10-05", // lundi
}));

vi.mock("@/hooks/use-fitness", () => ({ useWorkouts: () => sources.workouts }));
vi.mock("@/hooks/useWeeklyPlan", () => ({ useWeeklyPlanRows: () => sources.plan }));
vi.mock("@/hooks/useLocalToday", () => ({ useLocalToday: () => sources.today }));

import { useWeekReport, useWeekReportList, useWeekReportTeaser } from "@/hooks/useWeekReport";

let container: HTMLDivElement;
let root: Root;
const seen = {} as {
  report: ReturnType<typeof useWeekReport>;
  list: ReturnType<typeof useWeekReportList>;
  teaser: ReturnType<typeof useWeekReportTeaser>;
};

function Probe({ weekStart }: { weekStart: string }) {
  seen.report = useWeekReport(weekStart);
  seen.list = useWeekReportList();
  seen.teaser = useWeekReportTeaser();
  return null;
}

// Variable intermédiaire : un littéral en ligne déclencherait la vérification des propriétés
// excédentaires contre l'intersection de types de `ReportWorkout.exercises`.
const SQUAT_SETS = [{ id: "s", set_number: 1, reps: 5, weight: 100, completed: true }];

const workout = (date: string): ReportWorkout => ({
  id: `w-${date}`,
  date,
  name: "Séance",
  status: "completed",
  discipline: "muscu",
  exercises: [
    {
      id: "e",
      name: "Squat",
      weight: null,
      sets: null,
      reps: null,
      exercise_sets: SQUAT_SETS,
    },
  ],
});

beforeEach(() => {
  sources.workouts = { data: [workout("2026-09-30")], isLoading: false };
  sources.plan = { data: [], isLoading: false };
  sources.today = "2026-10-05";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = (weekStart = "2026-09-28") => act(() => root.render(<Probe weekStart={weekStart} />));

describe("useWeekReport*", () => {
  it("prêt quand les séances ET le plan sont lus", () => {
    mount();
    expect(seen.report.isLoading).toBe(false);
    expect(seen.list.isLoading).toBe(false);
    expect(seen.teaser.isLoading).toBe(false);
  });

  it.each([
    ["les séances", () => (sources.workouts = { data: undefined, isLoading: true })],
    ["le plan", () => (sources.plan = { data: undefined, isLoading: true })],
  ])("pas prêt tant que %s ne sont pas lus", (_name, makeLoading) => {
    makeLoading();
    mount();
    expect(seen.report.isLoading).toBe(true);
    expect(seen.list.isLoading).toBe(true);
    expect(seen.teaser.isLoading).toBe(true);
  });

  it("le bilan de la semaine demandée, dérivé des séances", () => {
    mount("2026-09-28");
    expect(seen.report.report).toMatchObject({
      weekStart: "2026-09-28",
      sessions: 1,
      volumeKg: 500,
    });
  });

  it("une autre semaine sans séance : pas de bilan", () => {
    mount("2026-09-14");
    expect(seen.report.report).toBeNull();
  });

  it("la liste exclut la semaine en cours et porte les semaines passées", () => {
    sources.today = "2026-10-05"; // lundi : la semaine du 28/09 est finie, celle du 05/10 commence
    sources.workouts = { data: [workout("2026-09-30"), workout("2026-10-05")], isLoading: false };
    mount();
    expect(seen.list.weeks.map((w) => w.weekStart)).toEqual(["2026-09-28"]);
  });

  it("le bandeau utilise la date du jour de l'horloge locale, pas la sienne", () => {
    mount();
    expect(seen.teaser.teaser).toMatchObject({
      weekStart: "2026-09-28",
      title: "Ta semaine est prête",
    });
    sources.today = "2026-10-08"; // jeudi : plus de bandeau
    mount();
    expect(seen.teaser.teaser).toBeNull();
  });

  it("données absentes (undefined) : aucun plantage, pas de bilan", () => {
    sources.workouts = { data: undefined, isLoading: false };
    sources.plan = { data: undefined, isLoading: false };
    mount();
    expect(seen.report.report).toBeNull();
    expect(seen.list.weeks).toEqual([]);
    expect(seen.teaser.teaser).toBeNull();
  });
});
