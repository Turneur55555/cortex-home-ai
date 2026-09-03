// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";

/**
 * CHANTIER 4 (AMEL-04) — le point discret de conflit sur l'onglet Profil.
 * `useConflictIndicator` est mocké : ce test vérifie le RENDU (présence /
 * absence du point), pas la lecture du store partagé (couverte par
 * `hooks/useConflictIndicator.test.ts`).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const conflictCount = vi.hoisted(() => ({ current: 0 }));

vi.mock("@/hooks/useConflictIndicator", () => ({
  useConflictIndicator: () => conflictCount.current,
}));

import { BottomNav } from "./BottomNav";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  conflictCount.current = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function render() {
  const rootRoute = createRootRoute({ component: BottomNav });
  const router = createRouter({ routeTree: rootRoute, history: undefined });
  await router.load();
  await act(async () => {
    root.render(<RouterProvider router={router} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("BottomNav — indicateur discret de conflit (AMEL-04)", () => {
  it("aucun conflit → aucun point sur l'onglet Profil", async () => {
    conflictCount.current = 0;
    await render();
    expect(container.querySelector('[data-testid="nav-conflict-dot"]')).toBeNull();
  });

  it("un conflit → point visible sur l'onglet Profil", async () => {
    conflictCount.current = 1;
    await render();
    expect(container.querySelector('[data-testid="nav-conflict-dot"]')).not.toBeNull();
  });
});
