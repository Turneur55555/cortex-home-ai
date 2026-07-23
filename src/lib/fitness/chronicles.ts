// ============================================================
// LOT C2 — Le Livre des Chroniques : dérivations PURES (zéro React).
//
// Tout ce module LIT l'historique déjà chargé (useWorkouts) et en dérive
// les vues du Livre : Hall of Fame, Légendes, Techniques oubliées,
// Potentiel caché, Spécialisations, Galerie des Records. AUCUNE donnée
// n'est inventée : chaque valeur provient d'une agrégation des séries
// réellement enregistrées ; quand une donnée n'existe pas, la fonction
// retourne null / une liste vide et l'UI masque la carte.
//
// Aucun moteur, hook, mutation ou calcul existant n'est modifié — ce
// fichier ne fait qu'importer les helpers purs déjà en place
// (workoutGrouping, calories, muscleMapping).
// ============================================================

import { buildGroups, sessionMuscleActivation } from "./workoutGrouping";
import type { ExerciseLike } from "./workoutGrouping";
import { estimateWorkoutCalories } from "./calories";
import { formatTonnage } from "./strength";
import { MUSCLE_META, type MuscleId } from "./muscleMapping";

/** Forme minimale d'une séance consommée par ce module (sur-ensemble
 *  structurel de WorkoutRow — seuls ces champs sont lus). */
export type WorkoutLike = {
  id: string;
  date: string;
  name: string;
  created_at?: string | null;
  duration_minutes?: number | null;
  discipline?: string | null;
  exercises?: ExerciseLike[] | null;
};

function isMuscu(w: WorkoutLike): boolean {
  return (w.discipline ?? "muscu") === "muscu";
}

/** Tri chronologique ascendant stable (date puis created_at). */
function sortAsc(workouts: WorkoutLike[]): WorkoutLike[] {
  return [...workouts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });
}

// ─── Records tombés par séance ────────────────────────────────────────────────
// (Déplacé de ChroniquePage.tsx pour être partagé — comportement identique.)
// Un exercice jamais vu = « nouvel exercice » ; une charge max STRICTEMENT
// supérieure au meilleur passé = PR.

export type SessionRecord = { key: string; name: string; weight: number; isNew: boolean };

export function computeRecordsBySession(
  muscuWorkouts: WorkoutLike[],
): Map<string, SessionRecord[]> {
  const sorted = sortAsc(muscuWorkouts);
  const runningMax = new Map<string, number>();
  const bySession = new Map<string, SessionRecord[]>();
  for (const w of sorted) {
    const groups = buildGroups(w.exercises ?? []);
    const records: SessionRecord[] = [];
    for (const g of groups) {
      if (g.maxWeight == null) continue;
      const prev = runningMax.get(g.key);
      if (prev == null) {
        records.push({ key: g.key, name: g.name, weight: g.maxWeight, isNew: true });
        runningMax.set(g.key, g.maxWeight);
      } else if (g.maxWeight > prev) {
        records.push({ key: g.key, name: g.name, weight: g.maxWeight, isNew: false });
        runningMax.set(g.key, g.maxWeight);
      }
    }
    bySession.set(w.id, records);
  }
  return bySession;
}

// ─── 3. Hall of Fame ──────────────────────────────────────────────────────────

export type HallOfFame = {
  /** Plus gros tonnage sur une séance (kg). */
  bestTonnage: { value: number; date: string; workoutName: string } | null;
  /** Plus grosse dépense estimée sur une séance (kcal). */
  bestCalories: { value: number; date: string; workoutName: string } | null;
  /** Plus haute intensité (kg soulevés / minute). */
  bestIntensity: { value: number; date: string; workoutName: string } | null;
  /** Série la plus lourde jamais enregistrée. */
  heaviestSet: { exercise: string; weight: number; date: string } | null;
  /** Série la plus longue (reps) — uniquement les séries avec reps > 0. */
  longestSet: { exercise: string; reps: number; date: string } | null;
  /** Plus longue séance (minutes) — toutes disciplines. */
  longestSession: { minutes: number; date: string; workoutName: string } | null;
  /** Totaux carrière — pour les compteurs animés du header. */
  career: { sessions: number; tonnage: number; series: number; prCount: number };
};

export function computeHallOfFame(
  workouts: WorkoutLike[],
  bodyWeightKg: number | null,
): HallOfFame {
  const muscu = workouts.filter(isMuscu);
  const recordsBySession = computeRecordsBySession(muscu);

  let bestTonnage: HallOfFame["bestTonnage"] = null;
  let bestCalories: HallOfFame["bestCalories"] = null;
  let bestIntensity: HallOfFame["bestIntensity"] = null;
  let heaviestSet: HallOfFame["heaviestSet"] = null;
  let longestSet: HallOfFame["longestSet"] = null;
  let longestSession: HallOfFame["longestSession"] = null;
  let careerTonnage = 0;
  let careerSeries = 0;
  let careerPrs = 0;

  for (const records of recordsBySession.values()) {
    careerPrs += records.filter((r) => !r.isNew).length;
  }

  for (const w of workouts) {
    const minutes = w.duration_minutes ?? 0;
    if (minutes > 0 && (longestSession == null || minutes > longestSession.minutes)) {
      longestSession = { minutes, date: w.date, workoutName: w.name || "Séance" };
    }
  }

  for (const w of muscu) {
    const groups = buildGroups(w.exercises ?? []);
    let volume = 0;
    for (const g of groups) {
      volume += g.volume;
      careerSeries += g.totalSeries;
      for (const s of g.series) {
        if (s.weight != null && (heaviestSet == null || s.weight > heaviestSet.weight)) {
          heaviestSet = { exercise: g.name, weight: s.weight, date: w.date };
        }
        if (s.reps != null && s.reps > 0 && (longestSet == null || s.reps > longestSet.reps)) {
          longestSet = { exercise: g.name, reps: s.reps, date: w.date };
        }
      }
    }
    careerTonnage += volume;
    const name = w.name || "Séance";
    if (volume > 0 && (bestTonnage == null || volume > bestTonnage.value)) {
      bestTonnage = { value: Math.round(volume), date: w.date, workoutName: name };
    }
    const minutes = w.duration_minutes ?? 0;
    const kcal = estimateWorkoutCalories({
      durationMinutes: minutes,
      volumeKg: volume,
      bodyWeightKg,
    });
    if (kcal != null && (bestCalories == null || kcal > bestCalories.value)) {
      bestCalories = { value: kcal, date: w.date, workoutName: name };
    }
    if (minutes > 0 && volume > 0) {
      const kgPerMin = volume / minutes;
      if (bestIntensity == null || kgPerMin > bestIntensity.value) {
        bestIntensity = { value: Math.round(kgPerMin), date: w.date, workoutName: name };
      }
    }
  }

  return {
    bestTonnage,
    bestCalories,
    bestIntensity,
    heaviestSet,
    longestSet,
    longestSession,
    career: {
      sessions: workouts.length,
      tonnage: Math.round(careerTonnage),
      series: careerSeries,
      prCount: careerPrs,
    },
  };
}

// ─── 4. Les Légendes ──────────────────────────────────────────────────────────

export type LegendLevel = "Légendaire" | "Maîtrisé" | "Confirmé" | "En apprentissage";

export type LegendCard = {
  key: string;
  name: string;
  imagePath: string | null;
  pr: number;
  /** % de progression entre la charge max de la 1re séance et le PR (null si baseline nulle). */
  progressionPct: number | null;
  sessions: number;
  lastUsed: string;
  level: LegendLevel;
};

// Niveau = ancienneté d'usage × progression réelle. Seuils volontairement
// simples et documentés — aucune "IA", uniquement les données.
function legendLevel(sessions: number, progressionPct: number | null): LegendLevel {
  if (sessions >= 8 && (progressionPct ?? 0) >= 25) return "Légendaire";
  if (sessions >= 5) return "Maîtrisé";
  if (sessions >= 3) return "Confirmé";
  return "En apprentissage";
}

export function computeLegends(workouts: WorkoutLike[], limit = 6): LegendCard[] {
  const muscu = sortAsc(workouts.filter(isMuscu));
  const byKey = new Map<
    string,
    {
      name: string;
      imagePath: string | null;
      firstMax: number | null;
      pr: number;
      sessions: number;
      lastUsed: string;
    }
  >();

  for (const w of muscu) {
    for (const g of buildGroups(w.exercises ?? [])) {
      if (g.maxWeight == null) continue;
      const entry = byKey.get(g.key);
      if (!entry) {
        byKey.set(g.key, {
          name: g.name,
          imagePath: g.imagePath,
          firstMax: g.maxWeight,
          pr: g.maxWeight,
          sessions: 1,
          lastUsed: w.date,
        });
      } else {
        entry.sessions += 1;
        entry.lastUsed = w.date;
        if (g.maxWeight > entry.pr) entry.pr = g.maxWeight;
        if (entry.imagePath == null && g.imagePath != null) entry.imagePath = g.imagePath;
      }
    }
  }

  const cards: LegendCard[] = [];
  for (const [key, e] of byKey) {
    if (e.sessions < 2) continue; // une légende se construit sur la durée
    const progressionPct =
      e.firstMax != null && e.firstMax > 0
        ? Math.round(((e.pr - e.firstMax) / e.firstMax) * 100)
        : null;
    cards.push({
      key,
      name: e.name,
      imagePath: e.imagePath,
      pr: e.pr,
      progressionPct,
      sessions: e.sessions,
      lastUsed: e.lastUsed,
      level: legendLevel(e.sessions, progressionPct),
    });
  }

  // Classement : les exercices les plus construits d'abord (séances puis
  // progression puis PR).
  return cards
    .sort(
      (a, b) =>
        b.sessions - a.sessions || (b.progressionPct ?? 0) - (a.progressionPct ?? 0) || b.pr - a.pr,
    )
    .slice(0, limit);
}

// ─── 5. Techniques oubliées ───────────────────────────────────────────────────

export type ForgottenExercise = {
  key: string;
  name: string;
  daysSince: number;
  lastUsed: string;
  sessions: number;
  /** Muscles qui perdent leur stimulation (libellés lisibles). */
  impact: string[];
};

const FORGOTTEN_THRESHOLD_DAYS = 21;

export function computeForgotten(
  workouts: WorkoutLike[],
  now: Date = new Date(),
  limit = 5,
): ForgottenExercise[] {
  const muscu = sortAsc(workouts.filter(isMuscu));
  const byKey = new Map<string, { name: string; lastUsed: string; sessions: number }>();
  for (const w of muscu) {
    for (const g of buildGroups(w.exercises ?? [])) {
      const entry = byKey.get(g.key);
      if (!entry) byKey.set(g.key, { name: g.name, lastUsed: w.date, sessions: 1 });
      else {
        entry.sessions += 1;
        entry.lastUsed = w.date;
      }
    }
  }

  const result: ForgottenExercise[] = [];
  for (const [key, e] of byKey) {
    if (e.sessions < 2) continue; // jamais vraiment adopté ≠ oublié
    const daysSince = Math.floor(
      (now.getTime() - new Date(e.lastUsed + "T12:00:00").getTime()) / 86_400_000,
    );
    if (daysSince < FORGOTTEN_THRESHOLD_DAYS) continue;
    // Impact : mêmes mappings muscle que le Scan des Titans.
    const impact = sessionMuscleActivation([
      { id: "probe", name: e.name, weight: 1, sets: null, reps: 1 },
    ]).map((a) => a.label);
    result.push({
      key,
      name: e.name,
      daysSince,
      lastUsed: e.lastUsed,
      sessions: e.sessions,
      impact,
    });
  }
  return result.sort((a, b) => b.daysSince - a.daysSince).slice(0, limit);
}

// ─── 6. Le potentiel caché (plateaux) ─────────────────────────────────────────

export type PlateauExercise = {
  key: string;
  name: string;
  /** Semaines écoulées depuis la dernière amélioration de la charge max. */
  weeksSinceImprovement: number;
  /** Nombre de séances jouées sans progresser depuis. */
  stalledSessions: number;
  pr: number;
};

const PLATEAU_MIN_STALLED_SESSIONS = 3;
const PLATEAU_ACTIVE_WINDOW_DAYS = 45;

export function computePlateaus(
  workouts: WorkoutLike[],
  now: Date = new Date(),
  limit = 5,
): PlateauExercise[] {
  const muscu = sortAsc(workouts.filter(isMuscu));
  const byKey = new Map<
    string,
    { name: string; pr: number; lastImproved: string; lastUsed: string; stalled: number }
  >();

  for (const w of muscu) {
    for (const g of buildGroups(w.exercises ?? [])) {
      if (g.maxWeight == null) continue;
      const entry = byKey.get(g.key);
      if (!entry) {
        byKey.set(g.key, {
          name: g.name,
          pr: g.maxWeight,
          lastImproved: w.date,
          lastUsed: w.date,
          stalled: 0,
        });
      } else {
        entry.lastUsed = w.date;
        if (g.maxWeight > entry.pr) {
          entry.pr = g.maxWeight;
          entry.lastImproved = w.date;
          entry.stalled = 0;
        } else {
          entry.stalled += 1;
        }
      }
    }
  }

  const result: PlateauExercise[] = [];
  for (const [key, e] of byKey) {
    if (e.stalled < PLATEAU_MIN_STALLED_SESSIONS) continue;
    const daysSinceUsed = Math.floor(
      (now.getTime() - new Date(e.lastUsed + "T12:00:00").getTime()) / 86_400_000,
    );
    // Un exercice abandonné relève des "Techniques oubliées", pas du plateau.
    if (daysSinceUsed > PLATEAU_ACTIVE_WINDOW_DAYS) continue;
    const weeksSinceImprovement = Math.max(
      1,
      Math.floor(
        (now.getTime() - new Date(e.lastImproved + "T12:00:00").getTime()) / (7 * 86_400_000),
      ),
    );
    result.push({
      key,
      name: e.name,
      weeksSinceImprovement,
      stalledSessions: e.stalled,
      pr: e.pr,
    });
  }
  return result.sort((a, b) => b.weeksSinceImprovement - a.weeksSinceImprovement).slice(0, limit);
}

// ─── 7. Spécialisations ───────────────────────────────────────────────────────

export type Specialization = {
  id: string;
  title: string;
  /** 1 à 5 étoiles — part relative du volume total travaillé. */
  stars: number;
  volume: number;
  sets: number;
};

// Catégories dérivées des 14 MuscleId du domaine — libellés "univers
// CORTEX", calcul purement volumétrique. Exporté : Les Légendes (module
// Chroniques) réutilise la même taxonomie pour filtrer les exercices
// contributeurs d'une famille (voir ChroniquesPage / FamilyDetailSheet).
export const SPECIALIZATION_GROUPS: Array<{ id: string; title: string; muscles: MuscleId[] }> = [
  { id: "dos", title: "Maître du Dos", muscles: ["dos", "trapeze", "lombaires"] },
  { id: "pecs", title: "Seigneur des Pectoraux", muscles: ["pectoraux"] },
  {
    id: "jambes",
    title: "Titan des Jambes",
    muscles: ["quadriceps", "ischio", "fessiers", "mollets"],
  },
  { id: "bras", title: "Forgeron des Bras", muscles: ["biceps", "triceps", "avant-bras"] },
  { id: "epaules", title: "Sentinelle des Épaules", muscles: ["epaules"] },
  { id: "tronc", title: "Bastion du Tronc", muscles: ["abdos", "obliques"] },
];

const SPECIALIZATION_MIN_SETS = 6;

export function computeSpecializations(workouts: WorkoutLike[]): Specialization[] {
  const totals = new Map<MuscleId, { volume: number; sets: number }>();
  for (const w of workouts.filter(isMuscu)) {
    for (const a of sessionMuscleActivation(w.exercises ?? [])) {
      const entry = totals.get(a.id) ?? { volume: 0, sets: 0 };
      entry.volume += a.volume;
      entry.sets += a.sets;
      totals.set(a.id, entry);
    }
  }
  // Sanity : MUSCLE_META garantit que chaque id agrégé est un MuscleId connu.
  void MUSCLE_META;

  const cards = SPECIALIZATION_GROUPS.map((grp) => {
    let volume = 0;
    let sets = 0;
    for (const m of grp.muscles) {
      const t = totals.get(m);
      if (t) {
        volume += t.volume;
        sets += t.sets;
      }
    }
    return { id: grp.id, title: grp.title, volume: Math.round(volume), sets, stars: 0 };
  }).filter((c) => c.sets >= SPECIALIZATION_MIN_SETS && c.volume > 0);

  const maxVolume = Math.max(...cards.map((c) => c.volume), 1);
  for (const c of cards) {
    c.stars = Math.max(1, Math.round((c.volume / maxVolume) * 5));
  }
  return cards.sort((a, b) => b.volume - a.volume);
}

// ─── Les Légendes — rang par groupe musculaire (module Chroniques) ───────────
//
// Variante de computeSpecializations() qui ne filtre JAMAIS une famille : les
// 6 familles anatomiques sont une constante du domaine (pas une donnée
// inventée), donc toujours affichées — seule leur progression (volume/sets/
// stars, à 0 si jamais entraînée) reflète les vraies séances. C'est la carte
// mère du module « Les Légendes » (un rang par groupe musculaire, toujours
// dérivé du même moteur de projection que le Profil — specRankFromVolume).

export function computeLegendFamilies(workouts: WorkoutLike[]): Specialization[] {
  const totals = new Map<MuscleId, { volume: number; sets: number }>();
  for (const w of workouts.filter(isMuscu)) {
    for (const a of sessionMuscleActivation(w.exercises ?? [])) {
      const entry = totals.get(a.id) ?? { volume: 0, sets: 0 };
      entry.volume += a.volume;
      entry.sets += a.sets;
      totals.set(a.id, entry);
    }
  }

  const cards = SPECIALIZATION_GROUPS.map((grp) => {
    let volume = 0;
    let sets = 0;
    for (const m of grp.muscles) {
      const t = totals.get(m);
      if (t) {
        volume += t.volume;
        sets += t.sets;
      }
    }
    return { id: grp.id, title: grp.title, volume: Math.round(volume), sets, stars: 0 };
  });

  const maxVolume = Math.max(...cards.map((c) => c.volume), 1);
  for (const c of cards) {
    c.stars = c.volume > 0 ? Math.max(1, Math.round((c.volume / maxVolume) * 5)) : 0;
  }
  return cards.sort((a, b) => b.volume - a.volume);
}

// ─── 8. Galerie des Records (badges) ─────────────────────────────────────────

export type ChronicleBadge = {
  id: string;
  emoji: string;
  label: string;
  detail: string;
};

/** Plus longue suite de JOURS CALENDAIRES consécutifs avec ≥1 séance. */
export function computeLongestStreak(workouts: WorkoutLike[]): number {
  const days = Array.from(new Set(workouts.map((w) => w.date))).sort();
  let best = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const d of days) {
    const cur = new Date(d + "T12:00:00");
    if (prev != null && Math.round((cur.getTime() - prev.getTime()) / 86_400_000) === 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = cur;
  }
  return best;
}

export function computeBadges(workouts: WorkoutLike[]): ChronicleBadge[] {
  const muscu = sortAsc(workouts.filter(isMuscu));
  const badges: ChronicleBadge[] = [];

  // Premier 100 kg — première série ≥ 100 kg (date réelle).
  let first100: { date: string; exercise: string } | null = null;
  // Première tonne — première séance dont le tonnage dépasse 1000 kg.
  let firstTon: { date: string } | null = null;
  let totalSeries = 0;
  let maxPrsOneSession = 0;

  const recordsBySession = computeRecordsBySession(muscu);
  for (const w of muscu) {
    const groups = buildGroups(w.exercises ?? []);
    let volume = 0;
    for (const g of groups) {
      volume += g.volume;
      totalSeries += g.totalSeries;
      if (first100 == null) {
        for (const s of g.series) {
          if (s.weight != null && s.weight >= 100) {
            first100 = { date: w.date, exercise: g.name };
            break;
          }
        }
      }
    }
    if (firstTon == null && volume >= 1000) firstTon = { date: w.date };
    const prs = (recordsBySession.get(w.id) ?? []).filter((r) => !r.isNew).length;
    if (prs > maxPrsOneSession) maxPrsOneSession = prs;
  }

  if (first100) {
    badges.push({
      id: "first-100",
      emoji: "🏆",
      label: "Premier 100 kg",
      detail: first100.exercise,
    });
  }
  if (firstTon) {
    badges.push({ id: "first-ton", emoji: "🥇", label: "Première tonne", detail: "En une séance" });
  }

  const streak = computeLongestStreak(workouts);
  for (const t of [10, 7, 3]) {
    if (streak >= t) {
      badges.push({
        id: `streak-${t}`,
        emoji: "🔥",
        label: `${t} jours d'affilée`,
        detail: `Meilleure série : ${streak} jours`,
      });
      break; // seul le meilleur palier atteint est affiché
    }
  }

  for (const t of [5, 3]) {
    if (maxPrsOneSession >= t) {
      badges.push({
        id: `prs-${t}`,
        emoji: "⚡",
        label: `${t} PR en une séance`,
        detail: `Record : ${maxPrsOneSession} PR`,
      });
      break;
    }
  }

  for (const t of [1000, 500, 100]) {
    if (totalSeries >= t) {
      badges.push({
        id: `series-${t}`,
        emoji: "💪",
        label: `${t} séries`,
        detail: `${totalSeries} séries au total`,
      });
      break;
    }
  }

  for (const t of [100, 50, 10]) {
    if (workouts.length >= t) {
      badges.push({
        id: `sessions-${t}`,
        emoji: "🎖️",
        label: `${t} séances`,
        detail: `${workouts.length} séances au total`,
      });
      break;
    }
  }

  return badges;
}

// ─── LOT C3 — Projection sur l'échelle de rangs RPG existante ─────────────────
//
// Purement PRÉSENTATIONNELLE : projette un volume cumulé sur la MÊME échelle
// à 30 paliers (6 rangs × 5 niveaux : Mortel → Primordial) que le profil
// principal. Ne recalcule AUCUN rang du moteur RPG (rank/engine.ts) — le
// résultat est destiné à être passé tel quel à `toRankState` (le builder
// d'affichage déjà utilisé par le Profil), pour habiller les spécialisations
// dans le même univers visuel. Échelle logarithmique : ~1 t = bas de Mortel,
// ~1 000 t cumulées ≈ Olympien I, Primordial reste une aspiration lointaine.

export function projectVolumeToRankTier(volumeKg: number): {
  tierIndex: number;
  masteryPercent: number;
} {
  if (!(volumeKg > 0)) return { tierIndex: 0, masteryPercent: 0 };
  const BASE_LOG = 3; // 10^3 = 1 000 kg → bas du tier 0 (Mortel I)
  const STEP = 0.15; // 10^6 kg cumulés ≈ tier 20 (Olympien I)
  const raw = (Math.log10(volumeKg) - BASE_LOG) / STEP;
  const clamped = Math.max(0, Math.min(29, raw));
  const tierIndex = Math.floor(clamped);
  return {
    tierIndex,
    masteryPercent: tierIndex >= 29 ? 100 : Math.round((clamped - tierIndex) * 100),
  };
}

// ─── LOT C3 — Galerie des Records : collections à paliers ─────────────────────
//
// Salle des trophées : chaque catégorie est une échelle de paliers, chacun
// débloqué ou non selon les MÊMES métriques déjà dérivées (série la plus
// lourde, tonnage carrière, séances, streak, PR/séance, séries). Aucune
// nouvelle métrique métier — uniquement un re-seuillage pour l'affichage
// (paliers verrouillés visibles mais assombris + progression globale).

export type BadgeTier = {
  id: string;
  label: string;
  unlocked: boolean;
};

export type BadgeCategory = {
  id: string;
  title: string;
  emoji: string;
  /** Valeur actuelle formatée (ex. "182 kg", "37 t", "42 séances"). */
  current: string;
  /** Phrase de progression vers le prochain palier verrouillé (null si tout est débloqué). */
  nextHint: string | null;
  tiers: BadgeTier[];
  unlockedCount: number;
};

export type BadgeCollection = {
  categories: BadgeCategory[];
  unlocked: number;
  total: number;
};

function buildCategory(
  id: string,
  title: string,
  emoji: string,
  value: number,
  currentLabel: string,
  tiers: Array<{ threshold: number; label: string }>,
  remaining: (missing: number, nextLabel: string) => string,
): BadgeCategory {
  const rows: BadgeTier[] = tiers.map((t) => ({
    id: `${id}-${t.threshold}`,
    label: t.label,
    unlocked: value >= t.threshold,
  }));
  const unlockedCount = rows.filter((r) => r.unlocked).length;
  const next = tiers.find((t) => value < t.threshold);
  const nextHint = next ? remaining(next.threshold - value, next.label) : null;
  return { id, title, emoji, current: currentLabel, nextHint, tiers: rows, unlockedCount };
}

export function computeBadgeCollection(workouts: WorkoutLike[]): BadgeCollection {
  const muscu = workouts.filter(isMuscu);
  const recordsBySession = computeRecordsBySession(muscu);

  let heaviestSet = 0;
  let careerTonnage = 0;
  let totalSeries = 0;
  let maxPrsOneSession = 0;

  for (const w of muscu) {
    for (const g of buildGroups(w.exercises ?? [])) {
      careerTonnage += g.volume;
      totalSeries += g.totalSeries;
      for (const s of g.series) {
        if (s.weight != null && s.weight > heaviestSet) heaviestSet = s.weight;
      }
    }
    const prs = (recordsBySession.get(w.id) ?? []).filter((r) => !r.isNew).length;
    if (prs > maxPrsOneSession) maxPrsOneSession = prs;
  }

  const totalSessions = workouts.length;
  const streak = computeLongestStreak(workouts);

  const categories: BadgeCategory[] = [
    buildCategory(
      "force",
      "Force",
      "🏋️",
      heaviestSet,
      heaviestSet > 0 ? `${heaviestSet} kg` : "—",
      [
        { threshold: 60, label: "60 kg" },
        { threshold: 100, label: "Premier 100 kg" },
        { threshold: 200, label: "200 kg" },
        { threshold: 300, label: "300 kg" },
      ],
      (missing, next) => `Encore ${missing} kg avant « ${next} ».`,
    ),
    buildCategory(
      "volume",
      "Volume",
      "🏔️",
      careerTonnage,
      careerTonnage > 0 ? formatTonnage(careerTonnage) : "—",
      [
        { threshold: 1_000, label: "Première tonne" },
        { threshold: 10_000, label: "10 tonnes" },
        { threshold: 50_000, label: "50 tonnes" },
        { threshold: 100_000, label: "100 tonnes" },
      ],
      (missing, next) => `Encore ${formatTonnage(missing)} avant « ${next} ».`,
    ),
    buildCategory(
      "discipline",
      "Discipline",
      "🎖️",
      totalSessions,
      `${totalSessions} séances`,
      [
        { threshold: 10, label: "10 séances" },
        { threshold: 50, label: "50 séances" },
        { threshold: 100, label: "100 séances" },
        { threshold: 200, label: "200 séances" },
      ],
      (missing, next) => `Plus que ${missing} séances avant « ${next} ».`,
    ),
    buildCategory(
      "regularite",
      "Régularité",
      "🔥",
      streak,
      streak > 0 ? `${streak} jours d'affilée` : "—",
      [
        { threshold: 3, label: "3 jours d'affilée" },
        { threshold: 7, label: "7 jours d'affilée" },
        { threshold: 14, label: "14 jours d'affilée" },
        { threshold: 30, label: "30 jours d'affilée" },
      ],
      (missing, next) => `Encore ${missing} jours enchaînés avant « ${next} ».`,
    ),
    buildCategory(
      "intensite",
      "Intensité",
      "⚡",
      maxPrsOneSession,
      maxPrsOneSession > 0 ? `${maxPrsOneSession} PR en une séance` : "—",
      [
        { threshold: 2, label: "2 PR en une séance" },
        { threshold: 3, label: "3 PR en une séance" },
        { threshold: 5, label: "5 PR en une séance" },
      ],
      (missing, next) => `Encore ${missing} PR dans la même séance avant « ${next} ».`,
    ),
    buildCategory(
      "endurance",
      "Endurance",
      "💪",
      totalSeries,
      `${totalSeries} séries`,
      [
        { threshold: 100, label: "100 séries" },
        { threshold: 500, label: "500 séries" },
        { threshold: 1_000, label: "1000 séries" },
      ],
      (missing, next) => `Encore ${missing} séries avant « ${next} ».`,
    ),
  ];

  const unlocked = categories.reduce((s, c) => s + c.unlockedCount, 0);
  const total = categories.reduce((s, c) => s + c.tiers.length, 0);
  return { categories, unlocked, total };
}
