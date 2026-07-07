// ============================================================
// Zones de fréquence cardiaque (Z1-Z5, % de FC max) — extrait en
// Phase 5 comme composant générique réutilisable par le moteur Course
// et par toute future discipline endurance. Formule standard (% de FC
// max par zone), pas une méthode certifiée par un cardiologue — un
// repère d'entraînement raisonnable, comme les tables de charge HYROX.
//
// Toujours optionnel dans l'appelant : une FC max non connue ne doit
// jamais bloquer une génération de séance (voir courseEngine.ts).
// ============================================================

export interface HeartRateZone {
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  minBpm: number;
  maxBpm: number;
}

const ZONE_BOUNDS: Array<{
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  minPct: number;
  maxPct: number;
}> = [
  { zone: 1, label: "Z1 — Récupération", minPct: 0.5, maxPct: 0.6 },
  { zone: 2, label: "Z2 — Endurance fondamentale", minPct: 0.6, maxPct: 0.7 },
  { zone: 3, label: "Z3 — Tempo", minPct: 0.7, maxPct: 0.8 },
  { zone: 4, label: "Z4 — Seuil", minPct: 0.8, maxPct: 0.9 },
  { zone: 5, label: "Z5 — VMA", minPct: 0.9, maxPct: 1.0 },
];

export function computeHeartRateZones(maxHeartRate: number): HeartRateZone[] {
  if (!Number.isFinite(maxHeartRate) || maxHeartRate <= 0) return [];
  return ZONE_BOUNDS.map((z) => ({
    zone: z.zone,
    label: z.label,
    minBpm: Math.round(maxHeartRate * z.minPct),
    maxBpm: Math.round(maxHeartRate * z.maxPct),
  }));
}

/** Libellé prêt à afficher pour une zone donnée, ex: "Z2 — Endurance
 *  fondamentale (114-133 bpm)". Retourne `undefined` si la FC max n'est
 *  pas connue — l'appelant doit alors afficher juste le nom de zone. */
export function formatZoneRange(
  maxHeartRate: number | undefined,
  zoneNumber: 1 | 2 | 3 | 4 | 5,
): string | undefined {
  if (maxHeartRate === undefined) return undefined;
  const zones = computeHeartRateZones(maxHeartRate);
  const z = zones.find((zz) => zz.zone === zoneNumber);
  return z ? `${z.label} (${z.minBpm}-${z.maxBpm} bpm)` : undefined;
}

/** Nom de la zone seul (sans bpm), pour l'afficher quand la FC max n'est
 *  pas connue. Convenance : `describeZone` choisit automatiquement entre
 *  ce fallback et `formatZoneRange` selon que la FC max est fournie. */
export function zoneLabel(zoneNumber: 1 | 2 | 3 | 4 | 5): string {
  return ZONE_BOUNDS.find((z) => z.zone === zoneNumber)?.label ?? `Z${zoneNumber}`;
}

/** Point d'entrée unique pour un moteur qui veut afficher une zone
 *  cible : bpm précis si la FC max est connue (question ou wearable),
 *  sinon juste le nom de la zone — ne bloque jamais l'affichage. */
export function describeZone(zoneNumber: 1 | 2 | 3 | 4 | 5, maxHeartRate?: number): string {
  return formatZoneRange(maxHeartRate, zoneNumber) ?? zoneLabel(zoneNumber);
}
