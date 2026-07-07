// ============================================================
// Utilitaires d'allure course à pied — extraits en Phase 5 comme
// composant générique réutilisable par le moteur Course et par toute
// future discipline endurance (zéro import React, pur comme le reste
// de /lib/fitness/).
// ============================================================

/** "5.5" (5 min 30 par km) -> "5:30 /km". Les réponses Sensei encodent
 *  l'allure en minutes décimales par km (plus simple à saisir qu'un
 *  champ mm:ss dédié) ; cette fonction ne sert qu'à l'affichage. */
export function formatPace(minPerKm: number): string {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return "—";
  const totalSeconds = Math.round(minPerKm * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} /km`;
}

/** Distance parcourue (km, arrondie à 0.1) pour une durée et une allure
 *  données. Utilisé pour dériver "Distance" quand seule la durée est
 *  demandée à l'utilisateur (cas le plus courant du Sensei course). */
export function distanceForDuration(durationMinutes: number, paceMinPerKm: number): number {
  if (!Number.isFinite(paceMinPerKm) || paceMinPerKm <= 0) return 0;
  return Math.round((durationMinutes / paceMinPerKm) * 10) / 10;
}
