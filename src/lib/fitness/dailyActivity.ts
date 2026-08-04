// Pure domain logic — fusion des relevés `daily_activity` par SOURCE
// (Phase 10 §5/§6/§7). No React, no Supabase.
//
// `daily_activity` a toujours été conçue avec UNIQUE(user_id, date, source)
// — une ligne par source par jour, jamais une ligne unique par jour (voir
// neat.ts, en-tête). Jusqu'à cette phase, "apple_health" était la SEULE
// source jamais utilisée (0 ligne dans toute la base) ; Phase 10 ajoute une
// saisie manuelle Cortex-native (`source: "manual"`) qui peut désormais
// coexister avec un futur import pour la MÊME date. Cette fusion en
// LECTURE évite de dupliquer la logique de choix de source dans chaque
// hook — un futur import (Garmin, Whoop, Oura...) réutilise la même
// structure sans modification de ce fichier au-delà de la liste `SOURCES`.
//
// Règle de fusion : la saisie MANUELLE gagne toujours, champ par champ,
// quand elle est renseignée — c'est une correction/complément explicite de
// l'utilisateur, jamais une donnée par défaut. Un import externe comble
// uniquement les champs que le manuel ne renseigne pas. La provenance de
// CHAQUE champ retenu est conservée (jamais fusionnée en un simple nombre
// sans contexte) — nécessaire notamment pour la HRV (§7 : ne jamais
// comparer aveuglément des séries de méthodes/appareils incompatibles).

export interface DailyActivityRow {
  date: string;
  source: string;
  steps: number | null;
  active_calories: number | null;
  avg_hr: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
}

export interface SourcedValue<T> {
  value: T;
  source: string;
}

export interface MergedDailyActivity {
  date: string;
  steps: SourcedValue<number> | null;
  activeCalories: SourcedValue<number> | null;
  avgHr: SourcedValue<number> | null;
  restingHr: SourcedValue<number> | null;
  hrvMs: SourcedValue<number> | null;
}

const MANUAL_SOURCE = "manual";

function pickField<K extends keyof DailyActivityRow>(
  rows: readonly DailyActivityRow[],
  key: K,
): SourcedValue<NonNullable<DailyActivityRow[K]>> | null {
  const manual = rows.find((r) => r.source === MANUAL_SOURCE && r[key] != null);
  if (manual) {
    return { value: manual[key] as NonNullable<DailyActivityRow[K]>, source: manual.source };
  }
  const other = rows.find((r) => r.source !== MANUAL_SOURCE && r[key] != null);
  if (other) {
    return { value: other[key] as NonNullable<DailyActivityRow[K]>, source: other.source };
  }
  return null;
}

/**
 * Fusionne toutes les lignes `daily_activity` d'un même jour (une par
 * source) en une vue unique, champ par champ — jamais une moyenne ni une
 * somme entre sources hétérogènes. `rows` doit déjà être filtré sur un seul
 * `user_id`/`date` par l'appelant (une requête par jour). `null` si `rows`
 * est vide (aucune donnée ce jour-là, jamais un objet "vide" fabriqué).
 */
export function mergeDailyActivityRows(
  rows: readonly DailyActivityRow[],
): MergedDailyActivity | null {
  if (rows.length === 0) return null;
  return {
    date: rows[0].date,
    steps: pickField(rows, "steps"),
    activeCalories: pickField(rows, "active_calories"),
    avgHr: pickField(rows, "avg_hr"),
    restingHr: pickField(rows, "resting_hr"),
    hrvMs: pickField(rows, "hrv_ms"),
  };
}
