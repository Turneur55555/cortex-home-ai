// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({
  measures: {
    data: undefined,
    isLoading: false,
    isError: false,
  } as { data?: unknown; isLoading: boolean; isError?: boolean },
}));

vi.mock("@/hooks/use-fitness", () => ({ useBodyMeasurements: () => holder.measures }));
vi.mock("@/hooks/useLocalToday", () => ({ useLocalToday: () => "2026-10-01" }));
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
});
