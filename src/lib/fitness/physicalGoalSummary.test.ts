import { describe, expect, it } from "vitest";
import {
  describeSince,
  formatSignedKg,
  formatWeightKg,
  summarizeGoal,
  type GoalSummaryInput,
} from "./physicalGoalSummary";

const TODAY = "2026-10-01";
const startedWeeksAgo = (weeks: number) => new Date(2026, 9, 1 - weeks * 7, 12).toISOString();

function summary(over: Partial<GoalSummaryInput> = {}) {
  return summarizeGoal({
    goal: "fat_loss",
    startedAt: startedWeeksAgo(7),
    startingWeightKg: 82.6,
    targetWeightKg: 76.6,
    currentWeightKg: 78.4,
    todayDate: TODAY,
    ...over,
  });
}

describe("summarizeGoal — des faits lus dans l'objectif et la dernière pesée", () => {
  it("perte de gras : libellé, ancienneté, écart au départ, écart visé, part du chemin", () => {
    expect(summary()).toEqual({
      label: "Perte de gras",
      weeksSince: 7,
      sinceLabel: "depuis 7 semaines",
      changeKg: -4.2,
      targetChangeKg: -6,
      progress: 0.7,
    });
  });

  it("prise de masse : le chemin se mesure dans l'autre sens", () => {
    const s = summary({
      goal: "muscle_gain",
      startingWeightKg: 70,
      targetWeightKg: 75,
      currentWeightKg: 72,
    });
    expect(s).toMatchObject({
      label: "Prise de masse",
      changeKg: 2,
      targetChangeKg: 5,
      progress: 0.4,
    });
  });

  it("maintien : aucun trajet, donc jamais de barre", () => {
    const s = summary({ goal: "maintenance", targetWeightKg: 80, currentWeightKg: 79 });
    expect(s).toMatchObject({ label: "Maintien", targetChangeKg: null, progress: null });
    expect(s.changeKg).toBe(-3.6); // l'écart au départ reste un fait
  });

  it("la progression n'embarque aucun bruit flottant (0,7 et non 0,7000000000000001)", () => {
    expect(summary().progress).toBe(0.7);
    expect(
      summary({ startingWeightKg: 90, targetWeightKg: 87, currentWeightKg: 89 }).progress,
    ).toBe(0.333);
  });

  it("cible atteinte ou dépassée : la barre plafonne à 1", () => {
    expect(summary({ currentWeightKg: 76.6 }).progress).toBe(1);
    expect(summary({ currentWeightKg: 74 }).progress).toBe(1);
  });

  it("dans le mauvais sens (le poids monte pour une perte de gras) : 0, jamais une barre négative", () => {
    const s = summary({ currentWeightKg: 84 });
    expect(s.changeKg).toBe(1.4);
    expect(s.progress).toBe(0);
  });

  it("aucune pesée : pas d'écart, pas de progression inventés", () => {
    expect(summary({ currentWeightKg: null })).toMatchObject({ changeKg: null, progress: null });
  });

  it("pas de poids de départ : pas d'écart ni de progression", () => {
    expect(summary({ startingWeightKg: null })).toMatchObject({
      changeKg: null,
      targetChangeKg: null,
      progress: null,
    });
  });

  it("pas de cible : l'écart au départ est connu, la progression non", () => {
    expect(summary({ targetWeightKg: null })).toMatchObject({
      changeKg: -4.2,
      targetChangeKg: null,
      progress: null,
    });
  });

  it("cible égale au départ : division impossible, donc pas de progression", () => {
    expect(summary({ targetWeightKg: 82.6 })).toMatchObject({ targetChangeKg: 0, progress: null });
  });

  it("les écarts sont arrondis à une décimale (pas de 4,199999)", () => {
    expect(summary({ startingWeightKg: 82.67, currentWeightKg: 78.4 }).changeKg).toBe(-4.3);
    expect(summary({ startingWeightKg: 82.63, currentWeightKg: 78.4 }).changeKg).toBe(-4.2);
  });
});

describe("summarizeGoal — l'ancienneté", () => {
  it("semaines COMPLÈTES : 6 jours = 0 semaine, 7 jours = 1", () => {
    const at = (daysAgo: number) =>
      summary({ startedAt: new Date(2026, 9, 1 - daysAgo, 12).toISOString() }).weeksSince;
    expect(at(0)).toBe(0);
    expect(at(6)).toBe(0);
    expect(at(7)).toBe(1);
    expect(at(13)).toBe(1);
    expect(at(14)).toBe(2);
  });

  it("démarré dans le futur (horloge décalée) : 0, jamais négatif", () => {
    expect(summary({ startedAt: new Date(2026, 9, 5, 12).toISOString() }).weeksSince).toBe(0);
  });

  it("horodatage illisible : 0 semaine plutôt qu'un plantage", () => {
    expect(summary({ startedAt: "pas une date" }).weeksSince).toBe(0);
  });

  it("le jour de début est le jour LOCAL (pas le jour UTC)", () => {
    // 00h30 locale le 24/09 : en UTC c'est encore le 23/09 en France — 7 jours avant le 01/10 local.
    const s = summary({ startedAt: new Date(2026, 8, 24, 0, 30).toISOString() });
    expect(s.weeksSince).toBe(1);
  });

  it("describeSince : jamais « 0 semaine »", () => {
    expect(describeSince(0)).toBe("cette semaine");
    expect(describeSince(1)).toBe("depuis 1 semaine");
    expect(describeSince(7)).toBe("depuis 7 semaines");
  });
});

describe("formats", () => {
  it("formatSignedKg : virgule, vrai signe moins, jamais « -0 »", () => {
    expect(formatSignedKg(-4.2)).toBe("−4,2");
    expect(formatSignedKg(1.5)).toBe("+1,5");
    expect(formatSignedKg(0)).toBe("0");
    expect(formatSignedKg(-0.04)).toBe("0");
    expect(formatSignedKg(-6)).toBe("−6");
  });

  it("formatWeightKg : virgule décimale", () => {
    expect(formatWeightKg(78.4)).toBe("78,4");
    expect(formatWeightKg(80)).toBe("80");
  });
});
