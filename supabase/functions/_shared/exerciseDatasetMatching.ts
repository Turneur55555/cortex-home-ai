// Moteur de correspondance pur (zéro I/O, zéro dépendance Deno/React) entre un
// enregistrement du dataset externe hasaneyldrm/exercises-dataset et une ligne
// existante de `exercise_reference`. Utilisé par l'edge function
// `import-exercises-dataset` (Deno) ET réexporté côté frontend
// (`src/lib/fitness/exerciseDatasetMatching.ts`) pour être testé avec vitest —
// même convention que `supabase/functions/_shared/meals.ts` /
// `src/lib/nutrition/meals.ts` (source unique, pas de duplication de logique).
//
// Règle absolue (voir docs/architecture/exercises-dataset-integration.md) :
// ce module ne modifie jamais rien lui-même. Il ne fait que scorer une paire
// (existant, candidat dataset) — la décision d'écrire (enrichir / créer /
// mettre en revue) est prise par l'appelant à partir du score retourné.
//
// Renforcement 2026-07-28 (v2, demandé par Nathan) : le dataset externe
// n'expose le nom de l'exercice qu'en anglais (voir doc §1) — sans couche de
// traduction, un nom anglais et un nom français identiques (même exercice) ne
// se seraient JAMAIS rapprochés par simple recouvrement de tokens. Le score
// combine désormais 5 signaux indépendants : nom (FR fourni + traduction
// exacte + traduction phrase + EN brut + alias existants), muscle principal,
// muscles secondaires, équipement, catégorie — voir `exerciseTranslations.ts`
// pour les dictionnaires EN->FR. Le nom reste le signal dominant ; la somme
// des poids des 4 autres signaux reste strictement inférieure à
// `AUTO_MERGE_THRESHOLD`, pour qu'aucune combinaison muscle/équipement/
// catégorie seule ne puisse jamais déclencher une fusion automatique sans un
// minimum de correspondance de nom (garde-fou vérifié par test).
import {
  exactTranslateExerciseName,
  translateExerciseNameToFrench,
  translateMuscleToFrench,
  translateEquipmentToFrench,
  extractEquipmentFromFrenchLabel,
} from "./exerciseTranslations.ts";
import { normalizeForMatch as normalize } from "./textNormalize.ts";

export type MatchDecision = "auto_merge" | "needs_review" | "create_new";

/** Réexporté pour compatibilité — voir `textNormalize.ts` pour l'implémentation. */
export { normalizeForMatch } from "./textNormalize.ts";

export interface ExistingExerciseConfigForMatch {
  muscle_group?: string | null;
  secondary_muscles?: string[] | null;
  equipment?: string | null;
}

export interface ExistingExerciseForMatch {
  id: string;
  name: string;
  category: string | null;
  aliases: string[] | null;
  /** Additif : présent uniquement si la ligne a déjà été enrichie une fois. */
  config?: ExistingExerciseConfigForMatch | null;
}

export interface DatasetRecordForMatch {
  datasetExerciseId: string;
  nameFr: string | null;
  nameEn: string;
  muscleGroup: string | null;
  secondaryMuscles: string[];
  equipment: string | null;
  category: string | null;
  /** Synonymes connus côté dataset (tags, variantes) — additif, souvent vide. */
  datasetAliases?: string[];
}

/**
 * Sous-scores individuels (0..1) de chacun des 5 signaux — exposés pour le
 * rapport détaillé du dry-run (voir `exerciseDatasetReport.ts`), qui doit
 * pouvoir afficher "Nom : 86 %", "Muscle principal : 100 %", etc. pour
 * chaque correspondance ambiguë, pas seulement le score global.
 */
export interface MatchBreakdown {
  name: number;
  musclePrimary: number;
  secondaryMuscles: number;
  equipment: number;
  category: number;
}

export interface MatchResult {
  existingId: string;
  score: number;
  reasons: string[];
  breakdown: MatchBreakdown;
}

/** Seuils de décision — voir doc pour la justification empirique. */
export const AUTO_MERGE_THRESHOLD = 0.82;
export const CREATE_NEW_THRESHOLD = 0.35;

/** Poids des signaux (somme = 1). Le nom reste dominant par construction. */
const WEIGHT_NAME = 0.55;
const WEIGHT_MUSCLE_PRIMARY = 0.2;
const WEIGHT_SECONDARY_MUSCLES = 0.1;
const WEIGHT_EQUIPMENT = 0.1;
const WEIGHT_CATEGORY = 0.05;

function tokenize(value: string): Set<string> {
  const normalized = normalize(value);
  return new Set(normalized.split(" ").filter(Boolean));
}

/** Coefficient de Dice sur les jeux de tokens — 1 = identique, 0 = disjoint. */
export function tokenSetSimilarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

/** Coefficient de Dice entre deux listes (utilisé pour les muscles secondaires). */
function listSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a.map((v) => normalize(v)).filter(Boolean));
  const setB = new Set(b.map((v) => normalize(v)).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return (2 * intersection) / (setA.size + setB.size);
}

/**
 * Construit tous les candidats de nom côté dataset : nom FR fourni par
 * l'appelant (si une future source le donne directement), traduction exacte
 * haute précision, traduction phrase best-effort, nom anglais brut, et
 * synonymes dataset connus. C'est ici que la couche de traduction EN<->FR
 * entre dans le scoring.
 */
function datasetNameCandidates(dataset: DatasetRecordForMatch): Array<[string, string]> {
  const candidates: Array<[string, string]> = [];
  if (dataset.nameFr) candidates.push(["nom FR (fourni)", dataset.nameFr]);
  const exact = exactTranslateExerciseName(dataset.nameEn);
  if (exact) candidates.push(["nom FR (traduction exacte)", exact]);
  const translated = translateExerciseNameToFrench(dataset.nameEn);
  if (translated) candidates.push(["nom FR (traduit)", translated]);
  candidates.push(["nom EN", dataset.nameEn]);
  for (const alias of dataset.datasetAliases ?? []) {
    candidates.push(["synonyme dataset", alias]);
  }
  return candidates;
}

function existingNameCandidates(existing: ExistingExerciseForMatch): Array<[string, string]> {
  const candidates: Array<[string, string]> = [["nom existant", existing.name]];
  for (const alias of existing.aliases ?? []) {
    candidates.push(["alias existant", alias]);
  }
  return candidates;
}

function bestNameSimilarity(
  existing: ExistingExerciseForMatch,
  dataset: DatasetRecordForMatch,
): { score: number; reason: string | null } {
  const candidates = datasetNameCandidates(dataset);
  const existingLabels = existingNameCandidates(existing);

  let best = { score: 0, reason: null as string | null };
  for (const [datasetLabel, datasetValue] of candidates) {
    for (const [existingLabel, existingValue] of existingLabels) {
      // Correspondance exacte (insensible casse/accents) : score maximal,
      // ne redéclenche jamais un simple recouvrement de tokens à côté.
      if (normalize(datasetValue) === normalize(existingValue) && normalize(datasetValue)) {
        return { score: 1, reason: `${datasetLabel} == ${existingLabel} (exact)` };
      }
      const score = tokenSetSimilarity(datasetValue, existingValue);
      if (score > best.score) {
        best = { score, reason: `${datasetLabel} ~ ${existingLabel} (${score.toFixed(2)})` };
      }
    }
  }
  return best;
}

/** Muscle principal : catégorie existante vs muscle/cible dataset (traduit EN->FR). */
function musclePrimaryAgreement(
  existing: ExistingExerciseForMatch,
  dataset: DatasetRecordForMatch,
): { score: number; reason: string | null } {
  const existingMuscle = existing.category ?? existing.config?.muscle_group ?? null;
  const datasetMuscleFr = translateMuscleToFrench(dataset.muscleGroup) ?? dataset.muscleGroup;
  if (!existingMuscle || !datasetMuscleFr) return { score: 0, reason: null };
  const similarity = tokenSetSimilarity(existingMuscle, datasetMuscleFr);
  if (similarity >= 0.5) {
    return {
      score: similarity,
      reason: `muscle principal "${existingMuscle}" ~ "${datasetMuscleFr}" (${similarity.toFixed(2)})`,
    };
  }
  return { score: 0, reason: null };
}

/** Muscles secondaires : uniquement disponible si l'existant a déjà été enrichi une fois. */
function secondaryMusclesAgreement(
  existing: ExistingExerciseForMatch,
  dataset: DatasetRecordForMatch,
): { score: number; reason: string | null } {
  const existingSecondary = existing.config?.secondary_muscles ?? [];
  if (existingSecondary.length === 0 || dataset.secondaryMuscles.length === 0) {
    return { score: 0, reason: null };
  }
  const translated = dataset.secondaryMuscles.map((m) => translateMuscleToFrench(m) ?? m);
  const similarity = listSimilarity(existingSecondary, translated);
  if (similarity > 0) {
    return { score: similarity, reason: `muscles secondaires (${similarity.toFixed(2)})` };
  }
  return { score: 0, reason: null };
}

/**
 * Équipement : compare l'équipement connu de l'existant (colonne `config`
 * une fois enrichi, sinon déduit du libellé français par heuristique de
 * mots-clés — voir `extractEquipmentFromFrenchLabel`) à l'équipement dataset
 * traduit EN->FR.
 */
function equipmentAgreement(
  existing: ExistingExerciseForMatch,
  dataset: DatasetRecordForMatch,
): { score: number; reason: string | null } {
  const existingEquipment =
    existing.config?.equipment ?? extractEquipmentFromFrenchLabel(existing.name);
  const datasetEquipmentFr = translateEquipmentToFrench(dataset.equipment) ?? dataset.equipment;
  if (!existingEquipment || !datasetEquipmentFr) return { score: 0, reason: null };
  if (normalize(existingEquipment) === normalize(datasetEquipmentFr)) {
    return { score: 1, reason: `équipement "${existingEquipment}" == "${datasetEquipmentFr}"` };
  }
  const similarity = tokenSetSimilarity(existingEquipment, datasetEquipmentFr);
  return similarity > 0
    ? { score: similarity, reason: `équipement ~ (${similarity.toFixed(2)})` }
    : { score: 0, reason: null };
}

/** Catégorie dataset (souvent générique : "strength", "cardio"...) vs catégorie existante. */
function categoryAgreement(
  existing: ExistingExerciseForMatch,
  dataset: DatasetRecordForMatch,
): { score: number; reason: string | null } {
  if (!existing.category || !dataset.category) return { score: 0, reason: null };
  const datasetCategoryFr = translateMuscleToFrench(dataset.category) ?? dataset.category;
  const similarity = tokenSetSimilarity(existing.category, datasetCategoryFr);
  return similarity > 0
    ? { score: similarity, reason: `catégorie ~ (${similarity.toFixed(2)})` }
    : { score: 0, reason: null };
}

/**
 * Score une paire (exercice existant, enregistrement dataset). Combine 5
 * signaux : nom (dominant, avec traduction/synonymes/alias — voir
 * `datasetNameCandidates`/`existingNameCandidates`), muscle principal,
 * muscles secondaires, équipement, catégorie. Un nom exact vaut 1
 * indépendamment des autres signaux. Sinon, la somme pondérée des 4 signaux
 * d'appoint (poids total 0.45) ne peut jamais, à elle seule, dépasser
 * `AUTO_MERGE_THRESHOLD` (0.82) — garanti par construction et vérifié par
 * test — donc aucune fusion automatique n'est possible sans un minimum de
 * correspondance de nom.
 */
export function scoreCandidate(
  existing: ExistingExerciseForMatch,
  dataset: DatasetRecordForMatch,
): MatchResult {
  const nameMatch = bestNameSimilarity(existing, dataset);
  // Les 4 signaux d'appoint sont toujours calculés (même en cas de nom exact)
  // pour que le rapport détaillé du dry-run puisse afficher une décomposition
  // complète et cohérente — ils n'influencent le score final que si le nom
  // n'est pas déjà exact (voir plus bas).
  const muscleMatch = musclePrimaryAgreement(existing, dataset);
  const secondaryMatch = secondaryMusclesAgreement(existing, dataset);
  const equipmentMatch = equipmentAgreement(existing, dataset);
  const categoryMatch = categoryAgreement(existing, dataset);

  const breakdown: MatchBreakdown = {
    name: nameMatch.score,
    musclePrimary: muscleMatch.score,
    secondaryMuscles: secondaryMatch.score,
    equipment: equipmentMatch.score,
    category: categoryMatch.score,
  };

  if (nameMatch.score >= 1) {
    return {
      existingId: existing.id,
      score: 1,
      reasons: [nameMatch.reason ?? ""].filter(Boolean),
      breakdown,
    };
  }

  const reasons = [
    nameMatch.reason,
    muscleMatch.reason,
    secondaryMatch.reason,
    equipmentMatch.reason,
    categoryMatch.reason,
  ].filter((r): r is string => Boolean(r));

  const score =
    nameMatch.score * WEIGHT_NAME +
    muscleMatch.score * WEIGHT_MUSCLE_PRIMARY +
    secondaryMatch.score * WEIGHT_SECONDARY_MUSCLES +
    equipmentMatch.score * WEIGHT_EQUIPMENT +
    categoryMatch.score * WEIGHT_CATEGORY;

  return { existingId: existing.id, score, reasons, breakdown };
}

/** Meilleure correspondance parmi tous les exercices existants d'une discipline. */
export function findBestMatch(
  existingRows: ExistingExerciseForMatch[],
  dataset: DatasetRecordForMatch,
): MatchResult | null {
  let best: MatchResult | null = null;
  for (const row of existingRows) {
    const result = scoreCandidate(row, dataset);
    if (!best || result.score > best.score) best = result;
  }
  return best;
}

export function classifyMatch(score: number): MatchDecision {
  if (score >= AUTO_MERGE_THRESHOLD) return "auto_merge";
  if (score <= CREATE_NEW_THRESHOLD) return "create_new";
  return "needs_review";
}

/**
 * Convertit un exercice EXISTANT (`ExistingExerciseForMatch`) en un
 * pseudo-enregistrement dataset comparable, pour réutiliser `scoreCandidate`
 * tel quel entre deux exercices Cortex — voir `scoreExercisePair`. Aucune
 * traduction n'est nécessaire ici : depuis le renforcement "bibliothèque
 * d'exercices" (2026-07-31), tout exercice importé du dataset reçoit déjà un
 * nom canonique FRANÇAIS à la création (voir §14 de la doc) — comparer deux
 * exercices Cortex, c'est donc toujours comparer du français à du français.
 */
function toComparableRecord(exercise: ExistingExerciseForMatch): DatasetRecordForMatch {
  return {
    datasetExerciseId: exercise.id,
    nameFr: exercise.name,
    nameEn: exercise.name,
    muscleGroup: exercise.config?.muscle_group ?? exercise.category,
    secondaryMuscles: exercise.config?.secondary_muscles ?? [],
    equipment: exercise.config?.equipment ?? null,
    category: exercise.category,
    datasetAliases: exercise.aliases ?? [],
  };
}

/**
 * Score de similarité entre DEUX exercices Cortex existants (jamais entre un
 * exercice et un enregistrement dataset brut — voir `scoreCandidate` pour ce
 * cas). Réutilise exactement le même moteur à 5 signaux (aucune logique
 * dupliquée) via `toComparableRecord`. Utilisé par la détection de
 * similarité de la bibliothèque d'exercices (§14) : alimente uniquement des
 * SUGGESTIONS affichées dans l'interface d'administration — ne déclenche
 * jamais de fusion automatique, quel que soit le score obtenu.
 */
export function scoreExercisePair(
  a: ExistingExerciseForMatch,
  b: ExistingExerciseForMatch,
): MatchResult {
  return scoreCandidate(a, toComparableRecord(b));
}

/**
 * Génère l'ensemble des alias français/anglais à persister sur
 * `exercise_reference.aliases` pour qu'une recherche dans les deux langues
 * retrouve l'exercice (ex. "lat pulldown" ET "tirage vertical" retrouvent la
 * même ligne). Utilisée par l'edge function au moment de l'écriture — pure,
 * ne fait aucune I/O. Ne renvoie que des valeurs non vides, dédupliquées,
 * jamais le nom canonique lui-même (redondant avec `exercise_reference.name`).
 */
export function buildAliasesForDatasetRecord(
  dataset: DatasetRecordForMatch,
  canonicalName: string,
): string[] {
  const candidates = [
    dataset.nameEn,
    dataset.nameFr,
    exactTranslateExerciseName(dataset.nameEn),
    translateExerciseNameToFrench(dataset.nameEn),
    ...(dataset.datasetAliases ?? []),
  ];
  const canonicalKey = normalize(canonicalName);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const key = normalize(candidate);
    if (!key || key === canonicalKey || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}
