import { describe, expect, it } from "vitest";
import {
  scoreCandidate,
  findBestMatch,
  classifyMatch,
  scoreExercisePair,
  tokenSetSimilarity,
  buildAliasesForDatasetRecord,
  AUTO_MERGE_THRESHOLD,
  CREATE_NEW_THRESHOLD,
  type ExistingExerciseForMatch,
  type DatasetRecordForMatch,
} from "./exerciseDatasetMatching";

function existing(overrides: Partial<ExistingExerciseForMatch> = {}): ExistingExerciseForMatch {
  return {
    id: "e1",
    name: "Développé couché barre",
    category: "Pectoraux",
    aliases: null,
    ...overrides,
  };
}

function dataset(overrides: Partial<DatasetRecordForMatch> = {}): DatasetRecordForMatch {
  return {
    datasetExerciseId: "d1",
    nameFr: null,
    nameEn: "Barbell Bench Press",
    muscleGroup: "chest",
    secondaryMuscles: [],
    equipment: "barbell",
    category: null,
    ...overrides,
  };
}

describe("tokenSetSimilarity", () => {
  it("vaut 1 pour deux chaînes identiques (accents/casse ignorés)", () => {
    expect(tokenSetSimilarity("Développé couché", "developpe couche")).toBeCloseTo(1);
  });

  it("vaut 0 pour deux chaînes disjointes", () => {
    expect(tokenSetSimilarity("Squat barre", "Curl haltères")).toBe(0);
  });

  it("vaut 0 si l'une des deux chaînes est vide", () => {
    expect(tokenSetSimilarity("", "Squat")).toBe(0);
  });
});

describe("scoreCandidate", () => {
  it("score 1 en cas de nom exact (insensible casse/accents)", () => {
    const result = scoreCandidate(existing(), dataset({ nameFr: "Développé couché barre" }));
    expect(result.score).toBe(1);
    expect(result.reasons[0]).toContain("exact");
  });

  it("score élevé pour un nom partiellement recouvrant + muscle cohérent", () => {
    // Le dataset externe ne traduit que les instructions, pas le nom de
    // l'exercice (voir docs/architecture/exercises-dataset-integration.md,
    // section limites) : ce cas simule donc soit un nom déjà en français côté
    // dataset (`nameFr`, si une future source le fournit), soit un chevauchement
    // de tokens partiel dans la même langue.
    const result = scoreCandidate(
      existing({ name: "Développé couché barre", category: "Pectoraux" }),
      dataset({ nameEn: "developpe couche", muscleGroup: "pectoraux" }),
    );
    expect(result.score).toBeGreaterThan(0.3);
  });

  it("score faible pour deux exercices sans rapport", () => {
    const result = scoreCandidate(
      existing({ name: "Squat barre", category: "Jambes" }),
      dataset({ nameEn: "Bicep Curl", muscleGroup: "biceps" }),
    );
    expect(result.score).toBeLessThan(CREATE_NEW_THRESHOLD);
  });

  it("score faible (jamais fusionné) quand seul le nom anglais est disponible sans recouvrement lexical avec le nom français existant", () => {
    // Cas réel et fréquent avec ce dataset : le nom existant est en français,
    // le nom dataset en anglais, sans dictionnaire de traduction des noms
    // (seules les instructions sont traduites). Le score doit rester bas afin
    // que ces paires partent en revue manuelle plutôt que d'être fusionnées
    // à tort — comportement voulu, pas un défaut de l'algorithme.
    const result = scoreCandidate(
      existing({ name: "Développé couché barre", category: "Pectoraux" }),
      dataset({ nameEn: "Bench Press", muscleGroup: "pectoraux" }),
    );
    expect(result.score).toBeLessThan(AUTO_MERGE_THRESHOLD);
  });

  it("recherche aussi dans les aliases existants", () => {
    const result = scoreCandidate(
      existing({ name: "Tirage vertical poitrine", aliases: ["Lat Pulldown"] }),
      dataset({ nameEn: "Lat Pulldown" }),
    );
    expect(result.score).toBe(1);
  });

  it("utilise la traduction exacte EN->FR pour fusionner un exercice connu sans alias préexistant", () => {
    // "Lat Pulldown" doit retrouver "Tirage vertical" via le dictionnaire de
    // traduction exacte, même si l'exercice existant n'a encore aucun alias.
    const result = scoreCandidate(
      existing({ name: "Tirage vertical", category: "Dos", aliases: null }),
      dataset({ nameEn: "Lat Pulldown", muscleGroup: "back" }),
    );
    expect(result.score).toBe(1);
    expect(result.reasons[0]).toContain("traduction exacte");
  });

  it("muscles secondaires : renforce le score quand l'existant a déjà été enrichi une fois", () => {
    const withoutSecondary = scoreCandidate(
      existing({ name: "Développé couché", category: "Pectoraux" }),
      dataset({
        nameEn: "Chest Press",
        muscleGroup: "chest",
        secondaryMuscles: ["triceps", "shoulders"],
      }),
    );
    const withSecondary = scoreCandidate(
      existing({
        name: "Développé couché",
        category: "Pectoraux",
        config: { secondary_muscles: ["triceps", "épaules"] },
      }),
      dataset({
        nameEn: "Chest Press",
        muscleGroup: "chest",
        secondaryMuscles: ["triceps", "shoulders"],
      }),
    );
    expect(withSecondary.score).toBeGreaterThan(withoutSecondary.score);
  });

  it("équipement : utilise `config.equipment` si présent, sinon déduit du libellé existant", () => {
    const viaHeuristic = scoreCandidate(
      existing({ name: "Développé couché barre", category: "Pectoraux" }),
      dataset({ nameEn: "Chest Press", muscleGroup: "chest", equipment: "barbell" }),
    );
    const viaConfig = scoreCandidate(
      existing({ name: "Développé couché", category: "Pectoraux", config: { equipment: "barre" } }),
      dataset({ nameEn: "Chest Press", muscleGroup: "chest", equipment: "barbell" }),
    );
    expect(viaHeuristic.score).toBeGreaterThan(0);
    expect(viaConfig.score).toBeGreaterThan(0);
  });

  it("garde-fou : muscle + muscles secondaires + équipement + catégorie seuls ne peuvent jamais atteindre le seuil de fusion automatique", () => {
    // Aucun recouvrement de nom du tout, mais accord parfait sur tous les
    // autres signaux : le score doit rester strictement sous
    // AUTO_MERGE_THRESHOLD (poids cumulé des signaux d'appoint = 0.45 < 0.82).
    const result = scoreCandidate(
      existing({
        name: "Exercice totalement différent",
        category: "Pectoraux",
        config: { secondary_muscles: ["triceps", "épaules"], equipment: "barre" },
      }),
      dataset({
        nameEn: "Completely Unrelated Movement Xyz",
        muscleGroup: "chest",
        secondaryMuscles: ["triceps", "shoulders"],
        equipment: "barbell",
        category: "chest",
      }),
    );
    expect(result.score).toBeLessThan(AUTO_MERGE_THRESHOLD);
  });
});

describe("buildAliasesForDatasetRecord", () => {
  it("inclut le nom anglais et la traduction exacte, sans dupliquer le nom canonique", () => {
    const aliases = buildAliasesForDatasetRecord(
      dataset({ nameEn: "Lat Pulldown" }),
      "Tirage vertical",
    );
    expect(aliases).toContain("Lat Pulldown");
    expect(aliases.some((a) => a.toLowerCase().includes("tirage vertical"))).toBe(false);
  });

  it("ne renvoie jamais de doublon (recouvrement nom anglais / traduction identique)", () => {
    const aliases = buildAliasesForDatasetRecord(dataset({ nameEn: "Face Pull" }), "Face Pull");
    // "Face Pull" == nom canonique -> exclu ; traduction exacte == "Face Pull" aussi -> exclu.
    expect(aliases).not.toContain("Face Pull");
  });

  it("ignore les entrées vides", () => {
    const aliases = buildAliasesForDatasetRecord(
      dataset({ nameEn: "Some Unknown Exercise 99", nameFr: null }),
      "Un exercice",
    );
    expect(aliases.every((a) => a.trim().length > 0)).toBe(true);
  });
});

describe("findBestMatch / classifyMatch", () => {
  it("retourne null si la liste existante est vide", () => {
    expect(findBestMatch([], dataset())).toBeNull();
  });

  it("choisit la meilleure correspondance parmi plusieurs candidats", () => {
    const rows = [
      existing({ id: "a", name: "Squat barre", category: "Jambes" }),
      existing({ id: "b", name: "Développé couché barre", category: "Pectoraux" }),
    ];
    const best = findBestMatch(
      rows,
      dataset({ nameFr: "Développé couché barre", muscleGroup: "chest" }),
    );
    expect(best?.existingId).toBe("b");
  });

  it("classifie un score exact comme fusion automatique", () => {
    expect(classifyMatch(1)).toBe("auto_merge");
    expect(classifyMatch(AUTO_MERGE_THRESHOLD)).toBe("auto_merge");
  });

  it("classifie un score nul comme nouvel exercice à créer", () => {
    expect(classifyMatch(0)).toBe("create_new");
  });

  it("classifie un score intermédiaire comme nécessitant une revue", () => {
    expect(classifyMatch((AUTO_MERGE_THRESHOLD + CREATE_NEW_THRESHOLD) / 2)).toBe("needs_review");
  });
});

describe("scoreExercisePair (bibliothèque d'exercices, §14)", () => {
  it("détecte une similarité forte entre deux exercices Cortex quasi identiques", () => {
    const a = existing({ id: "a", name: "Développé couché", category: "Pectoraux" });
    const b = existing({ id: "b", name: "Développé couché barre", category: "Pectoraux" });
    const result = scoreExercisePair(a, b);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("recherche aussi dans les alias de l'exercice B (nom canonique différent, alias identique)", () => {
    const a = existing({ id: "a", name: "Tirage vertical", category: "Dos" });
    const b = existing({
      id: "b",
      name: "Lat Pulldown FR",
      category: "Dos",
      aliases: ["Tirage vertical"],
    });
    const result = scoreExercisePair(a, b);
    expect(result.score).toBe(1);
  });

  it("score faible entre deux exercices sans rapport", () => {
    const a = existing({ id: "a", name: "Squat barre", category: "Jambes" });
    const b = existing({ id: "b", name: "Curl haltères", category: "Biceps" });
    const result = scoreExercisePair(a, b);
    expect(result.score).toBeLessThan(CREATE_NEW_THRESHOLD);
  });

  it("n'est jamais un déclencheur de fusion en lui-même — seulement un score pour suggestion manuelle", () => {
    // scoreExercisePair ne fait qu'appeler scoreCandidate ; classifyMatch reste
    // disponible pour catégoriser le score côté appelant (affichage), mais
    // rien dans ce module n'écrit ni ne fusionne quoi que ce soit.
    const a = existing({ id: "a", name: "Développé couché barre", category: "Pectoraux" });
    const b = existing({ id: "b", name: "Développé couché barre", category: "Pectoraux" });
    const result = scoreExercisePair(a, b);
    expect(result.score).toBe(1);
    expect(typeof result.score).toBe("number");
  });
});
