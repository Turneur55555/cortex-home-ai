// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TEST_TODAY, makeWeekPlanView } from "./weekPlanTestFixtures";

/**
 * La carte d'entrée du plan sur l'écran Séances : une invitation qui promet
 * quand il n'y a pas de plan, la semaine d'un coup d'œil quand il y en a un.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({ view: null as unknown }));

vi.mock("@/hooks/useWeekPlanView", () => ({ useWeekPlanView: () => holder.view }));
// L'éditeur a son propre fichier de test : ici, un marqueur suffit à savoir qu'il s'ouvre.
vi.mock("@/components/fitness/plan/WeeklyPlanSheet", () => ({
  WeeklyPlanSheet: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="plan-sheet">
      <button type="button" onClick={onClose}>
        fermer
      </button>
    </div>
  ),
}));

import { WeekPlanCard } from "./WeekPlanCard";

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

function show(
  view: ReturnType<typeof makeWeekPlanView>,
  props: React.ComponentProps<typeof WeekPlanCard> = {},
) {
  holder.view = view;
  act(() => root.render(<WeekPlanCard {...props} />));
}

const sheet = () => container.querySelector('[data-testid="plan-sheet"]');
const button = (text: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
const click = (el: Element | undefined) => {
  if (!el) throw new Error("élément introuvable");
  act(() => (el as HTMLElement).click());
};

const day = (n: 1 | 2 | 3 | 4 | 5 | 6 | 7) => ({ dayOfWeek: n });
const session = (id: string, date: string) => ({
  id,
  date,
  status: "completed",
  discipline: "muscu",
});

describe("WeekPlanCard", () => {
  it("pendant le chargement : un squelette, ni invitation ni semaine", () => {
    show(makeWeekPlanView({ isLoading: true }));
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Planifie ta semaine");
    expect(container.querySelector("ol")).toBeNull();
  });

  describe("sans plan", () => {
    it("invite, en promettant quelque chose, au lieu d'afficher un écran vide", () => {
      show(makeWeekPlanView());
      expect(container.textContent).toContain("Planifie ta semaine");
      expect(container.textContent).toContain("CORTEX te dit chaque jour quoi faire");
      expect(container.querySelector("ol")).toBeNull();
    });

    it("un appui ouvre l'éditeur, qui se referme ensuite", () => {
      show(makeWeekPlanView());
      expect(sheet()).toBeNull();
      click(button("Planifie ta semaine"));
      expect(sheet()).not.toBeNull();
      click(button("fermer"));
      expect(sheet()).toBeNull();
    });
  });

  describe("avec un plan", () => {
    const plan = {
      1: { ...day(1), kind: "muscles" as const, groups: ["dos" as const] },
      2: { ...day(2), kind: "muscles" as const, groups: ["epaules" as const] },
      3: { ...day(3), kind: "muscles" as const, groups: ["jambes" as const] },
      4: { ...day(4), kind: "rest" as const },
      5: { ...day(5), kind: "muscles" as const, groups: ["pecs" as const] },
    };

    it("montre la semaine, sans l'invitation", () => {
      show(makeWeekPlanView({ plan }));
      expect(container.querySelectorAll("ol li")).toHaveLength(7);
      expect(container.textContent).not.toContain("Planifie ta semaine");
      expect(container.textContent).toContain("Ton rythme");
    });

    it("annonce la progression : « 1 / 4 faites »", () => {
      show(makeWeekPlanView({ plan, workouts: [session("a", "2026-09-28")] }));
      expect(container.textContent).toContain("1 / 4 faites");
    });

    it("une séance un jour libre est un bonus, jamais comptée dans les « faites »", () => {
      show(makeWeekPlanView({ plan, workouts: [session("a", "2026-10-03")] })); // samedi, libre
      expect(container.textContent).toContain("0 / 4 faites · +1 en plus");
    });

    it("une semaine de repos le dit, au lieu d'afficher « 0 / 0 faites »", () => {
      show(
        makeWeekPlanView({
          plan: { 1: { ...day(1), kind: "rest" }, 2: { ...day(2), kind: "rest" } },
        }),
      );
      expect(container.textContent).toContain("Semaine de repos");
      expect(container.textContent).not.toContain("0 / 0");
    });

    it("« Modifier » ouvre l'éditeur", () => {
      show(makeWeekPlanView({ plan }));
      click(button("Modifier"));
      expect(sheet()).not.toBeNull();
    });

    it("repère aujourd'hui dans la bande", () => {
      show(makeWeekPlanView({ plan, today: TEST_TODAY }));
      const current = container.querySelector('li[aria-current="date"]');
      expect(current?.getAttribute("aria-label")).toContain("Mercredi");
    });
  });
});

describe("WeekPlanCard — sur l'Accueil (hideInvitation)", () => {
  const plan = { 1: { dayOfWeek: 1, kind: "rest" } as const };

  it("sans plan : rien du tout (la Carte du jour porte déjà l'invitation)", () => {
    show(makeWeekPlanView(), { hideInvitation: true });
    expect(container.innerHTML).toBe("");
  });

  it("pendant le chargement : rien non plus (la Carte du jour a son propre squelette)", () => {
    show(makeWeekPlanView({ isLoading: true }), { hideInvitation: true });
    expect(container.innerHTML).toBe("");
  });

  it("avec un plan : la semaine s'affiche comme sur l'écran Séances", () => {
    show(makeWeekPlanView({ plan }), { hideInvitation: true });
    expect(container.querySelector('[aria-label="Ta semaine"]')).not.toBeNull();
    expect(button("Modifier")).toBeDefined();
  });

  it("par défaut (écran Séances), l'invitation reste affichée sans plan", () => {
    show(makeWeekPlanView());
    expect(button("Planifie ta semaine")).toBeDefined();
  });
});
