import { describe, expect, it } from "vitest";
import { BRAND_NAME } from "@/lib/brand";
import { rankShareCopy, sessionShareCopy, weekShareCopy } from "@/lib/share/shareCopy";

const week = { weekStart: "2026-09-21", weekNumber: 39, sessions: 5, sets: 68, volumeKg: 18420 };
const rank = {
  rankKey: "guerrier",
  rankLabel: "Guerrier",
  grade: "Vétéran",
  exerciseName: "Squat",
};

describe("shareCopy — chaque carte signe sous le même nom", () => {
  it("le nom du produit est « Cortex »", () => {
    expect(BRAND_NAME).toBe("Cortex");
  });

  it.each([
    ["séance", sessionShareCopy({ totalSets: 15, totalVolumeKg: 4120 })],
    ["semaine", weekShareCopy(week)],
    ["rang", rankShareCopy(rank)],
  ])("%s : titre ou texte signé « Cortex », jamais l'ancienne graphie", (_name, copy) => {
    const all = `${copy.title} ${copy.text}`;
    expect(all).toContain("Cortex");
    expect(all).not.toMatch(/icortex/i);
    expect(copy.filename).toMatch(/^cortex-.+\.png$/);
  });

  describe("séance", () => {
    it("séries et volume, tels qu'ils sont", () => {
      const copy = sessionShareCopy({ totalSets: 15, totalVolumeKg: 4120 });
      expect(copy.title).toBe("Séance terminée — Cortex");
      expect(copy.text).toBe("15 séries · 4\u00a0120 kg 💪");
      expect(copy.filename).toBe("cortex-seance.png");
    });

    it("une seule série : singulier", () => {
      expect(sessionShareCopy({ totalSets: 1, totalVolumeKg: 60 }).text).toBe("1 série · 60 kg 💪");
    });

    it("un volume nul n'est jamais affiché (séance au poids du corps)", () => {
      expect(sessionShareCopy({ totalSets: 12, totalVolumeKg: 0 }).text).toBe("12 séries 💪");
    });
  });

  describe("semaine", () => {
    it("numéro de semaine, séances, séries, volume", () => {
      const copy = weekShareCopy(week);
      expect(copy.title).toBe("Ma semaine 39 — Cortex");
      expect(copy.text).toBe("5 séances · 68 séries · 18\u00a0420 kg");
    });

    it("le nom de fichier porte la semaine : deux partages ne s'écrasent pas", () => {
      expect(weekShareCopy(week).filename).toBe("cortex-semaine-2026-09-21.png");
      expect(weekShareCopy({ ...week, weekStart: "2026-09-28" }).filename).toBe(
        "cortex-semaine-2026-09-28.png",
      );
    });

    it("une séance : singulier, et pas de volume quand il est nul", () => {
      expect(weekShareCopy({ ...week, sessions: 1, sets: 1, volumeKg: 0 }).text).toBe(
        "1 séance · 1 série",
      );
    });
  });

  describe("rang", () => {
    it("grade, exercice, signature", () => {
      const copy = rankShareCopy(rank);
      expect(copy.title).toBe("Guerrier — Vétéran — Squat");
      expect(copy.text).toBe("Rang Guerrier — Vétéran sur Cortex 💪");
      expect(copy.filename).toBe("cortex-guerrier.png");
    });
  });
});
