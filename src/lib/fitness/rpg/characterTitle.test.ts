import { describe, it, expect } from "vitest";
import {
  characterTitleForLevel,
  characterGradeIndexForLevel,
  characterGradeLabelForLevel,
  nextGradeLabelForLevel,
  hasOfficialGrades,
  characterProgression,
  MORTAL_GRADES,
  GRADES_PER_TITLE,
} from "./characterTitle";
import { RANK_TIERS, LEVELS_PER_RANK } from "../exerciseRanks";

describe("characterTitleForLevel", () => {
  it("chaque bande de 5 niveaux correspond au titre officiel dans l'ordre", () => {
    const expected = RANK_TIERS.map((t) => t.label);
    for (let band = 0; band < expected.length; band++) {
      for (let i = 0; i < LEVELS_PER_RANK; i++) {
        const level = band * LEVELS_PER_RANK + i + 1;
        expect(characterTitleForLevel(level)).toBe(expected[band]);
      }
    }
  });

  it("niveau 1 = Mortel, niveau 6 = Guerrier, niveau 11 = Héros", () => {
    expect(characterTitleForLevel(1)).toBe("Mortel");
    expect(characterTitleForLevel(6)).toBe("Guerrier");
    expect(characterTitleForLevel(11)).toBe("Héros");
    expect(characterTitleForLevel(16)).toBe("Titan");
    expect(characterTitleForLevel(21)).toBe("Olympien");
    expect(characterTitleForLevel(26)).toBe("Primordial");
  });

  it("niveau très élevé plafonné sur Primordial", () => {
    expect(characterTitleForLevel(99)).toBe("Primordial");
    expect(characterTitleForLevel(1000)).toBe("Primordial");
  });

  it("niveau nul ou négatif replié sur Mortel (niveau 1)", () => {
    expect(characterTitleForLevel(0)).toBe("Mortel");
    expect(characterTitleForLevel(-5)).toBe("Mortel");
  });
});

describe("characterGradeIndexForLevel", () => {
  it("vaut 0 au premier niveau de chaque bande, 4 au dernier", () => {
    expect(characterGradeIndexForLevel(1)).toBe(0);
    expect(characterGradeIndexForLevel(5)).toBe(4);
    expect(characterGradeIndexForLevel(6)).toBe(0);
    expect(characterGradeIndexForLevel(10)).toBe(4);
    expect(characterGradeIndexForLevel(16)).toBe(0);
    expect(characterGradeIndexForLevel(20)).toBe(4);
  });
});

describe("MORTAL_GRADES", () => {
  it("contient exactement les 5 grades officiels dans l'ordre", () => {
    expect(MORTAL_GRADES).toEqual(["Éveillé", "Initié", "Aguerri", "Accompli", "Émérite"]);
    expect(MORTAL_GRADES.length).toBe(GRADES_PER_TITLE);
  });
});

describe("characterGradeLabelForLevel", () => {
  it("renvoie les grades officiels pour le titre Mortel", () => {
    expect(characterGradeLabelForLevel(1)).toBe("Éveillé");
    expect(characterGradeLabelForLevel(2)).toBe("Initié");
    expect(characterGradeLabelForLevel(3)).toBe("Aguerri");
    expect(characterGradeLabelForLevel(4)).toBe("Accompli");
    expect(characterGradeLabelForLevel(5)).toBe("Émérite");
  });

  it("ne nomme pas les grades des autres titres (libellé neutre numéroté)", () => {
    expect(characterGradeLabelForLevel(6)).toBe("1er grade");
    expect(characterGradeLabelForLevel(7)).toBe("2e grade");
    expect(characterGradeLabelForLevel(10)).toBe("5e grade");
    expect(characterGradeLabelForLevel(16)).toBe("1er grade");
  });
});

describe("hasOfficialGrades", () => {
  it("vrai uniquement pour le titre Mortel", () => {
    expect(hasOfficialGrades(1)).toBe(true);
    expect(hasOfficialGrades(5)).toBe(true);
    expect(hasOfficialGrades(6)).toBe(false);
    expect(hasOfficialGrades(26)).toBe(false);
  });
});

describe("nextGradeLabelForLevel", () => {
  it("renvoie le grade suivant dans la bande Mortel", () => {
    expect(nextGradeLabelForLevel(1)).toBe("Initié");
    expect(nextGradeLabelForLevel(2)).toBe("Aguerri");
    expect(nextGradeLabelForLevel(3)).toBe("Accompli");
    expect(nextGradeLabelForLevel(4)).toBe("Émérite");
  });

  it("renvoie null au dernier grade d'une bande", () => {
    expect(nextGradeLabelForLevel(5)).toBeNull();
    expect(nextGradeLabelForLevel(10)).toBeNull();
    expect(nextGradeLabelForLevel(20)).toBeNull();
  });
});

describe("characterProgression", () => {
  it("expose Titre + Grade + XP sans jamais exposer le Level", () => {
    const p = characterProgression(0);
    expect(p.title).toBe("Mortel");
    expect(p.grade).toBe("Éveillé");
    expect(p.xp).toBe(0);
    expect(p).not.toHaveProperty("level");
  });

  it("XP 0 : Mortel Éveillé, objectif suivant = Initié", () => {
    const p = characterProgression(0);
    expect(p.nextGrade).toBe("Initié");
    expect(p.isMaxGradeInTitle).toBe(false);
    expect(p.xpToNextGrade).toBe(50); // xpAtNextLevel(1) = 50·1²
  });

  it("XP 50 : passe au grade Initié (niveau 2)", () => {
    const p = characterProgression(50);
    expect(p.grade).toBe("Initié");
    expect(p.nextGrade).toBe("Aguerri");
  });

  it("XP 200 : passe au grade Aguerri (niveau 3)", () => {
    const p = characterProgression(200);
    expect(p.grade).toBe("Aguerri");
  });

  it("XP juste sous le dernier grade Mortel : Émérite atteint, plus de grade suivant", () => {
    // niveau 5 commence à xp = 50·4² = 800
    const p = characterProgression(800);
    expect(p.title).toBe("Mortel");
    expect(p.grade).toBe("Émérite");
    expect(p.isMaxGradeInTitle).toBe(true);
    expect(p.nextGrade).toBeNull();
    expect(p.xpToNextGrade).toBe(0);
  });

  it("XP 12500 : titre Titan (niveau ~16), grade neutre, pas de Level exposé", () => {
    const p = characterProgression(12_500);
    expect(p.title).toBe("Titan");
    expect(p).not.toHaveProperty("level");
    expect(p.isMaxGradeInTitle).toBe(false);
    expect(p.nextGrade).not.toBeNull();
  });

  it("XP négative repliée sur Mortel Éveillé", () => {
    const p = characterProgression(-100);
    expect(p.title).toBe("Mortel");
    expect(p.grade).toBe("Éveillé");
    expect(p.xp).toBe(0);
  });
});
