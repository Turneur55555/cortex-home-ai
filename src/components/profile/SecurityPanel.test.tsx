// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { OfflineSignOutSummary } from "@/lib/offline/signOutGuard";

/**
 * CHANTIER 4 (MAJ-04) — flux de déconnexion sécurisé (bouton du Profil).
 *
 * `signOutGuard` (la logique de garde) et `signOut` (l'appel réel, qui purge
 * `syncQueue`/`conflicts`) sont mockés ici : ce test vérifie l'ORCHESTRATION
 * du bouton — quand `signOut()` part directement, quand il attend une
 * confirmation, et qu'il ne part JAMAIS avant que l'utilisateur ait tranché.
 * La logique de garde elle-même (classification, réutilisation du moteur) est
 * couverte par `lib/offline/signOutGuard.test.ts`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY: OfflineSignOutSummary = {
  pendingCount: 0,
  failedCount: 0,
  blockedCount: 0,
  conflictCount: 0,
};

const mocks = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue(undefined),
  navigate: vi.fn(),
  getOfflineSignOutSummary: vi.fn(),
  attemptSyncBeforeSignOut: vi.fn(),
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "a@b.fr" },
    signOut: mocks.signOut,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    cancelQueries: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { updateUser: vi.fn() } },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/offline/signOutGuard", async () => {
  const actual = await vi.importActual<typeof import("@/lib/offline/signOutGuard")>(
    "@/lib/offline/signOutGuard",
  );
  return {
    ...actual,
    getOfflineSignOutSummary: mocks.getOfflineSignOutSummary,
    attemptSyncBeforeSignOut: mocks.attemptSyncBeforeSignOut,
  };
});

import { SecurityPanel } from "./SecurityPanel";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};

  vi.clearAllMocks();
  mocks.getOfflineSignOutSummary.mockResolvedValue(EMPTY);
  mocks.attemptSyncBeforeSignOut.mockResolvedValue(EMPTY);

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

function findButton(label: string | RegExp): HTMLButtonElement {
  const matches = (value: string) =>
    typeof label === "string" ? value.includes(label) : label.test(value);
  const button = Array.from(document.body.querySelectorAll("button")).find((el) =>
    matches(el.textContent ?? ""),
  );
  if (!button) throw new Error(`Bouton introuvable : ${label}`);
  return button;
}

function clickSignOutEntry() {
  act(() => {
    findButton("Se déconnecter").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function render() {
  act(() => {
    root.render(<SecurityPanel />);
  });
}

function dialogOpen(): boolean {
  return document.body.textContent?.includes("Des modifications ne sont pas encore") ?? false;
}

describe("SecurityPanel — déconnexion sécurisée (MAJ-04)", () => {
  it("cas 1 — aucune opération en attente → déconnexion immédiate", async () => {
    mocks.getOfflineSignOutSummary.mockResolvedValue(EMPTY);
    render();
    clickSignOutEntry();
    await flush();

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/login", replace: true });
    expect(dialogOpen()).toBe(false);
  });

  it("cas — pending > 0 → avertissement, pas de déconnexion immédiate", async () => {
    mocks.getOfflineSignOutSummary.mockResolvedValue({ ...EMPTY, pendingCount: 2 });
    render();
    clickSignOutEntry();
    await flush();

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(true);
    expect(document.body.textContent).toContain("2 actions en attente d'envoi");
  });

  it("cas — failed > 0 → avertissement", async () => {
    mocks.getOfflineSignOutSummary.mockResolvedValue({ ...EMPTY, failedCount: 1 });
    render();
    clickSignOutEntry();
    await flush();

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(true);
  });

  it("cas — blocked > 0 → avertissement", async () => {
    mocks.getOfflineSignOutSummary.mockResolvedValue({ ...EMPTY, blockedCount: 1 });
    render();
    clickSignOutEntry();
    await flush();

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(true);
  });

  it("cas — conflit > 0 → avertissement", async () => {
    mocks.getOfflineSignOutSummary.mockResolvedValue({ ...EMPTY, conflictCount: 1 });
    render();
    clickSignOutEntry();
    await flush();

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(true);
  });

  it("« Synchroniser d'abord » réussi → la déconnexion se termine", async () => {
    mocks.getOfflineSignOutSummary.mockResolvedValue({ ...EMPTY, pendingCount: 1 });
    mocks.attemptSyncBeforeSignOut.mockResolvedValue(EMPTY);
    render();
    clickSignOutEntry();
    await flush();

    click(findButton("Synchroniser d'abord"));
    await flush();

    expect(mocks.attemptSyncBeforeSignOut).toHaveBeenCalledWith("user-1");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(dialogOpen()).toBe(false);
  });

  it("« Synchroniser d'abord » laisse une opération → reste connecté", async () => {
    mocks.getOfflineSignOutSummary.mockResolvedValue({ ...EMPTY, pendingCount: 1 });
    mocks.attemptSyncBeforeSignOut.mockResolvedValue({ ...EMPTY, blockedCount: 1 });
    render();
    clickSignOutEntry();
    await flush();

    click(findButton("Synchroniser d'abord"));
    await flush();

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(true);
    expect(document.body.textContent).toContain("1 action bloquée");
  });

  it("« Se déconnecter quand même » exige une confirmation explicite puis purge (signOut réel)", async () => {
    mocks.getOfflineSignOutSummary.mockResolvedValue({ ...EMPTY, pendingCount: 1 });
    render();
    clickSignOutEntry();
    await flush();

    click(findButton("Se déconnecter quand même"));
    expect(mocks.signOut).not.toHaveBeenCalled();

    click(findButton("Se déconnecter et perdre ces données"));
    await flush();

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/login", replace: true });
  });

  it("« Annuler » ne déconnecte jamais", async () => {
    mocks.getOfflineSignOutSummary.mockResolvedValue({ ...EMPTY, pendingCount: 1 });
    render();
    clickSignOutEntry();
    await flush();

    click(findButton(/^Annuler$/));
    await flush();

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(dialogOpen()).toBe(false);
  });
});
