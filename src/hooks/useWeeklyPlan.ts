import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createExclusiveRunner } from "@/lib/exclusiveByKey";
import {
  normalizePlanInput,
  planDayWrite,
  type IsoDay,
  type PlanDayInput,
  type PlanWriteOp,
} from "@/lib/fitness/weeklyPlan";
import { getIsOnline } from "@/lib/offline/networkStatus";
import { OFFLINE_FIRST_QUERY_OPTIONS } from "@/lib/offline/offlineQuery";
import { createOfflineRepository, hydrateEntitiesFromServer } from "@/lib/offline/repository";

// ============================================================
// B06 « Mon rythme » — le plan de la semaine, offline-first.
//
// Table `weekly_plan_days` (migration 20260930120000) : au plus 7 lignes par
// utilisateur, une par jour de la semaine ISO. Même pattern que
// `usePhysicalGoal.ts` : écriture TOUJOURS locale d'abord (IndexedDB) puis
// file de synchronisation, lecture avec hydratation en ligne et repli local
// hors connexion — le plan reste donc lisible et modifiable en salle, sans
// réseau.
//
// Ce fichier porte le repository, les requêtes et l'écriture. La
// composition « plan + séances + modèles → semaine à afficher » vit dans
// `useWeekPlanView.ts` : `offlineQueryConvention.test.ts` exige que le
// marqueur offline-first ne se trouve que dans un module à store local.
//
// Aucune contrainte UNIQUE (user_id, jour) en base, volontairement (voir la
// migration) : les doublons entre deux appareils se départagent à la lecture
// (`resolveWeeklyPlan`), et l'écriture ci-dessous les nettoie au passage.
// ============================================================

export interface WeeklyPlanDayRow {
  id: string;
  user_id: string;
  /** Jour ISO : 1 = lundi … 7 = dimanche. */
  day_of_week: number;
  kind: string;
  muscle_groups: string[];
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

export const weeklyPlanDaysRepo = createOfflineRepository<WeeklyPlanDayRow>("weekly_plan_days");

export const WEEKLY_PLAN_KEY = ["weekly_plan_days"] as const;

async function refreshWeeklyPlanFromServer(userId: string): Promise<void> {
  if (!getIsOnline()) return;
  try {
    const { data, error } = await supabase
      .from("weekly_plan_days")
      .select("*")
      .eq("user_id", userId)
      // Plafond très large : un plan tient en 7 lignes (doublons entre deux
      // appareils compris). Il garantit surtout que la lecture est bornée
      // (invariant 4.1, `check:bounded-reads`).
      .limit(100);
    if (!error && data) {
      await hydrateEntitiesFromServer("weekly_plan_days", userId, data as WeeklyPlanDayRow[]);
    }
  } catch {
    // Hors ligne ou erreur réseau : on continue avec le store local.
  }
}

/** Les lignes brutes du plan. Utiliser `useWeekPlanView` pour l'affichage. */
export function useWeeklyPlanRows() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    ...OFFLINE_FIRST_QUERY_OPTIONS,
    queryKey: [...WEEKLY_PLAN_KEY, userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<WeeklyPlanDayRow[]> => {
      if (!userId) return [];
      await refreshWeeklyPlanFromServer(userId);
      return weeklyPlanDaysRepo.list(userId);
    },
  });
}

/** Messages affichés quand une saisie ne peut pas être enregistrée. */
export const PLAN_INPUT_ERRORS = {
  "no-groups": "Choisis au moins un groupe musculaire",
  "no-template": "Choisis une séance sauvegardée",
} as const;

/**
 * Une écriture de planning à la fois, par utilisateur. La section critique est
 * « lire les lignes du jour, décider créer ou mettre à jour, écrire » : sans
 * exclusion, deux appuis rapprochés sur un même jour lisent tous deux
 * « aucune ligne » et en créent deux. Le doublon serait toléré (voir
 * `resolveWeeklyPlan`), mais autant ne pas le fabriquer. Le verrou est INTERNE
 * à l'écriture : un `disabled` à l'écran ne ferait que le refléter.
 */
const runPlanWriteExclusively = createExclusiveRunner();

/**
 * Enregistre (ou efface, avec `input = null`) le plan d'UN jour. Retourne ce qui
 * a été fait — `noop` quand rien n'avait à l'être (jour déjà libre, ou contenu
 * identique).
 *
 * Toujours locale d'abord : fonctionne hors connexion, la synchronisation
 * suit par la file.
 */
export async function writePlanDay(
  userId: string,
  dayOfWeek: IsoDay,
  input: PlanDayInput | null,
): Promise<PlanWriteOp["type"]> {
  const normalized = input === null ? null : normalizePlanInput(input);
  // Validé AVANT d'entrer dans la section critique : une saisie invalide ne
  // doit ni attendre son tour ni toucher au store.
  if (normalized && !normalized.ok) throw new Error(PLAN_INPUT_ERRORS[normalized.reason]);

  return runPlanWriteExclusively(userId, async () => {
    const rows = await weeklyPlanDaysRepo.list(userId);
    const op = planDayWrite(rows, dayOfWeek, normalized);

    switch (op.type) {
      case "create":
        await weeklyPlanDaysRepo.create(userId, { day_of_week: dayOfWeek, ...op.content });
        break;
      case "update":
        // `op.content` porte TOUJOURS les trois champs de contenu (kind,
        // muscle_groups, template_id), y compris à `[]` / `null` : le patch
        // change `kind` ET efface le reste d'un seul coup, sinon le CHECK de
        // la base refuserait un « repos » portant encore un template_id.
        if (!op.unchanged) await weeklyPlanDaysRepo.update(op.id, userId, op.content);
        for (const id of op.removeIds) await weeklyPlanDaysRepo.remove(id, userId);
        break;
      case "clear":
        for (const id of op.removeIds) await weeklyPlanDaysRepo.remove(id, userId);
        break;
      case "noop":
        break;
    }
    return op.type;
  });
}

export interface SetPlanDayVariables {
  dayOfWeek: IsoDay;
  /** `null` : le jour redevient libre. */
  input: PlanDayInput | null;
}

export function useSetPlanDay() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ dayOfWeek, input }: SetPlanDayVariables) => {
      if (!user) throw new Error("Non authentifié");
      return writePlanDay(user.id, dayOfWeek, input);
    },
    // Pas de toast de succès : on règle sept jours d'affilée, le changement
    // s'affiche immédiatement dans la liste — un toast par appui serait du bruit.
    onSuccess: () => qc.invalidateQueries({ queryKey: WEEKLY_PLAN_KEY }),
    onError: (e: Error) => toast.error(e.message),
  });
}
