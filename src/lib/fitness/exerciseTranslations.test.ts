import { describe, expect, it } from "vitest";
import {
  exactTranslateExerciseName,
  translateExerciseNameToFrench,
  translateMuscleToFrench,
  translateEquipmentToFrench,
  extractEquipmentFromFrenchLabel,
} from "./exerciseTranslations";

describe("exactTranslateExerciseName", () => {
  it("traduit les exemples fournis par Nathan", () => {
    expect(exactTranslateExerciseName("Bench Press")).toBe("Développé couché");
    expect(exactTranslateExerciseName("Lat Pulldown")).toBe("Tirage vertical");
    expect(exactTranslateExerciseName("Seated Cable Row")).toBe("Tirage horizontal assis");
    expect(exactTranslateExerciseName("Face Pull")).toBe("Face Pull");
    expect(exactTranslateExerciseName("Romanian Deadlift")).toBe("Soulevé de terre roumain");
  });

  it("est insensible à la casse", () => {
    expect(exactTranslateExerciseName("bench press")).toBe("Développé couché");
    expect(exactTranslateExerciseName("BENCH PRESS")).toBe("Développé couché");
  });

  it("retourne null pour un nom inconnu", () => {
    expect(exactTranslateExerciseName("Some Made Up Exercise 42")).toBeNull();
  });

  it("corrige la cible du soulevé de terre sumo (analyse du 2026-07-30)", () => {
    // Sans cette entrée exacte, "barbell sumo deadlift" se rapprochait par
    // erreur de "Soulevé de terre roumain barre" (meilleur score global grâce
    // aux signaux muscle/équipement/catégorie) plutôt que du bon exercice
    // "Soulevé de terre sumo", qui existe pourtant déjà dans Cortex.
    expect(exactTranslateExerciseName("barbell sumo deadlift")).toBe("Soulevé de terre sumo");
  });

  it("reconnaît les synonymes découverts lors de l'analyse des correspondances ambiguës", () => {
    expect(exactTranslateExerciseName("barbell full squat")).toBe("Squat barre");
    expect(exactTranslateExerciseName("cable kneeling crunch")).toBe("Crunch câble");
  });
});

describe("translateExerciseNameToFrench", () => {
  it("traduit un nom composé via le dictionnaire phrase/mot", () => {
    const result = translateExerciseNameToFrench("Barbell Bench Press");
    expect(result).toContain("développé");
    expect(result).toContain("couché");
  });

  it("ne renvoie jamais une chaîne vide, même pour un nom sans traduction connue", () => {
    expect(translateExerciseNameToFrench("Zzyzx Unknown Movement")).toBeTruthy();
  });

  it("traduit le préfixe générique 'lever' (convention dataset pour machine)", () => {
    const result = translateExerciseNameToFrench("Lever Leg Extension");
    expect(result).toContain("machine");
  });

  it("traduit le préfixe générique 'sled'", () => {
    const result = translateExerciseNameToFrench("Sled Hack Squat");
    expect(result).toContain("machine");
  });

  it("ne corrompt jamais un mot français déjà produit par une autre substitution (non-régression 2026-07-30)", () => {
    // "front" a été essayé comme traduction ("front" -> "avant") puis retiré :
    // "lying triceps extension" se traduit en "barre au front" (mot français
    // = front/forehead), et une règle "front" -> "avant" repassait dessus en
    // cascade et le corrompait en "barre au avant". Ce test verrouille le
    // résultat correct pour empêcher toute réintroduction du bug.
    const result = translateExerciseNameToFrench("Barbell Lying Triceps Extension");
    expect(result).toContain("barre au front");
    expect(result).not.toContain("avant");
  });
});

describe("translateMuscleToFrench", () => {
  it("traduit les muscles principaux courants", () => {
    expect(translateMuscleToFrench("chest")).toBe("pectoraux");
    expect(translateMuscleToFrench("back")).toBe("dos");
    expect(translateMuscleToFrench("shoulders")).toBe("épaules");
    expect(translateMuscleToFrench("glutes")).toBe("fessiers");
  });

  it("retombe sur un recouvrement de token pour une valeur composée inconnue", () => {
    expect(translateMuscleToFrench("upper legs")).toBe("jambes");
  });

  it("retourne null pour une entrée vide/inconnue", () => {
    expect(translateMuscleToFrench(null)).toBeNull();
    expect(translateMuscleToFrench("xyz")).toBeNull();
  });

  it("traduit les valeurs réelles du dataset absentes avant l'analyse du 2026-07-30", () => {
    expect(translateMuscleToFrench("spine")).toBe("dos");
    expect(translateMuscleToFrench("cardiovascular system")).toBe("cardio");
  });
});

describe("translateEquipmentToFrench", () => {
  it("traduit les équipements courants", () => {
    expect(translateEquipmentToFrench("barbell")).toBe("barre");
    expect(translateEquipmentToFrench("body weight")).toBe("poids du corps");
    expect(translateEquipmentToFrench("cable")).toBe("câble");
  });

  it("traduit les valeurs réelles du dataset absentes avant l'analyse du 2026-07-30", () => {
    expect(translateEquipmentToFrench("sled machine")).toBe("machine");
    expect(translateEquipmentToFrench("assisted")).toBe("machine assistée");
  });
});

describe("extractEquipmentFromFrenchLabel", () => {
  it("déduit l'équipement implicite d'un libellé existant", () => {
    expect(extractEquipmentFromFrenchLabel("Développé couché barre")).toBe("barre");
    expect(extractEquipmentFromFrenchLabel("Curl haltères alternés")).toBe("haltères");
    expect(extractEquipmentFromFrenchLabel("Tirage vertical poulie")).toBe("poulie");
  });

  it("retourne null si aucun mot-clé d'équipement n'est présent", () => {
    expect(extractEquipmentFromFrenchLabel("Crunch")).toBeNull();
  });
});
