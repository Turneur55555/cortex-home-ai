// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { setHapticsEnabled } from "@/lib/haptics";
import type { TodayWorkout } from "@/lib/fitness/todayCard";

/**
 * L'objectif de séance dans le bandeau de la séance en cours : ce qu'il
 * AFFICHE vient de `resolveSessionGoal` (testée à part). Ici : il ne rend rien
 * sans référence, il lit bien ses données, et il ne vibre qu'à la transition
 * « pas encore battu » → « battu ».
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({
  history: { data: undefined as unknown },
  templates: { data: undefined as unknown },
}));

vi.mock("@/hooks/use-fitness", () => ({ useWorkouts: () => holder.history }));
vi.mock("@/hooks/useWorkoutTemplates", () => ({ useWorkoutTemplates: () => holder.templates }));

import { SessionGoalBar } from "./SessionGoalBar";

type SetLike = { reps: number | null; weight: number | null; completed?: boolean };

/** 12 séries de 8×30 + 2 de 8×60 = 14 séries, 3 840 kg. */
function pastEpaules(): TodayWorkout {
  return {
    id: "h1",
    date: "2026-09-23",
    name: "Épaules A",
    status: "completed",
    discipline: "muscu",
    created_at: "2026-09-23T18:00:00.000Z",
    exercises: [
      {
        id: "e1",
        name: "Exo",
        exercise_sets: [
          ...Array.from({ length: 12 }, () => ({ reps: 8, weight: 30 })),
          ...Array.from({ length: 2 }, () => ({ reps: 8, weight: 60 })),
        ],
      },
    ],
  };
}

const ticked = (reps: number | null, weight: number | null, n = 1): SetLike[] =>
  Array.from({ length: n }, () => ({ reps, weight, completed: true }));

let container: HTMLDivElement;
let root: Root;
let vibrate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  holder.history = { data: [pastEpaules()] };
  holder.templates = {
    data: [
      {
        id: "t1",
        name: "Épaules A",
        exercises: [{ default_sets: 7 }, { default_sets: 7 }],
        segments: [],
      },
    ],
  };
  vibrate = vi.fn();
  Object.defineProperty(navigator, "vibrate", {
    value: vibrate,
    configurable: true,
    writable: true,
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Reflect.deleteProperty(navigator, "vibrate");
  localStorage.clear(); // le réglage « Vibrations » ne fuit pas d'un test à l'autre
});

function show(name: string, sets: SetLike[]) {
  act(() => root.render(<SessionGoalBar name={name} exercises={[{ exercise_sets: sets }]} />));
}

const bar = () => container.querySelector('[role="progressbar"]');

describe("SessionGoalBar", () => {
  it("sans référence (première fois, séance libre) : ne rend RIEN", () => {
    show("Nouvelle séance", ticked(8, 40, 3));
    expect(container.innerHTML).toBe("");
  });

  it("pendant que l'historique charge (data indéfinie) : rien, pas d'objectif fantôme", () => {
    holder.history = { data: undefined };
    show("Épaules A", []);
    expect(container.innerHTML).toBe("");
  });

  it("au démarrage : « 0 / 14 séries » et l'objectif chiffré", () => {
    show("Épaules A", []);
    expect(container.textContent).toContain("Objectif de séance");
    expect(container.textContent).toContain("0 / 14 séries");
    expect(container.textContent).toContain("Objectif : 14 séries · 3 840 kg");
  });

  it("en cours : 9 / 14, le volume et ce qu'il reste à battre", () => {
    show("Épaules A", [...ticked(8, 40, 8), ...ticked(7, 60)]);
    expect(container.textContent).toContain("9 / 14 séries");
    expect(container.textContent).toContain(
      "2 980 kg soulevés · encore 860 kg pour battre ta dernière Épaules A",
    );
  });

  it("la barre de progression est accessible : valeurs et texte parlé", () => {
    show("Épaules A", [...ticked(8, 40, 8), ...ticked(7, 60)]);
    const progress = bar();
    expect(progress?.getAttribute("aria-valuemin")).toBe("0");
    expect(progress?.getAttribute("aria-valuemax")).toBe("14");
    expect(progress?.getAttribute("aria-valuenow")).toBe("9");
    expect(progress?.getAttribute("aria-valuetext")).toBe("9 séries sur 14");
    expect((progress?.firstElementChild as HTMLElement).style.width).toBe("64%");
  });

  it("les séries prévues viennent de la séance sauvegardée quand elle est connue (même nombre que le plan)", () => {
    holder.templates = {
      data: [
        {
          id: "t1",
          name: "Épaules A",
          exercises: [{ default_sets: 6 }, { default_sets: 6 }],
          segments: [],
        },
      ],
    };
    show("Épaules A", []);
    expect(container.textContent).toContain("0 / 12 séries");
  });

  it("modèles pas encore lus : on retombe sur la référence, sans planter", () => {
    holder.templates = { data: undefined };
    show("Épaules A", []);
    expect(container.textContent).toContain("0 / 14 séries");
  });

  it("dépassé : l'étiquette change, et la barre est pleine", () => {
    show("Épaules A", [...ticked(8, 40, 12), ...ticked(7, 40), ...ticked(8, null, 2)]);
    const root1 = container.firstElementChild as HTMLElement;
    expect(root1.getAttribute("data-beaten")).toBe("true");
    expect(container.textContent).toContain("Objectif dépassé");
    expect(container.textContent).toContain("15 / 14 séries");
    expect(container.textContent).toContain("+280 kg au-dessus de ta dernière Épaules A");
    expect((bar()?.firstElementChild as HTMLElement).style.width).toBe("100%");
    expect(bar()?.getAttribute("aria-valuenow")).toBe("14"); // plafonné à la cible
  });

  it("jamais un pourcentage dans le texte affiché", () => {
    show("Épaules A", [...ticked(8, 40, 8), ...ticked(7, 60)]);
    expect(container.textContent).not.toMatch(/%/);
  });
});

describe("SessionGoalBar — la vibration au dépassement", () => {
  const BEFORE = [...ticked(8, 40, 8)]; // 2 560 kg : pas encore battu
  const AFTER = [...ticked(8, 40, 8), ...ticked(10, 140)]; // + 1 400 = 3 960 kg : battu

  it("vibre UNE fois, à la transition « pas battu » → « battu »", () => {
    show("Épaules A", BEFORE);
    expect(vibrate).not.toHaveBeenCalled();
    show("Épaules A", AFTER);
    expect(vibrate).toHaveBeenCalledTimes(1);
    // Double impact : distinct du buzz unique de 50 ms de la validation d'une série.
    expect(vibrate).toHaveBeenCalledWith([30, 70, 30]);
  });

  it("respecte le réglage « Vibrations » du Profil : désactivé → aucune vibration", () => {
    setHapticsEnabled(false);
    show("Épaules A", BEFORE);
    show("Épaules A", AFTER);
    expect(vibrate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Objectif dépassé"); // l'affichage, lui, ne dépend pas du réglage
  });

  it("réglage réactivé → la vibration revient", () => {
    setHapticsEnabled(false);
    setHapticsEnabled(true);
    show("Épaules A", BEFORE);
    show("Épaules A", AFTER);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("ne revibre pas à chaque série de plus une fois dépassé", () => {
    show("Épaules A", BEFORE);
    show("Épaules A", AFTER);
    show("Épaules A", [...AFTER, ...ticked(8, 40)]);
    show("Épaules A", [...AFTER, ...ticked(8, 40, 2)]);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("ne vibre PAS quand on rouvre une séance déjà dépassée (pas de transition)", () => {
    show("Épaules A", AFTER);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("ne vibre pas non plus quand l'historique se charge après coup sur une séance déjà dépassée", () => {
    holder.history = { data: undefined };
    show("Épaules A", AFTER); // goal null : rien
    holder.history = { data: [pastEpaules()] };
    show("Épaules A", AFTER); // goal apparaît d'emblée « battu »
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("appareil sans vibration (iOS, bureau) : aucune erreur", () => {
    Reflect.deleteProperty(navigator, "vibrate");
    show("Épaules A", BEFORE);
    expect(() => show("Épaules A", AFTER)).not.toThrow();
    expect(container.textContent).toContain("Objectif dépassé");
  });
});
