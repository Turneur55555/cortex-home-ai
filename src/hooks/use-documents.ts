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
  detected_module?: DocModule | null;
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

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function isImageFile(file: File): boolean {
  if (ACCEPTED_IMAGE_TYPES.has(file.type)) return true;
  // iOS Safari may report HEIC as "" — fallback to extension
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

async function compressImage(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(new Error("Lecture de l'image échouée"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Image invalide ou format non supporté"));
    i.src = dataUrl;
  });
  const MAX = 1600;
  const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return new Promise<Blob>((res, rej) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) rej(new Error("Compression échouée"));
        else res(blob);
      },
      "image/jpeg",
      0.85,
    );
  });
}

export function useUploadAndAnalyze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, module }: { file: File; module: DocModuleSelection }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const isImage = isImageFile(file);
      const isPdf = file.type === "application/pdf";
      if (!isImage && !isPdf) {
        throw new Error("Format non supporté (PDF, JPG, PNG, WEBP, HEIC)");
      }
      if (file.size > 15 * 1024 * 1024) throw new Error("Fichier trop volumineux (max 15 Mo)");

      let uploadBlob: Blob = file;
      let contentType = file.type || "application/pdf";
      // Normalize filename: replace HEIC/HEIF with .jpg since we compress to JPEG
      let displayName = file.name.replace(/\.(heic|heif)$/i, ".jpg");

      if (isImage) {
        uploadBlob = await compressImage(file);
        contentType = "image/jpeg";
      }

      const path = `${user.id}/${Date.now()}-${displayName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("pdf-documents")
        .upload(path, uploadBlob, { contentType, upsert: false });
      if (upErr) throw upErr;

      const { data: ai, error: fnErr } = await supabase.functions.invoke("analyze-pdf", {
        body: { storage_path: path, module, name: displayName, content_type: contentType },
      });
      if (fnErr) {
        // FunctionsHttpError wraps non-2xx responses — try to extract the real message
        let friendlyMsg = isImage
          ? "Impossible d'analyser cette image. Essayez un format JPG ou PNG clair."
          : "Impossible d'analyser ce PDF. Vérifiez que le fichier n'est pas corrompu.";
        try {
          const body = await (fnErr as { context?: { json?: () => Promise<Record<string, unknown>> } }).context?.json?.();
          if (body?.error && typeof body.error === "string") friendlyMsg = body.error;
        } catch { /* keep default */ }
        throw new Error(friendlyMsg);
      }
      if (ai?.error) throw new Error(ai.error);

      const result = ai as AnalysisResult;
      const finalModule: DocModule =
        module === "auto" ? (result.detected_module ?? "documents") : module;

      const { data: doc, error: insErr } = await supabase
        .from("documents")
        .insert({
          user_id: user.id,
          name: displayName,
          module: finalModule,
          storage_path: path,
          summary: result.summary,
          key_insights: result.key_insights,
          alerts: result.alerts,
          analysis: JSON.stringify(result.extracted_items),
        })
        .select()
        .single();
      if (insErr) throw insErr;

      return { doc, result, detectedModule: finalModule, wasAuto: module === "auto", isImage };
    },
    onSuccess: ({ wasAuto, detectedModule }) => {
      toast.success(
        wasAuto
          ? `Document analysé — détecté: ${MODULE_LABELS[detectedModule]}`
          : "Document analysé",
      );
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: Tables<"documents">) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      await supabase.storage.from("pdf-documents").remove([doc.storage_path]);
      const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id)
        .eq("user_id", user.id);
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
      if (n === 0) {
        toast.info("Aucune donnée exploitable à ajouter");
      } else {
        toast.success(`${n} entrée(s) ajoutée(s) à ${MODULE_LABELS[module]}`);
      }
      for (const key of MODULE_QUERY_KEYS[module] ?? []) {
        qc.invalidateQueries({ queryKey: key });
      }
      qc.invalidateQueries({ queryKey: ["dashboard_stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Pour into target modules. Returns inserted count.
export async function pourIntoModule(
  module: DocModule,
  items: Array<Record<string, unknown>>,
): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  if (
    module === "alimentation" ||
    module === "pharmacie" ||
    module === "habits" ||
    module === "menager"
  ) {
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
    const rows = items
      .map((it) => ({
        user_id: user.id,
        date: str(it.date) ?? today,
        name: str(it.name) ?? "Repas",
        meal: str(it.meal),
        calories: int(it.calories),
        proteins: num(it.proteins),
        carbs: num(it.carbs),
        fats: num(it.fats),
      }))
      .filter(
        (r) =>
          r.name !== "Repas" ||
          r.meal ||
          r.calories != null ||
          r.proteins != null ||
          r.carbs != null ||
          r.fats != null,
      );
    if (!rows.length) return 0;
    const { error, count } = await supabase.from("nutrition").insert(rows, { count: "exact" });
    if (error) throw error;
    return count ?? rows.length;
  }

  if (module === "body") {
    // Bornes alignées sur les CHECK constraints en base — toute valeur hors plage est ignorée
    // pour éviter qu'un PDF mal interprété fasse échouer toute l'insertion.
    const inRange = (v: unknown, min: number, max: number) => {
      const n = num(v);
      return n != null && n >= min && n <= max ? n : null;
    };
    const rows = items
      .map((it) => ({
        user_id: user.id,
        date: str(it.date) ?? today,
        weight: inRange(it.weight, 20, 500),
        body_fat: inRange(it.body_fat, 1, 70),
        muscle_mass: inRange(it.muscle_mass, 1, 100),
        chest: inRange(it.chest, 30, 250),
        waist: inRange(it.waist, 30, 250),
        hips: inRange(it.hips, 30, 250),
        left_arm: inRange(it.left_arm, 10, 100),
        right_arm: inRange(it.right_arm, 10, 100),
        left_thigh: inRange(it.left_thigh, 20, 150),
        right_thigh: inRange(it.right_thigh, 20, 150),
        notes: str(it.notes),
      }))
      .filter(
        (r) =>
          r.weight != null ||
          r.body_fat != null ||
          r.muscle_mass != null ||
          r.chest != null ||
          r.waist != null ||
          r.hips != null ||
          r.left_arm != null ||
          r.right_arm != null ||
          r.left_thigh != null ||
          r.right_thigh != null ||
          Boolean(r.notes),
      );
    if (!rows.length) return 0;
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
      const exs = Array.isArray(it.exercises)
        ? (it.exercises as Array<Record<string, unknown>>)
        : [];
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
