import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type UserPdf = {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  created_at: string;
};

const QK = ["user_pdfs"] as const;
const MAX_SIZE = 50 * 1024 * 1024; // 50 Mo

export function useUserPdfs() {
  return useQuery({
    queryKey: QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_pdfs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as UserPdf[];
    },
  });
}

export function useUploadPdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");

      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) throw new Error("Seuls les fichiers PDF sont acceptés");
      if (file.size > MAX_SIZE) throw new Error("Fichier trop volumineux (max 50 Mo)");

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("pdfs")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { data, error: insErr } = await supabase
        .from("user_pdfs")
        .insert({ user_id: user.id, file_name: file.name, file_path: path, file_size: file.size })
        .select()
        .single();

      if (insErr) {
        await supabase.storage.from("pdfs").remove([path]);
        throw new Error(insErr.message);
      }
      return data as UserPdf;
    },
    onSuccess: () => {
      toast.success("PDF ajouté");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pdf: UserPdf) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non authentifié");
      await supabase.storage.from("pdfs").remove([pdf.file_path]);
      const { error } = await supabase
        .from("user_pdfs")
        .delete()
        .eq("id", pdf.id)
        .eq("user_id", user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("PDF supprimé");
      qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export async function getPdfSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("pdfs")
    .createSignedUrl(filePath, 3600);
  if (error || !data?.signedUrl) throw new Error("Impossible d'obtenir l'URL du PDF");
  return data.signedUrl;
}
