// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { mutation } = vi.hoisted(() => ({
  mutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-fitness", () => ({
  useDeleteWorkout: mutation,
  useUpdateWorkoutName: mutation,
  useUpdateWorkoutSchedule: mutation,
  isValidWorkoutDurationMinutes: (n: number) => Number.isInteger(n) && n > 0,
}));
vi.mock("@/hooks/useGenericActiveSession", () => ({ useStartGenericActiveWorkout: mutation }));
vi.mock("@/hooks/useWorkoutAnalyses", () => ({
  useWorkoutAnalysisIndex: () => ({ data: new Set<string>() }),
}));
vi.mock("@/components/fitness/StoredWorkoutAnalysisSheet", () => ({
  StoredWorkoutAnalysisSheet: () => null,
}));

import { GenericHistoryCard } from "./GenericHistoryCard";
import { buildCourseMetadata, COURSES } from "@/lib/fitness/courses";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const lagree = {
  id: "w1",
  name: "Lagree",
  date: "2026-11-04",
  created_at: new Date(2026, 10, 4, 17, 29).toISOString(),
  discipline: "guided",
  duration_minutes: 50,
  notes: null,
  gym_location: "Keep Cool",
  metadata: buildCourseMetadata(COURSES.lagree),
  exercises: [],
};

describe("GenericHistoryCard — cours de Lagree", () => {
  it("affiche l'heure de début du cours, jamais 00h00", () => {
    act(() => root.render(<GenericHistoryCard workout={lagree} />));
    const text = container.textContent ?? "";
    expect(text).toContain("mercredi 4 novembre • 17h29");
    expect(text).not.toContain("00h00");
  });

  it("le menu permet de modifier la date et la durée", () => {
    act(() => root.render(<GenericHistoryCard workout={lagree} />));
    const menu = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Options de la séance"]',
    );
    expect(menu).not.toBeNull();
    act(() => menu!.click());
    const edit = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Modifier date / durée"),
    );
    expect(edit).toBeDefined();
    act(() => edit!.click());
    const dateInput = document.querySelector<HTMLInputElement>('input[type="date"]');
    expect(dateInput?.value).toBe("2026-11-04");
  });
});
