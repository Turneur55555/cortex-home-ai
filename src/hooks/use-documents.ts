import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FunctionsFetchError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";

// Classifications possibles pour un document. Toutes ne mènent pas à une
// écriture en base : "habits"/"menager" n'ont aucune table métier (modules
// retirés en juillet 2026, volontairement non recréés — voir
// docs/architecture/documents-deposit-pipeline.md), "pharmacie" générique
// (analyses, comptes-rendus) reste archivée sans forcer un schéma inadapté.
export type DocModule =
  | "alimentation"
  | "pharmacie"
  | "habits"
  | "menager"
  | "nutrition"
  | "fitness"
  | "body"
  | "documents";

export const MODULE_LABELS: Record<DocModule, string> = {
  alimentation: "Alimentation",
  pharmacie: "Santé / Pharmacie",
  habits: "Garde-robe",
  menager: "Ménager",
  nutrition: "Nutrition",
  fitness: "Séances",
  body: "Mesures corporelles",
  documents: "Document générique",
};

export type FitnessJournalEntry = {
  date?: string;
  name: string;
  duration_minutes?: number;
  exercises?: Array<{ name: string; sets?: number; reps?: number; weight?: number }>;
  notes?: string;
};

// Réponse de l'edge function analyze-pdf — pure analyse, n'écrit jamais en base.
export type AnalysisResult = {
  summary: string;
  key_insights: string[];
  alerts: string[];
  detected_modules: DocModule[];
  modules: {
    body?: Array<Record<string, unknown>>;
    nutrition?: Array<Record<string, unknown>>;
    supplements?: Array<Record<string, unknown>>;
    fitness_template?: Array<Record<string, unknown>>;
    fitness_journal?: FitnessJournalEntry[];
    documents?: Array<Record<string, unknown>>;
  };
};

// Réponse du RPC transactionnel deposit_document_analysis.
export type ModuleDepositReport = {
  written: Array<Record<string, unknown>>;
  skipped: Array<Record<string, unknown>>;
};
export type DepositReport = Partial<
  Record<"body" | "nutrition" | "supplements" | "fitness_template", ModuleDepositReport>
>;

export type DepositResult = {
  doc: Tables<"documents">;
  analysis: AnalysisResult;
  report: DepositReport;
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
  // iOS Safari peut rapporter un type MIME vide pour HEIC — fallback extension.
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

// Compression canvas — HEIC/HEIF exclus car les navigateurs ne savent pas les
// dessiner sur un canvas ; l'edge function les gère nativement via magic bytes.
async function compressImage(file: File): Promise<Blob> {
  const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
  if (isHeic) return file;

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

// Chaque étape réseau du pipeline est bornée par un timeout explicite : si une
// promesse ne se résout jamais (cause historique du blocage "Analyse 1/1…"),
// la mutation échoue proprement avec un message qui identifie l'étape en
// cause, au lieu de laisser isPending=true indéfiniment.
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: l'étape "${label}" n'a pas répondu après ${Math.round(ms / 1000)}s.`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function friendlyFunctionError(fnErr: unknown, isImage: boolean): string {
  let msg = isImage
    ? "Impossible d'analyser cette image. Essayez un format JPG ou PNG clair."
    : "Impossible d'analyser ce document. Vérifiez que le fichier n'est pas corrompu.";
  if (fnErr instanceof FunctionsFetchError) {
    msg = "Service d'analyse inaccessible (erreur réseau). Réessaie dans un instant.";
  }
  return msg;
}

/**
 * Pipeline unique de déversement : upload → analyse IA (analyze-pdf) →
 * écriture transactionnelle dans les modules concernés (RPC
 * deposit_document_analysis). Un seul appel = un clic sur "Déverser".
 */
export function useDeposeDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<DepositResult> => {
      let stage = "start";
      let createdDocId: string | null = null;
      let analysisSaved = false;
      const mark = (s: string) => {
        stage = s;
      };

      try {
        mark("auth:getUser");
        const {
          data: { user },
        } = await withTimeout(supabase.auth.getUser(), 10_000, "auth.getUser");
        if (!user) throw new Error("Non authentifié");

        const isImage = isImageFile(file);
        const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        if (!isImage && !isPdf) {
          throw new Error("Format non supporté (PDF, JPG, PNG, WEBP, HEIC)");
        }
        if (file.size > 15 * 1024 * 1024) throw new Error("Fichier trop volumineux (max 15 Mo)");

        let uploadBlob: Blob = file;
        let contentType = file.type || "application/pdf";
        const displayName = file.name.replace(/\.(heic|heif)$/i, ".jpg");

        if (isImage) {
          mark("compress:image");
          uploadBlob = await compressImage(file);
          contentType = "image/jpeg";
        }

        const path = `${user.id}/${Date.now()}-${displayName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

        mark("storage:upload");
        const { error: upErr } = await withTimeout(
          supabase.storage.from("pdf-documents").upload(path, uploadBlob, { contentType, upsert: false }),
          30_000,
          "storage.upload",
        );
        if (upErr) throw upErr;

        // Ligne "documents" créée avant l'analyse (module provisoire) pour que
        // le RPC de déversement ait un document_id à référencer en traçabilité.
        mark("db:insert-stub");
        const { data: stubDoc, error: stubErr } = await withTimeout(
          supabase
            .from("documents")
            .insert({ user_id: user.id, name: displayName, storage_path: path, module: "documents" })
            .select()
            .single(),
          15_000,
          "documents.insert (stub)",
        );
        if (stubErr) throw stubErr;
        createdDocId = stubDoc.id;

        mark("edge-function:invoke");
        const { data: ai, error: fnErr } = await withTimeout(
          supabase.functions.invoke("analyze-pdf", {
            body: { storage_path: path, name: displayName },
          }),
          60_000,
          "functions.invoke(analyze-pdf)",
        );
        if (fnErr) throw new Error(friendlyFunctionError(fnErr, isImage));
        if ((ai as { error?: string })?.error) throw new Error((ai as { error: string }).error);

        const analysis = ai as AnalysisResult;
        const primaryModule: DocModule = (analysis.detected_modules?.[0] as DocModule) ?? "documents";

        mark("db:update-analysis");
        const { data: updatedDoc, error: updErr } = await withTimeout(
          supabase
            .from("documents")
            .update({
              module: primaryModule,
              summary: analysis.summary,
              key_insights: analysis.key_insights,
              alerts: analysis.alerts,
              extracted_items: (analysis.modules?.documents ?? []) as never,
            })
            .eq("id", createdDocId)
            .select()
            .single(),
          15_000,
          "documents.update (analyse)",
        );
        if (updErr) throw updErr;
        analysisSaved = true;

        const depositPayload: Record<string, unknown> = {};
        if (analysis.modules?.body?.length) depositPayload.body = analysis.modules.body;
        if (analysis.modules?.nutrition?.length) depositPayload.nutrition = analysis.modules.nutrition;
        if (analysis.modules?.supplements?.length) depositPayload.supplements = analysis.modules.supplements;
        if (analysis.modules?.fitness_template?.length)
          depositPayload.fitness_template = analysis.modules.fitness_template;

        let report: DepositReport = {};
        if (Object.keys(depositPayload).length > 0) {
          mark("rpc:deposit");
          const { data: reportData, error: rpcErr } = await withTimeout(
            supabase.rpc("deposit_document_analysis", {
              p_document_id: createdDocId,
              p_modules: depositPayload as Json,
            }),
            20_000,
            "rpc.deposit_document_analysis",
          );
          if (rpcErr) throw rpcErr;
          report = reportData as DepositReport;
        }

        return { doc: updatedDoc, analysis, report };
      } catch (e) {
        console.error(`[Documents] échec à l'étape "${stage}"`, e);
        // Nettoyage best-effort : ne pas laisser un document "stub" sans
        // analyse dans l'historique si l'échec survient avant que l'analyse
        // ait pu être enregistrée dessus.
        if (createdDocId && !analysisSaved) {
          void supabase.from("documents").delete().eq("id", createdDocId);
        }
        throw e;
      }
    },
    onSuccess: ({ report, analysis }) => {
      const modulesLabel = analysis.detected_modules?.map((m) => MODULE_LABELS[m] ?? m).join(", ");
      toast.success(modulesLabel ? `Document analysé — ${modulesLabel}` : "Document analysé");
      qc.invalidateQueries({ queryKey: ["documents"] });
      if (report.body) qc.invalidateQueries({ queryKey: ["body_tracking"] });
      if (report.nutrition) qc.invalidateQueries({ queryKey: ["nutrition"] });
      if (report.supplements) qc.invalidateQueries({ queryKey: ["supplements"] });
      if (report.fitness_template) qc.invalidateQueries({ queryKey: ["fitness", "workout_templates"] });
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
