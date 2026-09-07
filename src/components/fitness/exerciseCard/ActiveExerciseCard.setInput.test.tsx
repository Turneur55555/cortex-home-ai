// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * CHANTIER 9 (C1), verrouillé par le CHANTIER FINAL (AUD-09, test 3) —
 * UNE SAISIE INVALIDE N'ATTEINT JAMAIS LA DONNÉE MÉTIER.
 *
 * Ce que ce test protège, concrètement : avant le chantier 9, une saisie
 * inexploitable partait telle quelle vers `useUpdateExerciseSet` — un `NaN`
 * dans une colonne `smallint`, une valeur hors bornes dans un
 * `numeric(6,2)`. Le serveur rejetait l'écriture avec une erreur NON
 * réessayable, l'opération épuisait ses tentatives, passait `blocked`, et
 * cette opération bloquée RETENAIT la clôture de la séance : une faute de
 * frappe pouvait coûter la récompense d'une séance entière.
 *
 * La règle vérifiée ici est donc à trois issues, jamais quatre :
 * - vide → `null` assumé (l'utilisateur efface) ;
 * - valeur exploitable → écrite NORMALISÉE ;
 * - saisie inexploitable → RIEN n'est écrit, et le champ revient à la valeur
 *   enregistrée (surtout pas `null`, qui effacerait une valeur valide).
 *
 * On teste la MUTATION RÉELLEMENT APPELÉE (`useUpdateExerciseSet` mocké au
 * niveau du hook), pas la fonction pure — celle-ci a déjà sa couverture dans
 * `lib/fitness/sets.test.ts`. Ce qui est en jeu ici, c'est le câblage.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const updateSet = vi.hoisted(() => vi.fn());
const emptyMutation = vi.hoisted(() => () => ({
  mutate: () => undefined,
  mutateAsync: async () => undefined,
  isPending: false,
}));

vi.mock("@/hooks/use-fitness", () => ({
  useUpdateExerciseSet: () => ({ mutate: updateSet, mutateAsync: updateSet, isPending: false }),
  useAddExerciseSet: emptyMutation,
  useDeleteExerciseSet: emptyMutation,
  useDeleteExercises: emptyMutation,
}));
vi.mock("@/hooks/useUserExercisePhotos", () => ({ useUpsertExercisePhoto: emptyMutation }));
vi.mock("@/hooks/useGenericActiveSession", () => ({
  useAddGenericSegment: emptyMutation,
  useDeleteGenericSegment: emptyMutation,
  useReorderGenericSegment: emptyMutation,
  useUpdateGenericSegment: emptyMutation,
}));
vi.mock("@/hooks/useDisciplineSegmentHistory", () => ({
  useDisciplineSegmentHistory: () => ({ data: undefined }),
}));
vi.mock("@/hooks/useRestTimer", () => ({
  restTimer: { startForExercise: () => undefined },
  useRestTimer: () => ({ remaining: null }),
}));
vi.mock("../RestTimerInline", () => ({ RestTimerInline: () => null }));

import { ActiveExerciseCard } from "./ActiveExerciseCard";
import type { ActiveExercise } from "@/hooks/use-fitness";

const EXERCISE: ActiveExercise = {
  id: "ex-1",
  name: "Développé couché",
  image_path: null,
  sets: null,
  reps: null,
  weight: null,
  exercise_reference_id: null,
  position: 0,
  exercise_sets: [{ id: "set-1", set_number: 1, reps: 10, weight: 80, completed: false }],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  updateSet.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Monte la carte ET la déplie : les séries ne sont pas rendues carte fermée
 *  (comportement voulu depuis le retour de Nathan du 30/07/2026). */
function renderExpanded() {
  act(() => {
    root.render(
      <ActiveExerciseCard
        kind="muscu"
        exercise={EXERCISE}
        imageUrl={null}
        lastSession={null}
        pr={null}
        isFirst
        isLast
        onMoveUp={() => undefined}
        onMoveDown={() => undefined}
      />,
    );
  });
  const toggle = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Développé couché"),
  );
  act(() => {
    toggle?.click();
  });
}

function field(label: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) throw new Error(`Champ introuvable : ${label}`);
  return input;
}

const WEIGHT = "Charge de la série 1 en kilogrammes";
const REPS = "Répétitions de la série 1";

/** Saisit puis quitte le champ — `onCommit` est branché sur le `blur`.
 *  React écoute `focusout` (qui remonte) et non `blur` (qui ne remonte pas) :
 *  dispatcher `blur` ici ferait passer les tests À VIDE, sans jamais
 *  déclencher la validation. */
function typeAndCommit(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

describe("ActiveExerciseCard — saisie d'une série (AUD-09, test 3)", () => {
  it("valeur valide → écrite, normalisée", () => {
    renderExpanded();
    // Décimale au POINT : un `<input type="number">` refuse « 82,5 » et rend
    // une chaîne vide, dans jsdom comme dans un navigateur. La tolérance à la
    // virgule française vit dans `parseSetFieldInput` (couverte par
    // `lib/fitness/sets.test.ts`) et n'est pas atteignable par ce champ.
    typeAndCommit(field(WEIGHT), "82.5");

    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith({ id: "set-1", weight: 82.5 });
  });

  it("champ vidé → `null` assumé (l'utilisateur efface sa valeur)", () => {
    renderExpanded();
    typeAndCommit(field(REPS), "");

    expect(updateSet).toHaveBeenCalledWith({ id: "set-1", reps: null });
  });

  it.each([
    ["négative", "-5"],
    ["notation exponentielle", "1e9"],
    ["hors bornes de la colonne", "99999"],
  ])("saisie invalide (%s) → AUCUNE écriture métier", (_label, raw) => {
    renderExpanded();
    const input = field(WEIGHT);
    typeAndCommit(input, raw);

    expect(updateSet).not.toHaveBeenCalled();
    // Le retour à la valeur enregistrée PROUVE que la validation a bien
    // tourné : sans lui, ce test passerait aussi si rien ne s'était produit.
    expect(input.value).toBe("80");
  });

  it("saisie invalide → le champ revient à la valeur ENREGISTRÉE, jamais vidé", () => {
    renderExpanded();
    const input = field(WEIGHT);
    typeAndCommit(input, "-5");

    // Surtout pas "" : un champ vidé aurait ensuite écrit `null` au prochain
    // commit et effacé une valeur valide.
    expect(input.value).toBe("80");
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("répétitions invalides → aucune écriture non plus (les deux champs, même règle)", () => {
    renderExpanded();
    const input = field(REPS);
    typeAndCommit(input, "-1");

    expect(updateSet).not.toHaveBeenCalled();
    expect(input.value).toBe("10");
  });

  it("une saisie invalide n'empêche pas la suivante, valide, d'être écrite", () => {
    renderExpanded();
    const input = field(WEIGHT);
    typeAndCommit(input, "-5");
    expect(updateSet).not.toHaveBeenCalled();

    typeAndCommit(input, "85");
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith({ id: "set-1", weight: 85 });
  });
});
