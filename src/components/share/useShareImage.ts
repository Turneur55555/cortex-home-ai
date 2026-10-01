import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { EXPORT_BACKGROUND } from "@/components/share/ShareExportFrame";
import { shareImage, type ShareImageOptions, type ShareMode } from "@/lib/share/shareImage";

/**
 * G28 — le geste « Partager » des cartes : capture du nœud, partage ou enregistrement, et dire ce
 * qui s'est passé. `lib/share/shareImage.ts` porte la règle ; ce hook ne fait que la brancher à
 * l'écran (nœud, verrou anti double-appui, retour à l'utilisateur).
 *
 * Retour à l'utilisateur : une image enregistrée à la place du partage est annoncée (sinon un
 * téléchargement silencieux ressemble à un bouton cassé) ; un échec l'est aussi — l'ancien
 * comportement ne disait rien du tout. Une feuille de partage fermée par l'utilisateur ne produit
 * jamais de message : ce n'est pas une erreur.
 */
export function useShareImage() {
  const exportRef = useRef<HTMLDivElement>(null);
  const running = useRef(false);
  const [busy, setBusy] = useState<ShareMode | null>(null);

  const run = useCallback(async (options: ShareImageOptions) => {
    const node = exportRef.current;
    if (!node || running.current) return null;
    running.current = true;
    setBusy(options.mode ?? "share");
    try {
      const outcome = await shareImage(node, { backgroundColor: EXPORT_BACKGROUND, ...options });
      if (outcome === "downloaded") toast.success("Image enregistrée");
      else if (outcome === "failed") toast.error("Impossible de créer l'image");
      return outcome;
    } finally {
      running.current = false;
      setBusy(null);
    }
  }, []);

  return { exportRef, busy, run };
}
