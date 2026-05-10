import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type DocModule =
  | "alimentation"
  | "pharmacie"
  | "habits"
  | "menager"
  | "nutrition"
  | "fitness"
  | "body"
  | "documents";

export type DocModuleSelection = DocModule | "auto";

export const MODULE_LABELS: Record<DocModule, string> = {
  alimentation: "Alimentation",
  pharmacie: "Pharmacie",
  habits: "Garde-robe",
  menager: "Ménager",
  nutrition: "Nutrition",
  fitness: "Séances",
  body: "Mesures corporelles",
  documents: "Document seul",
};

export const MODULE_SELECTION_LABELS: Record<DocModuleSelection, string> = {
  auto: "Détection automatique",
  ...MODULE_LABELS,
};

export type AnalysisResult = {
  summary: string;
  key_insights: string[];
  alerts: string[];
  extracted_items: Array<Record<string, unknown>>;
};

export function useDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Tables<"documents">[];
    },
  });
}

export function useUploadAndAnalyze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, module }: { file: File; module: DocModule }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      if (file.type !== "application/pdf") throw new Error("Format non supporté (PDF uniquement)");
      if (file.size > 15 * 1024 * 1024) throw new Error("Fichier trop volumineux (max 15 Mo)");

      const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("pdf-documents")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw upErr;

      const { data: ai, error: fnErr } = await supabase.functions.invoke("analyze-pdf", {
        body: { storage_path: path, module, name: file.name },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (ai?.error) throw new Error(ai.error);

      const result = ai as AnalysisResult;

      const { data: doc, error: insErr } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          name: file.name,
          module,
          storage_path: path,
          summary: result.summary,
          key_insights: result.key_insights,
          alerts: result.alerts,
          analysis: JSON.stringify(result.extracted_items),
        })
        .select()
        .single();
      if (insErr) throw insErr;

      return { doc, result };
    },
    onSuccess: () => {
      toast.success("PDF analysé");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: Tables<"documents">) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      await supabase.storage.from("pdf-documents").remove([doc.storage_path]);
      const { error } = await supabase.from("documents").delete().eq("id", doc.id).eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document supprimé");
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

const MODULE_QUERY_KEYS: Record<DocModule, string[][]> = {
  alimentation: [["items", "alimentation"], ["items"]],
  pharmacie: [["items", "pharmacie"], ["items"]],
  habits: [["items", "habits"], ["items"]],
  menager: [["items", "menager"], ["items"]],
  nutrition: [["nutrition"]],
  fitness: [["workouts"], ["exercises"]],
  body: [["body_tracking"]],
  documents: [],
};

export function usePourIntoModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      module,
      items,
    }: {
      module: DocModule;
      items: Array<Record<string, unknown>>;
    }) => {
      const n = await pourIntoModule(module, items);
      return { n, module };
    },
    onSuccess: ({ n, module }) => {
      toast.success(`${n} entrée(s) ajoutée(s) à ${MODULE_LABELS[module]}`);
      for (const key of MODULE_QUERY_KEYS[module] ?? []) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Pour into target modules. Returns inserted count.
export async function pourIntoModule(
  module: DocModule,
  items: Array<Record<string, unknown>>,
): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");
  if (!items.length) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const str = (v: unknown) => (typeof v === "string" ? v : v != null ? String(v) : null);
  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : v != null ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const int = (v: unknown) => {
    const n = num(v);
    return n == null ? null : Math.round(n);
  };

  if (module === "alimentation" || module === "pharmacie" || module === "habits" || module === "menager") {
    const rows = items
      .map((it) => ({
        user_id: user.id,
        module,
        name: str(it.name) ?? "Sans nom",
        category: str(it.category) ?? "autre",
        quantity: int(it.quantity) ?? 1,
        unit: str(it.unit),
        location: str(it.location),
        expiration_date: str(it.expiration_date),
        notes: str(it.notes),
      }))
      .filter((r) => r.name !== "Sans nom" || r.category !== "autre");
    const { error, count } = await supabase.from("items").insert(rows, { count: "exact" });
    if (error) throw error;
    return count ?? rows.length;
  }

  if (module === "nutrition") {
    const rows = items.map((it) => ({
      user_id: user.id,
      date: str(it.date) ?? today,
      name: str(it.name) ?? "Repas",
      meal: str(it.meal),
      calories: int(it.calories),
      proteins: num(it.proteins),
      carbs: num(it.carbs),
      fats: num(it.fats),
    }));
    const { error, count } = await supabase.from("nutrition").insert(rows, { count: "exact" });
    if (error) throw error;
    return count ?? rows.length;
  }

  if (module === "body") {
    const rows = items.map((it) => ({
      user_id: user.id,
      date: str(it.date) ?? today,
      weight: num(it.weight),
      body_fat: num(it.body_fat),
      muscle_mass: num(it.muscle_mass),
      chest: num(it.chest),
      waist: num(it.waist),
      hips: num(it.hips),
      left_arm: num(it.left_arm),
      right_arm: num(it.right_arm),
      left_thigh: num(it.left_thigh),
      right_thigh: num(it.right_thigh),
      notes: str(it.notes),
    }));
    const { error, count } = await supabase.from("body_tracking").insert(rows, { count: "exact" });
    if (error) throw error;
    return count ?? rows.length;
  }

  if (module === "fitness") {
    let total = 0;
    for (const it of items) {
      const { data: w, error: wErr } = await supabase
        .from("workouts")
        .insert({
          user_id: user.id,
          date: str(it.date) ?? today,
          name: str(it.name) ?? "Séance",
          duration_minutes: int(it.duration_minutes),
          notes: str(it.notes),
        })
        .select()
        .single();
      if (wErr) throw wErr;
      const exs = Array.isArray(it.exercises) ? (it.exercises as Array<Record<string, unknown>>) : [];
      if (exs.length) {
        const { error: eErr } = await supabase.from("exercises").insert(
          exs.map((ex) => ({
            user_id: user.id,
            workout_id: w.id,
            name: str(ex.name) ?? "Exercice",
            sets: int(ex.sets),
            reps: int(ex.reps),
            weight: num(ex.weight),
            notes: str(ex.notes),
          })),
        );
        if (eErr) throw eErr;
      }
      total++;
    }
    return total;
  }

  return 0;
}
