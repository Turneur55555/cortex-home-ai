// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { WeeklyReport } from "@/lib/fitness/weeklyReport";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const stats = vi.hoisted(() => ({ value: { data: undefined as { xp: number } | undefined } }));
const run = vi.hoisted(() => vi.fn());
const busy = vi.hoisted(() => ({ value: null as null | "share" | "download" }));

vi.mock("@/hooks/useUserStats", () => ({ useUserStats: () => stats.value }));
vi.mock("@/components/share/useShareImage", () => ({
  useShareImage: () => ({ exportRef: { current: null }, busy: busy.value, run }),
}));

import { WeekShare } from "./WeekShare";

const REPORT: WeeklyReport = {
  weekStart: "2026-09-21",
  weekEnd: "2026-09-27",
  weekNumber: 39,
  label: "Semaine 39 · 21 → 27 septembre",
  headline: "Ta meilleure semaine",
  sessions: 5,
  plannedSessions: null,
  plannedDone: null,
  sets: 68,
  volumeKg: 18420,
  minutes: null,
  previousVolumeKg: null,
  volumeDeltaPercent: null,
  records: [],
  sentence: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  stats.value = { data: undefined };
  busy.value = null;
  run.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const show = () => act(() => root.render(<WeekShare report={REPORT} />));
const button = () => container.querySelector("button") as HTMLButtonElement;
// Le nœud d'export est hors écran et masqué (aria-hidden) : c'est lui qui est capturé.
const exported = () => container.querySelector('div[aria-hidden="true"]') as HTMLElement;

describe("WeekShare — « Partager ma semaine »", () => {
  it("le bouton est nommé, et lance la capture avec le texte et les dimensions 9:16", () => {
    show();
    expect(button().textContent).toContain("Partager ma semaine");
    act(() => button().click());
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({
      title: "Ma semaine 39 — Cortex",
      text: "5 séances · 68 séries · 18\u00a0420 kg",
      filename: "cortex-semaine-2026-09-21.png",
      width: 540,
      height: 960,
    });
  });

  it("le nœud d'export porte la carte de la semaine et la signature « Cortex »", () => {
    show();
    expect(exported().textContent).toContain("Ta meilleure semaine");
    expect(exported().textContent).toContain("Cortex");
  });

  describe("le rang de la signature n'est jamais inventé", () => {
    it("XP inconnue (chargement, erreur) : mot-marque seul, aucun rang affiché", () => {
      stats.value = { data: undefined };
      show();
      expect(exported().textContent).not.toContain("Mortel");
      // Ni médaillon, ni image de rang : le pied de carte n'a que le mot-marque.
      expect(exported().querySelector("img")).toBeNull();
    });

    it("XP connue : le Titre et le grade du joueur, avec son médaillon", () => {
      stats.value = { data: { xp: 0 } };
      show();
      expect(exported().querySelectorAll("img").length).toBeGreaterThanOrEqual(1);
      expect(exported().textContent).toMatch(/Mortel\s·/);
    });

    it("une XP plus haute change le Titre imprimé", () => {
      stats.value = { data: { xp: 0 } };
      show();
      const low = exported().textContent;
      stats.value = { data: { xp: 400000 } };
      show();
      expect(exported().textContent).not.toBe(low);
    });
  });

  it("pendant la capture : bouton désactivé et occupé — pas de double partage", () => {
    busy.value = "share";
    show();
    expect(button().disabled).toBe(true);
    expect(button().getAttribute("aria-busy")).toBe("true");
  });

  it("au repos : bouton actif", () => {
    show();
    expect(button().disabled).toBe(false);
    expect(button().getAttribute("aria-busy")).toBe("false");
  });
});
