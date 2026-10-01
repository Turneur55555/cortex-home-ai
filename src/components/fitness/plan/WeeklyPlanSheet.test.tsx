// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { makeWeekPlanView, template } from "./weekPlanTestFixtures";

/**
 * L'éditeur « Mon rythme » : ce que le joueur voit, et surtout CE QUE CHAQUE
 * GESTE ENVOIE à l'écriture. `useWeekPlanView` et `useSetPlanDay` sont simulés ;
 * l'écriture réelle (hors ligne, sérialisée, patch complet) est couverte par
 * `hooks/useWeeklyPlan.test.ts`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const holder = vi.hoisted(() => ({
  view: null as unknown,
  mutate: null as unknown,
  isPending: false,
}));

vi.mock("@/hooks/useWeekPlanView", () => ({ useWeekPlanView: () => holder.view }));
vi.mock("@/hooks/useWeeklyPlan", () => ({
  useSetPlanDay: () => ({ mutate: holder.mutate, isPending: holder.isPending }),
}));

import { WeeklyPlanSheet } from "./WeeklyPlanSheet";

let container: HTMLDivElement;
let root: Root;
let mutate: ReturnType<typeof vi.fn>;

const TEMPLATES = [
  template("tpl-dos", "Dos A", [4, 4, 4, 3]), // 15 séries
  template("tpl-ep", "Épaules A", [4, 4, 3, 3]), // 14 séries
];

function show(view = makeWeekPlanView({ templates: TEMPLATES })) {
  holder.view = view;
  act(() => root.render(<WeeklyPlanSheet onClose={() => undefined} />));
}

const body = () => document.body;
const dayButton = (name: string) =>
  Array.from(body().querySelectorAll<HTMLButtonElement>("button[aria-expanded]")).find((b) =>
    b.textContent?.includes(name),
  )!;
const buttonNamed = (text: string) =>
  Array.from(body().querySelectorAll<HTMLButtonElement>("button")).find((b) =>
    b.textContent?.trim().startsWith(text),
  );
/** Une pastille de groupe : texte EXACT, pour ne jamais confondre « Épaules » avec la séance « Épaules A ». */
const chip = (label: string) =>
  Array.from(body().querySelectorAll<HTMLButtonElement>("button[aria-pressed]")).find(
    (b) => b.textContent?.trim() === label,
  );
const click = (el: Element | undefined) => {
  if (!el) throw new Error("élément introuvable");
  act(() => (el as HTMLElement).click());
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mutate = vi.fn();
  holder.mutate = mutate;
  holder.isPending = false;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("WeeklyPlanSheet — lecture", () => {
  it("liste les sept jours, lundi en premier", () => {
    show();
    const rows = Array.from(body().querySelectorAll("button[aria-expanded]"));
    expect(rows).toHaveLength(7);
    expect(rows[0].textContent).toMatch(/^Lundi/);
    expect(rows[6].textContent).toMatch(/^Dimanche/);
  });

  it("annonce la charge de la semaine : « 2 séances par semaine · 29 séries prévues »", () => {
    show(
      makeWeekPlanView({
        templates: TEMPLATES,
        plan: {
          1: { dayOfWeek: 1, kind: "template", templateId: "tpl-dos" },
          2: { dayOfWeek: 2, kind: "template", templateId: "tpl-ep" },
          4: { dayOfWeek: 4, kind: "rest" },
        },
      }),
    );
    expect(body().textContent).toContain("2 séances par semaine · 29 séries prévues");
  });

  it("dit « au moins » dès qu'un jour n'a pas de nombre de séries connu", () => {
    show(
      makeWeekPlanView({
        templates: TEMPLATES,
        plan: {
          1: { dayOfWeek: 1, kind: "template", templateId: "tpl-dos" },
          5: { dayOfWeek: 5, kind: "muscles", groups: ["pecs"] },
        },
      }),
    );
    expect(body().textContent).toContain("2 séances par semaine · au moins 15 séries");
    expect(body().textContent).not.toContain("prévues");
  });

  it("une séance sauvegardée affiche son nombre de séries dans la liste des jours", () => {
    show(
      makeWeekPlanView({
        templates: TEMPLATES,
        plan: { 1: { dayOfWeek: 1, kind: "template", templateId: "tpl-dos" } },
      }),
    );
    expect(dayButton("Lundi").textContent).toContain("Dos A");
    expect(dayButton("Lundi").textContent).toContain("15 séries · 4 exos");
  });

  it("une séance supprimée est signalée, jamais effacée en silence", () => {
    show(
      makeWeekPlanView({
        templates: TEMPLATES,
        plan: { 1: { dayOfWeek: 1, kind: "template", templateId: null } },
      }),
    );
    expect(dayButton("Lundi").textContent).toContain("Séance supprimée");
  });

  it("pendant le chargement : des squelettes, pas une liste vide ni un faux « aucune séance »", () => {
    show(makeWeekPlanView({ isLoading: true }));
    expect(body().querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(body().querySelectorAll("button[aria-expanded]")).toHaveLength(0);
    expect(body().textContent).not.toContain("Aucune séance prévue");
  });

  it("sans aucun jour d'entraînement : invite à choisir", () => {
    show();
    expect(body().textContent).toContain("Aucune séance prévue — choisis tes jours.");
  });
});

describe("WeeklyPlanSheet — le panneau d'un jour", () => {
  it("ouvre un seul jour à la fois", () => {
    show();
    click(dayButton("Lundi"));
    expect(dayButton("Lundi").getAttribute("aria-expanded")).toBe("true");
    click(dayButton("Mardi"));
    expect(dayButton("Lundi").getAttribute("aria-expanded")).toBe("false");
    expect(dayButton("Mardi").getAttribute("aria-expanded")).toBe("true");
  });

  it("referme le jour ouvert au second appui", () => {
    show();
    click(dayButton("Lundi"));
    click(dayButton("Lundi"));
    expect(dayButton("Lundi").getAttribute("aria-expanded")).toBe("false");
  });

  it("propose les séances sauvegardées EN PREMIER, avec leur nombre de séries", () => {
    show();
    click(dayButton("Mercredi"));
    const text = body().textContent ?? "";
    expect(text.indexOf("Mes séances sauvegardées")).toBeLessThan(
      text.indexOf("Ou juste des groupes musculaires"),
    );
    expect(text.indexOf("Ou juste des groupes musculaires")).toBeLessThan(text.indexOf("Ou rien"));
    expect(buttonNamed("Dos A")?.textContent).toContain("15 séries · 4 exos");
    expect(buttonNamed("Épaules A")?.textContent).toContain("14 séries · 4 exos");
  });

  it("sans séance sauvegardée : explique comment en avoir une", () => {
    show(makeWeekPlanView({ templates: [] }));
    click(dayButton("Mercredi"));
    expect(body().textContent).toContain("Aucune séance sauvegardée");
  });

  it("modèles pas encore chargés : ne prétend pas qu'il n'y en a aucun", () => {
    show(makeWeekPlanView({ templates: null }));
    click(dayButton("Mercredi"));
    expect(body().textContent).not.toContain("Aucune séance sauvegardée");
  });

  it("préremplit les groupes d'un jour déjà réglé", () => {
    show(
      makeWeekPlanView({
        templates: TEMPLATES,
        plan: { 1: { dayOfWeek: 1, kind: "muscles", groups: ["dos", "pecs"] } },
      }),
    );
    click(dayButton("Lundi"));
    expect(chip("Dos")?.getAttribute("aria-pressed")).toBe("true");
    expect(chip("Pectoraux")?.getAttribute("aria-pressed")).toBe("true");
    expect(chip("Jambes")?.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("WeeklyPlanSheet — ce que chaque geste envoie", () => {
  it("choisir une séance sauvegardée l'enregistre aussitôt", () => {
    show();
    click(dayButton("Mercredi"));
    click(buttonNamed("Épaules A"));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({
      dayOfWeek: 3,
      input: { kind: "template", templateId: "tpl-ep" },
    });
  });

  it("le jour se referme une fois l'écriture réussie", () => {
    show();
    click(dayButton("Mercredi"));
    click(buttonNamed("Épaules A"));
    act(() => mutate.mock.calls[0][1].onSuccess());
    expect(dayButton("Mercredi").getAttribute("aria-expanded")).toBe("false");
  });

  it("« Jour de repos » s'enregistre aussitôt", () => {
    show();
    click(dayButton("Jeudi"));
    click(buttonNamed("Jour de repos"));
    expect(mutate.mock.calls[0][0]).toEqual({ dayOfWeek: 4, input: { kind: "rest" } });
  });

  it("des groupes musculaires ne s'enregistrent qu'à la validation", () => {
    show();
    click(dayButton("Vendredi"));
    click(chip("Pectoraux"));
    click(chip("Épaules"));
    expect(mutate).not.toHaveBeenCalled(); // cocher n'écrit rien
    click(buttonNamed("Enregistrer"));
    expect(mutate.mock.calls[0][0]).toEqual({
      dayOfWeek: 5,
      input: { kind: "muscles", groups: ["pecs", "epaules"] },
    });
  });

  it("« Enregistrer » est inactif tant qu'aucun groupe n'est coché, et n'écrit rien", () => {
    show();
    click(dayButton("Vendredi"));
    const save = buttonNamed("Enregistrer") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    click(save);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("décocher le dernier groupe désactive de nouveau « Enregistrer »", () => {
    show();
    click(dayButton("Vendredi"));
    click(chip("Pectoraux"));
    expect((buttonNamed("Enregistrer") as HTMLButtonElement).disabled).toBe(false);
    click(chip("Pectoraux"));
    expect((buttonNamed("Enregistrer") as HTMLButtonElement).disabled).toBe(true);
  });

  it("« Laisser ce jour libre » n'est pas proposé pour un jour qui n'est pas réglé", () => {
    show();
    click(dayButton("Samedi"));
    expect(buttonNamed("Laisser ce jour libre")).toBeUndefined();
  });

  it("« Laisser ce jour libre » efface un jour réglé : il envoie null", () => {
    show(makeWeekPlanView({ templates: TEMPLATES, plan: { 6: { dayOfWeek: 6, kind: "rest" } } }));
    click(dayButton("Samedi"));
    click(buttonNamed("Laisser ce jour libre"));
    expect(mutate.mock.calls[0][0]).toEqual({ dayOfWeek: 6, input: null });
  });

  it("pendant une écriture, les choix sont désactivés et aucun second envoi n'est possible", () => {
    holder.isPending = true;
    show();
    click(dayButton("Mercredi"));
    const template = buttonNamed("Dos A") as HTMLButtonElement;
    const rest = buttonNamed("Jour de repos") as HTMLButtonElement;
    expect(template.disabled).toBe(true);
    expect(rest.disabled).toBe(true);
    click(template);
    click(rest);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("marque la séance actuellement choisie pour ce jour", () => {
    show(
      makeWeekPlanView({
        templates: TEMPLATES,
        plan: { 3: { dayOfWeek: 3, kind: "template", templateId: "tpl-ep" } },
      }),
    );
    click(dayButton("Mercredi"));
    expect(buttonNamed("Épaules A")?.getAttribute("aria-pressed")).toBe("true");
    expect(buttonNamed("Dos A")?.getAttribute("aria-pressed")).toBe("false");
  });
});
