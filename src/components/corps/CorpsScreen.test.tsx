// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({ goal: { data: null as unknown, isLoading: false } }));

vi.mock("@/hooks/usePhysicalGoal", () => ({ usePhysicalGoal: () => holder.goal }));
vi.mock("@/routes/_authenticated/fitness/CorpsTab", () => ({
  CorpsTab: () => <div data-testid="tab-mesures" />,
}));
vi.mock("@/components/corps/SanteView", () => ({
  SanteView: ({ part }: { part: string }) => <div data-testid={`tab-${part}`} />,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    replace,
    children,
    ...rest
  }: {
    to: string;
    search?: { onglet: string };
    replace?: boolean;
    children: React.ReactNode;
  }) => (
    <a href={`${to}?onglet=${search?.onglet}`} data-replace={String(replace === true)} {...rest}>
      {children}
    </a>
  ),
}));

import { CorpsScreen } from "./CorpsScreen";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  holder.goal = { data: null, isLoading: false };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const show = (onglet: Parameters<typeof CorpsScreen>[0]["onglet"]) =>
  act(() => root.render(<CorpsScreen onglet={onglet} />));
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);
const links = () => Array.from(container.querySelectorAll("nav a"));

describe("CorpsScreen — Objectif | Mesures | Santé", () => {
  it("trois onglets, des LIENS vers /corps?onglet=, qui REMPLACENT l'historique", () => {
    show("mesures");
    expect(
      links().map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("data-replace")]),
    ).toEqual([
      ["Objectif", "/corps?onglet=objectif", "true"],
      ["Mesures", "/corps?onglet=mesures", "true"],
      ["Santé", "/corps?onglet=sante", "true"],
    ]);
  });

  it.each([
    ["objectif", "tab-objectif"],
    ["mesures", "tab-mesures"],
    ["sante", "tab-sante"],
  ] as const)("l'onglet %s affiche son contenu, et lui seul", (onglet, shown) => {
    show(onglet);
    for (const id of ["tab-objectif", "tab-mesures", "tab-sante"]) {
      expect(q(id) !== null, id).toBe(id === shown);
    }
  });

  it("l'onglet courant porte aria-current, les autres jamais", () => {
    show("sante");
    expect(links().map((a) => a.getAttribute("aria-current"))).toEqual([null, null, "page"]);
  });

  it("sans onglet demandé et SANS objectif : Mesures", () => {
    show(undefined);
    expect(q("tab-mesures")).not.toBeNull();
  });

  it("sans onglet demandé et AVEC un objectif actif : Objectif", () => {
    holder.goal = { data: { id: "g1" }, isLoading: false };
    show(undefined);
    expect(q("tab-objectif")).not.toBeNull();
  });

  it("un onglet demandé l'emporte même avec un objectif actif", () => {
    holder.goal = { data: { id: "g1" }, isLoading: false };
    show("mesures");
    expect(q("tab-mesures")).not.toBeNull();
  });

  it("sans onglet demandé, l'objectif encore en chargement : un squelette — pas de « Mesures » qui clignote", () => {
    holder.goal = { data: undefined, isLoading: true };
    show(undefined);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(q("tab-mesures")).toBeNull();
    expect(q("tab-objectif")).toBeNull();
    expect(links().every((a) => a.getAttribute("aria-current") === null)).toBe(true);
  });

  it("onglet demandé et objectif en chargement : aucune attente, l'onglet s'affiche", () => {
    holder.goal = { data: undefined, isLoading: true };
    show("sante");
    expect(q("tab-sante")).not.toBeNull();
  });
});
