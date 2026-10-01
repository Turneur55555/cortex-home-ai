import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SPECIALIZATION_GROUPS } from "./chronicles";
import {
  DAY_INITIALS,
  DAY_NAMES,
  ISO_DAYS,
  PLAN_GROUP_IDS,
  PLAN_GROUP_LABELS,
  PLAN_GROUP_SHORT_LABELS,
  buildWeekView,
  describePlanDay,
  describePlannedWeek,
  describeTemplateLoad,
  emptyWeeklyPlan,
  isCountedWorkout,
  isoDayOf,
  normalizeGroups,
  normalizePlanInput,
  planDayLabel,
  planDayShortLabel,
  planDayWrite,
  plannedWeeklyLoad,
  resolveTemplateRef,
  resolveWeeklyPlan,
  summarizeTemplate,
  summarizeWeek,
  weekDates,
  type PlanDay,
  type PlanDayRow,
  type TemplateSummary,
  type WeeklyPlan,
  type WorkoutLike,
} from "./weeklyPlan";

// Semaine de référence : mercredi 30/09/2026 → lundi 28/09 … dimanche 04/10.
const WEDNESDAY = "2026-09-30";

let seq = 0;
function row(
  day: number,
  kind: string,
  extra: Partial<PlanDayRow> = {},
  updatedAt = "2026-09-01T10:00:00Z",
): PlanDayRow {
  seq += 1;
  return {
    id: `row-${String(seq).padStart(3, "0")}`,
    day_of_week: day,
    kind,
    muscle_groups: kind === "muscles" ? ["dos"] : [],
    template_id: null,
    updated_at: updatedAt,
    ...extra,
  };
}

function workout(date: string, extra: Partial<WorkoutLike> = {}): WorkoutLike {
  seq += 1;
  return { id: `w-${seq}`, date, status: "completed", discipline: "muscu", ...extra };
}

function planOf(entries: Partial<Record<number, PlanDay>>): WeeklyPlan {
  const plan = emptyWeeklyPlan();
  for (const [day, value] of Object.entries(entries)) plan[Number(day) as 1] = value as PlanDay;
  return plan;
}

describe("vocabulaire — un seul, verrouillé à trois endroits", () => {
  it("les familles du plan sont EXACTEMENT les id de SPECIALIZATION_GROUPS", () => {
    expect([...PLAN_GROUP_IDS].sort()).toEqual(SPECIALIZATION_GROUPS.map((g) => g.id).sort());
  });

  it("les familles du plan sont EXACTEMENT celles que le CHECK de la migration autorise", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260930120000_weekly_plan_days.sql"),
      "utf-8",
    );
    const match = /muscle_groups <@ ARRAY\[([^\]]+)\]/.exec(sql);
    expect(match).not.toBeNull();
    const inSql = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...PLAN_GROUP_IDS].sort());
  });

  describe("invariant 1.7 — ce que la migration ne doit JAMAIS contenir", () => {
    /** La migration sans ses commentaires : ils expliquent justement pourquoi ces mots en sont absents. */
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260930120000_weekly_plan_days.sql"),
      "utf-8",
    )
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    it("aucune contrainte UNIQUE : une violation inconnue du moteur de sync devient une opération blocked", () => {
      // Deux appareils qui créent le même jour hors ligne donneraient un 23505 classé
      // « définitif » (syncErrors.ts, classifyUniqueViolation), donc `blocked`, donc le
      // point d'attention du Profil pour un simple changement de planning. Le doublon se
      // départage à la lecture (resolveWeeklyPlan), il ne se refuse pas à l'écriture.
      expect(sql).not.toMatch(/\bUNIQUE\b/i);
    });

    it("aucune colonne d'état fait / à faire : il se dérive des séances, jamais stocké", () => {
      const create = /CREATE TABLE IF NOT EXISTS public\.weekly_plan_days \(([\s\S]*?)\n\);/.exec(
        sql,
      );
      expect(create).not.toBeNull();
      const columns = [...create![1].matchAll(/^\s*(\w+)\s+[a-z]/gim)].map((m) => m[1]);
      expect(columns).toEqual(
        expect.arrayContaining(["id", "user_id", "day_of_week", "kind", "template_id"]),
      );
      for (const forbidden of ["done", "is_done", "completed", "status", "completed_at"]) {
        expect(columns).not.toContain(forbidden);
      }
    });

    it("template_id ne EXIGE jamais une valeur : supprimer un modèle ne doit pas être bloqué", () => {
      // `ON DELETE SET NULL` + un CHECK « kind = 'template' ⇒ template_id non nul » ferait
      // échouer la suppression d'un modèle par le planning.
      expect(sql).toMatch(
        /template_id uuid REFERENCES public\.workout_templates\(id\) ON DELETE SET NULL/,
      );
      // `template_id IS NOT NULL` apparaît légitimement dans l'index partiel : on ne
      // l'interdit que DANS une clause CHECK.
      const checks = [...sql.matchAll(/CHECK\s*\(([\s\S]*?)\);/g)].map((m) => m[1]);
      expect(checks.length).toBeGreaterThan(0);
      for (const check of checks) expect(check).not.toMatch(/template_id\s+IS\s+NOT\s+NULL/i);
    });
  });

  it("chaque famille a un libellé complet et un libellé court", () => {
    for (const id of PLAN_GROUP_IDS) {
      expect(PLAN_GROUP_LABELS[id]).toBeTruthy();
      expect(PLAN_GROUP_SHORT_LABELS[id]).toBeTruthy();
    }
  });

  it("les sept jours ISO ont un nom et une initiale, lundi en premier", () => {
    expect(ISO_DAYS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(DAY_NAMES[1]).toBe("Lundi");
    expect(DAY_NAMES[7]).toBe("Dimanche");
    expect(ISO_DAYS.map((d) => DAY_INITIALS[d]).join("")).toBe("LMMJVSD");
  });
});

describe("normalizeGroups", () => {
  it("garde l'ordre canonique, dédoublonne et écarte les inconnues", () => {
    expect(normalizeGroups(["pecs", "dos", "dos", "foo", 3, null])).toEqual(["dos", "pecs"]);
  });

  it("tolère null et undefined", () => {
    expect(normalizeGroups(null)).toEqual([]);
    expect(normalizeGroups(undefined)).toEqual([]);
  });
});

describe("resolveWeeklyPlan", () => {
  it("sans ligne : sept jours libres", () => {
    const plan = resolveWeeklyPlan([]);
    expect(ISO_DAYS.map((d) => plan[d])).toEqual([null, null, null, null, null, null, null]);
  });

  it("lit repos, groupes et séance sauvegardée", () => {
    const plan = resolveWeeklyPlan([
      row(1, "muscles", { muscle_groups: ["pecs", "dos"] }),
      row(4, "rest"),
      row(3, "template", { template_id: "tpl-1" }),
    ]);
    expect(plan[1]).toEqual({ dayOfWeek: 1, kind: "muscles", groups: ["dos", "pecs"] });
    expect(plan[4]).toEqual({ dayOfWeek: 4, kind: "rest" });
    expect(plan[3]).toEqual({ dayOfWeek: 3, kind: "template", templateId: "tpl-1" });
    expect(plan[2]).toBeNull();
  });

  it("un modèle supprimé (template_id NULL) reste un jour d'entraînement, pas un jour effacé", () => {
    const plan = resolveWeeklyPlan([row(3, "template", { template_id: null })]);
    expect(plan[3]).toEqual({ dayOfWeek: 3, kind: "template", templateId: null });
  });

  it("deux appareils ont créé le même jour : la ligne la plus récente gagne", () => {
    const older = row(2, "rest", {}, "2026-09-01T10:00:00Z");
    const newer = row(2, "muscles", { muscle_groups: ["jambes"] }, "2026-09-02T10:00:00Z");
    expect(resolveWeeklyPlan([older, newer])[2]).toMatchObject({ kind: "muscles" });
    expect(resolveWeeklyPlan([newer, older])[2]).toMatchObject({ kind: "muscles" });
  });

  it("à égalité de date, le départage est déterministe (id le plus grand), jamais l'ordre d'arrivée", () => {
    const a = row(2, "rest", { id: "aaa" }, "2026-09-01T10:00:00Z");
    const b = row(2, "muscles", { id: "bbb", muscle_groups: ["bras"] }, "2026-09-01T10:00:00Z");
    expect(resolveWeeklyPlan([a, b])[2]).toMatchObject({ kind: "muscles" });
    expect(resolveWeeklyPlan([b, a])[2]).toMatchObject({ kind: "muscles" });
  });

  it("une ligne illisible, même plus récente, ne masque pas une ligne valide plus ancienne", () => {
    const valid = row(5, "rest", {}, "2026-09-01T10:00:00Z");
    const garbage = row(5, "weird", {}, "2026-09-09T10:00:00Z");
    expect(resolveWeeklyPlan([valid, garbage])[5]).toEqual({ dayOfWeek: 5, kind: "rest" });
  });

  it("ignore un jour hors 1..7, non entier, ou un kind inconnu", () => {
    const plan = resolveWeeklyPlan([
      row(0, "rest"),
      row(8, "rest"),
      row(2.5, "rest"),
      row(3, "nope"),
    ]);
    expect(ISO_DAYS.every((d) => plan[d] === null)).toBe(true);
  });

  it("un jour « muscles » sans aucune famille valide n'est pas un jour (ce serait un repos déguisé)", () => {
    expect(resolveWeeklyPlan([row(1, "muscles", { muscle_groups: [] })])[1]).toBeNull();
    expect(resolveWeeklyPlan([row(1, "muscles", { muscle_groups: ["foo"] })])[1]).toBeNull();
    expect(resolveWeeklyPlan([row(1, "muscles", { muscle_groups: null })])[1]).toBeNull();
  });
});

describe("normalizePlanInput — le contenu écrit est toujours complet", () => {
  it("repos : efface groupes ET modèle dans le même contenu", () => {
    expect(normalizePlanInput({ kind: "rest" })).toEqual({
      ok: true,
      content: { kind: "rest", muscle_groups: [], template_id: null },
    });
  });

  it("muscles : normalise, et refuse une sélection vide", () => {
    expect(normalizePlanInput({ kind: "muscles", groups: ["pecs", "dos"] })).toEqual({
      ok: true,
      content: { kind: "muscles", muscle_groups: ["dos", "pecs"], template_id: null },
    });
    expect(normalizePlanInput({ kind: "muscles", groups: [] })).toEqual({
      ok: false,
      reason: "no-groups",
    });
    expect(normalizePlanInput({ kind: "muscles", groups: ["foo"] })).toEqual({
      ok: false,
      reason: "no-groups",
    });
  });

  it("template : porte l'id, vide les groupes, refuse un id vide", () => {
    expect(normalizePlanInput({ kind: "template", templateId: " tpl-9 " })).toEqual({
      ok: true,
      content: { kind: "template", muscle_groups: [], template_id: "tpl-9" },
    });
    expect(normalizePlanInput({ kind: "template", templateId: "  " })).toEqual({
      ok: false,
      reason: "no-template",
    });
  });
});

describe("planDayWrite", () => {
  const rest = normalizePlanInput({ kind: "rest" });
  const dos = normalizePlanInput({ kind: "muscles", groups: ["dos"] });

  it("aucune ligne pour ce jour : création", () => {
    expect(planDayWrite([row(1, "rest")], 2, dos)).toEqual({
      type: "create",
      content: { kind: "muscles", muscle_groups: ["dos"], template_id: null },
    });
  });

  it("une ligne existe : mise à jour de CETTE ligne, jamais une seconde création", () => {
    const existing = row(2, "rest");
    const op = planDayWrite([existing, row(3, "rest")], 2, dos);
    expect(op).toMatchObject({ type: "update", id: existing.id, unchanged: false, removeIds: [] });
  });

  it("même contenu : unchanged, donc aucune opération de sync inutile", () => {
    const existing = row(2, "muscles", { muscle_groups: ["dos", "pecs"] });
    const same = normalizePlanInput({ kind: "muscles", groups: ["pecs", "dos"] });
    expect(planDayWrite([existing], 2, same)).toMatchObject({ type: "update", unchanged: true });
  });

  it("doublon : met à jour la plus récente et supprime les autres", () => {
    const older = row(2, "rest", {}, "2026-09-01T10:00:00Z");
    const newer = row(2, "muscles", {}, "2026-09-02T10:00:00Z");
    const op = planDayWrite([older, newer], 2, rest);
    expect(op).toMatchObject({ type: "update", id: newer.id, removeIds: [older.id] });
  });

  it("séance sauvegardée → repos : le contenu efface template_id (sinon le CHECK refuse et l'opération passe blocked)", () => {
    const existing = row(2, "template", { template_id: "tpl-1" });
    const op = planDayWrite([existing], 2, rest);
    expect(op).toMatchObject({
      type: "update",
      unchanged: false,
      content: { kind: "rest", muscle_groups: [], template_id: null },
    });
  });

  it("repos → groupes musculaires : le contenu ne garde aucun template_id", () => {
    const existing = row(2, "rest");
    const op = planDayWrite([existing], 2, dos);
    expect(op).toMatchObject({ content: { kind: "muscles", template_id: null } });
  });

  it("effacer un jour supprime toutes ses lignes, doublons compris", () => {
    const a = row(2, "rest");
    const b = row(2, "muscles");
    const op = planDayWrite([a, b, row(3, "rest")], 2, null);
    expect(op.type).toBe("clear");
    expect(op.type === "clear" && [...op.removeIds].sort()).toEqual([a.id, b.id].sort());
  });

  it("effacer un jour déjà libre : rien à faire", () => {
    expect(planDayWrite([row(3, "rest")], 2, null)).toEqual({ type: "noop" });
  });

  it("une saisie invalide n'écrit rien", () => {
    const invalid = normalizePlanInput({ kind: "muscles", groups: [] });
    expect(planDayWrite([row(2, "rest")], 2, invalid)).toEqual({ type: "noop" });
  });

  it("RÉGRESSION — une ligne illisible n'est JAMAIS « inchangée » : choisir Repos doit la réécrire", () => {
    // Avant correction, `contentOf` ramenait un kind inconnu à « repos » : choisir
    // Repos pour ce jour donnait unchanged=true, rien n'était écrit, et le jour
    // restait invisible (resolveWeeklyPlan ignore la ligne) pour toujours.
    const illegible = row(2, "weird");
    const op = planDayWrite([illegible], 2, rest);
    expect(op).toMatchObject({ type: "update", id: illegible.id, unchanged: false });
  });
});

describe("semaine : dates et jours ISO", () => {
  it("un mercredi : lundi 28/09 → dimanche 04/10", () => {
    expect(weekDates(WEDNESDAY)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("un dimanche appartient à la semaine qui finit, pas à la suivante", () => {
    expect(weekDates("2026-10-04")[0]).toBe("2026-09-28");
  });

  it("un lundi ouvre sa propre semaine", () => {
    expect(weekDates("2026-09-28")[0]).toBe("2026-09-28");
  });

  it("traverse un changement de mois", () => {
    expect(weekDates("2026-10-01")).toContain("2026-09-28");
    expect(weekDates("2026-10-01")).toContain("2026-10-04");
  });

  it("isoDayOf : lundi = 1, dimanche = 7", () => {
    expect(isoDayOf("2026-09-28")).toBe(1);
    expect(isoDayOf("2026-09-30")).toBe(3);
    expect(isoDayOf("2026-10-04")).toBe(7);
  });

  it("refuse une date mal formée plutôt que de calculer n'importe quoi", () => {
    expect(() => weekDates("30/09/2026")).toThrow();
    expect(() => isoDayOf("2026-9-3")).toThrow();
  });
});

describe("isCountedWorkout", () => {
  it("une séance de musculation terminée compte", () => {
    expect(isCountedWorkout(workout(WEDNESDAY))).toBe(true);
    expect(isCountedWorkout({ id: "x", date: WEDNESDAY, status: "completed" })).toBe(true);
  });

  it("une séance active n'est pas « faite »", () => {
    expect(isCountedWorkout(workout(WEDNESDAY, { status: "active" }))).toBe(false);
  });

  it("une autre discipline ne valide pas un jour de plan", () => {
    expect(isCountedWorkout(workout(WEDNESDAY, { discipline: "course" }))).toBe(false);
  });
});

describe("buildWeekView — l'état de chaque jour", () => {
  const plan = planOf({
    1: { dayOfWeek: 1, kind: "muscles", groups: ["dos"] }, // lundi, passé
    2: { dayOfWeek: 2, kind: "muscles", groups: ["epaules"] }, // mardi, passé
    3: { dayOfWeek: 3, kind: "muscles", groups: ["jambes"] }, // mercredi = aujourd'hui
    4: { dayOfWeek: 4, kind: "rest" }, // jeudi
    5: { dayOfWeek: 5, kind: "muscles", groups: ["pecs"] }, // vendredi
    // samedi, dimanche : libres
  });

  it("fait / manqué / aujourd'hui / repos / à venir / libre", () => {
    const week = buildWeekView(plan, [workout("2026-09-28")], WEDNESDAY);
    expect(week.map((d) => d.state)).toEqual([
      "done", // lundi : séance faite
      "missed", // mardi : prévu, passé, rien fait
      "today", // mercredi : prévu, pas encore fait
      "rest", // jeudi
      "upcoming", // vendredi
      "unplanned", // samedi
      "unplanned", // dimanche
    ]);
  });

  it("marque aujourd'hui, et un seul jour", () => {
    const week = buildWeekView(plan, [], WEDNESDAY);
    expect(week.filter((d) => d.isToday).map((d) => d.dayOfWeek)).toEqual([3]);
  });

  it("aujourd'hui devient « fait » dès qu'une séance est terminée", () => {
    const week = buildWeekView(plan, [workout(WEDNESDAY)], WEDNESDAY);
    expect(week[2].state).toBe("done");
    expect(week[2].isToday).toBe(true);
  });

  it("n'importe quelle séance de musculation valide le jour, même sans rapport avec le groupe prévu", () => {
    // Le plan dit « Jambes » ; la séance faite s'appelle comme elle veut.
    const week = buildWeekView(plan, [workout(WEDNESDAY, { id: "bras-day" })], WEDNESDAY);
    expect(week[2].state).toBe("done");
    expect(week[2].workoutIds).toEqual(["bras-day"]);
  });

  it("deux séances le même jour : les deux sont listées, le jour est fait une fois", () => {
    const week = buildWeekView(
      plan,
      [workout("2026-09-28", { id: "a" }), workout("2026-09-28", { id: "b" })],
      WEDNESDAY,
    );
    expect(week[0].workoutIds).toEqual(["a", "b"]);
    expect(summarizeWeek(week).doneDays).toBe(1);
  });

  it("une séance sur un jour de repos est un bonus : le jour est « fait » mais n'était pas prévu", () => {
    const week = buildWeekView(plan, [workout("2026-10-01")], WEDNESDAY);
    expect(week[3].state).toBe("done");
    expect(week[3].isTrainingPlanned).toBe(false);
  });

  it("ignore les séances non terminées, non musculation, ou hors de la semaine", () => {
    const week = buildWeekView(
      plan,
      [
        workout("2026-09-28", { status: "active" }),
        workout("2026-09-29", { discipline: "course" }),
        workout("2026-09-27"), // dimanche précédent
        workout("2026-10-05"), // lundi suivant
      ],
      WEDNESDAY,
    );
    expect(week.every((d) => d.workoutIds.length === 0)).toBe(true);
    expect(week[0].state).toBe("missed");
  });

  it("un jour libre où l'on s'est entraîné est « fait », jamais « manqué »", () => {
    const week = buildWeekView(emptyWeeklyPlan(), [workout("2026-09-29")], WEDNESDAY);
    expect(week[1].state).toBe("done");
    expect(week[0].state).toBe("unplanned");
  });

  it("un jour d'entraînement « séance supprimée » est bien un jour d'entraînement prévu", () => {
    const withDeleted = planOf({ 4: { dayOfWeek: 4, kind: "template", templateId: null } });
    const week = buildWeekView(withDeleted, [], WEDNESDAY);
    expect(week[3].isTrainingPlanned).toBe(true);
    expect(week[3].state).toBe("upcoming");
  });

  it("fournit les 7 dates dans l'ordre", () => {
    const week = buildWeekView(emptyWeeklyPlan(), [], WEDNESDAY);
    expect(week.map((d) => d.date)).toEqual(weekDates(WEDNESDAY));
    expect(week.map((d) => d.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("summarizeWeek", () => {
  const plan = planOf({
    1: { dayOfWeek: 1, kind: "muscles", groups: ["dos"] },
    2: { dayOfWeek: 2, kind: "muscles", groups: ["epaules"] },
    3: { dayOfWeek: 3, kind: "muscles", groups: ["jambes"] },
    4: { dayOfWeek: 4, kind: "rest" },
    5: { dayOfWeek: 5, kind: "muscles", groups: ["pecs"] },
  });

  it("compte prévus, faits, restants, manqués", () => {
    const week = buildWeekView(plan, [workout("2026-09-28")], WEDNESDAY);
    expect(summarizeWeek(week)).toEqual({
      plannedDays: 4,
      doneDays: 1,
      remainingDays: 2, // mercredi (aujourd'hui) + vendredi
      missedDays: 1, // mardi
      extraDays: 0,
    });
  });

  it("une séance hors plan est un bonus, jamais comptée comme « faite » sur les prévus", () => {
    const week = buildWeekView(plan, [workout("2026-10-03")], WEDNESDAY); // samedi, libre
    const summary = summarizeWeek(week);
    expect(summary.doneDays).toBe(0);
    expect(summary.extraDays).toBe(1);
  });

  it("sans plan : rien de prévu, rien de manqué", () => {
    const summary = summarizeWeek(buildWeekView(emptyWeeklyPlan(), [], WEDNESDAY));
    expect(summary).toEqual({
      plannedDays: 0,
      doneDays: 0,
      remainingDays: 0,
      missedDays: 0,
      extraDays: 0,
    });
  });
});

describe("summarizeTemplate — le nombre de séries, jamais plus précis que ce qu'on sait", () => {
  it("tous les exercices portent leurs séries : total exact", () => {
    const s = summarizeTemplate({
      id: "t",
      name: "Jambes A",
      exercises: [
        { default_sets: 4 },
        { default_sets: 4 },
        { default_sets: 3 },
        { default_sets: 3 },
        { default_sets: 2 },
      ],
    });
    expect(s).toMatchObject({ sets: 16, exerciseCount: 5, setsComplete: true });
  });

  it("un exercice sans séries : le total devient un minimum, pas un total", () => {
    const s = summarizeTemplate({
      id: "t",
      name: "Full body",
      exercises: [{ default_sets: 4 }, { default_sets: null }, { default_sets: 3 }],
    });
    expect(s).toMatchObject({ sets: 7, setsComplete: false });
  });

  it("aucune série connue : total nul et incomplet (l'écran n'affiche rien)", () => {
    const s = summarizeTemplate({ id: "t", name: "x", exercises: [{ default_sets: null }] });
    expect(s).toMatchObject({ sets: 0, setsComplete: false });
  });

  it("un modèle sans exercice n'est jamais « complet »", () => {
    expect(summarizeTemplate({ id: "t", name: "x", exercises: [] }).setsComplete).toBe(false);
  });

  it("0 ou négatif ne compte pas comme un nombre de séries", () => {
    const s = summarizeTemplate({
      id: "t",
      name: "x",
      exercises: [{ default_sets: 0 }, { default_sets: -2 }],
    });
    expect(s).toMatchObject({ sets: 0, setsComplete: false });
  });

  it("compte les blocs métriques à part : ce ne sont pas des séries", () => {
    const s = summarizeTemplate({
      id: "t",
      name: "Hybride",
      exercises: [{ default_sets: 3 }],
      segments: [{}, {}],
    });
    expect(s).toMatchObject({ sets: 3, blockCount: 2 });
  });
});

describe("describeTemplateLoad", () => {
  const base: TemplateSummary = {
    id: "t",
    name: "x",
    exerciseCount: 5,
    blockCount: 0,
    sets: 16,
    setsComplete: true,
  };

  it("« 16 séries · 5 exos »", () => {
    expect(describeTemplateLoad(base)).toBe("16 séries · 5 exos");
  });

  it("marque un total incomplet par « + »", () => {
    expect(describeTemplateLoad({ ...base, sets: 12, setsComplete: false })).toBe(
      "12+ séries · 5 exos",
    );
  });

  it("accorde le singulier", () => {
    expect(describeTemplateLoad({ ...base, sets: 1, exerciseCount: 1 })).toBe("1 série · 1 exo");
  });

  it("n'invente aucun chiffre quand les séries sont inconnues", () => {
    expect(describeTemplateLoad({ ...base, sets: 0, setsComplete: false })).toBe("5 exos");
  });

  it("ajoute les blocs d'un modèle hybride", () => {
    expect(
      describeTemplateLoad({
        ...base,
        exerciseCount: 0,
        sets: 0,
        setsComplete: false,
        blockCount: 2,
      }),
    ).toBe("2 blocs");
  });
});

describe("resolveTemplateRef", () => {
  const known = new Map<string, TemplateSummary>([
    [
      "tpl-1",
      { id: "tpl-1", name: "A", exerciseCount: 1, blockCount: 0, sets: 3, setsComplete: true },
    ],
  ]);

  it("un jour qui n'est pas une séance sauvegardée est sans objet", () => {
    expect(resolveTemplateRef({ dayOfWeek: 1, kind: "rest" }, known)).toBe("ok");
  });

  it("modèle connu", () => {
    expect(resolveTemplateRef({ dayOfWeek: 1, kind: "template", templateId: "tpl-1" }, known)).toBe(
      "ok",
    );
  });

  it("template_id NULL ou introuvable : supprimé", () => {
    expect(resolveTemplateRef({ dayOfWeek: 1, kind: "template", templateId: null }, known)).toBe(
      "deleted",
    );
    expect(resolveTemplateRef({ dayOfWeek: 1, kind: "template", templateId: "gone" }, known)).toBe(
      "deleted",
    );
  });

  it("modèles pas encore chargés : « en attente », JAMAIS « supprimé » (sinon un chargement lent accuse à tort)", () => {
    expect(resolveTemplateRef({ dayOfWeek: 1, kind: "template", templateId: "tpl-1" }, null)).toBe(
      "pending",
    );
  });
});

describe("plannedWeeklyLoad", () => {
  const templates = new Map<string, TemplateSummary>([
    [
      "a",
      { id: "a", name: "Dos A", exerciseCount: 4, blockCount: 0, sets: 15, setsComplete: true },
    ],
    [
      "b",
      { id: "b", name: "Épaules A", exerciseCount: 4, blockCount: 0, sets: 14, setsComplete: true },
    ],
    [
      "c",
      { id: "c", name: "Partiel", exerciseCount: 3, blockCount: 0, sets: 7, setsComplete: false },
    ],
  ]);

  it("somme les séries des séances sauvegardées complètes ; « complet » quand tout est connu", () => {
    const load = plannedWeeklyLoad(
      planOf({
        1: { dayOfWeek: 1, kind: "template", templateId: "a" },
        2: { dayOfWeek: 2, kind: "template", templateId: "b" },
        3: { dayOfWeek: 3, kind: "rest" },
      }),
      templates,
    );
    expect(load).toEqual({ sets: 29, countedDays: 2, uncountedDays: 0, complete: true });
  });

  it("un jour de groupes seuls n'a pas de nombre de séries : le total n'est plus « complet »", () => {
    const load = plannedWeeklyLoad(
      planOf({
        1: { dayOfWeek: 1, kind: "template", templateId: "a" },
        5: { dayOfWeek: 5, kind: "muscles", groups: ["pecs"] },
      }),
      templates,
    );
    expect(load).toEqual({ sets: 15, countedDays: 1, uncountedDays: 1, complete: false });
  });

  it("une séance supprimée, inconnue ou à séries incomplètes n'est pas comptée", () => {
    const load = plannedWeeklyLoad(
      planOf({
        1: { dayOfWeek: 1, kind: "template", templateId: null },
        2: { dayOfWeek: 2, kind: "template", templateId: "gone" },
        3: { dayOfWeek: 3, kind: "template", templateId: "c" },
      }),
      templates,
    );
    expect(load).toEqual({ sets: 0, countedDays: 0, uncountedDays: 3, complete: false });
  });

  it("un plan sans entraînement : rien à compter, rien d'incomplet", () => {
    expect(plannedWeeklyLoad(emptyWeeklyPlan(), templates)).toEqual({
      sets: 0,
      countedDays: 0,
      uncountedDays: 0,
      complete: true,
    });
  });
});

describe("libellés d'un jour", () => {
  it("jour libre, repos", () => {
    expect(planDayLabel(null)).toBe("Libre");
    expect(planDayLabel({ dayOfWeek: 1, kind: "rest" })).toBe("Repos");
    expect(planDayShortLabel(null)).toBe("—");
    expect(planDayShortLabel({ dayOfWeek: 1, kind: "rest" })).toBe("Repos");
  });

  it("groupes : libellé complet joint par « + », libellé court avec compteur", () => {
    const two: PlanDay = { dayOfWeek: 1, kind: "muscles", groups: ["dos", "pecs"] };
    expect(planDayLabel(two)).toBe("Dos + Pectoraux");
    expect(planDayShortLabel(two)).toBe("Dos +1");
    expect(planDayShortLabel({ dayOfWeek: 1, kind: "muscles", groups: ["epaules"] })).toBe(
      "Épaules",
    );
  });

  it("séance sauvegardée : son nom, ou « supprimée » si on ne le connaît pas", () => {
    const day: PlanDay = { dayOfWeek: 1, kind: "template", templateId: "t" };
    expect(planDayLabel(day, "Jambes A")).toBe("Jambes A");
    expect(planDayLabel(day)).toBe("Séance supprimée");
    expect(planDayShortLabel(day, "Jambes A")).toBe("Jambes A");
    expect(planDayShortLabel(day)).toBe("Supprimée");
  });
});

describe("describePlanDay — un seul endroit pour afficher un jour", () => {
  const templates = new Map<string, TemplateSummary>([
    [
      "tpl-1",
      {
        id: "tpl-1",
        name: "Jambes A",
        exerciseCount: 5,
        blockCount: 0,
        sets: 16,
        setsComplete: true,
      },
    ],
  ]);

  it("jour libre, repos, groupes : indépendants des modèles, même non chargés", () => {
    expect(describePlanDay(null, null)).toEqual({
      short: "—",
      full: "Libre",
      detail: null,
      ref: "ok",
    });
    expect(describePlanDay({ dayOfWeek: 1, kind: "rest" }, null)).toMatchObject({
      short: "Repos",
      full: "Repos",
    });
    expect(
      describePlanDay({ dayOfWeek: 1, kind: "muscles", groups: ["dos", "pecs"] }, null),
    ).toMatchObject({ short: "Dos +1", full: "Dos + Pectoraux", detail: null });
  });

  it("séance sauvegardée connue : son nom et son détail « 16 séries · 5 exos »", () => {
    expect(
      describePlanDay({ dayOfWeek: 3, kind: "template", templateId: "tpl-1" }, templates),
    ).toEqual({ short: "Jambes A", full: "Jambes A", detail: "16 séries · 5 exos", ref: "ok" });
  });

  it("modèles pas encore chargés : « … », JAMAIS « supprimée »", () => {
    const description = describePlanDay(
      { dayOfWeek: 3, kind: "template", templateId: "tpl-1" },
      null,
    );
    expect(description).toMatchObject({ short: "…", full: "…", ref: "pending" });
    expect(description.full).not.toMatch(/supprim/i);
  });

  it("modèle supprimé (template_id NULL) : « Séance supprimée »", () => {
    expect(
      describePlanDay({ dayOfWeek: 3, kind: "template", templateId: null }, templates),
    ).toMatchObject({ short: "Supprimée", full: "Séance supprimée", detail: null, ref: "deleted" });
  });

  it("identifiant introuvable parmi des modèles chargés : supprimé", () => {
    expect(
      describePlanDay({ dayOfWeek: 3, kind: "template", templateId: "gone" }, templates),
    ).toMatchObject({ full: "Séance supprimée", ref: "deleted" });
  });

  it("un modèle sans série connue n'affiche aucun détail inventé", () => {
    const bare = new Map<string, TemplateSummary>([
      [
        "t",
        { id: "t", name: "Vide", exerciseCount: 0, blockCount: 0, sets: 0, setsComplete: false },
      ],
    ]);
    expect(
      describePlanDay({ dayOfWeek: 1, kind: "template", templateId: "t" }, bare),
    ).toMatchObject({ full: "Vide", detail: null });
  });
});

describe("describePlannedWeek — jamais un minimum présenté comme un total", () => {
  const complete = { sets: 68, countedDays: 5, uncountedDays: 0, complete: true };

  it("aucun jour d'entraînement : on invite à choisir", () => {
    expect(
      describePlannedWeek(0, { sets: 0, countedDays: 0, uncountedDays: 0, complete: true }),
    ).toBe("Aucune séance prévue — choisis tes jours.");
  });

  it("tout est connu : « 5 séances par semaine · 68 séries prévues »", () => {
    expect(describePlannedWeek(5, complete)).toBe("5 séances par semaine · 68 séries prévues");
  });

  it("un jour sans nombre de séries connu : « au moins » plutôt que « prévues »", () => {
    expect(
      describePlannedWeek(5, { sets: 53, countedDays: 4, uncountedDays: 1, complete: false }),
    ).toBe("5 séances par semaine · au moins 53 séries");
  });

  it("aucune série connue : on ne dit que les séances, sans chiffre inventé", () => {
    expect(
      describePlannedWeek(3, { sets: 0, countedDays: 0, uncountedDays: 3, complete: false }),
    ).toBe("3 séances par semaine");
  });

  it("accorde le singulier", () => {
    expect(
      describePlannedWeek(1, { sets: 1, countedDays: 1, uncountedDays: 0, complete: true }),
    ).toBe("1 séance par semaine · 1 série prévue");
  });
});
