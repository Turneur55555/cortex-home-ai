import { describe, expect, it } from "vitest";
import {
  daysBetweenYMD,
  describeLastTime,
  describeNextTraining,
  formatKg,
  lastCompletedSession,
  lastSameNamedSession,
  longDayLabel,
  nextTrainingAfter,
  relativeDaysLabel,
  resolveTodayCard,
  type TodayCardInput,
  type TodayCardState,
  type TodayWorkout,
} from "./todayCard";
import {
  buildWeekView,
  emptyWeeklyPlan,
  type PlanDay,
  type TemplateSummary,
  type WeeklyPlan,
} from "./weeklyPlan";

// Semaine de référence : jeudi 01/10/2026 → lundi 28/09 … dimanche 04/10.
const THURSDAY = "2026-10-01";

function template(id: string, name: string, extra: Partial<TemplateSummary> = {}): TemplateSummary {
  return {
    id,
    name,
    exerciseCount: 5,
    blockCount: 0,
    sets: 14,
    setsComplete: true,
    ...extra,
  };
}

const EPAULES_A = template("tpl-epaules", "Épaules A");
const TEMPLATES = new Map([[EPAULES_A.id, EPAULES_A]]);

function planOf(days: Partial<Record<number, PlanDay>>): WeeklyPlan {
  const plan = emptyWeeklyPlan();
  for (const [day, value] of Object.entries(days)) {
    plan[Number(day) as keyof WeeklyPlan] = value ?? null;
  }
  return plan;
}

const muscles = (dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7, groups: ("dos" | "pecs" | "epaules")[]) =>
  ({ dayOfWeek, kind: "muscles", groups }) as PlanDay;
const rest = (dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7) => ({ dayOfWeek, kind: "rest" }) as PlanDay;
const tpl = (dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7, templateId: string | null) =>
  ({ dayOfWeek, kind: "template", templateId }) as PlanDay;

let seq = 0;
/** Une séance terminée. 12 séries de 8×30 + 2 séries de 8×60 = 14 séries, 3 840 kg. */
function done(
  date: string,
  name: string,
  extra: Partial<TodayWorkout> = {},
  sets: Array<{ reps: number | null; weight: number | null }> = [
    ...Array.from({ length: 12 }, () => ({ reps: 8, weight: 30 })),
    ...Array.from({ length: 2 }, () => ({ reps: 8, weight: 60 })),
  ],
): TodayWorkout {
  seq += 1;
  return {
    id: `w-${seq}`,
    date,
    name,
    status: "completed",
    discipline: "muscu",
    created_at: `${date}T18:00:00.000Z`,
    exercises: [{ id: `e-${seq}`, name: "Exo", exercise_sets: sets }],
    ...extra,
  };
}

function input(over: {
  plan?: WeeklyPlan;
  workouts?: TodayWorkout[];
  templatesById?: ReadonlyMap<string, TemplateSummary> | null;
  activeWorkout?: TodayCardInput["activeWorkout"];
  today?: string;
}): TodayCardInput {
  const today = over.today ?? THURSDAY;
  const workouts = over.workouts ?? [];
  return {
    week: buildWeekView(over.plan ?? emptyWeeklyPlan(), workouts, today),
    todayDate: today,
    templatesById: over.templatesById === undefined ? TEMPLATES : over.templatesById,
    activeWorkout: over.activeWorkout ?? null,
    workouts,
  };
}

const card = (over: Parameters<typeof input>[0]) => resolveTodayCard(input(over));

describe("helpers de dates", () => {
  it("daysBetweenYMD : arrondi correct à travers un changement d'heure", () => {
    expect(daysBetweenYMD("2026-03-28", "2026-03-30")).toBe(2); // passage à l'heure d'été
    expect(daysBetweenYMD("2026-10-24", "2026-10-26")).toBe(2); // passage à l'heure d'hiver
    expect(daysBetweenYMD("2026-10-01", "2026-10-01")).toBe(0);
    expect(daysBetweenYMD("2026-10-05", "2026-10-01")).toBe(-4);
  });

  it("relativeDaysLabel : aujourd'hui, hier, il y a N jours, demain, dans N jours", () => {
    expect(relativeDaysLabel("2026-10-01", THURSDAY)).toBe("aujourd'hui");
    expect(relativeDaysLabel("2026-09-30", THURSDAY)).toBe("hier");
    expect(relativeDaysLabel("2026-09-23", THURSDAY)).toBe("il y a 8 jours");
    expect(relativeDaysLabel("2026-10-02", THURSDAY)).toBe("demain");
    expect(relativeDaysLabel("2026-10-04", THURSDAY)).toBe("dans 3 jours");
  });

  it("longDayLabel : « Jeudi 1 octobre »", () => {
    expect(longDayLabel(THURSDAY)).toBe("Jeudi 1 octobre");
    expect(longDayLabel("2026-12-25")).toBe("Vendredi 25 décembre");
  });

  it("formatKg : milliers séparés par une espace insécable, arrondi au kilo", () => {
    expect(formatKg(3840)).toBe("3 840");
    expect(formatKg(999)).toBe("999");
    expect(formatKg(1234567.4)).toBe("1 234 567");
  });
});

describe("lastSameNamedSession — la référence « la dernière fois »", () => {
  it("prend la plus récente séance TERMINÉE du même nom (casse et espaces ignorés)", () => {
    const older = done("2026-09-10", "Épaules A");
    const newer = done("2026-09-23", "  épaules a ");
    const ref = lastSameNamedSession([older, newer], "Épaules A");
    expect(ref?.workoutId).toBe(newer.id);
    expect(ref).toMatchObject({ date: "2026-09-23", sets: 14, volumeKg: 3840 });
  });

  it("départage deux séances du même jour par l'horodatage de création", () => {
    const morning = done("2026-09-23", "Épaules A", { created_at: "2026-09-23T07:00:00.000Z" });
    const evening = done("2026-09-23", "Épaules A", { created_at: "2026-09-23T19:00:00.000Z" });
    expect(lastSameNamedSession([evening, morning], "Épaules A")?.workoutId).toBe(evening.id);
    expect(lastSameNamedSession([morning, evening], "Épaules A")?.workoutId).toBe(evening.id);
  });

  it("ignore les séances actives, annulées et celles d'une autre discipline", () => {
    const refs = [
      done("2026-09-30", "Épaules A", { status: "active" }),
      done("2026-09-29", "Épaules A", { status: "cancelled" }),
      done("2026-09-28", "Épaules A", { discipline: "course" }),
    ];
    expect(lastSameNamedSession(refs, "Épaules A")).toBeNull();
  });

  it("saute une séance sans série ni tonnage plutôt que d'afficher « 0 série »", () => {
    const empty = done("2026-09-30", "Épaules A", {}, []);
    const good = done("2026-09-20", "Épaules A");
    expect(lastSameNamedSession([empty, good], "Épaules A")?.workoutId).toBe(good.id);
    expect(lastSameNamedSession([empty], "Épaules A")).toBeNull();
  });

  it("beforeDate exclut le jour même et le futur", () => {
    const today = done(THURSDAY, "Épaules A");
    const past = done("2026-09-23", "Épaules A");
    expect(lastSameNamedSession([today, past], "Épaules A", THURSDAY)?.workoutId).toBe(past.id);
  });

  it("un nom vide ne correspond à rien", () => {
    expect(lastSameNamedSession([done("2026-09-23", "")], "  ")).toBeNull();
  });

  it("compte comme la carte récap de fin de séance : une série à poids 0 n'est pas validée", () => {
    const sets = [
      { reps: 10, weight: 50 },
      { reps: 10, weight: 0 }, // poids de corps : pas une « série valide » pour le récap
      { reps: null, weight: 50 },
    ];
    const ref = lastSameNamedSession([done("2026-09-23", "Pompes", {}, sets)], "Pompes");
    expect(ref).toMatchObject({ sets: 1, volumeKg: 500 });
  });
});

describe("lastCompletedSession", () => {
  it("la plus récente séance de musculation terminée, quel que soit son nom", () => {
    const a = done("2026-09-20", "Dos A");
    const b = done("2026-09-28", "Jambes B");
    const c = done("2026-09-30", "Course", { discipline: "course" });
    expect(lastCompletedSession([a, b, c])).toEqual({
      workoutId: b.id,
      name: "Jambes B",
      date: "2026-09-28",
    });
    expect(lastCompletedSession([])).toBeNull();
  });
});

describe("describeLastTime", () => {
  it("« La dernière fois : 14 séries · 3 840 kg · il y a 8 jours »", () => {
    const ref = lastSameNamedSession([done("2026-09-23", "Épaules A")], "Épaules A");
    expect(describeLastTime(ref!, THURSDAY)).toBe(
      "La dernière fois : 14 séries · 3 840 kg · il y a 8 jours",
    );
  });

  it("jamais un chiffre à zéro : pas de tonnage → seulement les séries et le jour", () => {
    expect(
      describeLastTime(
        { workoutId: "w", name: "x", date: "2026-09-30", sets: 1, volumeKg: 0 },
        THURSDAY,
      ),
    ).toBe("La dernière fois : 1 série · hier");
    expect(
      describeLastTime(
        { workoutId: "w", name: "x", date: "2026-09-30", sets: 0, volumeKg: 900 },
        THURSDAY,
      ),
    ).toBe("La dernière fois : 900 kg · hier");
  });
});

describe("nextTrainingAfter — la prochaine séance prévue (plan récurrent)", () => {
  it("le lendemain quand il est prévu", () => {
    const week = input({ plan: planOf({ 5: muscles(5, ["dos"]) }) }).week;
    expect(nextTrainingAfter(week, THURSDAY)).toMatchObject({
      date: "2026-10-02",
      daysFromToday: 1,
      dayOfWeek: 5,
    });
  });

  it("passe par-dessus les repos et les jours libres", () => {
    const week = input({ plan: planOf({ 5: rest(5), 6: rest(6), 7: muscles(7, ["pecs"]) }) }).week;
    expect(nextTrainingAfter(week, THURSDAY)).toMatchObject({ daysFromToday: 3, dayOfWeek: 7 });
  });

  it("après dimanche, repart sur lundi de la semaine suivante (le plan est récurrent)", () => {
    const sunday = "2026-10-04";
    const week = input({ plan: planOf({ 1: muscles(1, ["dos"]) }), today: sunday }).week;
    expect(nextTrainingAfter(week, sunday)).toMatchObject({
      date: "2026-10-05",
      daysFromToday: 1,
      dayOfWeek: 1,
    });
  });

  it("le même jour de la semaine prochaine est atteint à 7 jours — jamais aujourd'hui lui-même", () => {
    const week = input({ plan: planOf({ 4: muscles(4, ["dos"]) }) }).week;
    expect(nextTrainingAfter(week, THURSDAY)).toMatchObject({
      date: "2026-10-08",
      daysFromToday: 7,
      dayOfWeek: 4,
    });
  });

  it("null si le plan n'a aucun entraînement (repos seuls, ou vide)", () => {
    expect(nextTrainingAfter(input({ plan: planOf({ 2: rest(2) }) }).week, THURSDAY)).toBeNull();
    expect(nextTrainingAfter(input({}).week, THURSDAY)).toBeNull();
  });

  it("se formule : demain, un jour de la semaine, « jeudi prochain »", () => {
    const at = (offsetPlan: Record<number, PlanDay>) => {
      const week = input({ plan: planOf(offsetPlan) }).week;
      return describeNextTraining(nextTrainingAfter(week, THURSDAY)!, TEMPLATES);
    };
    expect(at({ 5: muscles(5, ["dos", "pecs"]) })).toBe(
      "Prochaine séance : demain · Dos + Pectoraux",
    );
    expect(at({ 7: tpl(7, EPAULES_A.id) })).toBe("Prochaine séance : dimanche · Épaules A");
    expect(at({ 4: muscles(4, ["dos"]) })).toBe("Prochaine séance : jeudi prochain · Dos");
  });
});

describe("resolveTodayCard — état « active » (séance en cours)", () => {
  const created = new Date(2026, 9, 1, 18, 42).toISOString();

  it("prime sur tout : plan du jour, séance déjà faite aujourd'hui, repos", () => {
    const state = card({
      plan: planOf({ 4: tpl(4, EPAULES_A.id) }),
      workouts: [done(THURSDAY, "Autre")],
      activeWorkout: { name: "Épaules A", created_at: created },
    });
    expect(state).toMatchObject({
      kind: "active",
      kicker: "Séance en cours",
      title: "Épaules A",
      subtitle: "Démarrée à 18:42",
      primary: { label: "Reprendre ma séance", action: { type: "resume" } },
      secondary: null,
    });
  });

  it("sans nom → « Ma séance » ; horodatage illisible → pas de sous-titre inventé", () => {
    const state = card({ activeWorkout: { name: "  ", created_at: "pas une date" } });
    expect(state).toMatchObject({ kind: "active", title: "Ma séance", subtitle: null });
  });
});

describe("resolveTodayCard — état « planned » (entraînement prévu aujourd'hui)", () => {
  const plan = planOf({ 4: tpl(4, EPAULES_A.id) });

  it("séance sauvegardée : nom, séries prévues, dernière fois, démarrage direct", () => {
    const state = card({ plan, workouts: [done("2026-09-23", "Épaules A")] });
    expect(state).toEqual({
      kind: "planned",
      kicker: "Jeudi 1 octobre · aujourd'hui",
      title: "Épaules A",
      subtitle: "Prévu dans ton rythme · 14 séries · 5 exos",
      lastTime: "La dernière fois : 14 séries · 3 840 kg · il y a 8 jours",
      primary: {
        label: "Démarrer la séance",
        action: { type: "start-template", templateId: EPAULES_A.id },
      },
      secondary: { label: "Changer", action: { type: "edit-plan" } },
    });
  });

  it("aucune séance du même nom → pas de « dernière fois » inventée", () => {
    expect(card({ plan, workouts: [done("2026-09-23", "Dos A")] }).lastTime).toBeNull();
    expect(card({ plan }).lastTime).toBeNull();
  });

  it("séries incomplètes : « 12+ séries », jamais un total inventé", () => {
    const partial = template("tpl-p", "Épaules A", {
      sets: 12,
      setsComplete: false,
      exerciseCount: 4,
    });
    const state = card({
      plan: planOf({ 4: tpl(4, "tpl-p") }),
      templatesById: new Map([["tpl-p", partial]]),
    });
    expect(state.subtitle).toBe("Prévu dans ton rythme · 12+ séries · 4 exos");
  });

  it("modèle sans exercice : pas de détail, le sous-titre reste vrai", () => {
    const bare = template("tpl-b", "Séance vide", {
      sets: 0,
      exerciseCount: 0,
      setsComplete: false,
    });
    const state = card({
      plan: planOf({ 4: tpl(4, "tpl-b") }),
      templatesById: new Map([["tpl-b", bare]]),
    });
    expect(state.subtitle).toBe("Prévu dans ton rythme");
  });

  it("modèles pas encore chargés : « loading », jamais « supprimée »", () => {
    const state = card({ plan, templatesById: null });
    expect(state.kind).toBe("loading");
    expect(state.primary).toBeNull();
    expect(state.secondary).toBeNull();
  });

  it("séance sauvegardée SUPPRIMÉE : le jour reste un jour d'entraînement, on le dit, on ne démarre rien", () => {
    for (const planDay of [tpl(4, null), tpl(4, "tpl-inconnu")]) {
      const state = card({ plan: planOf({ 4: planDay }) });
      expect(state).toMatchObject({
        kind: "planned",
        title: "Séance supprimée",
        subtitle: "Prévu dans ton rythme · cette séance sauvegardée n'existe plus",
        lastTime: null,
        primary: { label: "Choisir une épreuve", action: { type: "new-session" } },
      });
    }
  });

  it("simples groupes musculaires : le focus, et « Démarrer » ouvre le choix d'épreuve", () => {
    const state = card({ plan: planOf({ 4: muscles(4, ["dos", "pecs"]) }) });
    expect(state).toMatchObject({
      kind: "planned",
      title: "Dos + Pectoraux",
      subtitle: "Prévu dans ton rythme",
      lastTime: null,
      primary: { label: "Démarrer la séance", action: { type: "new-session" } },
      secondary: { label: "Changer", action: { type: "edit-plan" } },
    });
  });

  it("un jour manqué plus tôt dans la semaine ne change rien à la carte d'aujourd'hui", () => {
    const state = card({ plan: planOf({ 1: muscles(1, ["dos"]), 4: tpl(4, EPAULES_A.id) }) });
    expect(state).toMatchObject({ kind: "planned", title: "Épaules A" });
  });
});

describe("resolveTodayCard — état « rest »", () => {
  it("Repos + prochaine séance ; « M'entraîner quand même » reste TOUJOURS là, en secondaire", () => {
    const state = card({ plan: planOf({ 4: rest(4), 5: muscles(5, ["dos"]) }) });
    expect(state).toEqual({
      kind: "rest",
      kicker: "Jeudi 1 octobre · aujourd'hui",
      title: "Repos",
      subtitle: "Prochaine séance : demain · Dos",
      lastTime: null,
      primary: null,
      secondary: { label: "M'entraîner quand même", action: { type: "new-session" } },
    });
  });

  it("repos sans aucune séance prévue ensuite : pas de sous-titre inventé", () => {
    expect(card({ plan: planOf({ 4: rest(4) }) }).subtitle).toBeNull();
  });
});

describe("resolveTodayCard — état « done »", () => {
  it("séance faite aujourd'hui : on le dit, puis la prochaine", () => {
    const state = card({
      plan: planOf({ 4: tpl(4, EPAULES_A.id), 5: muscles(5, ["dos"]) }),
      workouts: [done(THURSDAY, "Épaules A")],
    });
    expect(state).toMatchObject({
      kind: "done",
      title: "Séance faite",
      subtitle: "Prochaine séance : demain · Dos",
      primary: null,
      secondary: { label: "M'entraîner encore", action: { type: "new-session" } },
    });
  });

  it("une séance sur un jour de repos est un bonus : la carte dit « faite », pas « repos »", () => {
    const state = card({ plan: planOf({ 4: rest(4) }), workouts: [done(THURSDAY, "Bonus")] });
    expect(state.kind).toBe("done");
  });

  it("sans prochaine séance : le nombre de séances validées, au singulier comme au pluriel", () => {
    expect(card({ workouts: [done(THURSDAY, "A")] }).subtitle).toBe("1 séance validée aujourd'hui");
    expect(card({ workouts: [done(THURSDAY, "A"), done(THURSDAY, "B")] }).subtitle).toBe(
      "2 séances validées aujourd'hui",
    );
  });

  it("une séance d'une autre discipline, ou seulement active, ne valide pas la journée", () => {
    const state = card({
      plan: planOf({ 4: tpl(4, EPAULES_A.id) }),
      workouts: [done(THURSDAY, "Footing", { discipline: "course" })],
    });
    expect(state.kind).toBe("planned");
  });
});

describe("resolveTodayCard — états « none » et « free »", () => {
  it("aucun plan, déjà des séances : invitation + un FAIT (la dernière séance)", () => {
    const state = card({ workouts: [done("2026-09-28", "Jambes B")] });
    expect(state).toEqual({
      kind: "none",
      kicker: "Jeudi 1 octobre · aujourd'hui",
      title: "Quoi faire aujourd'hui ?",
      subtitle: "Dernière séance : « Jambes B » · il y a 3 jours",
      lastTime: null,
      primary: { label: "Choisir une épreuve", action: { type: "new-session" } },
      secondary: { label: "Planifier ma semaine", action: { type: "edit-plan" } },
    });
  });

  describe("aucun plan mais un rythme dans l'historique : la plus ancienne séance habituelle", () => {
    // Jeudi 1er octobre. « Jambes » : il y a 8 et 17 jours ; « Dos » : 5 et 12 ; « Pecs » : 3 et 10.
    const rhythm = () => [
      done("2026-09-24", "Jambes"),
      done("2026-09-14", "Jambes"),
      done("2026-09-26", "Dos"),
      done("2026-09-19", "Dos"),
      done("2026-09-28", "Pecs"),
      done("2026-09-21", "Pecs"),
    ];

    it("la carte dit QUOI faire, au lieu de poser la question", () => {
      const workouts = rhythm();
      const jambes = workouts[0];
      const state = card({ workouts });
      expect(state).toEqual({
        kind: "none",
        kicker: "Jeudi 1 octobre · aujourd'hui",
        title: "Jambes",
        subtitle: "La plus ancienne de tes séances habituelles.",
        lastTime: "La dernière fois : 14 séries · 3\u00a0840 kg · il y a 7 jours",
        primary: {
          label: "Refaire cette séance",
          action: { type: "repeat-session", workoutId: jambes.id },
        },
        secondary: { label: "Autre séance", action: { type: "new-session" } },
      });
    });

    it("le bouton refait la séance de RÉFÉRENCE (celle qui porte des séries), pas une coquille plus récente", () => {
      const shell = done("2026-09-25", "Jambes", {}, []); // importée : sans série, plus récente que la référence
      const base = rhythm();
      const withData = base[0]; // le 24/09
      const state = card({ workouts: [shell, ...base] });
      expect(state.primary?.action).toEqual({ type: "repeat-session", workoutId: withData.id });
    });

    it("un seul nom d'historique ne fait pas un rythme : retour à l'invitation", () => {
      const state = card({ workouts: [done("2026-09-28", "Jambes B")] });
      expect(state.title).toBe("Quoi faire aujourd'hui ?");
      expect(state.primary).toEqual({
        label: "Choisir une épreuve",
        action: { type: "new-session" },
      });
    });

    it("un plan existe : la suggestion n'est JAMAIS imposée par-dessus le plan", () => {
      const state = card({ workouts: rhythm(), plan: planOf({ 1: muscles(1, ["dos"]) }) });
      expect(state.kind).toBe("free");
      expect(state.primary?.action.type).toBe("new-session");
    });

    it("une séance déjà faite aujourd'hui prime : rien n'est suggéré", () => {
      const state = card({ workouts: [...rhythm(), done("2026-10-01", "Épaules A")] });
      expect(state.kind).toBe("done");
    });

    it("une séance en cours prime aussi", () => {
      const state = card({
        workouts: rhythm(),
        activeWorkout: { name: "Ma séance", created_at: "2026-10-01T07:00:00.000Z" },
      });
      expect(state.kind).toBe("active");
    });
  });

  it("aucun plan, aucune séance : « Ta première séance t'attend. »", () => {
    expect(card({}).subtitle).toBe("Ta première séance t'attend.");
  });

  it("un plan de repos seuls reste un plan : pas d'invitation à planifier", () => {
    expect(card({ plan: planOf({ 2: rest(2) }) }).kind).toBe("free");
  });

  it("plan existant mais aujourd'hui absent : « Jour libre » + prochaine séance", () => {
    const state = card({ plan: planOf({ 1: muscles(1, ["dos"]) }) });
    expect(state).toMatchObject({
      kind: "free",
      title: "Jour libre",
      subtitle: "Prochaine séance : lundi · Dos",
      primary: { label: "Choisir une épreuve", action: { type: "new-session" } },
      secondary: null,
    });
  });
});

describe("la carte ne dit QUE des faits : jamais un pourcentage, jamais de « prêt à »", () => {
  const scenarios: Array<[string, Parameters<typeof input>[0]]> = [
    ["active", { activeWorkout: { name: "X", created_at: new Date().toISOString() } }],
    [
      "planned template",
      { plan: planOf({ 4: tpl(4, EPAULES_A.id) }), workouts: [done("2026-09-23", "Épaules A")] },
    ],
    ["planned muscles", { plan: planOf({ 4: muscles(4, ["epaules"]) }) }],
    ["rest", { plan: planOf({ 4: rest(4), 5: muscles(5, ["dos"]) }) }],
    ["done", { workouts: [done(THURSDAY, "A")] }],
    ["none", { workouts: [done("2026-09-28", "B")] }],
    ["free", { plan: planOf({ 1: muscles(1, ["dos"]) }) }],
  ];

  it.each(scenarios)("%s", (_name, over) => {
    const state = card(over);
    const texts = [
      state.kicker,
      state.title,
      state.subtitle,
      state.lastTime,
      state.primary?.label,
      state.secondary?.label,
    ].filter((t): t is string => typeof t === "string");
    for (const text of texts) {
      expect(text).not.toMatch(/%|\bprêt|\bprête|récupér|\bforme\b/i);
    }
  });

  it("chaque état produit bien l'état attendu (le test ci-dessus ne passe pas à vide)", () => {
    const kinds = scenarios.map(([, over]) => (card(over) as TodayCardState).kind);
    expect(kinds).toEqual(["active", "planned", "planned", "rest", "done", "none", "free"]);
  });
});
