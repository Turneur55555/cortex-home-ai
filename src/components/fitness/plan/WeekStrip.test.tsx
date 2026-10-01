// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WeekStrip } from "./WeekStrip";
import { TEST_TODAY, makeWeekPlanView, template } from "./weekPlanTestFixtures";

/**
 * La bande de la semaine : chaque état est lisible À LA VOIX (la couleur seule ne
 * se lit pas), aujourd'hui est repérable, et une séance sauvegardée qu'on ne
 * connaît pas encore ne s'affiche jamais « supprimée » par erreur.
 */

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
});

const day = (n: 1 | 2 | 3 | 4 | 5 | 6 | 7) => ({ dayOfWeek: n });

function render(view: ReturnType<typeof makeWeekPlanView>) {
  act(() => root.render(<WeekStrip week={view.week} templatesById={view.templatesById} />));
  return Array.from(container.querySelectorAll<HTMLLIElement>("li"));
}

describe("WeekStrip", () => {
  const view = makeWeekPlanView({
    plan: {
      1: { ...day(1), kind: "muscles", groups: ["dos"] },
      2: { ...day(2), kind: "muscles", groups: ["epaules"] },
      3: { ...day(3), kind: "muscles", groups: ["jambes", "bras"] },
      4: { ...day(4), kind: "rest" },
      5: { ...day(5), kind: "muscles", groups: ["pecs"] },
    },
    workouts: [{ id: "w1", date: "2026-09-28", status: "completed", discipline: "muscu" }],
  });

  it("affiche les sept jours, lundi en tête", () => {
    const items = render(view);
    expect(items).toHaveLength(7);
    expect(container.querySelector("ol")?.getAttribute("aria-label")).toBe("Ta semaine");
  });

  it("dit chaque jour et son état à voix haute", () => {
    const labels = render(view).map((li) => li.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Lundi : Dos, fait",
      "Mardi : Épaules, manqué",
      "Mercredi : Jambes + Bras, aujourd'hui",
      "Jeudi : Repos, repos",
      "Vendredi : Pectoraux, à venir",
      "Samedi : Libre, libre",
      "Dimanche : Libre, libre",
    ]);
  });

  it("expose l'état de chaque jour pour le style, dans l'ordre", () => {
    expect(render(view).map((li) => li.dataset.state)).toEqual([
      "done",
      "missed",
      "today",
      "rest",
      "upcoming",
      "unplanned",
      "unplanned",
    ]);
  });

  it("marque aujourd'hui — et un seul jour — avec aria-current", () => {
    const current = render(view).filter((li) => li.getAttribute("aria-current") === "date");
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("aria-label")).toContain("Mercredi");
  });

  it("aujourd'hui reste repérable une fois la séance faite", () => {
    const done = makeWeekPlanView({
      plan: { 3: { ...day(3), kind: "muscles", groups: ["jambes"] } },
      workouts: [{ id: "w", date: TEST_TODAY, status: "completed", discipline: "muscu" }],
    });
    const wednesday = render(done)[2];
    expect(wednesday.dataset.state).toBe("done");
    expect(wednesday.getAttribute("aria-current")).toBe("date");
    expect(wednesday.className).toContain("ring-primary/70");
  });

  it("un jour manqué est barré mais jamais rouge vif : on informe, on ne punit pas", () => {
    const tuesday = render(view)[1];
    const label = tuesday.querySelectorAll("span")[1];
    expect(label.className).toContain("line-through");
    expect(tuesday.className).not.toMatch(/destructive|red-/);
  });

  it("une séance libre un jour sans plan est annoncée comme telle, pas comme « libre, fait »", () => {
    const free = makeWeekPlanView({
      workouts: [{ id: "w", date: "2026-09-29", status: "completed", discipline: "muscu" }],
    });
    expect(render(free)[1].getAttribute("aria-label")).toBe("Mardi : séance libre, fait");
  });

  it("n'emploie que les jetons du thème : aucune couleur en dur", () => {
    render(view);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(container.innerHTML).not.toMatch(/rgb\(/);
  });

  describe("séances sauvegardées", () => {
    const plan = { 1: { ...day(1), kind: "template" as const, templateId: "tpl-1" } };

    it("affiche le nom de la séance quand elle est connue", () => {
      const known = makeWeekPlanView({ plan, templates: [template("tpl-1", "Jambes A", [4, 4])] });
      expect(render(known)[0].getAttribute("aria-label")).toContain("Lundi : Jambes A");
    });

    it("modèles pas encore chargés : « … », jamais « supprimée »", () => {
      const loading = makeWeekPlanView({ plan, templates: null });
      const monday = render(loading)[0];
      expect(monday.getAttribute("aria-label")).toContain("Lundi : …");
      expect(monday.getAttribute("aria-label")).not.toMatch(/supprim/i);
    });

    it("séance supprimée : le jour reste un jour d'entraînement, signalé comme tel", () => {
      const deleted = makeWeekPlanView({
        plan: { 1: { ...day(1), kind: "template", templateId: null } },
        templates: [],
      });
      // Lundi 28/09 est passé (on est mercredi) et rien n'a été fait : « manqué ».
      expect(render(deleted)[0].getAttribute("aria-label")).toBe(
        "Lundi : Séance supprimée, manqué",
      );
    });
  });
});
