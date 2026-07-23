// Point d'entrée public du moteur d'analyse par exercice.
// Importer depuis "@/lib/fitness/analysis" plutôt que les sous-modules.

export { analyzeExercise } from "./engine";
export type { AnalyzeInput, SessionLike } from "./engine";
export { inferObjective, buildProfileContext } from "./profile";
export type { ProfileInput, UserProfileContext, BodyRow } from "./profile";
export { resolveMuscleRoles } from "./muscleRoles";
export type { RoleMap } from "./muscleRoles";
export * from "./types";
