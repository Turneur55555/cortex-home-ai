import { describe, expect, it } from "vitest";
import { previousWeekStart, summarizeWeeklyXp, weeklyXpLine } from "./weeklyXp";

// Dimanche 01/11/2026 : semaine du lundi 26/10 ; la précédente commence le 19/10.
const SUNDAY = "2026-11-01";
const at = (ymd: string, hour = 12) =>
  new Date(`${ymd}T${String(hour).padStart(2, "0")}:00:00`).toISOString();

describe("summarizeWeeklyXp — le journal d'XP serveur, par semaine locale (lundi → dimanche)", () => {
  it("la semaine du 26/10 telle que mesurée en production : 745 XP, rang d'exercice compris", () => {
    const events = [
      // Séances (workout_muscu + streak)…
      { amount: 100, created_at: at("2026-10-28", 15) },
      { amount: 100, created_at: at("2026-10-29", 16) },
      { amount: 15, created_at: at("2026-10-29", 16) },
      { amount: 100, created_at: at("2026-10-29", 16) },
      { amount: 15, created_at: at("2026-10-29", 16) },
      { amount: 100, created_at: at("2026-10-29", 16) },
      { amount: 15, created_at: at("2026-10-29", 16) },
      { amount: 100, created_at: at("2026-10-30", 8) },
      // …et la montée de rang d'exercice, rattachée à AUCUNE séance.
      { amount: 200, created_at: at("2026-10-30", 8) },
      // Semaine précédente.
      { amount: 619, created_at: at("2026-10-20", 10) },
    ];
    expect(summarizeWeeklyXp(events, SUNDAY)).toEqual({ thisWeek: 745, lastWeek: 619 });
  });

  it("frontière du lundi à minuit (heure LOCALE) ; plus ancien ou futur : ignoré", () => {
    const events = [
      { amount: 10, created_at: at("2026-10-26", 0) }, // lundi 00:00 → cette semaine
      { amount: 20, created_at: new Date("2026-10-25T23:59:00").toISOString() }, // dimanche soir → précédente
      { amount: 40, created_at: at("2026-10-18", 12) }, // il y a 2 semaines → ignoré
      { amount: 80, created_at: at("2026-11-02", 12) }, // futur → ignoré
    ];
    expect(summarizeWeeklyXp(events, SUNDAY)).toEqual({ thisWeek: 10, lastWeek: 20 });
  });

  it("valeurs illisibles : ignorées, jamais NaN", () => {
    const events = [
      { amount: null, created_at: at("2026-10-27") },
      { amount: Number.NaN, created_at: at("2026-10-27") },
      { amount: 30, created_at: "pas une date" },
      { amount: 5, created_at: at("2026-10-27") },
    ];
    expect(summarizeWeeklyXp(events, SUNDAY)).toEqual({ thisWeek: 5, lastWeek: 0 });
  });

  it("previousWeekStart : le lundi de la semaine précédente", () => {
    expect(previousWeekStart(SUNDAY)).toBe("2026-10-19");
    expect(previousWeekStart("2026-10-26")).toBe("2026-10-19");
  });
});

describe("weeklyXpLine — un fait, jamais « +0 XP »", () => {
  it("la semaine en cours dès qu'elle a rapporté quelque chose", () => {
    expect(weeklyXpLine({ thisWeek: 115, lastWeek: 745 })).toEqual({
      amount: 115,
      when: "cette semaine",
    });
  });

  it("lundi matin, rien encore : la semaine dernière", () => {
    expect(weeklyXpLine({ thisWeek: 0, lastWeek: 745 })).toEqual({
      amount: 745,
      when: "la semaine dernière",
    });
  });

  it("deux semaines sans XP, ou lecture impossible : rien du tout", () => {
    expect(weeklyXpLine({ thisWeek: 0, lastWeek: 0 })).toBeNull();
    expect(weeklyXpLine(null)).toBeNull();
  });
});
