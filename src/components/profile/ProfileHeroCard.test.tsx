// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * La carte de force de l'Accueil (« carte obsidienne ») : l'illustration officielle du Titre
 * (jamais une autre représentation du rang), le grade, l'XP restante sur une barre segmentée, et
 * une ligne par groupe musculaire. Les règles sont testées ailleurs (`titleConfig`,
 * `strengthCard`) ; ici on vérifie ce que la carte DIT.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({
  stats: undefined as unknown,
  strength: { isLoading: false, card: null } as unknown,
}));

vi.mock("@/hooks/useUserStats", () => ({ useUserStats: () => ({ data: holder.stats }) }));
vi.mock("@/hooks/useStrengthCard", () => ({ useStrengthCard: () => holder.strength }));
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

const NATHAN_ROWS = [
  {
    group: "pec",
    label: "PEC",
    exerciseName: "Chest press - debout",
    recordKg: 75,
    progressionKg: 0,
    sessions: 10,
    since: "2026-06-18",
    barRatio: 0.9375,
  },
  {
    group: "dos",
    label: "DOS",
    exerciseName: "Tirage horizontal assis poitrine",
    recordKg: 80,
    progressionKg: 10,
    sessions: 25,
    since: "2026-06-20",
    barRatio: 1,
  },
  {
    group: "epaules",
    label: "ÉPAULES",
    exerciseName: "Shoulder press",
    recordKg: 60,
    progressionKg: 10,
    sessions: 10,
    since: "2026-06-19",
    barRatio: 0.75,
  },
  {
    group: "bras",
    label: "BRAS",
    exerciseName: "Câble curl marteau with rope",
    recordKg: 25,
    progressionKg: 5,
    sessions: 10,
    since: "2026-08-03",
    barRatio: 0.3125,
  },
];

beforeEach(() => {
  holder.stats = undefined;
  holder.strength = { isLoading: false, card: null };
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

describe("ProfileHeroCard — la carte de force", () => {
  it("premier lancement sans aucun cache : un squelette, aucun rang inventé", () => {
    render();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="rank-illustration"]')).toBeNull();
  });

  it("Nathan au 02/11/2026 (72 009 XP) : Olympien Sublime, 1 191 XP avant Éternel, 17 segments sur 20", () => {
    holder.stats = { xp: 72009, level: 1, total_actions: 0 };
    holder.strength = { isLoading: false, card: { rows: NATHAN_ROWS, since: "2026-06-18" } };
    render();
    expect(
      container.querySelector('[data-testid="rank-illustration"]')?.getAttribute("data-rank"),
    ).toBe("olympien");
    expect(text()).toContain("Ta carte");
    expect(text()).toContain("Sublime");
    expect(text()).toContain("1 191 XP avant Éternel");
    const bar = container.querySelector('[role="progressbar"]');
    // Palier Sublime : 63 700 → 73 200 ; 8 309 / 9 500 ≈ 87 %.
    expect(bar?.getAttribute("aria-valuenow")).toBe("87");
    expect(bar?.children).toHaveLength(20);
    expect(container.querySelector('a[href="/progression"]')).not.toBeNull();
  });

  it("une ligne par groupe : exercice, record en kg, progression (rien quand elle est nulle)", () => {
    holder.stats = { xp: 72009, level: 1, total_actions: 0 };
    holder.strength = { isLoading: false, card: { rows: NATHAN_ROWS, since: "2026-06-18" } };
    render();
    const rows = Array.from(container.querySelectorAll("li")).map((li) => li.textContent);
    expect(rows).toEqual([
      "PECChest press - debout75kg",
      "DOSTirage horizontal assis poitrine80kg▲10",
      "ÉPAULESShoulder press60kg▲10",
      "BRASCâble curl marteau with rope25kg▲5",
    ]);
    expect(text()).toContain("▲ progression depuis juin");
    expect(text()).not.toContain("%");
  });

  it("pas encore de records : une phrase honnête, pas de ligne inventée", () => {
    holder.stats = { xp: 1200, level: 1, total_actions: 0 };
    holder.strength = { isLoading: false, card: { rows: [], since: null } };
    render();
    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(text()).toContain("Tes records apparaîtront ici");
    expect(text()).not.toContain("progression depuis");
  });

  it("records en cours de lecture : un squelette à leur place, la tête de carte est déjà là", () => {
    holder.stats = { xp: 72009, level: 1, total_actions: 0 };
    holder.strength = { isLoading: true, card: null };
    render();
    expect(text()).toContain("Sublime");
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("grade suprême : plus de cible, aucune XP restante inventée", () => {
    holder.stats = { xp: 999_999, level: 1, total_actions: 0 };
    render();
    expect(text()).toContain("Grade suprême atteint");
    expect(text()).not.toContain("XP avant");
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe(
      "100",
    );
  });
});
