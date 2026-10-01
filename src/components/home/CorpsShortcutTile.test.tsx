// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const goalHolder = vi.hoisted(() => ({ goal: null as unknown }));

const holder = vi.hoisted(() => ({
  measures: {
    data: undefined,
    isLoading: false,
    isError: false,
  } as { data?: unknown; isLoading: boolean; isError?: boolean },
}));

vi.mock("@/hooks/use-fitness", () => ({ useBodyMeasurements: () => holder.measures }));
vi.mock("@/hooks/useLocalToday", () => ({ useLocalToday: () => "2026-10-01" }));
vi.mock("@/hooks/usePhysicalGoal", () => ({
  usePhysicalGoal: () => ({ data: goalHolder.goal, isLoading: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { CorpsShortcutTile } from "./CorpsShortcutTile";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  goalHolder.goal = null;
  holder.measures = { data: [], isLoading: false, isError: false };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const show = () => act(() => root.render(<CorpsShortcutTile />));

describe("CorpsShortcutTile", () => {
  it("mène à Corps", () => {
    show();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/corps");
  });

  it("le nom accessible du lien porte le fait affiché : aucun aria-label ne l'écrase", () => {
    goalHolder.goal = {
      goal: "fat_loss",
      startedAt: new Date(2026, 7, 13, 12).toISOString(),
      startingWeightKg: 82.6,
      targetWeightKg: 76.6,
    };
    holder.measures = { data: [{ date: "2026-09-29", weight: 78.4 }], isLoading: false };
    show();
    const link = container.querySelector("a");
    expect(link?.hasAttribute("aria-label")).toBe(false);
    expect(link?.textContent).toContain("Corps");
    expect(link?.textContent).toContain("\u22124,2 kg depuis 7 semaines");
  });

  it("sans mesure : invite à en ajouter une, n'invente aucun poids", () => {
    show();
    expect(container.textContent).toContain("Ajoute ta première mesure");
    expect(container.textContent).not.toMatch(/kg/);
  });

  it("dernier poids et sa date, en français (virgule décimale)", () => {
    holder.measures = {
      data: [
        { date: "2026-09-29", weight: 78.4 },
        { date: "2026-09-20", weight: 79.1 },
      ],
      isLoading: false,
    };
    show();
    expect(container.textContent).toContain("78,4 kg");
    expect(container.textContent).toContain("il y a 2 jours");
  });

  it("une mesure sans poids n'est pas lue comme un poids : on prend la plus récente AVEC poids", () => {
    holder.measures = {
      data: [
        { date: "2026-09-30", weight: null, body_fat: 18 },
        { date: "2026-09-27", weight: 80, body_fat: null },
      ],
      isLoading: false,
    };
    show();
    expect(container.textContent).toContain("80 kg");
    expect(container.textContent).toContain("il y a 4 jours");
  });

  it("pas de pourcentage, ni d'objectif, ni de tendance interprétée", () => {
    holder.measures = { data: [{ date: "2026-09-29", weight: 78.4 }], isLoading: false };
    show();
    expect(container.textContent).not.toMatch(/%|objectif|plateau/i);
  });

  it("en erreur (hors ligne) : ne prétend PAS qu'il n'y a aucune mesure, mène simplement à Corps", () => {
    // `useBodyMeasurements` lit le serveur : hors connexion `data` est vide, ce
    // n'est pas « première mesure ».
    holder.measures = { data: undefined, isLoading: false, isError: true };
    show();
    expect(container.textContent).toContain("Voir mes mesures");
    expect(container.textContent).not.toContain("Ajoute ta première mesure");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/corps");
  });

  it("pendant le chargement : un squelette, pas de « première mesure » trompeur", () => {
    holder.measures = { data: undefined, isLoading: true };
    show();
    expect(container.textContent).not.toContain("Ajoute ta première mesure");
  });

  describe("avec un objectif physique actif", () => {
    const goal = (over: Record<string, unknown> = {}) => ({
      goal: "fat_loss",
      startedAt: new Date(2026, 7, 13, 12).toISOString(), // 7 semaines avant le 01/10
      startingWeightKg: 82.6,
      targetWeightKg: 76.6,
      ...over,
    });

    it("l'écart au poids de départ remplace le poids brut : « −4,2 kg depuis 7 semaines »", () => {
      goalHolder.goal = goal();
      holder.measures = { data: [{ date: "2026-09-29", weight: 78.4 }], isLoading: false };
      show();
      expect(container.textContent).toContain("\u22124,2 kg depuis 7 semaines");
    });

    it("sans pesée : l'objectif ne fabrique pas d'écart, on retombe sur l'invitation", () => {
      goalHolder.goal = goal();
      holder.measures = { data: [], isLoading: false };
      show();
      expect(container.textContent).not.toContain("depuis");
      expect(container.textContent).toContain("Ajoute ta première mesure");
    });

    it("sans poids de départ : pas d'écart, le dernier poids reste affiché", () => {
      goalHolder.goal = goal({ startingWeightKg: null });
      holder.measures = { data: [{ date: "2026-09-29", weight: 78.4 }], isLoading: false };
      show();
      expect(container.textContent).toContain("78,4 kg");
      expect(container.textContent).not.toContain("depuis");
    });

    it("jamais de projection ni de pourcentage", () => {
      goalHolder.goal = goal();
      holder.measures = { data: [{ date: "2026-09-29", weight: 78.4 }], isLoading: false };
      show();
      expect(container.textContent).not.toMatch(/%|cible|restantes|estim/i);
    });
  });
});
