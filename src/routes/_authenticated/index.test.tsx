// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * L'ordre de l'Accueil est une décision produit (Nathan, 30/09/2026) : l'ACTION
 * D'ABORD, puis le Rang. Ce test verrouille l'ordre, pas le contenu des cartes
 * (chacune a ses propres tests).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/components/home/TodayCard", () => ({
  TodayCard: () => <section data-testid="today-card" />,
}));
vi.mock("@/components/week/WeekReportTeaser", () => ({
  WeekReportTeaser: () => <a data-testid="week-teaser" href="/semaine" />,
}));
vi.mock("@/components/fitness/plan/WeekPlanCard", () => ({
  WeekPlanCard: ({ hideInvitation }: { hideInvitation?: boolean }) => (
    <section data-testid="week-card" data-hide-invitation={String(hideInvitation === true)} />
  ),
}));
vi.mock("@/components/profile/ProfileHeroCard", () => ({
  ProfileHeroCard: () => <header data-testid="hero-card" />,
}));
vi.mock("@/components/profile/rpg/RPGProgressionSection", () => ({
  RPGProgressionSection: () => <section data-testid="progression" />,
}));
vi.mock("@/components/home/CorpsShortcutTile", () => ({
  CorpsShortcutTile: () => <a data-testid="corps-tile" href="/corps" />,
}));

import { Route } from "./index";

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

function renderHome() {
  const Home = Route.options.component as () => React.ReactElement;
  act(() => root.render(<Home />));
}

const order = () =>
  Array.from(container.querySelectorAll("[data-testid]")).map((el) =>
    el.getAttribute("data-testid"),
  );

describe("Accueil — l'action d'abord, puis le Rang", () => {
  it("Carte du jour → bandeau de la semaine → semaine → illustration du Titre → progression → Corps", () => {
    renderHome();
    expect(order()).toEqual([
      "today-card",
      "week-teaser",
      "week-card",
      "hero-card",
      "progression",
      "corps-tile",
    ]);
  });

  it("la semaine n'y répète pas l'invitation à planifier (la Carte du jour s'en charge)", () => {
    renderHome();
    expect(
      container.querySelector('[data-testid="week-card"]')?.getAttribute("data-hide-invitation"),
    ).toBe("true");
  });
});
