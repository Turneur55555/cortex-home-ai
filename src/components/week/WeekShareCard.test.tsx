// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { WeeklyReport } from "@/lib/fitness/weeklyReport";
import { WeekShareCard } from "./WeekShareCard";

/**
 * La carte partageable d'une semaine : que des faits du bilan. Chaque bloc n'apparaît que si son fait
 * existe — ce qui part sur les réseaux ne doit jamais contenir un « 0 kg » ou un « +0 % » inventé.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeReport(over: Partial<WeeklyReport> = {}): WeeklyReport {
  return {
    weekStart: "2026-09-21",
    weekEnd: "2026-09-27",
    weekNumber: 39,
    label: "Semaine 39 · 21 → 27 septembre",
    headline: "Ta meilleure semaine",
    sessions: 5,
    plannedSessions: 5,
    plannedDone: 5,
    sets: 68,
    volumeKg: 18420,
    minutes: 250,
    previousVolumeKg: 13640,
    volumeDeltaPercent: 35,
    records: [
      { key: "squat", name: "Squat", weight: 120, previousWeight: 115 },
      { key: "rowing", name: "Rowing barre", weight: 75, previousWeight: 72.5 },
    ],
    sentence: "Rythme tenu : 5 séances sur 5, et 2 records battus.",
    ...over,
  };
}

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
});

const show = (report: WeeklyReport) =>
  act(() => root.render(<WeekShareCard report={report} rankKey="guerrier" />));
const text = () => (container.textContent ?? "").replace(/\u00a0/g, " ");

describe("WeekShareCard — les faits du bilan, tels quels", () => {
  it("titre, chiffres, records et phrase", () => {
    show(makeReport());
    const t = text();
    expect(t).toContain("Semaine 39 · 21 → 27 septembre");
    expect(t).toContain("Ta meilleure semaine");
    expect(t).toContain("5/ 5 prévues");
    expect(t).toContain("18 420kg");
    expect(t).toContain("68");
    expect(t).toContain("4 h 10");
    expect(t).toContain("2 records battus");
    expect(t).toContain("Squat");
    expect(t).toContain("120 kg");
    expect(t).toContain("Rythme tenu : 5 séances sur 5, et 2 records battus.");
  });

  it("« X / Y prévues » n'apparaît que si la comparaison est vérifiable", () => {
    show(makeReport({ plannedSessions: null, plannedDone: null }));
    expect(text()).not.toContain("prévues");
  });

  it("un volume nul n'est jamais écrit « 0 kg »", () => {
    show(
      makeReport({ volumeKg: 0, previousVolumeKg: null, volumeDeltaPercent: null, records: [] }),
    );
    expect(text()).not.toMatch(/0\s*kg/);
    expect(text()).toContain("—");
  });

  it("sans durée connue : pas de tuile Temps, et les séries prennent toute la largeur", () => {
    show(makeReport({ minutes: null }));
    expect(text()).not.toContain("Temps");
    const sets = [...container.querySelectorAll("div")].find((d) =>
      d.textContent?.startsWith("Séries"),
    );
    expect(sets?.className).toContain("col-span-2");
  });

  describe("comparaison de volume", () => {
    it("hausse : signe plus", () => {
      show(makeReport({ volumeDeltaPercent: 35 }));
      expect(text()).toContain("+35 % de volume sur la semaine précédente");
    });

    it("baisse : vrai signe moins, et sobre — jamais en rouge", () => {
      show(makeReport({ volumeDeltaPercent: -12 }));
      expect(text()).toContain("−12 % de volume");
      const line = [...container.querySelectorAll("p")].find((p) =>
        p.textContent?.includes("−12 %"),
      );
      expect(line?.className).not.toMatch(/red|destructive/);
    });

    it("sans semaine précédente : aucune comparaison", () => {
      show(makeReport({ previousVolumeKg: null, volumeDeltaPercent: null }));
      expect(text()).not.toContain("semaine précédente");
    });
  });

  describe("records", () => {
    it("aucun record : pas de bloc", () => {
      show(makeReport({ records: [] }));
      expect(container.querySelector('[aria-label="Records battus"]')).toBeNull();
    });

    it("un seul : singulier", () => {
      show(
        makeReport({
          records: [{ key: "squat", name: "Squat", weight: 120, previousWeight: 115 }],
        }),
      );
      expect(text()).toContain("1 record battu");
      expect(text()).not.toContain("1 records");
    });

    it("au plus trois sont nommés, le reste est compté — une carte, pas une liste", () => {
      const records = ["A", "B", "C", "D", "E"].map((name) => ({
        key: name,
        name,
        weight: 50,
        previousWeight: 45,
      }));
      show(makeReport({ records }));
      expect(container.querySelectorAll('[aria-label="Records battus"] li')).toHaveLength(3);
      expect(text()).toContain("5 records battus");
      expect(text()).toContain("et 2 autres");
    });
  });

  it("sans phrase fondée sur un fait : aucune phrase générique", () => {
    show(makeReport({ sentence: null }));
    expect(container.querySelector("p.italic")).toBeNull();
  });
});
