// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * E20 — « Séances » a deux étages, chacun une VRAIE route : l'Arène (`/seances`) et les
 * Chroniques (`/chroniques`). `SeancesTab` ne possède plus aucun état « Chroniques ouvertes » :
 * le module actif et la Chronique ouverte lui viennent de l'URL, via le contrat `ChroniquesRouting`.
 *
 * Les enfants lourds sont remplacés par des marqueurs qui exposent ce qu'on teste : leurs props
 * et leurs callbacks.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const WORKOUT_A = { id: "w-a", name: "Jambes", date: "2026-09-28", exercises: [] };
const WORKOUT_B = { id: "w-b", name: "Dos", date: "2026-09-30", exercises: [] };

const state = vi.hoisted(() => ({
  workouts: { data: [] as unknown[] | undefined, isLoading: false, error: null as Error | null },
  active: { data: null as unknown, isLoading: false },
  generic: { data: null as unknown, isLoading: false },
  startFromTemplate: vi.fn(),
}));

vi.mock("@/hooks/use-fitness", () => ({
  useWorkouts: () => state.workouts,
  useActiveWorkout: () => state.active,
  useExerciseImageUrls: () => ({ data: new Map() }),
  useStartWorkoutFromTemplate: () => ({ mutate: state.startFromTemplate, isPending: false }),
  useStartHybridStrengthWorkout: () => ({ mutate: () => undefined, isPending: false }),
}));
vi.mock("@/hooks/useGenericActiveSession", () => ({
  useActiveGenericWorkout: () => state.generic,
  useStartGenericActiveWorkout: () => ({ mutate: () => undefined, isPending: false }),
}));
vi.mock("@/hooks/useRecoveryMap", () => ({ useRecoveryMap: () => ({ data: null }) }));

const stub = vi.hoisted(() => (name: string) => ({
  [name]: () => <div data-testid={`stub-${name}`} />,
}));
vi.mock("@/components/fitness/SeancesHero", () => stub("SeancesHero"));
vi.mock("@/components/fitness/ChoisirEpreuveCard", () => stub("ChoisirEpreuveCard"));
vi.mock("@/components/fitness/BodyMap", () => stub("BodyMap"));
vi.mock("@/components/fitness/WorkoutCard", () => ({ WorkoutCard: () => <div /> }));
vi.mock("@/components/fitness/WorkoutSheet", () => stub("WorkoutSheet"));
vi.mock("@/components/fitness/session/GenericSessionReviewSheet", () =>
  stub("GenericSessionReviewSheet"),
);
vi.mock("@/components/fitness/StartWorkoutSheet", () => stub("StartWorkoutSheet"));
vi.mock("@/components/fitness/templates/NewSessionSheet", () => stub("NewSessionSheet"));
vi.mock("@/components/fitness/templates/SavedTemplatesSheet", () => stub("SavedTemplatesSheet"));
vi.mock("@/components/fitness/templates/TemplateEditorSheet", () => stub("TemplateEditorSheet"));
vi.mock("@/components/fitness/ExerciseCatalogSheet", () => stub("ExerciseCatalogSheet"));
vi.mock("@/components/fitness/PostWorkoutAnalysisSheet", () => stub("PostWorkoutAnalysisSheet"));
vi.mock("@/components/fitness/session/GenericPostWorkoutAnalysisSheet", () =>
  stub("GenericPostWorkoutAnalysisSheet"),
);
vi.mock("@/components/fitness/session/SessionRewardScreen", () => stub("SessionRewardScreen"));
vi.mock("@/components/fitness/session/SessionRecapScreen", () => stub("SessionRecapScreen"));
vi.mock("@/components/fitness/session/ActiveGenericSessionView", () =>
  stub("ActiveGenericSessionView"),
);
vi.mock("@/components/fitness/plan/WeekPlanCard", () => stub("WeekPlanCard"));
vi.mock("@/components/fitness/SeancesStageSwitch", () => stub("SeancesStageSwitch"));
vi.mock("@/components/fitness/SectionReveal", () => ({
  SectionReveal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./CoachSheet", () => ({ CoachSheet: () => <div data-testid="stub-CoachSheet" /> }));

vi.mock("@/components/fitness/RepeatLiveConfirmDialog", () => ({
  RepeatLiveConfirmDialog: ({
    workoutName,
    onConfirm,
  }: {
    workoutName: string;
    onConfirm: () => void;
  }) => (
    <div data-testid="repeat-dialog">
      Refaire « {workoutName} » en live ?<button onClick={onConfirm}>confirmer</button>
    </div>
  ),
}));

// Une séance active qui peut se terminer : expose `onFinished`.
vi.mock("@/components/fitness/ActiveWorkoutView", () => ({
  ActiveWorkoutView: ({
    workout,
    onFinished,
  }: {
    workout: { id: string };
    onFinished: (w: { id: string; name: string; exercises: unknown[] }) => void;
  }) => (
    <button
      data-testid="active-view"
      onClick={() => onFinished({ id: workout.id, name: "Push Day", exercises: [] })}
    >
      terminer
    </button>
  ),
}));

vi.mock("@/components/fitness/chronique/ChroniquesPage", () => ({
  ChroniquesPage: (props: {
    module: string;
    onModuleChange: (m: string) => void;
    onOpenChronicle: (w: unknown) => void;
    onRepeatLive: (w: unknown) => void;
  }) => (
    <div data-testid="chroniques-page" data-module={props.module}>
      <button onClick={() => props.onModuleChange("forge")}>vers-forge</button>
      <button onClick={() => props.onOpenChronicle(WORKOUT_A)}>ouvrir-chronique</button>
      <button onClick={() => props.onRepeatLive({ ...WORKOUT_A, exercises: [] })}>refaire</button>
    </div>
  ),
}));
vi.mock("@/components/fitness/chronique/ChroniquePage", () => ({
  ChroniquePage: (props: {
    workout: { id: string };
    onBack: () => void;
    onNavigate: (w: unknown) => void;
  }) => (
    <div data-testid="chronique-page" data-id={props.workout.id}>
      <button onClick={props.onBack}>retour</button>
      <button onClick={() => props.onNavigate(WORKOUT_B)}>suivante</button>
    </div>
  ),
}));

import type { ChroniquesRouting } from "@/lib/fitness/chroniquesRouting";
import { SeancesTab } from "./SeancesTab";

let container: HTMLDivElement;
let root: Root;
let routing: {
  module: ChroniquesRouting["module"];
  chronicleId: string | undefined;
  onModuleChange: Mock<ChroniquesRouting["onModuleChange"]>;
  onChronicleOpen: Mock<ChroniquesRouting["onChronicleOpen"]>;
  onChronicleClose: Mock<ChroniquesRouting["onChronicleClose"]>;
};

beforeEach(() => {
  state.workouts = { data: [WORKOUT_A, WORKOUT_B], isLoading: false, error: null };
  state.active = { data: null, isLoading: false };
  state.generic = { data: null, isLoading: false };
  state.startFromTemplate.mockReset();
  routing = {
    module: "legendes",
    onModuleChange: vi.fn<ChroniquesRouting["onModuleChange"]>(),
    chronicleId: undefined,
    onChronicleOpen: vi.fn<ChroniquesRouting["onChronicleOpen"]>(),
    onChronicleClose: vi.fn<ChroniquesRouting["onChronicleClose"]>(),
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = (over: Partial<ChroniquesRouting> = {}) =>
  act(() => root.render(<SeancesTab view="chroniques" chroniques={{ ...routing, ...over }} />));
const renderArene = () => act(() => root.render(<SeancesTab />));
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);
const button = (text: string) =>
  Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text);
const click = (el: Element | undefined) => {
  if (!el) throw new Error("élément introuvable");
  act(() => (el as HTMLElement).click());
};

describe("SeancesTab — l'Arène, premier étage", () => {
  it("affiche le sélecteur d'étages et plus aucune carte d'entrée vers les Chroniques", () => {
    renderArene();
    expect(q("stub-SeancesStageSwitch")).not.toBeNull();
    expect(q("stub-SeancesHero")).not.toBeNull();
    expect(q("chroniques-page")).toBeNull();
  });
});

describe("SeancesTab — les Chroniques, second étage (route /chroniques)", () => {
  it("affiche la page des Chroniques sur le module de l'URL, pas la vue Arène", () => {
    render({ module: "progression" });
    expect(q("chroniques-page")?.getAttribute("data-module")).toBe("progression");
    expect(q("stub-SeancesHero")).toBeNull();
    expect(q("stub-BodyMap")).toBeNull();
  });

  it("changer de module passe par l'URL (contrat de routage), jamais par un état local", () => {
    render();
    click(button("vers-forge"));
    expect(routing.onModuleChange).toHaveBeenCalledWith("forge");
    // Aucun état local : tant que la route ne change pas, le module affiché reste celui de l'URL.
    expect(q("chroniques-page")?.getAttribute("data-module")).toBe("legendes");
  });

  it("ouvrir une Chronique ajoute une entrée d'historique (push)", () => {
    render();
    click(button("ouvrir-chronique"));
    expect(routing.onChronicleOpen).toHaveBeenCalledWith("w-a", "push");
  });
});

describe("SeancesTab — la Chronique immersive (?seance=)", () => {
  it("l'identifiant de l'URL ouvre la Chronique de CETTE séance, à la place de la liste", () => {
    render({ chronicleId: "w-b" });
    expect(q("chronique-page")?.getAttribute("data-id")).toBe("w-b");
    expect(q("chroniques-page")).toBeNull();
  });

  it("« Retour » referme via la route ; « suivante » REMPLACE l'entrée (le retour ne rejoue pas chaque pas)", () => {
    render({ chronicleId: "w-a" });
    click(button("suivante"));
    expect(routing.onChronicleOpen).toHaveBeenCalledWith("w-b", "replace");
    click(button("retour"));
    expect(routing.onChronicleClose).toHaveBeenCalledTimes(1);
    expect(routing.onChronicleClose).toHaveBeenCalledWith(); // sans option : la route décide (retour arrière)
  });

  it("historique en cours de chargement : un chargement, ni la liste (qui clignoterait) ni fermeture", () => {
    state.workouts = { data: undefined, isLoading: true, error: null };
    render({ chronicleId: "w-a" });
    expect(q("chronique-loading")).not.toBeNull();
    expect(q("chroniques-page")).toBeNull();
    expect(q("chronique-page")).toBeNull();
    expect(routing.onChronicleClose).not.toHaveBeenCalled();
  });

  it("identifiant introuvable (séance supprimée, lien périmé) : fermeture par REMPLACEMENT, une seule fois", () => {
    render({ chronicleId: "inconnu" });
    expect(routing.onChronicleClose).toHaveBeenCalledTimes(1);
    expect(routing.onChronicleClose).toHaveBeenCalledWith({ replace: true });
    // Re-rendu avec les mêmes données : pas de seconde navigation.
    render({ chronicleId: "inconnu" });
    expect(routing.onChronicleClose).toHaveBeenCalledTimes(1);
  });

  it("identifiant connu : jamais de fermeture", () => {
    render({ chronicleId: "w-a" });
    expect(routing.onChronicleClose).not.toHaveBeenCalled();
  });

  it("l'historique arrive après coup : la Chronique s'ouvre, sans avoir été fermée entre-temps", () => {
    state.workouts = { data: undefined, isLoading: true, error: null };
    render({ chronicleId: "w-a" });
    state.workouts = { data: [WORKOUT_A], isLoading: false, error: null };
    render({ chronicleId: "w-a" });
    expect(q("chronique-page")?.getAttribute("data-id")).toBe("w-a");
    expect(routing.onChronicleClose).not.toHaveBeenCalled();
  });
});

describe("SeancesTab — ce que les Chroniques déclenchent doit être visible (défaut mesuré avant E20)", () => {
  it("« Refaire en live » depuis les Chroniques ouvre la confirmation (avant : 0 dialogue visible)", () => {
    render();
    expect(q("repeat-dialog")).toBeNull();
    click(button("refaire"));
    expect(q("repeat-dialog")?.textContent).toContain("Refaire « Jambes » en live ?");
  });

  it("confirmer démarre la séance refaite", () => {
    render();
    click(button("refaire"));
    click(button("confirmer"));
    expect(state.startFromTemplate).toHaveBeenCalledTimes(1);
    expect(state.startFromTemplate.mock.calls[0][0]).toMatchObject({ name: "Jambes" });
    expect(q("repeat-dialog")).toBeNull();
  });

  it("la même confirmation existe toujours dans l'Arène", () => {
    renderArene();
    expect(q("repeat-dialog")).toBeNull(); // rien tant qu'on n'a rien demandé
  });

  it("une séance terminée pendant que l'URL est /chroniques GARDE son écran de récompense", () => {
    state.active = {
      data: { id: "w-live", name: "Push Day", created_at: "2026-10-01T08:00:00Z", exercises: [] },
      isLoading: false,
    };
    render();
    expect(q("active-view")).not.toBeNull(); // la séance en cours prime, même sur /chroniques
    click(q("active-view") as Element);
    expect(q("stub-SessionRewardScreen")).not.toBeNull();

    // La séance est close : on retombe sur la vue Chroniques — la récompense doit survivre.
    state.active = { data: null, isLoading: false };
    render();
    expect(q("chroniques-page")).not.toBeNull();
    expect(q("stub-SessionRewardScreen")).not.toBeNull();
  });
});

describe("SeancesTab — la séance en cours prime sur les deux étages", () => {
  it("sur /chroniques comme sur /seances : c'est la séance qui s'affiche", () => {
    state.active = {
      data: { id: "w-live", name: "Push Day", created_at: "2026-10-01T08:00:00Z", exercises: [] },
      isLoading: false,
    };
    render({ module: "forge" });
    expect(q("active-view")).not.toBeNull();
    expect(q("chroniques-page")).toBeNull();
  });
});
