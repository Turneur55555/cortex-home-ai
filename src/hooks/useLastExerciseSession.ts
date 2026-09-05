import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import {
  exerciseSetsRepo,
  exercisesRepo,
  refreshWorkoutsFromServer,
  workoutsRepo,
} from "@/hooks/use-fitness";
import { OFFLINE_FIRST_QUERY_OPTIONS } from "@/lib/offline/offlineQuery";
import { normalize } from "@/lib/fitness/exerciseCatalog";
import { identityKey } from "@/lib/fitness/recentExercises";
import {
  selectLastExerciseSessions,
  type LastSession,
  type LastSessionSet,
} from "@/lib/fitness/lastExerciseSession";

/**
 * Dernières séances terminées par exercice, en excluant la séance active
 * courante.
 *
 * Étape 4.5 (2026-07-12) — bascule identité : chaque exercice de la séance
 * active porte désormais (quand disponible) son `exerciseReferenceId`
 * (`exercises.exercise_reference_id`, résolu via ExerciseResolutionService).
 * La correspondance avec l'historique se fait en priorité par cet id
 * (`identityKey`, même fonction que `recentExercises.ts` — une seule
 * logique d'identité partagée). Filet de compatibilité : si l'exercice
 * n'a pas encore de référence résolue, repli sur le nom normalisé, comme
 * avant. Contrat public élargi (l'appelant doit désormais fournir
 * `exerciseReferenceId` en plus du nom — un seul appelant, ActiveWorkoutView).
 *
 * Sert à pré-remplir les charges et à afficher le comparatif « dernière
 * séance » sur chaque carte d'exercice.
 *
 * ────────────────────────────────────────────────────────────────────────
 * CHANTIER 9 (E1) — CE HOOK LIT DÉSORMAIS LE STORE LOCAL.
 *
 * AVANT : trois requêtes Supabase directes, dont la première demandait
 * `exercises` de l'utilisateur SANS AUCUNE LIMITE NI TRI, puis filtrait en
 * mémoire. Deux défauts, et le second est une perte silencieuse :
 * 1. HORS LIGNE, la query était mise en pause par TanStack (`networkMode`
 *    « online » par défaut) : la ligne « dernière fois » disparaissait et le
 *    pré-remplissage des charges ne se faisait plus, alors que la donnée est
 *    sur l'appareil. Une séance hors ligne perdait donc son point de
 *    comparaison — exactement ce que l'offline-first doit empêcher.
 * 2. EN LIGNE, une lecture sans `limit` ni `order` est tronquée en SILENCE
 *    par PostgREST au-delà de `max-rows` (1 000 par défaut). Le jour où le
 *    compte d'exercices franchit ce plafond, les lignes conservées sont
 *    arbitraires : la « dernière séance » affichée pourrait être n'importe
 *    laquelle, sans la moindre erreur. C'est la régression MAJ-08 déjà
 *    corrigée sur l'hydratation, restée ouverte ici.
 *
 * MAINTENANT : rafraîchissement serveur BEST-EFFORT (le même que les autres
 * écrans fitness — `refreshWorkoutsFromServer` passe par la fenêtre de
 * fraîcheur partagée, donc aucun aller-retour supplémentaire), puis lecture
 * du store local, borné et non tronquable par construction. La règle de
 * sélection vit dans `lib/fitness/lastExerciseSession.ts` (pure, testée).
 *
 * LIMITE ASSUMÉE, À ARBITRER SÉPARÉMENT : le store local ne contient que les
 * `WORKOUTS_HYDRATION_LIMIT` (200) séances les plus récentes. Un exercice
 * dont la dernière pratique est ANTÉRIEURE à cette fenêtre n'a donc plus de
 * « dernière fois ». C'était déjà le cas de fait dès que la lecture serveur
 * était tronquée, mais de façon imprévisible. Rétablir un historique plus
 * profond demanderait une lecture serveur dédiée et bornée (séances
 * terminées les plus récentes → leurs exercices → leurs séries, par paquets,
 * comme `fetchChildRowsForParents`) : c'est un vrai ajout, pas un correctif,
 * et il n'est pas entrepris ici.
 * ────────────────────────────────────────────────────────────────────────
 */
export type { LastSession, LastSessionSet };

export interface LastExerciseSessionQuery {
  name: string;
  exerciseReferenceId?: string | null;
}

const EMPTY = new Map<string, LastSession>();

export function useLastExerciseSessions(
  exercises: LastExerciseSessionQuery[],
  excludeWorkoutId: string | null | undefined,
): Map<string, LastSession> {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Dédoublonnage par identité (id en priorité, nom normalisé en filet) ;
  // les entrées sans id ET sans nom exploitable (chaîne vide après trim) ne
  // correspondront jamais à rien en base, on les écarte donc en amont.
  const keys = Array.from(
    new Set(
      exercises
        .filter((e) => !!e.exerciseReferenceId || normalize(e.name).length > 0)
        .map((e) => identityKey({ name: e.name, exercise_reference_id: e.exerciseReferenceId })),
    ),
  ).sort();

  const q = useQuery({
    // Lecture du store local : la query doit tourner hors connexion (le
    // rafraîchissement serveur ci-dessous est déjà gardé par `getIsOnline()`).
    ...OFFLINE_FIRST_QUERY_OPTIONS,
    queryKey: ["fitness", "last_exercise_sessions", keys.join("|"), excludeWorkoutId ?? ""],
    enabled: !!userId && keys.length > 0,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, LastSession>> => {
      const id = userId as string;
      await refreshWorkoutsFromServer(id);
      const [workouts, allExercises, allSets] = await Promise.all([
        workoutsRepo.list(id),
        exercisesRepo.list(id),
        exerciseSetsRepo.list(id),
      ]);
      return selectLastExerciseSessions({
        keys: new Set(keys),
        excludeWorkoutId,
        rows: { workouts, exercises: allExercises, exerciseSets: allSets },
      });
    },
  });

  return q.data ?? EMPTY;
}
