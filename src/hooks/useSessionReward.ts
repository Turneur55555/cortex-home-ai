import { useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useUserStats } from "@/hooks/useUserStats";
import { hasQueuedOperationsForRecord } from "@/lib/offline/syncQueue";
import { SERVER_CONFIRMED_QUERY_OPTIONS } from "@/lib/offline/serverConfirmedQuery";
import {
  resolveRewardConfirmation,
  hasServerRewardSnapshot,
  type RewardConfirmation,
  type RewardServerSnapshot,
} from "@/lib/fitness/rpg/rewardConfirmation";
import { rewardSnapshotPollIntervalMs } from "@/lib/fitness/rpg/rewardPolling";
import {
  totalSessionXp,
  buildXpBreakdown,
  buildLevelTransitionFromServer,
  type SessionXpEvent,
  type XpBreakdownLine,
  type LevelTransition,
} from "@/lib/fitness/rpg/sessionReward";

export interface SessionRewardData {
  isLoading: boolean;
  /**
   * CHANTIER 4 (CRIT-03) — état RÉEL de la récompense. `totalXp`,
   * `breakdown` et la transition de niveau ne sont exploitables QUE si
   * `confirmation === "confirmed"` : dans les deux autres états le serveur
   * n'a encore rien calculé pour cette séance.
   */
  confirmation: RewardConfirmation;
  /** XP totale versée pour CETTE séance (somme des xp_events). 0 tant que non confirmée. */
  totalXp: number;
  /** Détail par source, ordonné (muscu → records → soutien). */
  breakdown: XpBreakdownLine[];
  /** Transition de niveau induite par la séance. */
  level: LevelTransition;
  /** true tant qu'aucun xp_event n'existe (ex. migration R1 non déployée) —
   *  l'écran reste affichable (stats/PR/badges), la section XP est masquée. */
  hasXp: boolean;
}

/**
 * Intervalle de relecture tant que la récompense n'est pas confirmée. Ce
 * n'est PAS un délai qui masque une course : aucune valeur n'est affichée
 * avant confirmation. C'est la relecture de l'unique signal qui fait foi
 * (l'instantané serveur), pour que l'écran se mette à jour de lui-même dès
 * que la sync queue a poussé la clôture et que le trigger a versé l'XP —
 * y compris au retour du réseau plusieurs minutes plus tard.
 *
 * AUD-12 : cette cadence NOMINALE reste celle des premières secondes, mais
 * la relecture SERVEUR s'espace ensuite (`rewardSnapshotPollIntervalMs`) —
 * voir `lib/fitness/rpg/rewardPolling.ts`. Le signal LOCAL ci-dessous, lui,
 * garde la cadence fixe : c'est une lecture IndexedDB sans réseau, et son
 * `enabled` l'éteint déjà dans les deux cas où il ne décide de rien.
 */
const UNCONFIRMED_POLL_MS = 1_500;

/** Transition neutre : aucune progression inventée tant que rien n'est confirmé. */
function neutralLevelTransition(xp: number, level: number): LevelTransition {
  return buildLevelTransitionFromServer(xp, xp, level, level);
}

/**
 * Récapitulatif d'XP d'une séance pour l'écran de récompense de fin de séance.
 * Lit `xp_events` (détail par source) + les compteurs AUTORITATIFS versés par
 * le serveur sur la séance elle-même (`workouts.xp_before/xp_after/
 * level_before/level_after`, migration `20260718120000`).
 *
 * CHANTIER 4 (CRIT-03) — le serveur est l'UNIQUE autorité, y compris sur la
 * question « la récompense existe-t-elle déjà ? ». Avant ce chantier, un
 * instantané serveur absent (cas NOMINAL juste après la clôture : l'écriture
 * `status='completed'` est offline-first, elle n'a pas encore été poussée par
 * la sync queue, donc le trigger `award_xp_on_workout_complete` n'a pas
 * tourné) retombait silencieusement sur `user_stats.xp` et affichait « +0 XP »
 * avec une barre de progression figée sur l'XP d'AVANT la séance : une
 * récompense fausse présentée comme réelle. Désormais cet état est nommé
 * (`confirmation`) et l'écran affiche un état honnête au lieu d'une valeur
 * inventée. `user_stats` ne sert plus qu'à savoir QUEL RANG afficher pendant
 * l'attente (dernière valeur confirmée), jamais à fabriquer une progression.
 */
export function useSessionReward(workoutId: string | null | undefined): SessionRewardData {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const isOnline = useNetworkStatus();
  const { data: userStats, isLoading: statsLoading } = useUserStats();

  // Début de l'attente pour CETTE séance — remis à zéro quand l'écran change
  // de séance. Sert uniquement à espacer la relecture serveur (AUD-12) ;
  // aucune décision d'affichage n'en dépend.
  const pollStartedAt = useRef<{ workoutId: string | null | undefined; at: number }>({
    workoutId,
    at: Date.now(),
  });
  if (pollStartedAt.current.workoutId !== workoutId) {
    pollStartedAt.current = { workoutId, at: Date.now() };
  }

  const { data: snapshot, isLoading: snapshotLoading } = useQuery({
    ...SERVER_CONFIRMED_QUERY_OPTIONS,
    queryKey: ["session_reward_snapshot", workoutId],
    enabled: !!user && !!workoutId,
    staleTime: 15_000,
    // Tant que le serveur n'a pas déposé ses compteurs, on relit : c'est
    // l'arrivée de la valeur serveur — et rien d'autre — qui fait passer
    // l'écran en état confirmé.
    //
    // AUD-12 — la cadence S'ESPACE avec l'attente, elle ne s'arrête jamais
    // avant confirmation : une clôture qui n'aboutit pas (opération bloquée,
    // serveur en échec) laissait sinon l'écran interroger le serveur 40 fois
    // par minute sans fin. `false` reste réservé au SEUL cas où il n'y a
    // plus rien à lire : la récompense est confirmée.
    refetchInterval: (query) =>
      hasServerRewardSnapshot(query.state.data as RewardServerSnapshot | null | undefined)
        ? false
        : rewardSnapshotPollIntervalMs(Date.now() - pollStartedAt.current.at),
    queryFn: async (): Promise<RewardServerSnapshot | null> => {
      const { data, error } = await (supabase as any)
        .from("workouts")
        .select("xp_before, xp_after, level_before, level_after")
        .eq("id", workoutId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as RewardServerSnapshot | null;
    },
  });

  const confirmed = hasServerRewardSnapshot(snapshot);

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    ...SERVER_CONFIRMED_QUERY_OPTIONS,
    queryKey: ["session_xp_events", workoutId, userId],
    // Le détail par source n'existe pas avant que le serveur ait versé l'XP :
    // inutile d'interroger `xp_events` tant que l'instantané est absent (c'est
    // aussi ce qui supprime les lectures répétées à vide de l'ancien écran).
    enabled: !!user && !!workoutId && confirmed,
    staleTime: 15_000,
    queryFn: async (): Promise<SessionXpEvent[]> => {
      const { data, error } = await (supabase as any)
        .from("xp_events")
        .select("source, amount")
        .eq("workout_id", workoutId!);
      if (error) throw error;
      return (data ?? []) as SessionXpEvent[];
    },
  });

  // Signal LOCAL (IndexedDB, aucun réseau) : la clôture est-elle encore en
  // file ? C'est lui qui distingue « pas encore synchronisé » (état honnête
  // durable, y compris hors ligne) de « synchronisé, récompense en cours de
  // lecture » (attente courte et normale).
  const { data: hasQueuedWorkoutOps = false } = useQuery({
    queryKey: ["session_reward_queue", workoutId, userId],
    // CHANTIER 9 (E2) — CE SIGNAL NE TOURNE QUE QUAND IL DÉCIDE DE QUELQUE
    // CHOSE. Deux relectures indépendantes tournaient en parallèle toutes les
    // 1,5 s tant que la récompense n'était pas confirmée, alors que dans deux
    // cas sur trois la seconde ne servait à rien :
    // - HORS LIGNE, `resolveRewardConfirmation` conclut « syncing » sur le
    //   seul `!isOnline` : la file n'est pas consultée, mais la boucle
    //   tournait quand même — indéfiniment, puisque l'instantané serveur, lui,
    //   est en pause hors connexion et ne peut jamais confirmer ;
    // - UNE FOIS LA CLÔTURE PARTIE (la file ne porte plus d'opération pour
    //   cette séance), ce signal ne peut plus changer : il ne reste qu'à
    //   attendre le serveur, ce que fait l'instantané ci-dessus.
    // Reste donc UNE SEULE boucle active à chaque instant.
    enabled: !!userId && !!workoutId && !confirmed && isOnline,
    // Lecture purement locale : elle doit tourner hors connexion (`enabled`
    // ci-dessus la coupe déjà hors ligne, mais la query ne doit jamais être
    // mise en PAUSE par TanStack au retour du réseau).
    networkMode: "always",
    // `false` est définitif pour cette séance : plus aucune opération de
    // clôture en file ne veut dire qu'elle est partie. On arrête d'y revenir.
    refetchInterval: (query) => (query.state.data === false ? false : UNCONFIRMED_POLL_MS),
    queryFn: () => hasQueuedOperationsForRecord(userId!, "workouts", workoutId!),
  });

  const confirmation = resolveRewardConfirmation({
    snapshot,
    hasQueuedWorkoutOps,
    isOnline,
  });

  return useMemo(() => {
    if (confirmation !== "confirmed") {
      // Aucune valeur inventée : XP à 0, aucun détail, transition neutre
      // ancrée sur le dernier état CONFIRMÉ connu (sert uniquement à
      // afficher le rang actuel pendant l'attente).
      const knownXp = userStats?.xp ?? 0;
      const knownLevel = userStats?.level ?? 1;
      return {
        isLoading: statsLoading || snapshotLoading,
        confirmation,
        totalXp: 0,
        breakdown: [],
        level: neutralLevelTransition(knownXp, knownLevel),
        hasXp: false,
      };
    }

    const totalXp = totalSessionXp(events);
    return {
      isLoading: eventsLoading,
      confirmation,
      totalXp,
      breakdown: buildXpBreakdown(events),
      level: buildLevelTransitionFromServer(
        snapshot!.xp_before!,
        snapshot!.xp_after!,
        snapshot!.level_before!,
        snapshot!.level_after!,
      ),
      hasXp: totalXp > 0,
    };
  }, [confirmation, events, snapshot, userStats, statsLoading, eventsLoading, snapshotLoading]);
}
