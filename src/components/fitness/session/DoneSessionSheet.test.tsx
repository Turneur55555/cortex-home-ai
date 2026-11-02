// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * La feuille « Séance faite » : ce qu'elle DÉCIDE est testé dans
 * `lib/fitness/doneSession.test.ts` ; ici, ce qu'on vérifie, c'est que le geste nominal tient
 * en UN appui (tout est pré-rempli), qu'une correction est prise en compte, et qu'une saisie à
 * corriger n'envoie rien.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TODAY = "2026-10-29";

const holder = vi.hoisted(() => ({
  workouts: [] as unknown[],
  mutateAsync: null as unknown,
  isPending: false,
}));

vi.mock("@/hooks/use-fitness", () => ({
  useWorkouts: () => ({ data: holder.workouts, isLoading: false }),
  useLogDoneWorkout: () => ({ mutateAsync: holder.mutateAsync, isPending: holder.isPending }),
}));
vi.mock("@/hooks/useWorkoutTemplates", () => ({
  useWorkoutTemplates: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useLocalToday", () => ({ useLocalToday: () => TODAY }));

import { DoneSessionSheet } from "./DoneSessionSheet";

const DOS = {
  id: "w-dos",
  date: "2026-10-26",
  name: "Dos",
  status: "completed",
  discipline: "muscu",
  created_at: "2026-10-26T16:00:00.000Z",
  duration_minutes: null,
  exercises: [
    {
      name: "Tirage poitrine",
      position: 0,
      exercise_reference_id: "ref-tirage",
      exercise_sets: [
        { set_number: 1, reps: 10, weight: 60, completed: true },
        { set_number: 2, reps: 10, weight: 60, completed: true },
      ],
    },
    {
      name: "Rowing barre",
      position: 1,
      exercise_reference_id: null,
      exercise_sets: [{ set_number: 1, reps: 10, weight: 50, completed: true }],
    },
  ],
};
const PECS_LIVE = {
  id: "w-pecs",
  date: "2026-10-28",
  name: "Pectoraux",
  status: "completed",
  discipline: "muscu",
  created_at: "2026-10-28T08:00:00.000Z",
  duration_minutes: 39,
  exercises: [],
};

let container: HTMLDivElement;
let root: Root;
let mutateAsync: ReturnType<typeof vi.fn>;
let onLogged: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

beforeEach(() => {
  holder.workouts = [DOS, PECS_LIVE];
  mutateAsync = vi.fn(async () => ({ workoutId: "w-new" }));
  holder.mutateAsync = mutateAsync;
  holder.isPending = false;
  onLogged = vi.fn();
  onClose = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

async function render() {
  await act(async () => {
    root.render(
      <DoneSessionSheet
        target={{ date: TODAY, name: "Dos", templateId: null }}
        onClose={onClose as unknown as () => void}
        onLogged={onLogged as unknown as (logged: unknown) => void}
      />,
    );
  });
}

const buttonByText = (text: string) =>
  Array.from(document.body.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
const click = async (el: Element | undefined | null) => {
  if (!el) throw new Error("élément introuvable");
  await act(async () => {
    (el as HTMLElement).click();
  });
};
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("DoneSessionSheet", () => {
  it("tout est pré-rempli : la dernière séance « Dos », la durée d'après un fait — UN appui suffit", async () => {
    await render();
    const text = document.body.textContent ?? "";
    expect(text).toContain("Séance faite");
    expect(text).toContain("Comme ta séance du lundi 26 octobre");
    expect(text).toContain("Tirage poitrine");
    expect(text).toContain("2 × 10 · 60 kg");
    expect(text).toContain("1 × 10 · 50 kg");
    // 39 min (dernière séance en direct) → 40, proposée et dite telle quelle.
    const duration = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Durée en minutes"]',
    );
    expect(duration?.value).toBe("40");
    expect(text).toContain("Proposée d'après ta dernière séance enregistrée en direct.");
    expect(text).toContain("3 séries · 1\u00a0700 kg · 40 min");

    await click(buttonByText("Valider la séance"));
    expect(mutateAsync).toHaveBeenCalledWith({
      name: "Dos",
      date: TODAY,
      durationMinutes: 40,
      exercises: [
        {
          name: "Tirage poitrine",
          imagePath: null,
          exerciseReferenceId: "ref-tirage",
          sets: [
            { reps: 10, weight: 60 },
            { reps: 10, weight: 60 },
          ],
        },
        {
          name: "Rowing barre",
          imagePath: null,
          exerciseReferenceId: null,
          sets: [{ reps: 10, weight: 50 }],
        },
      ],
    });
    expect(onLogged).toHaveBeenCalledWith(
      expect.objectContaining({ workoutId: "w-new", payload: expect.any(Object) }),
    );
  });

  it("un exercice décoché (« pas fait cette fois ») n'est pas enregistré ; une durée choisie l'est", async () => {
    await render();
    await click(document.body.querySelector('[role="checkbox"][aria-label^="Rowing barre"]'));
    expect(document.body.textContent).toContain("Pas fait cette fois");
    await click(
      Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === "60"),
    );
    await click(buttonByText("Valider la séance"));
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.exercises.map((e: { name: string }) => e.name)).toEqual(["Tirage poitrine"]);
    expect(payload.durationMinutes).toBe(60);
  });

  it("une charge effacée : un message clair, RIEN n'est envoyé", async () => {
    await render();
    await click(buttonByText("Tirage poitrine"));
    const weight = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="Charge, série 1"]',
    )!;
    type(weight, "");
    await click(buttonByText("Valider la séance"));
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      "Indique la charge sur « Tirage poitrine » (0 pour le poids du corps).",
    );
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(onLogged).not.toHaveBeenCalled();
  });

  it("une correction de charge est enregistrée telle quelle (virgule française)", async () => {
    await render();
    await click(buttonByText("Tirage poitrine"));
    type(
      document.body.querySelector<HTMLInputElement>('input[aria-label="Charge, série 2"]')!,
      "62,5",
    );
    await click(buttonByText("Valider la séance"));
    expect(mutateAsync.mock.calls[0][0].exercises[0].sets).toEqual([
      { reps: 10, weight: 60 },
      { reps: 10, weight: 62.5 },
    ]);
  });

  it("un échec d'écriture ne ferme rien et n'annonce rien (la mutation affiche son erreur)", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("Une séance est déjà en cours."));
    await render();
    await click(buttonByText("Valider la séance"));
    expect(onLogged).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
