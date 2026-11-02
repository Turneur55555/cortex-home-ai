// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DeferredPart } from "./DeferredPart";
import { lazyWithPreload, preloadWhenIdle } from "./lazyWithPreload";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const Chart = () => <p>graphique</p>;

describe("lazyWithPreload", () => {
  it("un échec de chargement n'est pas mémorisé : l'essai suivant recharge", async () => {
    const factory = vi
      .fn<() => Promise<{ default: typeof Chart }>>()
      .mockRejectedValueOnce(new Error("Failed to fetch dynamically imported module"))
      .mockResolvedValueOnce({ default: Chart });
    const Lazy = lazyWithPreload(factory);
    await expect(Lazy.preload()).rejects.toThrow();
    await expect(Lazy.preload()).resolves.toEqual({ default: Chart });
    // Une fois chargé, plus aucun nouvel appel.
    await Lazy.preload();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("preloadWhenIdle lance chaque chargement une fois, et l'annulation l'empêche", () => {
    vi.useFakeTimers();
    const a = vi.fn(async () => undefined);
    const cancel = preloadWhenIdle([a]);
    cancel();
    vi.advanceTimersByTime(5000);
    expect(a).not.toHaveBeenCalled();

    preloadWhenIdle([a]);
    vi.advanceTimersByTime(5000);
    expect(a).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("DeferredPart", () => {
  it("affiche le morceau une fois chargé", async () => {
    const Lazy = lazyWithPreload(async () => ({ default: Chart }));
    await act(async () => {
      root.render(
        <DeferredPart fallback={<span>chargement</span>}>
          <Lazy />
        </DeferredPart>,
      );
    });
    expect(container.textContent).toBe("graphique");
  });

  it("hors connexion (chargement impossible) : repli LOCAL, le reste de l'écran survit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Lazy = lazyWithPreload<typeof Chart>(async () => {
      throw new Error("Failed to fetch dynamically imported module");
    });
    await act(async () => {
      root.render(
        <div>
          <h1>Séance</h1>
          <DeferredPart>
            <Lazy />
          </DeferredPart>
        </div>,
      );
    });
    expect(container.querySelector("h1")?.textContent).toBe("Séance");
    expect(container.textContent).toContain("Indisponible pour l'instant");
  });
});
