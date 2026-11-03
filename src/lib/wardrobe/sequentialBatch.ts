/**
 * Traitement en lot, une pièce à la fois — logique pure, zéro import React.
 *
 * Sert au détourage des photos existantes (Remise à niveau) : le modèle tourne
 * dans le navigateur, une seule inférence à la fois, et une pièce qui échoue
 * n'arrête JAMAIS le lot (sa photo d'origine reste affichée).
 */
export interface BatchProgress {
  total: number;
  done: number;
  failed: string[];
  currentId: string | null;
}

export async function runSequentialBatch<T extends { id: string }>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  onProgress: (progress: BatchProgress) => void = () => {},
  shouldStop: () => boolean = () => false,
): Promise<BatchProgress> {
  const progress: BatchProgress = { total: items.length, done: 0, failed: [], currentId: null };
  for (const item of items) {
    if (shouldStop()) break;
    progress.currentId = item.id;
    onProgress({ ...progress, failed: [...progress.failed] });
    try {
      await worker(item);
      progress.done += 1;
    } catch {
      progress.failed.push(item.id);
    }
  }
  progress.currentId = null;
  onProgress({ ...progress, failed: [...progress.failed] });
  return progress;
}
