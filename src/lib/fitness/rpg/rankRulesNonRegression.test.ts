import { describe, expect, it } from "vitest";
import { RANK_TIERS } from "@/lib/fitness/exerciseRanks";
import { GRADE_NAMES_BY_TITLE, XP_THRESHOLDS, TOTAL_TIERS } from "./titleConfig";
import { titleProgressForXp } from "./titleProgress";

/**
 * CHANTIER 4 — NON-RÉGRESSION des règles RPG.
 *
 * Le chantier 4 ne corrige QUE la disponibilité, la synchronisation et
 * l'affichage de la progression. Il ne doit toucher NI les noms des Rangs, NI
 * leur ordre, NI les seuils, NI les règles de progression. Ce fichier fige ces
 * valeurs telles qu'elles existent avant le chantier : toute modification —
 * volontaire ou accidentelle, y compris « pour faire passer un test » — fait
 * échouer la CI.
 *
 * Complémentaire (et non redondant) avec l'existant :
 *  - `titleProgress.test.ts` vérifie des INVARIANTS de structure (5 grades par
 *    titre, seuils croissants, monotonie) ;
 *  - `titleConfig.sql-parity.test.ts` vérifie la PARITÉ client ↔ SQL ;
 *  - ici, on fige les VALEURS EXACTES elles-mêmes.
 */

describe("Rangs — noms et ordre figés", () => {
  it("les 6 familles de Rang gardent leurs clés, dans cet ordre", () => {
    expect(RANK_TIERS.map((t) => t.key)).toEqual([
      "mortel",
      "guerrier",
      "heros",
      "colosse",
      "olympien",
      "titan",
    ]);
  });

  it("les 30 Grades nommés sont inchangés", () => {
    expect(GRADE_NAMES_BY_TITLE).toEqual({
      mortel: ["Éveillé", "Initié", "Aguerri", "Accompli", "Émérite"],
      guerrier: ["Aspirant", "Vétéran", "Redoutable", "Inflexible", "Invaincu"],
      heros: ["Célèbre", "Admiré", "Glorieux", "Légendaire", "Mythique"],
      colosse: ["Colossal", "Implacable", "Dominateur", "Inébranlable", "Souverain"],
      olympien: ["Exalté", "Ascendant", "Sublime", "Éternel", "Divin"],
      titan: ["Originel", "Ancestral", "Suprême", "Absolu", "Omniscient"],
    });
  });
});

describe("Seuils d'XP — valeurs figées", () => {
  it("les 30 seuils sont exactement ceux calibrés en P1.8", () => {
    expect(XP_THRESHOLDS).toEqual([
      0, 200, 550, 900, 1350, 1800, 2600, 3700, 5000, 6450, 8000, 9700, 12250, 15200, 18500, 22000,
      25450, 30500, 36400, 43000, 50000, 55550, 63700, 73200, 83700, 95000, 116600, 148200, 185100,
      226000,
    ]);
    expect(XP_THRESHOLDS).toHaveLength(TOTAL_TIERS);
  });

  it("chaque seuil fait bien entrer dans SON palier, et pas un de plus", () => {
    XP_THRESHOLDS.forEach((threshold, tierIndex) => {
      expect(titleProgressForXp(threshold).tierIndex).toBe(tierIndex);
      if (tierIndex > 0) {
        expect(titleProgressForXp(threshold - 1).tierIndex).toBe(tierIndex - 1);
      }
    });
  });

  it("l'entrée dans chaque FAMILLE de Rang reste au seuil attendu", () => {
    // Un joueur retient son RANG (CLAUDE.md) : ces 6 frontières sont les
    // valeurs les plus visibles de tout le système.
    const entryByRank = RANK_TIERS.map((tier, i) => [tier.key, XP_THRESHOLDS[i * 5]] as const);
    expect(Object.fromEntries(entryByRank)).toEqual({
      mortel: 0,
      guerrier: 1800,
      heros: 8000,
      colosse: 22000,
      olympien: 50000,
      titan: 95000,
    });
  });
});

describe("Progression — comportements de bord inchangés", () => {
  it("0 XP = premier grade du premier Rang", () => {
    const p = titleProgressForXp(0);
    expect(p.tierIndex).toBe(0);
    expect(p.title.key).toBe("mortel");
    expect(p.grade).toBe("Éveillé");
    expect(p.isMax).toBe(false);
  });

  it("le palier suprême plafonne et ne propose plus de suite", () => {
    const p = titleProgressForXp(999_999);
    expect(p.tierIndex).toBe(TOTAL_TIERS - 1);
    expect(p.title.key).toBe("titan");
    expect(p.grade).toBe("Omniscient");
    expect(p.isMax).toBe(true);
    expect(p.xpNextThreshold).toBeNull();
  });

  it("une XP absente/nulle ne fabrique jamais un rang supérieur", () => {
    expect(titleProgressForXp(0).tierIndex).toBe(0);
    expect(titleProgressForXp(-500).tierIndex).toBe(0);
  });
});
