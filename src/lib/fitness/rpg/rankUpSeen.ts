/**
 * Dernier grade CÉLÉBRÉ par exercice, sur cet appareil — pour ne jamais rejouer deux fois la
 * même cinématique de montée de grade (pendant la séance, puis dans la fiche de l'exercice).
 *
 * Purement visuel : aucune récompense n'en dépend (l'XP de promotion est arbitrée côté serveur à
 * la clôture). Lecture/écriture tolérantes : stockage indisponible = rien de mémorisé.
 */
const STORAGE_PREFIX = "exrank:seen:";

export function loadSeenRankTier(userId: string, exerciseName: string): number | null {
  try {
    const v = localStorage.getItem(STORAGE_PREFIX + userId + ":" + exerciseName);
    if (v == null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function saveSeenRankTier(userId: string, exerciseName: string, tierIndex: number): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId + ":" + exerciseName, String(tierIndex));
  } catch {
    /* stockage indisponible : rien de mémorisé */
  }
}
