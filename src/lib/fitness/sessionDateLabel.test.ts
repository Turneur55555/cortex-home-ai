import { describe, expect, it } from "vitest";
import { sessionDateLabel } from "./sessionDateLabel";

// Heures construites en heure LOCALE : le test ne dépend pas du fuseau de la machine.
const local = (y: number, m: number, d: number, h: number, min: number) =>
  new Date(y, m - 1, d, h, min).toISOString();

describe("sessionDateLabel", () => {
  it("affiche l'heure de début, jamais minuit", () => {
    expect(sessionDateLabel("2026-11-04", local(2026, 11, 4, 17, 29))).toBe(
      "mercredi 4 novembre • 17h29",
    );
  });

  it("séance saisie après coup : date seule, aucune heure inventée", () => {
    expect(sessionDateLabel("2026-10-27", local(2026, 10, 29, 16, 29))).toBe("mardi 27 octobre");
  });

  it("sans created_at ou avec une valeur illisible : date seule", () => {
    expect(sessionDateLabel("2026-11-04")).toBe("mercredi 4 novembre");
    expect(sessionDateLabel("2026-11-04", null)).toBe("mercredi 4 novembre");
    expect(sessionDateLabel("2026-11-04", "pas une date")).toBe("mercredi 4 novembre");
  });
});
