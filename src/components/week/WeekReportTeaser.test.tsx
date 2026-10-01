// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({ value: { isLoading: false, teaser: null as unknown } }));

vi.mock("@/hooks/useWeekReport", () => ({ useWeekReportTeaser: () => holder.value }));
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

import { WeekReportTeaser } from "./WeekReportTeaser";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  holder.value = { isLoading: false, teaser: null };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const show = (teaser: unknown, isLoading = false) => {
  holder.value = { isLoading, teaser };
  act(() => root.render(<WeekReportTeaser />));
};

describe("WeekReportTeaser", () => {
  it("rien à annoncer : ne rend RIEN (ni cadre vide, ni célébration)", () => {
    show(null);
    expect(container.innerHTML).toBe("");
  });

  it("chargement : rien non plus, pas de bandeau qui clignote", () => {
    show(
      {
        weekStart: "2026-09-28",
        title: "Ta semaine est prête",
        subtitle: "Semaine 40 · 3 séances",
      },
      true,
    );
    expect(container.innerHTML).toBe("");
  });

  it("le bandeau : titre, sous-titre, et un lien vers le bilan de CETTE semaine", () => {
    show({
      weekStart: "2026-09-28",
      title: "Ta semaine est prête",
      subtitle: "Semaine 40 · 3 séances, 2 records",
    });
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/semaine/2026-09-28");
    expect(link?.textContent).toContain("Ta semaine est prête");
    expect(link?.textContent).toContain("Semaine 40 · 3 séances, 2 records");
  });
});
