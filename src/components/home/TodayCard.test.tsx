// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  resolveTodayCard,
  type TodayCardInput,
  type TodayCardState,
  type TodayWorkout,
} from "@/lib/fitness/todayCard";
import {
  buildWeekView,
  emptyWeeklyPlan,
  summarizeTemplate,
  type PlanDay,
  type WeeklyPlan,
} from "@/lib/fitness/weeklyPlan";

/**
 * La Carte du jour : ce qu'elle AFFICHE vient de `resolveTodayCard` (testée à
 * part), ce qu'on vérifie ici est ce que ses boutons FONT — démarrer une séance
 * sauvegardée puis rejoindre l'écran Séances, jamais deux démarrages, jamais de
 * navigation après un échec.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const THURSDAY = "2026-10-01";

const holder = vi.hoisted(() => ({
  view: { isLoading: false, state: null as unknown },
  streak: { current: 0, isLoading: false },
  templates: { data: undefined as unknown },
  start: { mutateAsync: null as unknown, isPending: false },
  navigate: null as unknown,
  toastError: null as unknown,
}));

vi.mock("@/hooks/useTodayCard", () => ({ useTodayCard: () => holder.view }));
vi.mock("@/hooks/useActivityStreak", () => ({ useActivityStreak: () => holder.streak }));
vi.mock("@/hooks/useWorkoutTemplates", () => ({
  useWorkoutTemplates: () => holder.templates,
  useStartWorkoutFromSavedTemplate: () => holder.start,
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => holder.navigate,
}));
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => (holder.toastError as (...a: unknown[]) => void)(...args),
  },
}));
vi.mock("@/components/fitness/plan/WeeklyPlanSheet", () => ({
  WeeklyPlanSheet: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="plan-sheet">
      <button type="button" onClick={onClose}>
        fermer
      </button>
    </div>
  ),
}));

import { TodayCard } from "./TodayCard";

const EPAULES = {
  id: "tpl-epaules",
  name: "Épaules A",
  exercises: [{ default_sets: 7 }, { default_sets: 7 }],
};
const EPAULES_ROW = { ...EPAULES, segments: [] };

let container: HTMLDivElement;
let root: Root;
let navigate: ReturnType<typeof vi.fn>;
let mutateAsync: ReturnType<typeof vi.fn>;
let toastError: ReturnType<typeof vi.fn>;

beforeEach(() => {
  navigate = vi.fn();
  mutateAsync = vi.fn(async () => "w-new");
  toastError = vi.fn();
  holder.navigate = navigate;
  holder.toastError = toastError;
  holder.start = { mutateAsync, isPending: false };
  holder.templates = { data: [EPAULES_ROW] };
  holder.streak = { current: 0, isLoading: false };
  holder.view = { isLoading: false, state: null };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function planOf(days: Record<number, PlanDay>): WeeklyPlan {
  const plan = emptyWeeklyPlan();
  for (const [day, value] of Object.entries(days)) plan[Number(day) as 1] = value;
  return plan;
}

function stateFor(
  plan: WeeklyPlan,
  extra: { workouts?: TodayWorkout[]; activeWorkout?: TodayCardInput["activeWorkout"] } = {},
): TodayCardState {
  const workouts = extra.workouts ?? [];
  const templatesById = new Map([[EPAULES.id, summarizeTemplate(EPAULES)]]);
  return resolveTodayCard({
    week: buildWeekView(plan, workouts, THURSDAY),
    todayDate: THURSDAY,
    templatesById,
    activeWorkout: extra.activeWorkout ?? null,
    workouts,
  });
}

const plannedTemplate = () =>
  stateFor(planOf({ 4: { dayOfWeek: 4, kind: "template", templateId: EPAULES.id } }));

function show(state: TodayCardState | null, opts: { isLoading?: boolean } = {}) {
  holder.view = { isLoading: opts.isLoading ?? false, state };
  act(() => root.render(<TodayCard />));
}

const button = (text: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
const click = async (el: Element | undefined) => {
  if (!el) throw new Error("élément introuvable");
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const section = () => container.querySelector("section");

describe("TodayCard — chargement", () => {
  it("pendant le chargement : un squelette, aucun bouton, rien de faux à l'écran", () => {
    show(null, { isLoading: true });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(section()).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("séance sauvegardée du jour pas encore chargée (« loading ») : squelette, jamais « supprimée »", () => {
    const loading = resolveTodayCard({
      week: buildWeekView(
        planOf({ 4: { dayOfWeek: 4, kind: "template", templateId: EPAULES.id } }),
        [],
        THURSDAY,
      ),
      todayDate: THURSDAY,
      templatesById: null,
      activeWorkout: null,
      workouts: [],
    });
    show(loading);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.textContent).not.toContain("supprimée");
  });
});

describe("TodayCard — affichage", () => {
  it("jour planifié : le focus, les séries prévues, la dernière fois, deux boutons", () => {
    const sets = [{ reps: 8, weight: 50 }];
    const workouts: TodayWorkout[] = [
      {
        id: "w-old",
        date: "2026-09-23",
        name: "Épaules A",
        status: "completed",
        discipline: "muscu",
        exercises: [{ id: "e", name: "Exo", exercise_sets: sets }],
      },
    ];
    show(
      stateFor(planOf({ 4: { dayOfWeek: 4, kind: "template", templateId: EPAULES.id } }), {
        workouts,
      }),
    );
    expect(section()?.getAttribute("aria-label")).toBe("Aujourd'hui");
    expect(section()?.getAttribute("data-kind")).toBe("planned");
    const text = container.textContent ?? "";
    expect(text).toContain("Jeudi 1 octobre · aujourd'hui");
    expect(text).toContain("Épaules A");
    expect(text).toContain("Prévu dans ton rythme · 14 séries · 2 exos");
    expect(text).toContain("La dernière fois : 1 série · 400 kg · il y a 8 jours");
    expect(button("Démarrer la séance")).toBeDefined();
    expect(button("Changer")).toBeDefined();
  });

  it("repos : « M'entraîner quand même » seul, pas de bouton principal", () => {
    show(stateFor(planOf({ 4: { dayOfWeek: 4, kind: "rest" } })));
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(button("M'entraîner quand même")).toBeDefined();
  });

  it("aucun pourcentage nulle part, quel que soit l'état", () => {
    show(plannedTemplate());
    expect(container.textContent).not.toMatch(/%/);
  });
});

describe("TodayCard — la flamme de la série de jours", () => {
  it("affichée à partir de 2 jours d'affilée", () => {
    holder.streak = { current: 6, isLoading: false };
    show(plannedTemplate());
    const flame = container.querySelector('[role="img"]');
    expect(flame?.getAttribute("aria-label")).toBe("6 jours d'activité d'affilée");
    expect(flame?.textContent).toBe("6");
  });

  it.each([0, 1])("masquée pour %i (hors ligne, la requête vaut 0 : jamais un faux « 0 »)", (n) => {
    holder.streak = { current: n, isLoading: false };
    show(plannedTemplate());
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it("masquée pendant son chargement", () => {
    holder.streak = { current: 9, isLoading: true };
    show(plannedTemplate());
    expect(container.querySelector('[role="img"]')).toBeNull();
  });
});

describe("TodayCard — les boutons", () => {
  it("« Démarrer la séance » : démarre la séance sauvegardée, PUIS rejoint l'écran Séances", async () => {
    const order: string[] = [];
    mutateAsync.mockImplementation(async () => {
      order.push("démarrage");
      return "w-new";
    });
    navigate.mockImplementation(() => order.push("navigation"));
    show(plannedTemplate());

    await click(button("Démarrer la séance"));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith(EPAULES_ROW);
    expect(navigate).toHaveBeenCalledWith({ to: "/seances" });
    expect(order).toEqual(["démarrage", "navigation"]);
  });

  it("un démarrage qui échoue ne navigue pas (la mutation a déjà affiché son erreur)", async () => {
    mutateAsync.mockRejectedValue(new Error("Une séance est déjà en cours"));
    show(plannedTemplate());

    await click(button("Démarrer la séance"));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled(); // pas de second message
  });

  it("démarrage en cours : les boutons sont désactivés, un second appui ne relance rien", async () => {
    holder.start = { mutateAsync, isPending: true };
    show(plannedTemplate());

    const start = button("Démarrer la séance") as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    expect((button("Changer") as HTMLButtonElement).disabled).toBe(true);
    await click(start);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("séance sauvegardée introuvable localement : un message, aucun démarrage, aucune navigation", async () => {
    holder.templates = { data: [] };
    show(plannedTemplate());

    await click(button("Démarrer la séance"));

    expect(toastError).toHaveBeenCalledWith("Cette séance sauvegardée est introuvable.");
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("modèles pas encore lus (data indéfinie) : même garde, jamais d'exception", async () => {
    holder.templates = { data: undefined };
    show(plannedTemplate());
    await click(button("Démarrer la séance"));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("« Reprendre ma séance » rejoint l'écran Séances sans rien démarrer", async () => {
    show(
      stateFor(emptyWeeklyPlan(), {
        activeWorkout: { name: "Push Day", created_at: new Date(2026, 9, 1, 18, 42).toISOString() },
      }),
    );
    await click(button("Reprendre ma séance"));
    expect(navigate).toHaveBeenCalledWith({ to: "/seances" });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("« M'entraîner quand même » ouvre « Choisir une épreuve » (?demarrer=nouvelle)", async () => {
    show(stateFor(planOf({ 4: { dayOfWeek: 4, kind: "rest" } })));
    await click(button("M'entraîner quand même"));
    expect(navigate).toHaveBeenCalledWith({ to: "/seances", search: { demarrer: "nouvelle" } });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("« Changer » ouvre l'éditeur « Mon rythme » ; il se referme", async () => {
    show(plannedTemplate());
    expect(container.querySelector('[data-testid="plan-sheet"]')).toBeNull();
    await click(button("Changer"));
    expect(container.querySelector('[data-testid="plan-sheet"]')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    await click(button("fermer"));
    expect(container.querySelector('[data-testid="plan-sheet"]')).toBeNull();
  });

  it("aucun plan : « Planifier ma semaine » ouvre l'éditeur, « Choisir une épreuve » va aux Séances", async () => {
    show(stateFor(emptyWeeklyPlan()));
    await click(button("Planifier ma semaine"));
    expect(container.querySelector('[data-testid="plan-sheet"]')).not.toBeNull();
    await click(button("fermer"));
    await click(button("Choisir une épreuve"));
    expect(navigate).toHaveBeenCalledWith({ to: "/seances", search: { demarrer: "nouvelle" } });
  });
});
