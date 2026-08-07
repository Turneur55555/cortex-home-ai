// Parser d'archive Apple Health (export.zip) — 100 % client-side.
// Extrait poids, masse grasse, masse maigre, séances et activité quotidienne.
// Le XML est traité en streaming pour ne jamais charger export.xml en une seule string.

import JSZip from "jszip";

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

type AppleAttributes = Record<string, string>;
type ActivityAccumulator = ParsedActivityRow & { hrSum?: number; hrCount?: number };

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

function massToKg(value: number, unit?: string): number {
  if (!unit) return value;
  if (unit === "kg") return value;
  if (unit === "lb") return value * 0.45359237;
  if (unit === "g") return value / 1000;
  return value;
}

function distanceToMeters(value: number, unit?: string): number {
  if (!unit) return value;
  if (unit === "km") return value * 1000;
  if (unit === "mi") return value * 1609.344;
  if (unit === "m") return value;
  return value * 1000;
}

function decodeXml(value: string): string {
  return value.replace(/&(?:quot|apos|lt|gt|amp|#\d+|#x[0-9a-fA-F]+);/g, (entity) => {
    switch (entity) {
      case "&quot;": return '"';
      case "&apos;": return "'";
      case "&lt;": return "<";
      case "&gt;": return ">";
      case "&amp;": return "&";
      default: {
        const hex = entity.startsWith("&#x");
        const raw = entity.slice(hex ? 3 : 2, -1);
        const codePoint = Number.parseInt(raw, hex ? 16 : 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
      }
    }
  });
}

function parseAttributes(tag: string): AppleAttributes {
  const attrs: AppleAttributes = {};
  const re = /([\w:.-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tag)) !== null) attrs[match[1]] = decodeXml(match[2]);
  return attrs;
}

function applyRecord(
  r: AppleAttributes,
  bodyByDate: Map<string, ParsedBodyRow>,
  actByDate: Map<string, ActivityAccumulator>,
): void {
  const type = r.type;
  const date = toDate(r.startDate || r.creationDate);
  if (!date || !type) return;
  const val = toNumber(r.value);
  if (val === null) return;

  const unit = r.unit;
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
    case "HKQuantityTypeIdentifierStepCount":
      act.steps = (act.steps ?? 0) + Math.round(val);
      actByDate.set(date, act);
      break;
    case "HKQuantityTypeIdentifierDistanceWalkingRunning":
      act.distance_m = (act.distance_m ?? 0) + distanceToMeters(val, unit);
      actByDate.set(date, act);
      break;
    case "HKQuantityTypeIdentifierActiveEnergyBurned":
      act.active_calories = Math.round((act.active_calories ?? 0) + val);
      actByDate.set(date, act);
      break;
    case "HKQuantityTypeIdentifierRestingHeartRate":
      if (val > 30 && val < 200) act.resting_hr = Math.round(val);
      actByDate.set(date, act);
      break;
    case "HKQuantityTypeIdentifierHeartRate":
      if (val > 30 && val < 230) {
        act.hrSum = (act.hrSum ?? 0) + val;
        act.hrCount = (act.hrCount ?? 0) + 1;
        act.max_hr = Math.max(act.max_hr ?? 0, Math.round(val));
      }
      actByDate.set(date, act);
      break;
  }
}

function applyWorkout(w: AppleAttributes, workouts: ParsedWorkoutRow[]): void {
  const date = toDate(w.startDate);
  if (!date) return;
  const dur = toNumber(w.duration);
  if (dur === null) return;
  const unit = w.durationUnit || "min";
  const minutes = unit === "min" ? Math.round(dur) : Math.round(dur / 60);
  if (minutes < 1 || minutes > 600) return;
  const actType = w.workoutActivityType || "";
  const name = WORKOUT_TYPE_LABELS[actType] || actType.replace(/^HKWorkoutActivityType/, "") || "Séance";
  workouts.push({ date, name, duration_minutes: minutes, notes: "Importé Apple Health" });
}

/**
 * Parse une archive Apple Health sans matérialiser export.xml en mémoire.
 * JSZip décompresse par petits chunks et seules les balises Record/Workout
 * nécessaires à Cortex sont conservées.
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

  if (!xmlFile) throw new Error("Fichier export.xml introuvable dans l'archive.");

  const bodyByDate = new Map<string, ParsedBodyRow>();
  const actByDate = new Map<string, ActivityAccumulator>();
  const workouts: ParsedWorkoutRow[] = [];
  let totalRecords = 0;
  let buffer = "";
  let lastProgressBucket = -1;

  onProgress?.("Analyse progressive des données…");

  await new Promise<void>((resolve, reject) => {
    // `internalStream` existe à l'exécution (JSZip) mais n'est pas exposé par ses types publics.
    const stream = (
      xmlFile as unknown as {
        internalStream: (type: "string") => {
          on: (event: string, cb: (...args: never[]) => void) => unknown;
          resume: () => void;
        };
      }
    ).internalStream("string");

    stream.on("data", (chunk: string, metadata: { percent?: number }) => {
      buffer += chunk;

      while (true) {
        const recordPos = buffer.indexOf("<Record ");
        const workoutPos = buffer.indexOf("<Workout ");
        let start = -1;
        let kind: "record" | "workout";

        if (recordPos >= 0 && (workoutPos < 0 || recordPos < workoutPos)) {
          start = recordPos;
          kind = "record";
        } else if (workoutPos >= 0) {
          start = workoutPos;
          kind = "workout";
        } else {
          // Conserve seulement assez de caractères pour une balise coupée entre deux chunks.
          if (buffer.length > 32) buffer = buffer.slice(-32);
          break;
        }

        const end = buffer.indexOf(">", start);
        if (end < 0) {
          if (start > 0) buffer = buffer.slice(start);
          break;
        }

        const tag = buffer.slice(start, end + 1);
        const attrs = parseAttributes(tag);
        totalRecords += 1;
        if (kind === "record") applyRecord(attrs, bodyByDate, actByDate);
        else applyWorkout(attrs, workouts);
        buffer = buffer.slice(end + 1);
      }

      const percent = Math.floor(metadata?.percent ?? 0);
      const bucket = Math.floor(percent / 10);
      if (bucket !== lastProgressBucket) {
        lastProgressBucket = bucket;
        onProgress?.(`Analyse des données… ${Math.min(100, bucket * 10)} %`);
      }
    });

    stream.on("error", (error: Error) => reject(error));
    stream.on("end", () => resolve());
    stream.resume();
  });

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

  onProgress?.("Analyse terminée.");
  return { body, workouts, activity, totalRecords };
}
