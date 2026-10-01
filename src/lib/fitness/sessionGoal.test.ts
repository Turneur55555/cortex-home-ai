import { describe, expect, it } from "vitest";
import { resolveSessionGoal, type SessionGoal, type SessionGoalInput } from "./sessionGoal";
import type { TodayWorkout } from "./todayCard";
import type { TemplateSummary } from "./weeklyPlan";

type SetLike = { reps: number | null; weight: number | null; completed?: boolean };

let seq = 0;
/** Une séance terminée. Par défaut : 12 séries de 8×30 + 2 de 8×60 = 14 séries, 3 840 kg. */
function past(
  name: string,
  extra: Partial<TodayWorkout> = {},
  sets: SetLike[] = [
    ...Array.from({ length: 12 }, () => ({ reps: 8, weight: 30 })),
    ...Array.from({ length: 2 }, () => ({ reps: 8, weight: 60 })),
  ],
): TodayWorkout {
  seq += 1;
  return {
    id: `h-${seq}`,
    date: "2026-09-23",
    name,
    status: "completed",
    discipline: "muscu",
    created_at: "2026-09-23T18:00:00.000Z",
    exercises: [{ id: `e-${seq}`, name: "Exo", exercise_sets: sets }],
    ...extra,
  };
}

const template = (name: string, extra: Partial<TemplateSummary> = {}): TemplateSummary => ({
  id: `t-${name}`,
  name,
  exerciseCount: 5,
  blockCount: 0,
  sets: 14,
  setsComplete: true,
  ...extra,
});

const ticked = (reps: number | null, weight: number | null, n = 1): SetLike[] =>
  Array.from({ length: n }, () => ({ reps, weight, completed: true }));

function goal(over: {
  name?: string;
  sets?: SetLike[];
  history?: TodayWorkout[];
  templates?: TemplateSummary[];
}): SessionGoal | null {
  const input: SessionGoalInput = {
    name: over.name ?? "Épaules A",
    exercises: [{ exercise_sets: over.sets ?? [] }],
    history: over.history ?? [past("Épaules A")],
    templates: over.templates ?? [template("Épaules A")],
  };
  return resolveSessionGoal(input);
}

describe("resolveSessionGoal — une référence, ou rien", () => {
  it("première fois : aucune séance du même nom → rien ne s'affiche", () => {
    expect(goal({ history: [] })).toBeNull();
    expect(goal({ history: [past("Dos A")] })).toBeNull();
  });

  it("séance libre sans nom : rien", () => {
    expect(goal({ name: "  ", history: [past("")] })).toBeNull();
  });

  it("une séance active, annulée ou d'une autre discipline n'est pas une référence", () => {
    expect(
      goal({
        history: [
          past("Épaules A", { status: "active" }),
          past("Épaules A", { status: "cancelled" }),
          past("Épaules A", { discipline: "course" }),
        ],
      }),
    ).toBeNull();
  });

  it("même une séance sauvegardée connue ne crée PAS d'objectif sans référence (on n'invente pas de cible)", () => {
    expect(goal({ history: [], templates: [template("Épaules A")] })).toBeNull();
  });

  it("une référence sans série ni tonnage est ignorée : rien, jamais « 0 / 0 »", () => {
    expect(goal({ history: [past("Épaules A", {}, [])] })).toBeNull();
  });

  it("des exercices sans séries ne font pas planter le calcul", () => {
    const state = resolveSessionGoal({
      name: "Épaules A",
      exercises: [{}, { exercise_sets: null }, { exercise_sets: [] }],
      history: [past("Épaules A")],
      templates: [],
    });
    expect(state).toMatchObject({ setsDone: 0, volumeKg: 0 });
  });
});

describe("resolveSessionGoal — au démarrage", () => {
  it("« Objectif : 14 séries · 3 840 kg », barre à zéro", () => {
    expect(goal({})).toEqual({
      label: "Objectif de séance",
      setsDone: 0,
      setsTarget: 14,
      progress: 0,
      volumeKg: 0,
      volumeTargetKg: 3840,
      beaten: false,
      note: "Objectif : 14 séries · 3 840 kg",
    });
  });

  it("des séries saisies mais pas cochées ne sont pas faites", () => {
    const state = goal({
      sets: [
        { reps: 8, weight: 100, completed: false },
        { reps: 8, weight: 100 },
      ],
    });
    expect(state).toMatchObject({ setsDone: 0, volumeKg: 0, progress: 0 });
    expect(state?.note).toBe("Objectif : 14 séries · 3 840 kg");
  });
});

describe("resolveSessionGoal — en cours de séance", () => {
  // 8 séries de 8×40 (2 560) + 1 de 7×60 (420) = 9 séries, 2 980 kg.
  const NINE = [...ticked(8, 40, 8), ...ticked(7, 60)];

  it("9 / 14 séries, 2 980 kg : « encore 860 kg pour battre ta dernière Épaules A »", () => {
    expect(goal({ sets: NINE })).toEqual({
      label: "Objectif de séance",
      setsDone: 9,
      setsTarget: 14,
      progress: 9 / 14,
      volumeKg: 2980,
      volumeTargetKg: 3840,
      beaten: false,
      note: "2 980 kg soulevés · encore 860 kg pour battre ta dernière Épaules A",
    });
  });

  it("une série cochée sans charge compte comme faite, pour 0 kg", () => {
    const state = goal({ sets: [...ticked(10, null, 2), ...ticked(8, 40)] });
    expect(state).toMatchObject({ setsDone: 3, volumeKg: 320 });
  });

  it("seules les séries cochées comptent dans le volume, pas celles juste saisies", () => {
    const state = goal({ sets: [...ticked(8, 40), { reps: 8, weight: 200, completed: false }] });
    expect(state).toMatchObject({ setsDone: 1, volumeKg: 320 });
  });

  it("les séries de plusieurs exercices s'additionnent", () => {
    const state = resolveSessionGoal({
      name: "Épaules A",
      exercises: [{ exercise_sets: ticked(8, 40, 3) }, { exercise_sets: ticked(10, 20, 2) }],
      history: [past("Épaules A")],
      templates: [],
    });
    expect(state).toMatchObject({ setsDone: 5, volumeKg: 3 * 320 + 2 * 200 });
  });

  it("égalité exacte : ce n'est PAS battu, on le dit tel quel", () => {
    // 12 séries de 8×40 = 3 840 kg pile.
    const state = goal({ sets: ticked(8, 40, 12) });
    expect(state?.volumeKg).toBe(3840);
    expect(state?.beaten).toBe(false);
    expect(state?.label).toBe("Objectif de séance");
    expect(state?.note).toBe("3 840 kg · à égalité avec ta dernière Épaules A");
  });
});

describe("resolveSessionGoal — l'objectif dépassé", () => {
  // 12 séries de 8×40 (3 840) + 1 de 7×40 (280) + 2 cochées sans charge = 15 séries, 4 120 kg.
  const BEATEN = [...ticked(8, 40, 12), ...ticked(7, 40), ...ticked(8, null, 2)];

  it("15 / 14 séries, 4 120 kg : « +280 kg au-dessus de ta dernière Épaules A »", () => {
    expect(goal({ sets: BEATEN })).toEqual({
      label: "Objectif dépassé",
      setsDone: 15,
      setsTarget: 14,
      progress: 1,
      volumeKg: 4120,
      volumeTargetKg: 3840,
      beaten: true,
      note: "4 120 kg · +280 kg au-dessus de ta dernière Épaules A",
    });
  });

  it("un seul kilo de plus suffit : la comparaison est stricte", () => {
    const state = goal({ sets: [...ticked(8, 40, 12), ...ticked(1, 1)] });
    expect(state).toMatchObject({ volumeKg: 3841, beaten: true });
  });

  it("la barre ne dépasse jamais 100 %, même avec plus de séries que prévu", () => {
    expect(goal({ sets: ticked(8, 40, 30) })?.progress).toBe(1);
  });

  it("battre le volume sans avoir fait toutes les séries prévues reste « dépassé » : c'est le volume qui compte", () => {
    // 6 séries très lourdes = 4 800 kg > 3 840 kg, mais 6 / 14 séries seulement.
    const state = goal({ sets: ticked(8, 100, 6) });
    expect(state).toMatchObject({
      setsDone: 6,
      volumeKg: 4800,
      beaten: true,
      label: "Objectif dépassé",
    });
    expect(state?.progress).toBeCloseTo(6 / 14);
  });
});

describe("resolveSessionGoal — d'où viennent les séries prévues", () => {
  it("la séance sauvegardée du même nom, quand elle est unique et complète (même nombre que le plan)", () => {
    const state = goal({ templates: [template("Épaules A", { sets: 12 })] });
    expect(state?.setsTarget).toBe(12);
    expect(state?.note).toBe("Objectif : 12 séries · 3 840 kg");
  });

  it("le nom se compare sans casse ni espaces", () => {
    const state = goal({ name: "  épaules a ", templates: [template("ÉPAULES A", { sets: 12 })] });
    expect(state?.setsTarget).toBe(12);
  });

  it("séries du modèle incomplètes (un exercice sans nombre) : on retombe sur la référence, jamais un minimum présenté comme un total", () => {
    const state = goal({ templates: [template("Épaules A", { sets: 12, setsComplete: false })] });
    expect(state?.setsTarget).toBe(14);
  });

  it("deux modèles du même nom : ambigu, on retombe sur la référence", () => {
    const state = goal({
      templates: [
        { ...template("Épaules A", { sets: 12 }), id: "t-1" },
        { ...template("Épaules A", { sets: 20 }), id: "t-2" },
      ],
    });
    expect(state?.setsTarget).toBe(14);
  });

  it("aucun modèle de ce nom, ou aucun modèle chargé : la référence", () => {
    expect(goal({ templates: [template("Dos A", { sets: 9 })] })?.setsTarget).toBe(14);
    expect(goal({ templates: [] })?.setsTarget).toBe(14);
  });

  it("un modèle sans séries (0) n'est pas une cible", () => {
    expect(goal({ templates: [template("Épaules A", { sets: 0 })] })?.setsTarget).toBe(14);
  });
});

describe("resolveSessionGoal — référence sans charge (poids de corps)", () => {
  const bodyweight = (n: number) =>
    past(
      "Pompes",
      {},
      Array.from({ length: n }, () => ({ reps: 20, weight: null })),
    );
  const run = (sets: SetLike[]) =>
    resolveSessionGoal({
      name: "Pompes",
      exercises: [{ exercise_sets: sets }],
      history: [bodyweight(10)],
      templates: [],
    });

  it("des séries détaillées sans charge ne font pas une référence : le récap de fin de séance ne les compte pas", () => {
    expect(run([])).toBeNull();
  });

  it("une référence dont les séries portent une charge nulle n'a pas de volume à battre", () => {
    const state = resolveSessionGoal({
      name: "Pompes",
      exercises: [{ exercise_sets: [] }],
      history: [
        past("Pompes", {
          exercises: [{ id: "e", name: "Pompes", sets: 10, reps: 20, weight: null }],
        }),
      ],
      templates: [],
    });
    expect(state).toMatchObject({ setsTarget: 10, volumeTargetKg: null, setsDone: 0 });
    expect(state?.note).toBe("Objectif : 10 séries");
  });

  it("en cours : la dernière fois ; au-delà des séries prévues : « de plus que prévu »", () => {
    const history = [
      past("Pompes", {
        exercises: [{ id: "e", name: "Pompes", sets: 10, reps: 20, weight: null }],
      }),
    ];
    const at = (n: number) =>
      resolveSessionGoal({
        name: "Pompes",
        exercises: [{ exercise_sets: ticked(20, null, n) }],
        history,
        templates: [],
      });
    expect(at(4)?.note).toBe("Ta dernière Pompes : 10 séries");
    expect(at(10)).toMatchObject({ beaten: false, progress: 1 });
    expect(at(11)).toMatchObject({
      beaten: true,
      label: "Objectif dépassé",
      note: "11 séries · +1 de plus que prévu",
    });
  });
});

describe("resolveSessionGoal — la référence", () => {
  it("la plus récente séance du même nom, pas la première trouvée", () => {
    const older = past(
      "Épaules A",
      { date: "2026-09-01", created_at: "2026-09-01T18:00:00.000Z" },
      ticked(8, 20, 4),
    );
    const newer = past("Épaules A");
    const state = goal({ history: [older, newer] });
    expect(state?.volumeTargetKg).toBe(3840);
  });

  it("la note reprend le nom tel qu'il est écrit dans l'historique", () => {
    const state = goal({ name: "  épaules a  ", sets: ticked(8, 40) });
    expect(state?.note).toContain("ta dernière Épaules A");
  });

  it("la séance en cours elle-même (statut actif) ne se compare jamais à elle-même", () => {
    const state = goal({
      history: [past("Épaules A", { status: "active", date: "2026-10-01" }), past("Épaules A")],
    });
    expect(state?.volumeTargetKg).toBe(3840);
  });
});

describe("resolveSessionGoal — ce que le texte ne dit jamais", () => {
  const SCENARIOS: Array<[string, SetLike[]]> = [
    ["au démarrage", []],
    ["en cours", [...ticked(8, 40, 8), ...ticked(7, 60)]],
    ["à égalité", ticked(8, 40, 12)],
    ["dépassé", [...ticked(8, 40, 12), ...ticked(7, 40)]],
  ];

  it.each(SCENARIOS)("%s : ni pourcentage, ni consigne de charge", (_name, sets) => {
    const state = goal({ sets });
    expect(state).not.toBeNull();
    for (const text of [state!.label, state!.note]) {
      expect(text).not.toMatch(/%/);
      // Un miroir du passé, jamais une consigne : aucun verbe à l'impératif sur la charge.
      expect(text).not.toMatch(/\b(soulève|ajoute|augmente|vise|essaie|monte)\b/i);
    }
  });
});
