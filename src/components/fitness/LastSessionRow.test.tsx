// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TodayWorkout } from "@/lib/fitness/todayCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/useLocalToday", () => ({ useLocalToday: () => "2026-10-01" }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string;
    search?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a href={`${to}?${new URLSearchParams(search).toString()}`} {...rest}>
      {children}
    </a>
  ),
}));

import { LastSessionRow } from "./LastSessionRow";

const w = (id: string, date: string, name: string, extra: Partial<TodayWorkout> = {}) =>
  ({
    id,
    date,
    name,
    status: "completed",
    discipline: "muscu",
    created_at: `${date}T08:00:00Z`,
    exercises: [],
    ...extra,
  }) as TodayWorkout;

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

const show = (workouts: readonly TodayWorkout[] | undefined) =>
  act(() => root.render(<LastSessionRow workouts={workouts} />));

describe("LastSessionRow — la dernière séance, dite comme elle est", () => {
  it("le nom et le jour de la séance terminée la plus récente", () => {
    show([w("a", "2026-09-20", "Dos"), w("b", "2026-09-28", "Pectoraux")]);
    expect(container.textContent).toContain("Dernière séance");
    expect(container.textContent).toContain("Pectoraux · il y a 3 jours");
  });

  it("mène à la Chronique de CETTE séance", () => {
    show([w("a", "2026-09-20", "Dos"), w("b", "2026-09-28", "Pectoraux")]);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/chroniques?seance=b");
  });

  it("aucune séance terminée, ou historique pas encore lu : rien — on n'invente pas de « dernière fois »", () => {
    show([]);
    expect(container.textContent).toBe("");
    show(undefined);
    expect(container.textContent).toBe("");
  });

  it("une séance en cours, annulée ou d'une autre discipline n'est pas « la dernière séance »", () => {
    show([
      w("a", "2026-09-30", "Footing", { discipline: "cardio" }),
      w("b", "2026-09-29", "En cours", { status: "active" }),
      w("c", "2026-09-22", "Jambes"),
    ]);
    expect(container.textContent).toContain("Jambes · il y a 9 jours");
  });

  it("hier et aujourd'hui se disent comme tels", () => {
    show([w("a", "2026-09-30", "Dos")]);
    expect(container.textContent).toContain("Dos · hier");
    show([w("a", "2026-10-01", "Dos")]);
    expect(container.textContent).toContain("Dos · aujourd'hui");
  });

  it("un nom vide ne donne jamais une ligne vide", () => {
    show([w("a", "2026-09-28", "   ")]);
    expect(container.textContent).toContain("Sans nom · il y a 3 jours");
  });
});
