// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { WeeklyReportSummary } from "@/lib/fitness/weeklyReport";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({ value: { isLoading: false, weeks: [] as unknown[] } }));

vi.mock("@/hooks/useWeekReport", () => ({ useWeekReportList: () => holder.value }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce((acc, [k, v]) => acc.replace(`$${k}`, v), to)}
      {...rest}
    >
      {children}
    </a>
  ),
}));

import { WeekReportList } from "./WeekReportList";

const week = (over: Partial<WeeklyReportSummary> = {}): WeeklyReportSummary => ({
  weekStart: "2026-09-21",
  label: "Semaine 39 · 21 → 27 septembre",
  sessions: 5,
  volumeKg: 18420,
  recordCount: 3,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  holder.value = { isLoading: false, weeks: [] };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const show = (weeks: WeeklyReportSummary[], isLoading = false) => {
  holder.value = { isLoading, weeks };
  act(() => root.render(<WeekReportList />));
};

describe("WeekReportList", () => {
  it("chargement : un squelette, pas de faux « premier bilan »", () => {
    show([], true);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Ton premier bilan");
  });

  it("aucune semaine : une promesse, pas un écran vide ni un reproche", () => {
    show([]);
    expect(container.textContent).toContain("Ton premier bilan arrive");
    expect(container.textContent).toContain("dès la fin de la première semaine");
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });

  it("chaque semaine : son libellé, ses chiffres, un lien vers son bilan", () => {
    show([
      week(),
      week({
        weekStart: "2026-09-14",
        label: "Semaine 38 · 14 → 20 septembre",
        sessions: 1,
        volumeKg: 0,
        recordCount: 0,
      }),
    ]);
    const items = Array.from(container.querySelectorAll("li"));
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Semaine 39 · 21 → 27 septembre");
    expect(items[0].textContent).toContain("5 séances · 18 420 kg · 3 records");
    expect(items[0].querySelector("a")?.getAttribute("href")).toBe("/semaine/2026-09-21");
    // Une semaine sans charge ni record ne fabrique ni « 0 kg » ni « 0 record ».
    expect(items[1].textContent).toContain("1 séance");
    expect(items[1].textContent).not.toMatch(/kg|record/);
  });

  it("singulier : 1 séance, 1 record", () => {
    show([week({ sessions: 1, recordCount: 1, volumeKg: 500 })]);
    expect(container.textContent).toContain("1 séance · 500 kg · 1 record");
  });

  it("garde l'ordre reçu (la plus récente d'abord)", () => {
    show([week({ weekStart: "2026-09-21" }), week({ weekStart: "2026-09-14" })]);
    const hrefs = Array.from(container.querySelectorAll("li a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/semaine/2026-09-21", "/semaine/2026-09-14"]);
  });
});
