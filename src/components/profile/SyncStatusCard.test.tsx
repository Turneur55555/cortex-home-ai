// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { OfflineSyncState } from "@/hooks/useOfflineSync";
import type { SyncOperation } from "@/lib/offline/types";

/**
 * Bloc « Synchronisation » du Profil (audit UI du 01/09/2026).
 *
 * Ce que ces tests verrouillent :
 * - une action utilisateur n'ouvre PLUS le grand panneau — il n'apparaît que
 *   sur un clic explicite dans le Profil (TEST UI 1 / 4) ;
 * - le compteur et les états reflètent la file réelle (TEST UI 3 / 5) ;
 * - « Réessayer » et « Retirer de la file » du panneau détaillé continuent
 *   d'appeler le hook existant (TEST UI 6 / 7) — aucune fonctionnalité du
 *   panneau n'a été retirée, seul son déclenchement a changé.
 *
 * Rendu sans `@testing-library/react` (absent du projet) : `react-dom/client`
 * + `act` suffisent ici et n'ajoutent aucune dépendance.
 */

// React 19 : sans ce drapeau, `act()` avertit à chaque rendu.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const syncState = vi.hoisted(() => ({ current: null as OfflineSyncState | null }));

vi.mock("@/hooks/useOfflineSync", () => ({
  useOfflineSync: () => syncState.current,
}));

import { SyncStatusCard } from "./SyncStatusCard";

function makeOperation(overrides: Partial<SyncOperation> = {}): SyncOperation {
  return {
    id: "op-1",
    userId: "user-1",
    table: "exercises",
    recordLocalId: "ex-1",
    opType: "update",
    payload: { name: "Développé couché" },
    baseUpdatedAt: "2026-09-01T06:00:00.000Z",
    createdAt: "2026-09-01T06:01:00.000Z",
    status: "pending",
    retryCount: 0,
    lastError: null,
    lastErrorCode: null,
    lastAttemptAt: null,
    ...overrides,
  };
}

function makeSyncState(overrides: Partial<OfflineSyncState> = {}): OfflineSyncState {
  return {
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    blockedCount: 0,
    operations: [],
    conflicts: [],
    syncNow: vi.fn().mockResolvedValue(undefined),
    resolveConflict: vi.fn().mockResolvedValue(undefined),
    retryOperation: vi.fn().mockResolvedValue(undefined),
    discardOperation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // Radix (Dialog / AlertDialog) s'appuie sur ces API absentes de jsdom.
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

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

function render(state: OfflineSyncState) {
  syncState.current = state;
  act(() => {
    root.render(<SyncStatusCard />);
  });
}

/** Le panneau détaillé est porté par un portail Radix : on cherche dans tout
 *  le document, jamais seulement dans le conteneur de rendu. */
function findByText(text: string | RegExp): HTMLElement | undefined {
  const matches = (value: string) =>
    typeof text === "string" ? value.includes(text) : text.test(value);
  return Array.from(document.body.querySelectorAll<HTMLElement>("*")).find(
    (el) => el.children.length === 0 && matches(el.textContent ?? ""),
  );
}

function findButton(label: string | RegExp): HTMLButtonElement {
  const matches = (value: string) =>
    typeof label === "string" ? value.includes(label) : label.test(value);
  const button = Array.from(document.body.querySelectorAll("button")).find((el) =>
    matches(el.textContent ?? ""),
  );
  if (!button) throw new Error(`Bouton introuvable : ${label}`);
  return button;
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

/** Le grand panneau est-il ouvert ? (Radix Dialog → `role="dialog"`) */
function sheetIsOpen(): boolean {
  return document.body.querySelector('[role="dialog"]') !== null;
}

describe("SyncStatusCard — bloc Synchronisation du Profil", () => {
  it("TEST UI 2 — le bloc s'affiche avec l'état courant de la file", () => {
    render(makeSyncState());
    expect(container.textContent).toContain("Synchronisé");
    expect(container.textContent).toContain("Voir les détails");
  });

  it("TEST UI 1 — des actions en attente n'ouvrent PAS le grand panneau", () => {
    render(
      makeSyncState({
        pendingCount: 3,
        operations: [
          makeOperation({ id: "op-1" }),
          makeOperation({ id: "op-2" }),
          makeOperation({ id: "op-3" }),
        ],
      }),
    );

    // Le bloc informe…
    expect(container.textContent).toContain("3 actions en attente");
    // …mais rien ne s'ouvre par-dessus l'écran.
    expect(sheetIsOpen()).toBe(false);
  });

  it("TEST UI 1 bis — même un état d'attention n'ouvre rien tout seul", () => {
    render(
      makeSyncState({
        blockedCount: 1,
        operations: [makeOperation({ status: "blocked", lastError: "colonne inconnue" })],
      }),
    );
    expect(sheetIsOpen()).toBe(false);
  });

  it("TEST UI 3 — le compteur reflète le nombre réel d'opérations en attente", () => {
    render(makeSyncState({ pendingCount: 1, operations: [makeOperation()] }));
    expect(container.textContent).toContain("1 action en attente");

    act(() => root.unmount());
    root = createRoot(container);
    render(
      makeSyncState({
        pendingCount: 5,
        operations: Array.from({ length: 5 }, (_, i) => makeOperation({ id: `op-${i}` })),
      }),
    );
    expect(container.textContent).toContain("5 actions en attente");
  });

  it("TEST UI 5 — une opération bloquée produit l'état d'attention", () => {
    render(
      makeSyncState({
        blockedCount: 1,
        operations: [
          makeOperation({
            status: "blocked",
            lastError: "Could not find the 'foo' column | code=PGRST204",
            lastErrorCode: "PGRST204",
          }),
        ],
      }),
    );
    expect(container.textContent).toContain("1 action nécessite votre attention");
    expect(container.querySelector('[data-testid="sync-attention-dot"]')).not.toBeNull();
  });

  it("TEST UI 4 — le clic sur le bloc ouvre le panneau détaillé existant", () => {
    render(makeSyncState({ pendingCount: 1, operations: [makeOperation()] }));
    expect(sheetIsOpen()).toBe(false);

    click(findButton("Voir les détails"));

    expect(sheetIsOpen()).toBe(true);
    // Le panneau existant, intact : titre, liste des opérations, pied de file.
    expect(document.body.textContent).toContain("Synchronisation");
    expect(document.body.textContent).toContain("Modification · Exercises");
    expect(document.body.textContent).toContain("1 action en attente");
  });

  it("TEST UI 6 — « Réessayer quand même » appelle toujours retryOperation", () => {
    const state = makeSyncState({
      blockedCount: 1,
      operations: [
        makeOperation({
          id: "op-bloquee",
          status: "blocked",
          lastError: "Could not find the 'foo' column | code=PGRST204",
          lastErrorCode: "PGRST204",
        }),
      ],
    });
    render(state);
    click(findButton("Voir les détails"));

    click(findButton("Réessayer quand même"));
    expect(state.retryOperation).toHaveBeenCalledWith("op-bloquee");
  });

  it("TEST UI 6 bis — le bouton « Réessayer » du pied de panneau appelle syncNow", () => {
    const state = makeSyncState({ pendingCount: 1, operations: [makeOperation()] });
    render(state);
    click(findButton("Voir les détails"));

    click(findButton(/^Réessayer$/));
    expect(state.syncNow).toHaveBeenCalled();
  });

  it("TEST UI 7 — « Retirer de la file » appelle toujours discardOperation après confirmation", () => {
    const state = makeSyncState({
      blockedCount: 1,
      operations: [
        makeOperation({
          id: "op-a-retirer",
          status: "blocked",
          lastError: "Could not find the 'foo' column | code=PGRST204",
          lastErrorCode: "PGRST204",
        }),
      ],
    });
    render(state);
    click(findButton("Voir les détails"));

    // 1er clic : ouvre la confirmation, ne retire rien.
    click(findButton("Retirer de la file"));
    expect(state.discardOperation).not.toHaveBeenCalled();
    expect(findByText("Retirer cette action de la file ?")).toBeDefined();

    // Confirmation explicite dans la boîte de dialogue.
    const confirm = Array.from(document.body.querySelectorAll("button")).filter((el) =>
      (el.textContent ?? "").includes("Retirer de la file"),
    );
    click(confirm[confirm.length - 1]);
    expect(state.discardOperation).toHaveBeenCalledWith("op-a-retirer");
  });
});
