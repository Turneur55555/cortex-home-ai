// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useLocalToday } from "./useLocalToday";

/**
 * « Aujourd'hui » doit suivre le calendrier. Une app laissée ouverte en salle le
 * soir et retrouvée le lendemain matin garderait sinon la veille en tête de la
 * semaine, et mettrait en avant le mauvais jour.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let renders = 0;

function Probe() {
  const today = useLocalToday();
  renders += 1;
  return <span data-testid="today">{today}</span>;
}

const shown = () => container.querySelector('[data-testid="today"]')?.textContent;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 30, 23, 59, 30)); // mercredi 30/09, 23:59:30 (heure locale)
  renders = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("useLocalToday", () => {
  it("donne la date locale du jour", () => {
    act(() => root.render(<Probe />));
    expect(shown()).toBe("2026-09-30");
  });

  it("passe au lendemain après minuit, sans aucune action de l'utilisateur", () => {
    act(() => root.render(<Probe />));
    vi.setSystemTime(new Date(2026, 9, 1, 0, 0, 5));
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(shown()).toBe("2026-10-01");
  });

  it("rattrape le jour au retour au premier plan, sans attendre le minuteur (onglet ralenti en arrière-plan)", () => {
    act(() => root.render(<Probe />));
    vi.setSystemTime(new Date(2026, 9, 2, 8, 0, 0)); // le lendemain matin
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(shown()).toBe("2026-10-02");
  });

  it("ne refait AUCUN rendu tant que le jour ne change pas", () => {
    // Départ à 10 h : `advanceTimersByTime` fait AUSSI avancer l'horloge factice,
    // donc partir de 23:59 ferait réellement changer de jour au bout de 3 minutes.
    vi.setSystemTime(new Date(2026, 8, 30, 10, 0, 0));
    act(() => root.render(<Probe />));
    const before = renders;
    act(() => {
      vi.advanceTimersByTime(60_000 * 3);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(renders).toBe(before);
    expect(shown()).toBe("2026-09-30");
  });

  it("le démontage libère le minuteur et l'écouteur : rien ne fuit", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    act(() => root.render(<Probe />));
    expect(vi.getTimerCount()).toBe(1);
    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    // Remonte une racine factice pour que le afterEach puisse la démonter sans erreur.
    root = createRoot(container);
  });
});
