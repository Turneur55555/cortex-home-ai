// ============================================================
// Contrat de données pour une future intégration objets connectés /
// santé (Apple Santé, Garmin, Polar, Coros, Suunto, Strava) — Phase 5.
//
// AUCUN connecteur n'est implémenté ici. Ce fichier existe uniquement
// pour que le moteur Course (et toute discipline endurance future)
// puisse dès aujourd'hui lire des données externes SI elles sont
// présentes dans le SenseiContext, sans qu'un futur branchement réel
// (OAuth, edge function d'ingestion, webhook...) n'oblige à modifier
// la signature de generate() ni la logique déjà écrite.
//
// Convention : `WorkoutEngine.generate(answers, context)` peut recevoir
// `context.wearable` de ce type. Tant qu'aucun connecteur n'existe,
// CoachSheet.tsx transmet toujours `wearable: undefined` (voir
// senseiCustomRenderers.tsx / SenseiRuntimeInputs) — chaque moteur DOIT
// donc gérer son absence gracieusement, jamais supposer qu'il est
// renseigné. C'est ce qui permet de "préparer sans implémenter".
// ============================================================

export type WearableProvider = "apple_health" | "garmin" | "polar" | "coros" | "suunto" | "strava";

export interface WearableActivitySample {
  provider: WearableProvider;
  /** Format YYYY-MM-DD. */
  date: string;
  distanceKm?: number;
  durationMinutes?: number;
  averageHeartRate?: number;
}

/** Snapshot agrégé qu'un futur connecteur alimentera. Tous les champs
 *  sont optionnels : un moteur ne doit jamais supposer qu'un champ
 *  précis est renseigné, seulement qu'il PEUT l'être. */
export interface WearableSnapshot {
  provider?: WearableProvider;
  maxHeartRate?: number;
  restingHeartRate?: number;
  /** Activités récentes (ex: 7 derniers jours) — sert par exemple à
   *  moduler l'intensité proposée selon la charge déjà accumulée. */
  recentActivities?: WearableActivitySample[];
}
