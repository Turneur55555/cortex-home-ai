// Parser d'archive Apple Health (export.zip) — 100 % client-side.
// Extrait poids, masse grasse, masse maigre, séances et activité quotidienne.

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export interface ParsedBodyRow {
  date: string; // yyyy-mm-dd
  weight?: number;
  body_fat?: number;
  muscle_mass?: number;
}

export interface ParsedWorkoutRow {
  date: string;
  name: string;
  duration_minutes: number;
  notes?: string;
}

export interface ParsedActivityRow {
  date: string;
  steps?: number;
  distance_m?: number;
  active_calories?: number;
  resting_hr?: number;
  avg_hr?: number;
  max_hr?: number;
}

export interface ParseResult {
  body: ParsedBodyRow[];
  workouts: ParsedWorkoutRow[];
  activity: ParsedActivityRow[];
  totalRecords: number;
}

const WORKOUT_TYPE_LABELS: Record<string, string> = {
  HKWorkoutActivityTypeRunning: "Course à pied",
  HKWorkoutActivityTypeWalking: "Marche",
  HKWorkoutActivityTypeCycling: "Vélo",
  HKWorkoutActivityTypeFunctionalStrengthTraining: "Musculation",
  HKWorkoutActivityTypeTraditionalStrengthTraining: "Musculation",
  HKWorkoutActivityTypeHighIntensityIntervalTraining: "HIIT",
  HKWorkoutActivityTypeYoga: "Yoga",
  HKWorkoutActivityTypeSwimming: "Natation",
  HKWorkoutActivityTypeElliptical: "Elliptique",
  HKWorkoutActivityTypeRowing: "Rameur",
  HKWorkoutActivityTypeCoreTraining: "Gainage",
  HKWorkoutActivityTypeMixedCardio: "Cardio mixte",
};

function toDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// Convertit une unité de masse Apple Health vers kg
function massToKg(value: number, unit?: string): number {
  if (!unit) return value;
  if (unit === "kg") return value;
  if (unit === "lb") return value * 0.45359237;
  if (unit === "g") return value / 1000;
  return value;
}

// Convertit une distance vers mètres
function distanceToMeters(value: number, unit?: string): number {
  if (!unit) return value;
  if (unit === "km") return value * 1000;
  if (unit === "mi") return value * 1609.344;
  if (unit === "m") return value;
  return value * 1000; // par défaut km
}

/**
 * Parse une archive Apple Health. Attend le fichier `export.zip`.
 * Extrait `apple_health_export/export.xml` puis parse les Records + Workouts.
 */
export async function parseAppleHealthZip(
  file: File,
  onProgress?: (msg: string) => void,
): Promise<ParseResult> {
  onProgress?.("Décompression de l'archive…");
  const zip = await JSZip.loadAsync(file);

  const xmlFile =
    zip.file("apple_health_export/export.xml") ||
    zip.file("export.xml") ||
    zip.file(/export\.xml$/i)[0];

  if (!xmlFile) {
    throw new Error("Fichier export.xml introuvable dans l'archive.");
  }

  onProgress?.("Lecture du fichier XML…");
  const xml = await xmlFile.async("string");

  onProgress?.("Analyse des données…");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    allowBooleanAttributes: true,
    parseAttributeValue: false,
    isArray: (name) => name === "Record" || name === "Workout" || name === "MetadataEntry",
  });

  const parsed = parser.parse(xml) as {
    HealthData?: {
      Record?: Array<Record<string, string>>;
      Workout?: Array<Record<string, string>>;
    };
  };

  const records = parsed.HealthData?.Record ?? [];
  const workoutsRaw = parsed.HealthData?.Workout ?? [];

  // --- Body : dernier point par jour ---
  const bodyByDate = new Map<string, ParsedBodyRow>();
  // --- Activité : agrégats par jour ---
  const actByDate = new Map<string, ParsedActivityRow & { hrSum?: number; hrCount?: number }>();

  for (const r of records) {
    const type = r.type;
    const date = toDate(r.startDate || r.creationDate);
    if (!date || !type) continue;
    const val = toNumber(r.value);
    const unit = r.unit;

    if (val === null) continue;

    const cur = bodyByDate.get(date) ?? { date };
    const act = actByDate.get(date) ?? { date };

    switch (type) {
      case "HKQuantityTypeIdentifierBodyMass": {
        const kg = massToKg(val, unit);
        if (kg >= 20 && kg <= 300) cur.weight = kg;
        bodyByDate.set(date, cur);
        break;
      }
      case "HKQuantityTypeIdentifierBodyFatPercentage": {
        // Apple exporte en fraction (0-1), Santé affiche en %
        const pct = val <= 1 ? val * 100 : val;
        if (pct >= 1 && pct <= 70) cur.body_fat = pct;
        bodyByDate.set(date, cur);
        break;
      }
      case "HKQuantityTypeIdentifierLeanBodyMass": {
        const kg = massToKg(val, unit);
        if (kg >= 10 && kg <= 200) cur.muscle_mass = kg;
        bodyByDate.set(date, cur);
        break;
      }
      case "HKQuantityTypeIdentifierStepCount": {
        act.steps = (act.steps ?? 0) + Math.round(val);
        actByDate.set(date, act);
        break;
      }
      case "HKQuantityTypeIdentifierDistanceWalkingRunning": {
        act.distance_m = (act.distance_m ?? 0) + distanceToMeters(val, unit);
        actByDate.set(date, act);
        break;
      }
      case "HKQuantityTypeIdentifierActiveEnergyBurned": {
        act.active_calories = Math.round((act.active_calories ?? 0) + val);
        actByDate.set(date, act);
        break;
      }
      case "HKQuantityTypeIdentifierRestingHeartRate": {
        if (val > 30 && val < 200) act.resting_hr = Math.round(val);
        actByDate.set(date, act);
        break;
      }
      case "HKQuantityTypeIdentifierHeartRate": {
        if (val > 30 && val < 230) {
          act.hrSum = (act.hrSum ?? 0) + val;
          act.hrCount = (act.hrCount ?? 0) + 1;
          act.max_hr = Math.max(act.max_hr ?? 0, Math.round(val));
        }
        actByDate.set(date, act);
        break;
      }
    }
  }

  const body = Array.from(bodyByDate.values()).filter(
    (b) => b.weight != null || b.body_fat != null || b.muscle_mass != null,
  );

  const activity: ParsedActivityRow[] = Array.from(actByDate.values()).map((a) => ({
    date: a.date,
    steps: a.steps,
    distance_m: a.distance_m != null ? Math.round(a.distance_m) : undefined,
    active_calories: a.active_calories,
    resting_hr: a.resting_hr,
    avg_hr: a.hrCount && a.hrSum ? Math.round(a.hrSum / a.hrCount) : undefined,
    max_hr: a.max_hr,
  }));

  // --- Séances ---
  const workouts: ParsedWorkoutRow[] = [];
  for (const w of workoutsRaw) {
    const date = toDate(w.startDate);
    if (!date) continue;
    const dur = toNumber(w.duration);
    if (dur === null) continue;
    const unit = w.durationUnit || "min";
    const minutes = unit === "min" ? Math.round(dur) : Math.round(dur / 60);
    if (minutes < 1 || minutes > 600) continue;
    const actType = w.workoutActivityType || "";
    const name = WORKOUT_TYPE_LABELS[actType] || actType.replace(/^HKWorkoutActivityType/, "") || "Séance";
    workouts.push({ date, name, duration_minutes: minutes, notes: "Importé Apple Health" });
  }

  return {
    body,
    workouts,
    activity,
    totalRecords: records.length + workoutsRaw.length,
  };
}
