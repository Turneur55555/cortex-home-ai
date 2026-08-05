import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/db";
import {
  mergeDailyActivityRows,
  type DailyActivityRow,
  type MergedDailyActivity,
} from "@/lib/fitness/dailyActivity";

const SELECT_COLUMNS = "date, source, steps, active_calories, avg_hr, resting_hr, hrv_ms";

/**
 * Dernier relevé d'activité connu (table `daily_activity`) — désormais
 * alimentée soit par un import (Apple Health, `source: "apple_health"`),
 * soit par une saisie manuelle Cortex-native (Phase 10, `source:
 * "manual"`). Les deux peuvent coexister pour la MÊME date (UNIQUE
 * user_id/date/source) — fusionnées champ par champ via
 * `mergeDailyActivityRows` (le manuel gagne quand renseigné). Retourne
 * `null` tant qu'aucune donnée n'existe, quelle que soit la source.
 */
export function useLatestActivity() {
  return useQuery({
    queryKey: ["daily_activity", "latest"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MergedDailyActivity | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      // Au plus 2 sources par date aujourd'hui (apple_health/manual) — 6
      // lignes couvrent large les 3 dates les plus récentes sans sur-fetcher.
      const { data, error } = await db
        .from("daily_activity")
        .select(SELECT_COLUMNS)
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(6);
      if (error || !data || data.length === 0) return null;
      const latestDate = data[0].date;
      const rows = data.filter((r) => r.date === latestDate) as DailyActivityRow[];
      return mergeDailyActivityRows(rows);
    },
  });
}

/**
 * Relevé d'activité pour une date PRÉCISE (contrairement à
 * `useLatestActivity`, qui renvoie le dernier relevé connu — pas
 * nécessairement aujourd'hui). Nécessaire pour tout calcul qui doit
 * correspondre à "la journée demandée" (ex. NEAT quotidien, Phase 2D) :
 * ne jamais présenter l'activité d'un autre jour comme celle du jour
 * demandé. `null` si aucune ligne n'existe pour cette date (toutes sources
 * confondues).
 */
export function useActivityForDate(dateYMD: string) {
  return useQuery({
    queryKey: ["daily_activity", "date", dateYMD],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MergedDailyActivity | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await db
        .from("daily_activity")
        .select(SELECT_COLUMNS)
        .eq("user_id", user.id)
        .eq("date", dateYMD);
      if (error || !data) return null;
      return mergeDailyActivityRows(data as DailyActivityRow[]);
    },
  });
}

export interface RestingHrHistoryPoint {
  date: string;
  restingHr: number;
}

/**
 * Historique de FC repos fusionné par jour (toutes sources confondues,
 * manuel prioritaire) sur les `days` derniers jours — utilisé pour établir
 * la baseline personnelle de `evaluateSystemicRecovery` (Phase 10 §8).
 * Ne calcule RIEN ici (pure lecture) : le calcul de récupération reste
 * dans `lib/fitness/systemicRecovery.ts`.
 */
export function useRestingHrHistory(days = 60) {
  return useQuery({
    queryKey: ["daily_activity", "resting_hr_history", days],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RestingHrHistoryPoint[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - days);
      const { data, error } = await db
        .from("daily_activity")
        .select(SELECT_COLUMNS)
        .eq("user_id", user.id)
        .gte("date", since.toISOString().slice(0, 10))
        .not("resting_hr", "is", null)
        .order("date", { ascending: false });
      if (error || !data) return [];
      const byDate = new Map<string, DailyActivityRow[]>();
      for (const row of data as DailyActivityRow[]) {
        const existing = byDate.get(row.date) ?? [];
        existing.push(row);
        byDate.set(row.date, existing);
      }
      const points: RestingHrHistoryPoint[] = [];
      for (const [date, rows] of byDate) {
        const merged = mergeDailyActivityRows(rows);
        if (merged?.restingHr != null) {
          points.push({ date, restingHr: merged.restingHr.value });
        }
      }
      return points;
    },
  });
}

export interface ManualDailyActivityInput {
  date: string;
  steps?: number | null;
  restingHr?: number | null;
  hrvMs?: number | null;
}

/**
 * Saisie manuelle Cortex-native (Phase 10 §5/§6/§7) — jamais un import
 * Apple Health requis. Upsert PARTIEL (seuls les champs fournis sont
 * envoyés) sur `(user_id, date, source="manual")` : ne réécrit jamais à
 * `null` un champ déjà renseigné une autre fois pour la même date (ex.
 * ajouter les pas aujourd'hui ne doit pas effacer la FC repos déjà saisie
 * ce même jour).
 */
export function useUpsertManualDailyActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ManualDailyActivityInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const patch = {
        user_id: user.id,
        date: input.date,
        source: "manual",
        ...(input.steps !== undefined ? { steps: input.steps } : {}),
        ...(input.restingHr !== undefined ? { resting_hr: input.restingHr } : {}),
        ...(input.hrvMs !== undefined ? { hrv_ms: input.hrvMs } : {}),
      };
      const { error } = await db
        .from("daily_activity")
        .upsert(patch, { onConflict: "user_id,date,source" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enregistré");
      qc.invalidateQueries({ queryKey: ["daily_activity"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
