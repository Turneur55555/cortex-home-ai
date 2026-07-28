// Script d'exécution LOCALE du dry-run import-exercises-dataset, en lecture
// seule : lit un export JSON des exercices existants (déjà extrait via
// requête SQL en lecture seule) + le dataset externe téléchargé, et exécute
// EXACTEMENT la même logique de matching que l'edge function (mêmes modules
// _shared importés), sans jamais écrire quoi que ce soit. Usage ponctuel de
// vérification manuelle avant tout import réel — pas un chemin de code
// exécuté en production.
import { readFileSync } from "node:fs";
import {
  findBestMatch,
  classifyMatch,
  type DatasetRecordForMatch,
  type ExistingExerciseForMatch,
} from "../supabase/functions/_shared/exerciseDatasetMatching.ts";
import {
  exactTranslateExerciseName,
  translateExerciseNameToFrench,
} from "../supabase/functions/_shared/exerciseTranslations.ts";
import {
  buildDryRunReport,
  type AmbiguousMatchEntry,
} from "../supabase/functions/_shared/exerciseDatasetReport.ts";

interface RawDatasetRecord {
  id: string | number;
  name: string;
  category?: string | null;
  body_part?: string | null;
  target?: string | null;
  muscle_group?: string | null;
  secondary_muscles?: string[] | null;
  equipment?: string | null;
}

function toMuscleGroup(record: RawDatasetRecord): string | null {
  return record.muscle_group ?? record.target ?? record.body_part ?? null;
}

function bestFrenchName(record: RawDatasetRecord): string {
  return exactTranslateExerciseName(record.name) ?? translateExerciseNameToFrench(record.name);
}

function toMatchRecord(record: RawDatasetRecord): DatasetRecordForMatch {
  return {
    datasetExerciseId: String(record.id),
    nameFr: bestFrenchName(record),
    nameEn: record.name,
    muscleGroup: toMuscleGroup(record),
    secondaryMuscles: record.secondary_muscles ?? [],
    equipment: record.equipment ?? null,
    category: record.category ?? null,
  };
}

const existingPath = process.argv[2];
const datasetPath = process.argv[3];

const existing = JSON.parse(readFileSync(existingPath, "utf8")) as ExistingExerciseForMatch[];
const allRecords = JSON.parse(readFileSync(datasetPath, "utf8")) as RawDatasetRecord[];

let autoMerged = 0;
let createdNew = 0;
let queuedForReview = 0;
let skippedNoName = 0;
const ambiguousMatches: AmbiguousMatchEntry[] = [];
// Suit combien de fois chaque exercice existant est choisi comme meilleure
// correspondance auto-fusionnée — sert à compter les doublons évités
// (un exercice dataset qui aurait sinon pu produire un doublon, fusionné à
// la place dans une ligne déjà existante).
const autoMergedTargets = new Map<string, number>();

for (const record of allRecords) {
  const name = (record.name ?? "").trim();
  if (!name) {
    skippedNoName += 1;
    continue;
  }
  const matchInput = toMatchRecord(record);
  const best = findBestMatch(existing, matchInput);
  const decision = classifyMatch(best?.score ?? 0);

  if (decision === "auto_merge" && best) {
    autoMerged += 1;
    autoMergedTargets.set(best.existingId, (autoMergedTargets.get(best.existingId) ?? 0) + 1);
  } else if (decision === "create_new") {
    createdNew += 1;
  } else if (best) {
    queuedForReview += 1;
    ambiguousMatches.push({
      datasetName: record.name,
      matchedExistingName: existing.find((e) => e.id === best.existingId)?.name ?? null,
      breakdown: best.breakdown,
      score: best.score,
      decision,
    });
  }
}

const report = buildDryRunReport(
  {
    datasetRecords: allRecords.length,
    autoMerged,
    createdNew,
    queuedForReview,
    skippedNoName,
  },
  ambiguousMatches,
  true,
);

const existingTotalMuscu = existing.length;
// Doublons évités = nombre d'enregistrements dataset qui, sans le moteur de
// fusion, auraient chacun pu devenir une ligne exercise_reference distincte
// pour un exercice déjà présent, mais ont été rattachés à une ligne
// existante à la place. Compte les enregistrements fusionnés (pas les
// lignes existantes cibles, qui peuvent recevoir plusieurs fusions).
const duplicatesAvoided = autoMerged;
const totalAfterImport = existingTotalMuscu + createdNew;

console.log(report);
console.log("");
console.log("=== Comptage catalogue (discipline muscu) ===");
console.log(`Exercices actuellement dans Cortex (muscu) : ${existingTotalMuscu}`);
console.log(`Exercices dataset analysés : ${allRecords.length}`);
console.log(`Nouveaux exercices qui seraient créés : ${createdNew}`);
console.log(`Total après import (muscu) : ${totalAfterImport}`);
console.log(`Doublons évités par le moteur de fusion (auto_merge) : ${duplicatesAvoided}`);
console.log(
  `Lignes existantes distinctes recevant au moins une fusion : ${autoMergedTargets.size}`,
);
