import { useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { Camera, ImageIcon, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet } from "@/components/shared/FormComponents";
import { fileToBase64Compressed } from "@/lib/nutrition/utils";
import type { MealPrefill } from "@/lib/nutrition/utils";

interface MealScanSheetProps {
  onClose: () => void;
  onResult: (p: MealPrefill) => void;
}

export function MealScanSheet({ onClose, onResult }: MealScanSheetProps) {
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const scan = useMutation({
    mutationFn: async (file: File) => {
      const { b64, mime } = await fileToBase64Compressed(file);
      setPreview(`data:${mime};base64,${b64}`);

      if (!b64 || b64.length < 100) throw new Error("Image vide ou illisible. Réessaie.");

      const { data, error } = await supabase.functions.invoke("scan-meal", {
        body: { image_base64: b64, mime_type: mime },
      });

      // Erreur réseau / infrastructure (non-2xx non géré par la fonction)
      if (error) {
        // Tente d'extraire le corps de la réponse pour un message précis
        let detail = "";
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            detail = body?.error ?? "";
          }
        } catch {/* ignore */}
        throw new Error(detail || "Erreur de connexion au service IA. Vérifie ta connexion et réessaie.");
      }

      // La fonction retourne toujours 200 — l'erreur est dans data.error
      if (data?.error) throw new Error(data.error as string);

      return data as {
        name: string;
        meal?: string;
        calories: number;
        proteins: number;
        carbs: number;
        fats: number;
        confidence?: number;
        details?: string;
      };
    },
    onSuccess: (d) => {
      onResult({
        name: d.name,
        meal: d.meal ?? "dejeuner",
        calories: String(Math.round(d.calories ?? 0)),
        proteins: String(Math.round((d.proteins ?? 0) * 10) / 10),
        carbs: String(Math.round((d.carbs ?? 0) * 10) / 10),
        fats: String(Math.round((d.fats ?? 0) * 10) / 10),
      });
      const conf = d.confidence != null ? ` (${Math.round(d.confidence * 100)}%)` : "";
      toast.success(`Repas analysé${conf} — ajuste si besoin`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPick = (f: File | null | undefined) => {
    if (!f) return;
    scan.mutate(f);
  };

  return (
    <Sheet title="Scanner mon repas" onClose={onClose}>
      <div className="space-y-4">
        {!preview && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
              <Sparkles className="h-7 w-7" />
            </div>
            <p className="text-xs text-muted-foreground">
              L'IA estime calories et macros depuis ta photo.
            </p>
          </div>
        )}
        {preview && (
          <div className="overflow-hidden rounded-2xl border border-border">
            <img src={preview} alt="Aperçu" className="max-h-64 w-full object-cover" />
          </div>
        )}
        {scan.isPending && (
          <div className="flex flex-col items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analyse en cours…
          </div>
        )}

        <input
          ref={camRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])}
        />

        <div className="flex gap-2">
          <button
            type="button"
            disabled={scan.isPending}
            onClick={() => camRef.current?.click()}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            <Camera className="h-4 w-4" />
            Photo
          </button>
          <button
            type="button"
            disabled={scan.isPending}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface text-xs font-semibold disabled:opacity-60"
          >
            <ImageIcon className="h-4 w-4" />
            Galerie
          </button>
        </div>
      </div>
    </Sheet>
  );
}
