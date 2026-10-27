import { describe, expect, it } from "vitest";
import {
  KEYBOARD_INSET_THRESHOLD_PX,
  computeKeyboardInset,
  installKeyboardInsetVariable,
} from "./keyboardInset";

describe("computeKeyboardInset", () => {
  it("vaut 0 sans clavier", () => {
    expect(computeKeyboardInset({ layoutHeight: 874, visualHeight: 874, visualOffsetTop: 0 })).toBe(
      0,
    );
  });

  it("ignore le repli des barres de Safari (petit écart)", () => {
    expect(computeKeyboardInset({ layoutHeight: 874, visualHeight: 800, visualOffsetTop: 0 })).toBe(
      0,
    );
    expect(KEYBOARD_INSET_THRESHOLD_PX).toBeGreaterThan(874 - 800);
  });

  it("mesure le clavier de l'iPhone 17 Pro (402×874)", () => {
    // Clavier + barre de suggestions ≈ 336 pt.
    expect(computeKeyboardInset({ layoutHeight: 874, visualHeight: 538, visualOffsetTop: 0 })).toBe(
      336,
    );
  });

  it("tient compte du défilement du visual viewport", () => {
    expect(
      computeKeyboardInset({ layoutHeight: 874, visualHeight: 538, visualOffsetTop: 200 }),
    ).toBe(136);
    expect(
      computeKeyboardInset({ layoutHeight: 874, visualHeight: 538, visualOffsetTop: 300 }),
    ).toBe(0);
  });

  it("résiste aux valeurs invalides", () => {
    expect(
      computeKeyboardInset({ layoutHeight: Number.NaN, visualHeight: 538, visualOffsetTop: 0 }),
    ).toBe(0);
  });
});

describe("installKeyboardInsetVariable", () => {
  it("ne fait rien sans visualViewport", () => {
    const fakeWindow = { visualViewport: null } as unknown as Window;
    expect(() => installKeyboardInsetVariable(fakeWindow)()).not.toThrow();
  });

  it("publie puis retire la variable CSS", () => {
    const listeners = new Map<string, () => void>();
    const props = new Map<string, string>();
    const fakeWindow = {
      innerHeight: 874,
      visualViewport: {
        height: 538,
        offsetTop: 0,
        addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
        removeEventListener: (type: string) => listeners.delete(type),
      },
      document: {
        documentElement: {
          style: {
            setProperty: (k: string, v: string) => props.set(k, v),
            removeProperty: (k: string) => props.delete(k),
          },
        },
      },
      requestAnimationFrame: (fn: () => void) => {
        fn();
        return 1;
      },
      cancelAnimationFrame: () => {},
    } as unknown as Window;

    const cleanup = installKeyboardInsetVariable(fakeWindow);
    expect(props.get("--keyboard-inset")).toBe("336px");
    expect(listeners.has("resize")).toBe(true);

    cleanup();
    expect(props.has("--keyboard-inset")).toBe(false);
    expect(listeners.size).toBe(0);
  });
});
