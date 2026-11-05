// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { buildCourseMetadata, COURSES } from "@/lib/fitness/courses";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { holder } = vi.hoisted(() => ({
  holder: {
    workouts: [] as unknown[],
    templates: [] as unknown[],
    xp: 50 as number | undefined,
  },
}));
vi.mock("@/hooks/use-fitness", () => ({ useWorkouts: () => ({ data: holder.workouts }) }));
vi.mock("@/hooks/useWorkoutTemplates", () => ({
  useWorkoutTemplates: () => ({ data: holder.templates }),
}));
vi.mock("@/hooks/useRewardAmount", () => ({ useRewardAmount: () => ({ data: holder.xp }) }));
vi.mock("@/hooks/useLocalToday", () => ({ useLocalToday: () => "2026-11-05" }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));

import { CourseWeekCard } from "./CourseWeekCard";

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  holder.workouts = [];
  holder.templates = [];
  holder.xp = 50;
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const lagreeTemplate = { id: "t", name: "Lagree", course_key: "lagree" };
const lagreeWed = {
  id: "w",
  date: "2026-11-04",
  status: "completed",
  metadata: buildCourseMetadata(COURSES.lagree),
  created_at: "2026-11-04T16:29:00Z",
  xp_before: 72269,
  xp_after: 72319,
};

describe("CourseWeekCard — Tes cours sous « Ton rythme »", () => {
  it("invisible sans modèle de cours ni cours cette semaine", () => {
    holder.templates = [{ id: "m", name: "Dos", course_key: null }];
    act(() => root.render(<CourseWeekCard />));
    expect(container.textContent).toBe("");
  });

  it("le cours de mercredi remplit un créneau avec l'XP versée, l'autre reste à prendre", () => {
    holder.templates = [lagreeTemplate];
    holder.workouts = [lagreeWed];
    act(() => root.render(<CourseWeekCard />));
    const text = container.textContent ?? "";
    expect(text).toContain("1 / 2 cette semaine");
    expect(text).toContain("LagreeMer.+50");
    expect(text).toContain("À prendre+50");
    expect(text).not.toMatch(/Abdominaux|Fessiers/);
  });

  it("barème injoignable : pas de montant inventé sur le créneau libre", () => {
    holder.templates = [lagreeTemplate];
    holder.xp = undefined;
    act(() => root.render(<CourseWeekCard />));
    expect(container.textContent).toContain("0 / 2 cette semaine");
    expect(container.textContent).not.toContain("+");
  });
});
