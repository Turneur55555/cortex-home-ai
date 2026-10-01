/**
 * G28 — LE TEXTE DE CE QU'ON PARTAGE : TITRE, PHRASE, NOM DE FICHIER. EN PUR.
 *
 * Logique PURE (zéro React, zéro DOM). Chaque moment partageable signe de la même façon : le nom du
 * produit vient de `lib/brand.ts`, jamais écrit en dur — c'est ce qui garantit qu'aucune carte ne
 * circule sous une autre graphie que les autres.
 *
 * Que des faits : chaque chiffre est lu dans ce qui est partagé, et une valeur nulle n'est jamais
 * affichée (« 0 kg » ne dit rien d'une semaine sans charge).
 */

import { BRAND_NAME } from "@/lib/brand";
import { formatKg } from "@/lib/fitness/todayCard";

export interface ShareCopy {
  /** Titre de la feuille de partage native. */
  title: string;
  /** Phrase qui accompagne l'image. */
  text: string;
  /** Nom du fichier PNG (partage natif ou téléchargement). */
  filename: string;
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count > 1 ? many : one}`;

/** Fin de séance (carte récap). */
export function sessionShareCopy(recap: { totalSets: number; totalVolumeKg: number }): ShareCopy {
  const parts = [plural(recap.totalSets, "série", "séries")];
  if (recap.totalVolumeKg > 0) parts.push(`${formatKg(recap.totalVolumeKg)} kg`);
  return {
    title: `Séance terminée — ${BRAND_NAME}`,
    text: `${parts.join(" · ")} 💪`,
    filename: `${BRAND_NAME.toLowerCase()}-seance.png`,
  };
}

/** Bilan d'une semaine (F26). */
export function weekShareCopy(report: {
  weekStart: string;
  weekNumber: number;
  sessions: number;
  sets: number;
  volumeKg: number;
}): ShareCopy {
  const parts = [
    plural(report.sessions, "séance", "séances"),
    plural(report.sets, "série", "séries"),
  ];
  if (report.volumeKg > 0) parts.push(`${formatKg(report.volumeKg)} kg`);
  return {
    title: `Ma semaine ${report.weekNumber} — ${BRAND_NAME}`,
    text: parts.join(" · "),
    filename: `${BRAND_NAME.toLowerCase()}-semaine-${report.weekStart}.png`,
  };
}

/** Rang d'un exercice (affiche de record). */
export function rankShareCopy(input: {
  rankKey: string;
  rankLabel: string;
  grade: string;
  exerciseName: string;
}): ShareCopy {
  const gradeLabel = `${input.rankLabel} — ${input.grade}`;
  return {
    title: `${gradeLabel} — ${input.exerciseName}`,
    text: `Rang ${gradeLabel} sur ${BRAND_NAME} 💪`,
    filename: `${BRAND_NAME.toLowerCase()}-${input.rankKey}.png`,
  };
}
