// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { WorkoutRow } from "@/components/fitness/WorkoutCard";

/**
 * La Chronique d'une séance : ce qu'elle AFFIRME doit reposer sur des faits. Trois mensonges
 * mesurés en production, jamais verrouillés avant ce test :
 *  - « 00h00 » sur CHAQUE séance (la colonne `date` n'a pas d'heure) ;
 *  - « Intensité : Légère » et un tableau de « — » pour une séance importée sans aucun exercice ;
 *  - « 600 min » (le plafond de clôture d'une séance restée ouverte) présenté comme une durée.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/useLatestBodyWeight", () => ({ useLatestBodyWeight: () => ({ data: 80 }) }));
vi.mock("@/hooks/useWorkoutAnalyses", () => ({ useStoredWorkoutAnalysis: () => ({ data: null }) }));
// Enfants lourds — sans rapport avec ce qui est vérifié ici.
vi.mock("@/components/fitness/BodyMap", () => ({ BodyMap: () => <div /> }));
vi.mock("@/components/fitness/WorkoutProgressCharts", () => ({
  WorkoutProgressCharts: () => <div />,
}));
vi.mock("@/components/fitness/SectionReveal", () => ({
  SectionReveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ChroniquePage } from "./ChroniquePage";

function workout(over: Partial<WorkoutRow> & { id: string; date: string }): WorkoutRow {
  return {
    name: "Pectoraux",
    duration_minutes: 62,
    status: "completed",
    discipline: "muscu",
    created_at: `${over.date}T06:00:00Z`,
    exercises: [],
    ...over,
  } as unknown as WorkoutRow;
}

const withExercises = (id: string, date: string, extra: Partial<WorkoutRow> = {}) =>
  workout({
    id,
    date,
    exercises: [
      {
        id: `${id}-e1`,
        name: "Développé couché",
        weight: 100,
        sets: 3,
        reps: 5,
        exercise_sets: [1, 2, 3].map((n) => ({
          id: `${id}-s${n}`,
          set_number: n,
          reps: 5,
          weight: 100,
          completed: true,
        })),
      },
    ],
    ...extra,
  } as Parameters<typeof workout>[0]);

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

function show(target: WorkoutRow, all: WorkoutRow[]) {
  act(() =>
    root.render(
      <ChroniquePage
        workout={target}
        allWorkouts={all}
        prByName={new Map()}
        histByName={new Map()}
        nameByKey={new Map()}
        onBack={() => undefined}
        onNavigate={() => undefined}
      />,
    ),
  );
}
const text = () => (container.textContent ?? "").replace(/[\u00a0\u202f]/g, " ");

describe("ChroniquePage — l'heure", () => {
  it("jamais d'heure inventée : la colonne `date` n'en porte pas (« 00h00 » sur chaque séance)", () => {
    const w = withExercises("w1", "2026-09-26");
    show(w, [w]);
    expect(text()).toMatch(/samedi 26 septembre/i);
    expect(text()).not.toMatch(/\d{2}h\d{2}/);
  });
});

describe("ChroniquePage — une séance sans aucun exercice (importée)", () => {
  const shell = workout({ id: "shell", date: "2026-08-22", duration_minutes: 45 });

  it("dit ce qu'on sait — sa date et son nom — plutôt qu'une phrase qui célèbre l'inconnu", () => {
    show(shell, [shell]);
    expect(text()).toContain("Aucun exercice enregistré pour cette séance");
    expect(text()).not.toContain("fait partie de ta légende");
  });

  it("pas de tableau de comparaison fait de « — » ni d'intensité inventée", () => {
    show(shell, [shell]);
    expect(text()).not.toContain("Comparaison");
    expect(text()).not.toContain("Intensité");
    expect(text()).not.toContain("Légère");
  });

  it("une séance AVEC exercices garde sa comparaison", () => {
    const w = withExercises("w1", "2026-09-26");
    show(w, [w]);
    expect(text()).toContain("Comparaison");
  });
});

describe("ChroniquePage — la durée", () => {
  it("une durée ordinaire est affichée", () => {
    const w = withExercises("w1", "2026-09-26", { duration_minutes: 62 });
    show(w, [w]);
    expect(text()).toContain("62 min");
  });

  it("600 min (plafond d'une séance restée ouverte) : durée inconnue, jamais présentée comme un fait", () => {
    const w = withExercises("w1", "2026-09-26", { duration_minutes: 600 });
    show(w, [w]);
    expect(text()).not.toContain("600");
    // Sans durée connue, pas d'intensité (tonnage par minute) non plus.
    expect(text()).not.toContain("Légère");
    expect(text()).not.toContain("Modérée");
  });

  it("la moyenne sur 30 jours ne compte que les séances dont la durée est CONNUE (pas de zéro qui tire vers le bas)", () => {
    const a = withExercises("a", "2026-09-26", { duration_minutes: 60 });
    const b = withExercises("b", "2026-09-24", { duration_minutes: 600 }); // plafond : inconnue
    const c = workout({ id: "c", date: "2026-09-22", duration_minutes: 40 }); // importée : durée connue
    show(a, [a, b, c]);
    const row = [...container.querySelectorAll("div")].find(
      (d) => d.className.includes("grid") && d.firstElementChild?.textContent === "Temps",
    );
    const cells = [...(row?.children ?? [])].map((cell) => cell.textContent);
    // (60 + 40) / 2 = 50 — et non (60 + 0 + 40) / 3 ≈ 33 si la séance au plafond comptait pour zéro.
    expect(cells[2]).toBe("50 min");
  });
});

describe("ChroniquePage — les nombres", () => {
  it("le tonnage s'écrit avec la virgule française", () => {
    const w = withExercises("w1", "2026-09-26");
    // 3 × 5 × 100 = 1 500 kg → « 1,5 t »
    show(w, [w]);
    expect(text()).toContain("1,5 t");
    expect(text()).not.toMatch(/\d\.\d t/);
  });
});
