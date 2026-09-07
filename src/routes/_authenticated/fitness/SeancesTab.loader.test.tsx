// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * CHANTIER 9 (B3), verrouillé par le CHANTIER FINAL (AUD-09, test 1) —
 * LE LOADER RESTE AFFICHÉ TANT QUE LA SÉANCE ACTIVE N'EST PAS CONNUE.
 *
 * La régression que ce test empêche est précise et a déjà eu lieu : la
 * condition était `(activeLoading || activeGenericLoading) && isLoading`,
 * c'est-à-dire qu'elle exigeait que l'HISTORIQUE soit lui aussi en cours de
 * chargement. Or `isLoading` (useWorkouts) est servi par le store local et
 * retombe à `false` presque immédiatement, hors ligne y compris : dans le cas
 * courant le loader disparaissait alors que la séance en cours n'était pas
 * encore connue, l'écran affichait la vue historique, puis basculait sur la
 * séance active — le clignotement que ce loader existe précisément pour
 * éviter.
 *
 * Le premier test ci-dessous reproduit EXACTEMENT cette combinaison
 * (`isLoading: false`, `activeLoading: true`) : avec l'ancienne condition, il
 * échoue.
 *
 * Les enfants lourds sont remplacés par des marqueurs inertes : ce test ne
 * porte que sur la décision d'affichage, pas sur le rendu des Chroniques, de
 * la BodyMap ou du catalogue.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  workouts: { data: [] as unknown[], isLoading: false, error: null as Error | null },
  active: { data: null as unknown, isLoading: false },
  generic: { data: null as unknown, isLoading: false },
}));

const noopMutation = vi.hoisted(() => () => ({
  mutate: () => undefined,
  mutateAsync: async () => undefined,
  isPending: false,
}));

vi.mock("@/hooks/use-fitness", () => ({
  useWorkouts: () => state.workouts,
  useActiveWorkout: () => state.active,
  useExerciseImageUrls: () => ({ data: new Map() }),
  useStartWorkoutFromTemplate: noopMutation,
  useStartHybridStrengthWorkout: noopMutation,
}));

vi.mock("@/hooks/useGenericActiveSession", () => ({
  useActiveGenericWorkout: () => state.generic,
  useStartGenericActiveWorkout: noopMutation,
}));

vi.mock("@/hooks/useRecoveryMap", () => ({ useRecoveryMap: () => ({ data: null }) }));

// Enfants lourds — remplacés par des marqueurs : leur rendu n'entre pas dans
// la décision testée, et les monter réellement ferait dépendre ce test des
// Chroniques, de recharts et du catalogue d'exercices.
const stub = vi.hoisted(() => (name: string) => ({
  [name]: () => <div data-testid={`stub-${name}`} />,
}));
vi.mock("@/components/fitness/SeancesHero", () => stub("SeancesHero"));
vi.mock("@/components/fitness/ChoisirEpreuveCard", () => stub("ChoisirEpreuveCard"));
vi.mock("@/components/fitness/BodyMap", () => stub("BodyMap"));
vi.mock("@/components/fitness/WorkoutCard", () => ({ WorkoutCard: () => <div /> }));
vi.mock("@/components/fitness/RepeatLiveConfirmDialog", () => stub("RepeatLiveConfirmDialog"));
vi.mock("@/components/fitness/WorkoutSheet", () => stub("WorkoutSheet"));
vi.mock("@/components/fitness/session/GenericSessionReviewSheet", () =>
  stub("GenericSessionReviewSheet"),
);
vi.mock("@/components/fitness/StartWorkoutSheet", () => stub("StartWorkoutSheet"));
vi.mock("@/components/fitness/templates/NewSessionSheet", () => stub("NewSessionSheet"));
vi.mock("@/components/fitness/templates/SavedTemplatesSheet", () => stub("SavedTemplatesSheet"));
vi.mock("@/components/fitness/templates/TemplateEditorSheet", () => stub("TemplateEditorSheet"));
vi.mock("@/components/fitness/ActiveWorkoutView", () => ({
  ActiveWorkoutView: () => <div data-testid="stub-ActiveWorkoutView" />,
}));
vi.mock("@/components/fitness/session/ActiveGenericSessionView", () => ({
  ActiveGenericSessionView: () => <div data-testid="stub-ActiveGenericSessionView" />,
}));
vi.mock("@/components/fitness/ExerciseCatalogSheet", () => stub("ExerciseCatalogSheet"));
vi.mock("@/components/fitness/PostWorkoutAnalysisSheet", () => stub("PostWorkoutAnalysisSheet"));
vi.mock("@/components/fitness/session/GenericPostWorkoutAnalysisSheet", () =>
  stub("GenericPostWorkoutAnalysisSheet"),
);
vi.mock("@/components/fitness/session/SessionRewardScreen", () => stub("SessionRewardScreen"));
vi.mock("@/components/fitness/session/SessionRecapScreen", () => stub("SessionRecapScreen"));
vi.mock("@/components/fitness/chronique/ChroniquePage", () => stub("ChroniquePage"));
vi.mock("@/components/fitness/chronique/ChroniquesEntryCard", () => stub("ChroniquesEntryCard"));
vi.mock("@/components/fitness/chronique/ChroniquesPage", () => stub("ChroniquesPage"));
vi.mock("@/components/fitness/SectionReveal", () => ({
  SectionReveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./CoachSheet", () => ({ CoachSheet: () => <div data-testid="stub-CoachSheet" /> }));

import { SeancesTab } from "./SeancesTab";

const LOADER = '[data-testid="seances-active-workout-loading"]';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  state.workouts = { data: [], isLoading: false, error: null };
  state.active = { data: null, isLoading: false };
  state.generic = { data: null, isLoading: false };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function render() {
  act(() => {
    root.render(<SeancesTab />);
  });
}

describe("SeancesTab — le loader couvre la séance active (AUD-09, test 1)", () => {
  it("séance active en cours de chargement ET historique DÉJÀ servi → loader affiché", () => {
    // La combinaison exacte de la régression : le store local a déjà répondu
    // pour l'historique, la séance active non.
    state.workouts = { data: [], isLoading: false, error: null };
    state.active = { data: null, isLoading: true };
    render();

    expect(container.querySelector(LOADER)).not.toBeNull();
    // Rien d'autre n'est monté : pas de vue historique, donc pas de
    // clignotement possible.
    expect(container.querySelector('[data-testid="stub-SeancesHero"]')).toBeNull();
    expect(container.querySelector('[data-testid="stub-ChoisirEpreuveCard"]')).toBeNull();
  });

  it("séance active GÉNÉRIQUE en cours de chargement → loader affiché", () => {
    state.generic = { data: null, isLoading: true };
    render();

    expect(container.querySelector(LOADER)).not.toBeNull();
    expect(container.querySelector('[data-testid="stub-SeancesHero"]')).toBeNull();
  });

  it("les deux chargements terminés → le loader disparaît, la vue s'affiche", () => {
    state.active = { data: null, isLoading: false };
    state.generic = { data: null, isLoading: false };
    render();

    expect(container.querySelector(LOADER)).toBeNull();
    expect(container.querySelector('[data-testid="stub-SeancesHero"]')).not.toBeNull();
  });

  it("séance active connue → la séance est rendue, jamais le loader", () => {
    state.active = {
      data: { id: "w-1", name: "Push Day", created_at: "2026-09-07T08:00:00Z", exercises: [] },
      isLoading: false,
    };
    render();

    expect(container.querySelector(LOADER)).toBeNull();
    expect(container.querySelector('[data-testid="stub-ActiveWorkoutView"]')).not.toBeNull();
  });

  it("l'historique encore en chargement ne suffit JAMAIS à couvrir la séance active", () => {
    // Cas inverse du premier : c'est l'historique qui charge, la séance
    // active est connue. Le loader plein écran ne doit PAS s'afficher — la
    // vue a son propre indicateur pour l'historique.
    state.workouts = { data: undefined as unknown as unknown[], isLoading: true, error: null };
    state.active = { data: null, isLoading: false };
    render();

    expect(container.querySelector(LOADER)).toBeNull();
  });
});
