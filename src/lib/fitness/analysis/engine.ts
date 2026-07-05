// ============================================================
// Moteur d'analyse par exercice — agrégateur (domaine pur, déterministe).
//
// Point d'entrée unique : analyzeExercise(input) → ExerciseAnalysis.
// Assemble tous les sous-modules à partir des données déjà disponibles
// (historique de séries, carte de récupération, mensurations, objectifs).
// Aucune requête, aucun effet de bord : entièrement mémoïsable / testable.
// L'analyse n'est JAMAIS vide (repli biomécanique + textes déterministes).
// ============================================================

import { MUSCLE_META, type MuscleId } from "../muscleMapping";
import type { RecoveryStatus } from "../recovery";
import type { WorkingSet } from "../sets";
import { topSet } from "../sets";
import {
  averageTopReps,
  buildComparison,
  type SessionLike,
} from "./comparison";
import { detectImbalances, type MuscleState } from "./imbalance";
import {
  baseSolicitationForRole,
  resolveMuscleRoles,
  type RoleMap,
} from "./muscleRoles";
import { writeNarrative, writeSmartSummary } from "./narrative";
import { computePhysicalImpact } from "./physicalImpact";
import { buildProfileContext, type ProfileInput } from "./profile";
import { buildRecommendations } from "./recommendations";
import { computeRelevance } from "./relevance";
import type {
  ExerciseAnalysis,
  MuscleContribution,
  MuscleRole,
} from "./types";

export interface AnalyzeInput {
  exerciseName: string;
  /** Historique des séances (date + séries), trié par date croissante. */
  sessions: ReadonlyArray<SessionLike>;
  /** Muscles résolus par l'IA pour un exercice personnalisé (repli). */
  aiMuscleGroups?: string[] | null;
  /** État de récupération de TOUS les muscles (recovery map de l'app). */
  recovery: ReadonlyArray<MuscleState & { status: RecoveryStatus; hoursRemaining?: number | null }>;
  /** Contexte profil (objectif explicite éventuel, Corps, objectifs). */
  profile: Omit<ProfileInput, "avgReps">;
}

function orderedContributions(
  roles: RoleMap,
  recoveryById: Map<MuscleId, { status: RecoveryStatus; hoursRemaining: number | null }>,
): MuscleContribution[] {
  const out: MuscleContribution[] = [];
  const seen = new Set<MuscleId>();

  const push = (ids: MuscleId[], role: MuscleRole) => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const rec = recoveryById.get(id);
      out.push({
        id,
        label: MUSCLE_META[id]?.label ?? id,
        role,
        solicitation: baseSolicitationForRole(role),
        recovery: rec?.status ?? "unknown",
        hoursRemaining: rec?.hoursRemaining ?? null,
      });
    }
  };

  push(roles.primary, "primary");
  push(roles.secondary, "secondary");
  push(roles.stabilizer, "stabilizer");
  return out;
}

export function analyzeExercise(input: AnalyzeInput): ExerciseAnalysis {
  const { exerciseName, sessions } = input;

  // 1. Décomposition musculaire (+ repli biomécanique générique).
  const rolesFull = resolveMuscleRoles(exerciseName, input.aiMuscleGroups);
  const { isGeneric, ...roles } = rolesFull;

  // 2. Récupération indexée.
  const recoveryById = new Map(
    input.recovery.map((m) => [
      m.id,
      { status: m.status, hoursRemaining: m.hoursRemaining ?? null },
    ]),
  );
  const muscles = orderedContributions(roles, recoveryById);

  // 3. Profil (objectif inféré / explicite) — utilise la plage de reps réelle.
  const avgReps = averageTopReps(sessions);
  const profileCtx = buildProfileContext({ ...input.profile, avgReps });

  // 4. Impact physique (dépend du profil).
  const physicalImpact = computePhysicalImpact(
    exerciseName,
    roles,
    avgReps,
    profileCtx.objective,
  );

  // 5. Comparaison temporelle.
  const comparison = buildComparison(sessions);

  // 6. Recommandations.
  const primaryRecovery = roles.primary.map(
    (id) => recoveryById.get(id)?.status ?? ("unknown" as RecoveryStatus),
  );
  const lastSetCount = lastSessionSetCount(sessions);
  const recommendations = buildRecommendations({
    comparison,
    objective: profileCtx.objective,
    avgReps,
    lastSetCount,
    sessionCount: sessions.length,
    primaryRecovery,
  });

  // 7. Déséquilibres.
  const imbalances = detectImbalances({
    muscles: input.recovery.map((m) => ({
      id: m.id,
      status: m.status,
      hoursSinceLast: m.hoursSinceLast,
    })),
    primary: roles.primary,
    progressState: comparison.state,
  });

  // 8. Score de pertinence.
  const neglectedPrimary = roles.primary.filter((id) => {
    const m = input.recovery.find((r) => r.id === id);
    if (!m) return false;
    if (m.status === "unknown") return true;
    return m.hoursSinceLast != null && m.hoursSinceLast >= 24 * 7;
  });
  const relevance = computeRelevance({
    exerciseName,
    roles,
    objective: profileCtx.objective,
    isGenericModel: isGeneric,
    neglectedPrimary,
    sessionCount: sessions.length,
    progressing: comparison.state === "progression",
  });

  // 9. Textes déterministes.
  const narrativeInput = {
    exerciseName,
    objective: profileCtx.objective,
    isGenericModel: isGeneric,
    muscles,
    physicalImpact,
    comparison,
    recommendations,
    imbalances,
    relevance,
  };
  const narrative = writeNarrative(narrativeInput);
  const smartSummary = writeSmartSummary(narrativeInput);

  return {
    exerciseName,
    isGenericModel: isGeneric,
    objective: profileCtx.objective,
    muscles,
    physicalImpact,
    comparison,
    recommendations,
    imbalances,
    relevance,
    narrative,
    smartSummary,
  };
}

function lastSessionSetCount(sessions: ReadonlyArray<SessionLike>): number {
  if (sessions.length === 0) return 0;
  const last = sessions[sessions.length - 1];
  return last.sets.filter(
    (s: WorkingSet) => s.reps != null && s.weight != null && (s.reps as number) > 0,
  ).length;
}

// Réexport pratique pour les consommateurs (hook, UI).
export { topSet };
export type { SessionLike } from "./comparison";
