// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * La fiche de personnage de l'Accueil : l'illustration officielle du Titre (jamais une autre
 * représentation du rang), le grade, la barre du palier, l'XP restante et le fait de rythme.
 * Les seuils viennent de `titleConfig` (testés ailleurs) ; ici on vérifie ce que la fiche DIT.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({
  stats: undefined as unknown,
  weekly: null as unknown,
}));

vi.mock("@/hooks/useUserStats", () => ({ useUserStats: () => ({ data: holder.stats }) }));
vi.mock("@/hooks/useWeeklyXp", () => ({ useWeeklyXp: () => ({ summary: holder.weekly }) }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, ...rest }: { to: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as object)} />
  ),
}));
vi.mock("@/components/rpg/RankIllustration", () => ({
  RankIllustration: ({ rankKey, label }: { rankKey: string; label: string }) => (
    <img data-testid="rank-illustration" data-rank={rankKey} alt={label} />
  ),
}));

import { ProfileHeroCard } from "./ProfileHeroCard";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  holder.stats = undefined;
  holder.weekly = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render() {
  act(() => root.render(<ProfileHeroCard />));
}

const text = () => (container.textContent ?? "").replace(/\u202f/g, " ");

describe("ProfileHeroCard — la fiche de personnage", () => {
  it("premier lancement sans aucun cache : un squelette, aucun rang inventé", () => {
    render();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="rank-illustration"]')).toBeNull();
  });

  it("Nathan au 01/11/2026 (71 909 XP) : Olympien Sublime, 1 291 XP avant Éternel", () => {
    holder.stats = { xp: 71909, level: 1, total_actions: 0 };
    render();
    const illustration = container.querySelector('[data-testid="rank-illustration"]');
    expect(illustration?.getAttribute("data-rank")).toBe("olympien");
    expect(text()).toContain("Grade actuel");
    expect(text()).toContain("Sublime");
    expect(text()).toContain("Plus que 1 291 XP avant Éternel");
    // Barre du palier Sublime (63 700 → 73 200) : 8 209 / 9 500 ≈ 86 %.
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe(
      "86",
    );
    // Toucher la fiche ouvre la page Progression.
    expect(container.querySelector('a[href="/progression"]')).not.toBeNull();
  });

  it("le fait de rythme : l'XP de la semaine (ou de la précédente), jamais « +0 XP »", () => {
    holder.stats = { xp: 71909, level: 1, total_actions: 0 };
    holder.weekly = { thisWeek: 0, lastWeek: 745 };
    render();
    expect(text()).toContain("+745 XP");
    expect(text()).toContain("la semaine dernière");

    holder.weekly = { thisWeek: 115, lastWeek: 745 };
    render();
    expect(text()).toContain("+115 XP");
    expect(text()).toContain("cette semaine");

    holder.weekly = { thisWeek: 0, lastWeek: 0 };
    render();
    expect(text()).not.toMatch(/\+\d/);
  });

  it("grade suprême : plus de cible, aucune XP restante inventée", () => {
    holder.stats = { xp: 999_999, level: 1, total_actions: 0 };
    render();
    expect(text()).toContain("Grade suprême atteint");
    expect(text()).not.toContain("Plus que");
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe(
      "100",
    );
  });

  it("aucun pourcentage affiché : le Rang se raconte en XP, pas en %", () => {
    holder.stats = { xp: 71909, level: 1, total_actions: 0 };
    holder.weekly = { thisWeek: 115, lastWeek: 0 };
    render();
    expect(text()).not.toContain("%");
  });
});
