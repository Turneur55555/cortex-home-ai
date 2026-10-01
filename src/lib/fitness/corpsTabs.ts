/**
 * Les trois onglets de l'écran Corps (E19) : Objectif | Mesures | Santé.
 *
 * Logique PURE (zéro React). « Santé nutritionnelle », autrefois un lien perdu dans « Mes espaces »,
 * est absorbée par Corps : une seule porte au lieu de deux.
 */

import { z } from "zod";

export const CORPS_TAB_KEYS = ["objectif", "mesures", "sante"] as const;
export type CorpsTabKey = (typeof CORPS_TAB_KEYS)[number];

export const CORPS_TAB_LABELS: Record<CorpsTabKey, string> = {
  objectif: "Objectif",
  mesures: "Mesures",
  sante: "Santé",
};

/** `?onglet=` — une valeur invalide est ignorée (onglet par défaut), jamais fatale. */
export const corpsSearchSchema = z.object({
  onglet: z.enum(CORPS_TAB_KEYS).optional().catch(undefined),
});

/**
 * L'onglet affiché. Demandé dans l'URL → celui-là. Sinon : « Objectif » pour quelqu'un qui en a un
 * (c'est ce qu'il vient voir), « Mesures » pour les autres — afficher un onglet Objectif vide à qui
 * n'a jamais défini d'objectif mettrait sous ses yeux un écran de configuration au lieu de son corps.
 */
export function resolveCorpsTab(
  requested: CorpsTabKey | undefined,
  hasActiveGoal: boolean,
): CorpsTabKey {
  if (requested) return requested;
  return hasActiveGoal ? "objectif" : "mesures";
}
