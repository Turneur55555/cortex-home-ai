// Détection des "doublons techniques évidents" au sein du dataset externe
// lui-même — pas de la comparaison avec Cortex (ça, c'est le rôle de
// `scoreExercisePair`/`exercise_similarity_pairs`, voir §14 de
// docs/architecture/exercises-dataset-integration.md). Deux enregistrements
// dataset sont un doublon technique quand ils décrivent, sans ambiguïté, le
// MÊME enregistrement : nom strictement identique une fois débarrassé des
// marqueurs de démonstration (angle caméra, numéro de version, genre du
// modèle), pour le même équipement. Zéro I/O, zéro dépendance Deno/React.
//
// Principe demandé par Nathan (2026-07-31) : importer l'intégralité du
// dataset comme fiches indépendantes, "hors doublons techniques évidents" —
// ce module ne fait QUE ce filtrage restreint ; il ne détecte jamais deux
// exercices différents qui se ressemblent (ça reste toujours une décision
// manuelle, jamais automatique).
import { normalizeForMatch } from "./textNormalize.ts";

/** Retire les marqueurs de démonstration qui ne changent pas l'exercice lui-même. */
export function stripDemoQualifiers(name: string): string {
  return normalizeForMatch(name)
    .replace(/\(?\bmale\b\)?/g, "")
    .replace(/\(?\bfemale\b\)?/g, "")
    .replace(/\(?\b(back|side|front)\s*pov\)?/g, "")
    .replace(/\bv\.?\s?\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DedupInput {
  id: string;
  name: string;
  equipment?: string | null;
}

export interface DedupResult<T extends DedupInput> {
  kept: T[];
  skipped: Array<{ record: T; duplicateOfId: string; reason: string }>;
}

/**
 * Regroupe les enregistrements par (nom débarrassé des marqueurs de démo,
 * équipement) ; conserve le premier de chaque groupe (ordre d'entrée),
 * marque les suivants comme doublons techniques. Ne touche jamais à deux
 * enregistrements dont le nom diffère au-delà de ces marqueurs, même très
 * proches — cette distinction reste toujours une décision manuelle.
 */
export function deduplicateDatasetRecords<T extends DedupInput>(records: T[]): DedupResult<T> {
  const kept: T[] = [];
  const skipped: DedupResult<T>["skipped"] = [];
  const seen = new Map<string, T>();

  for (const record of records) {
    const key = `${stripDemoQualifiers(record.name)}::${normalizeForMatch(record.equipment ?? "")}`;
    const existing = seen.get(key);
    if (existing) {
      skipped.push({
        record,
        duplicateOfId: existing.id,
        reason: `doublon technique de "${existing.name}" (même exercice, marqueur de démonstration différent)`,
      });
      continue;
    }
    seen.set(key, record);
    kept.push(record);
  }

  return { kept, skipped };
}
