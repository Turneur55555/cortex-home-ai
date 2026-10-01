// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({
  measures: { data: undefined as unknown, isLoading: false, isError: false } as {
    data?: unknown;
    isLoading: boolean;
    isError?: boolean;
  },
  goal: null as unknown,
}));

vi.mock("@/hooks/use-fitness", () => ({ useBodyMeasurements: () => holder.measures }));
vi.mock("@/hooks/useLocalToday", () => ({ useLocalToday: () => "2026-10-01" }));
vi.mock("@/hooks/usePhysicalGoal", () => ({
  usePhysicalGoal: () => ({ data: holder.goal, isLoading: false }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

import { BodyStatusCard } from "./BodyStatusCard";

const goal = (over: Record<string, unknown> = {}) => ({
  goal: "fat_loss",
  startedAt: new Date(2026, 7, 13, 12).toISOString(), // 7 semaines avant le 01/10/2026
  startingWeightKg: 82.6,
  targetWeightKg: 76.6,
  ...over,
});
const weights = (...rows: Array<[string, number | null]>) =>
  rows.map(([date, weight]) => ({ date, weight }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  holder.measures = { data: [], isLoading: false, isError: false };
  holder.goal = null;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const show = () => act(() => root.render(<BodyStatusCard />));
const text = () => container.textContent ?? "";
const bar = () => container.querySelector('[role="progressbar"]');

describe("BodyStatusCard — la porte unique de Corps, dans Profil", () => {
  it("mène à Corps", () => {
    show();
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/corps");
  });

  describe("avec un objectif physique actif : il passe EN TÊTE", () => {
    beforeEach(() => {
      holder.goal = goal();
      holder.measures = {
        data: weights(["2026-09-26", 78.4], ["2026-09-19", 79]),
        isLoading: false,
        isError: false,
      };
    });

    it("libellé, ancienneté, écart au départ, écart visé", () => {
      show();
      expect(text()).toContain("Perte de gras · depuis 7 semaines");
      expect(text()).toContain("−4,2");
      expect(text()).toContain("sur −6 kg");
    });

    it("la barre dit la part du chemin parcourue (70 %), accessiblement", () => {
      show();
      expect(bar()?.getAttribute("aria-valuenow")).toBe("70");
      expect((bar()?.firstElementChild as HTMLElement).style.width).toBe("70%");
    });

    it("le dernier poids et la date de la pesée, en français", () => {
      show();
      expect(text()).toContain("78,4 kg · pesée il y a 5 jours");
    });

    it("jamais de projection : ni « dans la cible », ni durée restante, ni estimation", () => {
      show();
      expect(text()).not.toMatch(/cible|restantes|estim|conforme|avance/i);
    });

    it("pas de poids de départ : l'écart est « — » et il n'y a PAS de barre", () => {
      holder.goal = goal({ startingWeightKg: null });
      show();
      expect(bar()).toBeNull();
      expect(text()).toContain("—");
    });

    it("pas de cible : l'écart au départ est lu, pas de barre, pas de « sur … »", () => {
      holder.goal = goal({ targetWeightKg: null });
      show();
      expect(text()).toContain("−4,2");
      expect(bar()).toBeNull();
      expect(text()).not.toContain("sur ");
    });

    it("objectif de maintien : jamais de barre (aucun trajet à parcourir)", () => {
      holder.goal = goal({ goal: "maintenance", targetWeightKg: 80 });
      show();
      expect(text()).toContain("Maintien · depuis 7 semaines");
      expect(bar()).toBeNull();
    });

    it("aucune pesée : on invite à en ajouter une, sans écart inventé", () => {
      holder.measures = { data: [], isLoading: false, isError: false };
      show();
      expect(text()).toContain("Ajoute ta première pesée dans Corps");
      expect(bar()).toBeNull();
    });

    it("en erreur (hors ligne) : on garde l'objectif, on n'invente aucune pesée", () => {
      holder.measures = { data: undefined, isLoading: false, isError: true };
      show();
      expect(text()).toContain("Perte de gras · depuis 7 semaines");
      expect(text()).toContain("Voir mes mesures");
      expect(bar()).toBeNull();
      expect(text()).not.toContain("Ajoute ta première");
    });

    it("pendant le chargement : un squelette", () => {
      holder.measures = { data: undefined, isLoading: true, isError: false };
      show();
      expect(text()).not.toContain("Perte de gras");
    });
  });

  describe("sans objectif : la carte d'avant, inchangée", () => {
    it("le poids, sa variation et la date de mise à jour", () => {
      holder.measures = {
        data: weights(["2026-09-29", 78.1], ["2026-09-20", 78.4]),
        isLoading: false,
        isError: false,
      };
      show();
      expect(text()).toContain("78.1 kg");
      expect(text()).toContain("-0.3 kg");
      expect(text()).toContain("Mise à jour il y a 2 jours");
    });

    it("aucune mesure : l'invitation", () => {
      show();
      expect(text()).toContain("Aucune mesure enregistrée");
      expect(text()).toContain("Ajoute ta première mesure dans Corps");
    });

    it("en erreur (hors ligne) : ne prétend PAS qu'il n'y a aucune mesure", () => {
      holder.measures = { data: undefined, isLoading: false, isError: true };
      show();
      expect(text()).not.toContain("Aucune mesure enregistrée");
      expect(text()).toContain("Voir mes mesures");
    });
  });
});
