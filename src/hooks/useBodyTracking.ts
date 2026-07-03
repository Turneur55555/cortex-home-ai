import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import type { TablesInsert } from "@/integrations/supabase/types";

export function useBodyMeasurements() {
  return useQuery({
    queryKey: ["body_tracking"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("body_tracking")
        .select("*")
        .or(
          "weight.not.is.null,body_fat.not.is.null,muscle_mass.not.is.null,chest.not.is.null,waist.not.is.null,hips.not.is.null,left_arm.not.is.null,right_arm.not.is.null,left_thigh.not.is.null,right_thigh.not.is.null,notes.not.is.null",
        )
        .order("date", { ascending: false })
        .limit(180);
      if (error) throw error;
      return data;
    },
  });
}

export function useAddBodyMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<TablesInsert<"body_tracking">, "user_id">) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase.from("body_tracking").insert({ ...input, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Mesure ajoutée");
      logActivity("body", vars.weight != null ? `Pesée : ${vars.weight} kg` : "Mensuration ajoutée", { date: vars.date });
      qc.invalidateQueries({ queryKey: ["body_tracking"] });
      qc.invalidateQueries({ queryKey: ["user_activity"] });
      qc.invalidateQueries({ queryKey: ["activity_streak"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteBodyMeasurement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      const { error } = await supabase
        .from("body_tracking")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Supprimée");
      qc.invalidateQueries({ queryKey: ["body_tracking"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
