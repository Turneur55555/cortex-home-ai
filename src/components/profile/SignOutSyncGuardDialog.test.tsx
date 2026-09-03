// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { OfflineSignOutSummary } from "@/lib/offline/signOutGuard";

/**
 * CHANTIER 4 (MAJ-04) — dialogue de confirmation de déconnexion.
 *
 * Couvre : résumé affiché, « Synchroniser d'abord » appelle bien le callback
 * fourni (pas un second moteur), « Se déconnecter quand même » exige une
 * confirmation explicite AVANT tout appel à `onSignOutAnyway` (jamais de
 * purge sur le premier clic), et « Annuler » ne déclenche aucune purge.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { SignOutSyncGuardDialog } from "./SignOutSyncGuardDialog";

function makeSummary(overrides: Partial<OfflineSignOutSummary> = {}): OfflineSignOutSummary {
  return {
    pendingCount: 0,
    failedCount: 0,
    blockedCount: 0,
    conflictCount: 0,
    ...overrides,
  };
}

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

function render(props: {
  summary: OfflineSignOutSummary;
  busy?: boolean;
  onSyncFirst?: () => void;
  onSignOutAnyway?: () => void;
  onCancel?: () => void;
}) {
  act(() => {
    root.render(
      <SignOutSyncGuardDialog
        summary={props.summary}
        busy={props.busy ?? false}
        onSyncFirst={props.onSyncFirst ?? (() => {})}
        onSignOutAnyway={props.onSignOutAnyway ?? (() => {})}
        onCancel={props.onCancel ?? (() => {})}
      />,
    );
  });
}

describe("SignOutSyncGuardDialog", () => {
  it("affiche un résumé de ce qui n'est pas résolu", () => {
    render({
      summary: makeSummary({ pendingCount: 2, blockedCount: 1, conflictCount: 1 }),
    });
    expect(document.body.textContent).toContain("2 actions en attente d'envoi");
    expect(document.body.textContent).toContain("1 action bloquée");
    expect(document.body.textContent).toContain("1 conflit à résoudre");
  });

  it("« Synchroniser d'abord » appelle le callback fourni, sans purge immédiate", () => {
    const onSyncFirst = vi.fn();
    const onSignOutAnyway = vi.fn();
    render({ summary: makeSummary({ pendingCount: 1 }), onSyncFirst, onSignOutAnyway });

    click(findButton("Synchroniser d'abord"));

    expect(onSyncFirst).toHaveBeenCalledTimes(1);
    expect(onSignOutAnyway).not.toHaveBeenCalled();
  });

  it("« Se déconnecter quand même » exige une confirmation explicite avant la purge", () => {
    const onSignOutAnyway = vi.fn();
    render({ summary: makeSummary({ pendingCount: 1 }), onSignOutAnyway });

    click(findButton("Se déconnecter quand même"));
    // Premier clic : pas encore de purge, seulement la confirmation qui s'ouvre.
    expect(onSignOutAnyway).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("irréversible");

    click(findButton("Se déconnecter et perdre ces données"));
    expect(onSignOutAnyway).toHaveBeenCalledTimes(1);
  });

  it("« Annuler » sur la confirmation revient à l'étape précédente sans purger", () => {
    const onSignOutAnyway = vi.fn();
    const onCancel = vi.fn();
    render({ summary: makeSummary({ pendingCount: 1 }), onSignOutAnyway, onCancel });

    click(findButton("Se déconnecter quand même"));
    click(findButton(/^Annuler$/));

    expect(onSignOutAnyway).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    // Retour à l'étape 1 : le bouton de synchronisation est de nouveau visible.
    expect(() => findButton("Synchroniser d'abord")).not.toThrow();
  });

  it("« Annuler » de l'étape initiale ferme le dialogue sans purge", () => {
    const onCancel = vi.fn();
    const onSignOutAnyway = vi.fn();
    render({ summary: makeSummary({ pendingCount: 1 }), onCancel, onSignOutAnyway });

    click(findButton(/^Annuler$/));

    expect(onSignOutAnyway).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("busy désactive « Synchroniser d'abord » et « Se déconnecter quand même »", () => {
    render({ summary: makeSummary({ pendingCount: 1 }), busy: true });
    expect(findButton("Synchroniser d'abord").disabled).toBe(true);
    expect(findButton("Se déconnecter quand même").disabled).toBe(true);
  });
});
