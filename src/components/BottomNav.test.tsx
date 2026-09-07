// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";

/**
 * CHANTIER 4 (AMEL-04), étendu par le CHANTIER FINAL (AUD-05) — le point
 * discret sur l'onglet Profil. `useSyncAttentionIndicator` est mocké : ce
 * test vérifie le RENDU (présence / absence du point, et le texte que
 * l'assistance vocale annonce), pas la lecture du store partagé (couverte
 * par `hooks/useSyncAttentionIndicator.test.ts`).
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const attention = vi.hoisted(() => ({ current: { conflictCount: 0, blockedCount: 0, total: 0 } }));

vi.mock("@/hooks/useSyncAttentionIndicator", () => ({
  useSyncAttentionIndicator: () => attention.current,
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
  attention.current = { conflictCount: 0, blockedCount: 0, total: 0 };
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

describe("BottomNav — signal discret « une décision vous attend » (AMEL-04 / AUD-05)", () => {
  it("rien à arbitrer → aucun point sur l'onglet Profil", async () => {
    attention.current = { conflictCount: 0, blockedCount: 0, total: 0 };
    await render();
    expect(container.querySelector('[data-testid="nav-attention-dot"]')).toBeNull();
  });

  it("un conflit → point visible sur l'onglet Profil", async () => {
    attention.current = { conflictCount: 1, blockedCount: 0, total: 1 };
    await render();
    expect(container.querySelector('[data-testid="nav-attention-dot"]')).not.toBeNull();
  });

  it("AUD-05 — une opération BLOQUÉE (sans aucun conflit) allume le point", async () => {
    attention.current = { conflictCount: 0, blockedCount: 1, total: 1 };
    await render();
    expect(container.querySelector('[data-testid="nav-attention-dot"]')).not.toBeNull();
  });

  it("AUD-05 — le point porte un texte annonçable, jamais un signal muet", async () => {
    attention.current = { conflictCount: 0, blockedCount: 2, total: 2 };
    await render();
    const label = container.querySelector(".sr-only");
    expect(label?.textContent).toBe("Synchronisation : 2 actions nécessitent votre attention.");
  });

  it("AUD-05 — le signal est porté par l'onglet Profil, et par lui seul", async () => {
    attention.current = { conflictCount: 1, blockedCount: 1, total: 2 };
    await render();
    const profil = container.querySelector('[data-testid="nav-profil"]');
    expect(profil?.querySelector('[data-testid="nav-attention-dot"]')).not.toBeNull();
    // Aucune autre entrée de la barre ne porte le signal : la
    // synchronisation ne s'impose jamais par-dessus l'écran courant.
    expect(container.querySelectorAll('[data-testid="nav-attention-dot"]')).toHaveLength(1);
  });
});
