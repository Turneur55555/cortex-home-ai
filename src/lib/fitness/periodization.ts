/**
 * Périodisation — domaine pur (zéro import React, zéro couleur, zéro slug UI).
 *
 * Génère la courbe semaine-par-semaine (intensité / RPE cible / volume) d'un
 * programme multi-semaines selon un modèle de périodisation et un objectif.
 *
 * Convention : intensité exprimée en % du 1RM (0-110), volume en multiplicateur
 * relatif (1 = volume de référence), RPE cible sur 0-10.
 */

export type ProgramGoal = "strength" | "hypertrophy" | "endurance" | "peaking";
export type PeriodizationModel = "linear" | "undulating" | "block";
export type WeekPhase = "accumulation" | "intensification" | "peak" | "deload";

export interface ProgramWeekPlan {
  weekNumber: number;
  phase: WeekPhase;
  /** % du 1RM cible (arrondi 0,5). */
  intensityPct: number;
  /** RPE cible (arrondi 0,5). */
  targetRpe: number;
  /** Multiplicateur de volume relatif (1 = référence, arrondi 0,01). */
  volumeMultiplier: number;
  isDeload: boolean;
  /** Fourchette de répétitions indicative pour la semaine. */
  repRange: { min: number; max: number };
}

export interface GenerateProgramOptions {
  goal: ProgramGoal;
  model: PeriodizationModel;
  /** Nombre total de semaines (1-52). */
  totalWeeks: number;
  /** Insérer une semaine de décharge tous les N semaines (0 = jamais). Défaut 4. */
  deloadEvery?: number;
}

interface GoalProfile {
  baseIntensity: number;
  baseRpe: number;
  repRange: { min: number; max: number };
}

const GOAL_PROFILES: Record<ProgramGoal, GoalProfile> = {
  endurance: { baseIntensity: 55, baseRpe: 6, repRange: { min: 15, max: 20 } },
  hypertrophy: { baseIntensity: 67, baseRpe: 7, repRange: { min: 8, max: 12 } },
  strength: { baseIntensity: 80, baseRpe: 8, repRange: { min: 3, max: 6 } },
  peaking: { baseIntensity: 85, baseRpe: 8.5, repRange: { min: 1, max: 3 } },
};

const round = (v: number, step: number) => Math.round(v / step) * step;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Semaine de décharge : volume et intensité réduits, RPE bas. */
function deloadWeek(weekNumber: number, profile: GoalProfile): ProgramWeekPlan {
  return {
    weekNumber,
    phase: "deload",
    intensityPct: round(profile.baseIntensity * 0.85, 0.5),
    targetRpe: clamp(round(profile.baseRpe - 2, 0.5), 4, 10),
    volumeMultiplier: 0.5,
    isDeload: true,
    repRange: profile.repRange,
  };
}

/**
 * Modèle LINÉAIRE : l'intensité monte et le volume descend semaine après
 * semaine au sein de chaque bloc (réinitialisé après chaque décharge).
 */
function linearWeek(posInBlock: number, blockLength: number, profile: GoalProfile, weekNumber: number): ProgramWeekPlan {
  const span = Math.max(1, blockLength - 1);
  const t = posInBlock / span; // 0 -> début de bloc, 1 -> fin de bloc
  return {
    weekNumber,
    phase: t < 0.5 ? "accumulation" : "intensification",
    intensityPct: round(clamp(profile.baseIntensity + t * 15, 0, 110), 0.5),
    targetRpe: clamp(round(profile.baseRpe + t * 2, 0.5), 0, 10),
    volumeMultiplier: round(1.1 - t * 0.4, 0.01),
    isDeload: false,
    repRange: profile.repRange,
  };
}

/**
 * Modèle ONDULATOIRE : alterne semaines à fort volume / intensité modérée et
 * semaines à forte intensité / volume réduit.
 */
function undulatingWeek(posInBlock: number, profile: GoalProfile, weekNumber: number): ProgramWeekPlan {
  const heavy = posInBlock % 2 === 1; // semaines impaires = lourdes
  return {
    weekNumber,
    phase: heavy ? "intensification" : "accumulation",
    intensityPct: round(clamp(profile.baseIntensity + (heavy ? 10 : -3), 0, 110), 0.5),
    targetRpe: clamp(round(profile.baseRpe + (heavy ? 1.5 : -0.5), 0.5), 0, 10),
    volumeMultiplier: round(heavy ? 0.8 : 1.15, 0.01),
    isDeload: false,
    repRange: heavy
      ? { min: profile.repRange.min, max: Math.max(profile.repRange.min, Math.round((profile.repRange.min + profile.repRange.max) / 2)) }
      : profile.repRange,
  };
}

/**
 * Modèle BLOC : enchaîne accumulation -> intensification -> pic sur la durée
 * totale (hors semaines de décharge).
 */
function blockWeek(posInProgram: number, workingWeeks: number, profile: GoalProfile, weekNumber: number): ProgramWeekPlan {
  const t = workingWeeks <= 1 ? 1 : posInProgram / (workingWeeks - 1); // 0 -> 1 sur tout le programme
  let phase: WeekPhase;
  if (t < 0.34) phase = "accumulation";
  else if (t < 0.74) phase = "intensification";
  else phase = "peak";
  return {
    weekNumber,
    phase,
    intensityPct: round(clamp(profile.baseIntensity + t * 22, 0, 110), 0.5),
    targetRpe: clamp(round(profile.baseRpe + t * 2, 0.5), 0, 10),
    volumeMultiplier: round(1.2 - t * 0.6, 0.01),
    isDeload: false,
    repRange:
      phase === "peak"
        ? { min: profile.repRange.min, max: Math.max(profile.repRange.min, profile.repRange.min + 1) }
        : profile.repRange,
  };
}

/**
 * Génère la planification semaine-par-semaine d'un programme.
 * Retourne un tableau de longueur `totalWeeks`.
 */
export function generateProgramWeeks(options: GenerateProgramOptions): ProgramWeekPlan[] {
  const totalWeeks = clamp(Math.trunc(options.totalWeeks) || 0, 1, 52);
  const deloadEvery = options.deloadEvery == null ? 4 : Math.max(0, Math.trunc(options.deloadEvery));
  const profile = GOAL_PROFILES[options.goal] ?? GOAL_PROFILES.hypertrophy;

  const weeks: ProgramWeekPlan[] = [];
  let posInBlock = 0; // position depuis la dernière décharge (modèles linéaire/ondulatoire)
  let workingIndex = 0; // index parmi les semaines de travail (modèle bloc)
  const workingWeeks = deloadEvery > 0 ? totalWeeks - Math.floor(totalWeeks / deloadEvery) : totalWeeks;

  for (let w = 1; w <= totalWeeks; w++) {
    const isDeload = deloadEvery > 0 && w % deloadEvery === 0;
    if (isDeload) {
      weeks.push(deloadWeek(w, profile));
      posInBlock = 0;
      continue;
    }
    if (options.model === "linear") {
      const blockLength = deloadEvery > 0 ? deloadEvery - 1 : totalWeeks;
      weeks.push(linearWeek(posInBlock, blockLength, profile, w));
    } else if (options.model === "undulating") {
      weeks.push(undulatingWeek(posInBlock, profile, w));
    } else {
      weeks.push(blockWeek(workingIndex, Math.max(1, workingWeeks), profile, w));
    }
    posInBlock++;
    workingIndex++;
  }
  return weeks;
}

/** Libellé FR court d'une phase (utilitaire d'affichage neutre, sans couleur). */
export function phaseLabel(phase: WeekPhase): string {
  switch (phase) {
    case "accumulation":
      return "Accumulation";
    case "intensification":
      return "Intensification";
    case "peak":
      return "Pic";
    case "deload":
      return "Décharge";
  }
}
