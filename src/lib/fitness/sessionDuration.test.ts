import { describe, expect, it } from "vitest";
import {
  FINISH_DURATION_CAP_MINUTES,
  IDLE_GAP_MINUTES,
  MAX_PLAUSIBLE_SESSION_MINUTES,
  plausibleDurationMinutes,
  sessionDurationOnFinish,
  validatedSetTimesForWorkout,
} from "./sessionDuration";

const at = (hhmm: string, day = "2026-09-16") => new Date(`${day}T${hhmm}:00Z`);

describe("sessionDurationOnFinish — à la clôture", () => {
  it("séance ordinaire : du début à maintenant", () => {
    expect(
      sessionDurationOnFinish({
        startedAt: at("18:00"),
        now: at("18:55"),
        validatedSetTimes: [at("18:05"), at("18:30"), at("18:52")],
      }),
    ).toBe(55);
  });

  it("« Terminer » oublié : le temps APRÈS la dernière série validée n'est pas de l'entraînement", () => {
    // Le cas mesuré : démarrée 06:14, séries validées jusqu'à 06:32, clôturée le lendemain 06:28.
    expect(
      sessionDurationOnFinish({
        startedAt: at("06:14", "2026-09-16"),
        now: at("06:28", "2026-09-17"),
        validatedSetTimes: [at("06:20"), at("06:32")],
      }),
    ).toBe(18);
  });

  it("séance démarrée longtemps avant de s'entraîner : le temps AVANT la première série n'est pas compté", () => {
    expect(
      sessionDurationOnFinish({
        startedAt: at("08:15"),
        now: at("19:10"),
        validatedSetTimes: [at("18:05"), at("19:00")],
      }),
    ).toBe(65); // 18:05 → 19:10 : la fin n'est pas rognée, la dernière série date de 10 min
  });

  it("les deux trous à la fois : on garde la fenêtre des séries validées", () => {
    expect(
      sessionDurationOnFinish({
        startedAt: at("07:00"),
        now: at("22:00"),
        validatedSetTimes: [at("12:00"), at("12:40")],
      }),
    ).toBe(40);
  });

  it("une pause plus courte que le seuil n'est jamais rognée", () => {
    const gap = IDLE_GAP_MINUTES;
    const start = at("10:00");
    const first = new Date(start.getTime() + gap * 60_000); // pile au seuil : pas STRICTEMENT plus long
    const now = new Date(first.getTime() + 30 * 60_000);
    expect(
      sessionDurationOnFinish({ startedAt: start, now, validatedSetTimes: [first, now] }),
    ).toBe(gap + 30);
  });

  it("juste au-dessus du seuil : le trou est rogné", () => {
    const start = at("10:00");
    const first = new Date(start.getTime() + (IDLE_GAP_MINUTES + 1) * 60_000);
    const now = new Date(first.getTime() + 30 * 60_000);
    expect(
      sessionDurationOnFinish({ startedAt: start, now, validatedSetTimes: [first, now] }),
    ).toBe(30);
  });

  it("aucune série validée : rien ne permet de rogner, on garde now − début (inchangé)", () => {
    expect(
      sessionDurationOnFinish({ startedAt: at("06:00"), now: at("07:30"), validatedSetTimes: [] }),
    ).toBe(90);
    expect(sessionDurationOnFinish({ startedAt: at("06:00"), now: at("07:30") })).toBe(90);
  });

  it("jamais moins d'une minute, jamais plus que le plafond de stockage", () => {
    expect(sessionDurationOnFinish({ startedAt: at("10:00"), now: at("10:00") })).toBe(1);
    expect(
      sessionDurationOnFinish({
        startedAt: at("00:00", "2026-09-10"),
        now: at("23:00", "2026-09-16"),
      }),
    ).toBe(FINISH_DURATION_CAP_MINUTES);
  });

  it("une série horodatée hors de la séance (horloge décalée) est ignorée, jamais une durée négative", () => {
    expect(
      sessionDurationOnFinish({
        startedAt: at("10:00"),
        now: at("10:50"),
        validatedSetTimes: [at("09:00"), at("11:30")],
      }),
    ).toBe(50);
  });

  it("une seule série validée : durée minimale plutôt que zéro", () => {
    expect(
      sessionDurationOnFinish({
        startedAt: at("06:00"),
        now: at("12:00"),
        validatedSetTimes: [at("09:00")],
      }),
    ).toBe(1);
  });

  it("dates invalides : 1 minute, pas de NaN", () => {
    expect(sessionDurationOnFinish({ startedAt: "n'importe quoi", now: at("10:00") })).toBe(1);
  });

  it("accepte des chaînes ISO comme des Date", () => {
    expect(
      sessionDurationOnFinish({
        startedAt: "2026-09-16T18:00:00Z",
        now: "2026-09-16T18:40:00Z",
        validatedSetTimes: ["2026-09-16T18:10:00Z"],
      }),
    ).toBe(40);
  });
});

describe("plausibleDurationMinutes — à l'affichage", () => {
  it("une durée ordinaire est affichée telle quelle", () => {
    expect(plausibleDurationMinutes(1)).toBe(1);
    expect(plausibleDurationMinutes(62)).toBe(62);
    expect(plausibleDurationMinutes(MAX_PLAUSIBLE_SESSION_MINUTES)).toBe(
      MAX_PLAUSIBLE_SESSION_MINUTES,
    );
  });

  it("le plafond de stockage (600) n'est JAMAIS un fait : inconnue", () => {
    expect(plausibleDurationMinutes(600)).toBeNull();
    expect(plausibleDurationMinutes(MAX_PLAUSIBLE_SESSION_MINUTES + 1)).toBeNull();
    expect(plausibleDurationMinutes(474)).toBeNull();
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY, null, undefined])(
    "absente ou invalide (%s) : inconnue",
    (value) => {
      expect(plausibleDurationMinutes(value as number | null | undefined)).toBeNull();
    },
  );
});

describe("validatedSetTimesForWorkout — le branchement à la clôture", () => {
  const exercises = [
    { id: "e1", workout_id: "w1" },
    { id: "e2", workout_id: "w1" },
    { id: "e3", workout_id: "autre" },
  ];
  const sets = [
    { exercise_id: "e1", completed: true, updated_at: "2026-09-16T06:20:00Z" },
    { exercise_id: "e2", completed: true, updated_at: "2026-09-16T06:32:00Z" },
    { exercise_id: "e1", completed: false, updated_at: "2026-09-16T09:00:00Z" },
    { exercise_id: "e2", completed: null, updated_at: "2026-09-16T09:10:00Z" },
    { exercise_id: "e3", completed: true, updated_at: "2026-09-16T12:00:00Z" },
  ];

  it("ne retient que les séries VALIDÉES de CETTE séance", () => {
    expect(validatedSetTimesForWorkout("w1", exercises, sets)).toEqual([
      "2026-09-16T06:20:00Z",
      "2026-09-16T06:32:00Z",
    ]);
  });

  it("une série non cochée ne prolonge jamais la séance (sinon le trou final ne serait pas rogné)", () => {
    const times = validatedSetTimesForWorkout("w1", exercises, sets);
    expect(
      sessionDurationOnFinish({
        startedAt: at("06:14"),
        now: new Date("2026-09-17T06:28:00Z"),
        validatedSetTimes: times,
      }),
    ).toBe(18);
  });

  it("une séance sans exercice ni série : liste vide", () => {
    expect(validatedSetTimesForWorkout("inconnue", exercises, sets)).toEqual([]);
    expect(validatedSetTimesForWorkout("w1", [], sets)).toEqual([]);
  });
});
