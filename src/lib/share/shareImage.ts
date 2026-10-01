import { toPng } from "html-to-image";

/**
 * G28 — LA CAPTURE ET LE PARTAGE D'UNE IMAGE, UNE SEULE FOIS POUR TOUTES LES CARTES.
 *
 * Avant, la fin de séance et l'affiche de rang portaient chacune leur copie de ce code (capture →
 * blob → partage natif → repli en téléchargement), avec deux comportements qui divergeaient en
 * silence. Un troisième moment partageable (la semaine) en aurait fait une troisième copie.
 *
 * On capture UNIQUEMENT le nœud passé — jamais l'écran. Le résultat dit ce qui s'est réellement
 * passé : l'appelant n'a jamais à deviner si quelque chose est parti.
 *
 *  - `shared`     : la feuille de partage native a reçu l'image ;
 *  - `downloaded` : le partage de fichiers n'est pas disponible (ou a échoué autrement que par une
 *                   annulation) — l'image a été enregistrée à la place. Ne rien faire, alors que
 *                   l'utilisateur vient de toucher « Partager », serait pire ;
 *  - `cancelled`  : l'utilisateur a fermé la feuille — jamais un téléchargement imposé après coup ;
 *  - `failed`     : la capture ou l'enregistrement ont échoué — rien n'est parti.
 */
export type ShareOutcome = "shared" | "downloaded" | "cancelled" | "failed";

export type ShareMode = "share" | "download";

export interface ShareImageOptions {
  filename: string;
  title: string;
  text: string;
  /** `share` (défaut) : partage natif si possible, sinon téléchargement. `download` : toujours téléchargement. */
  mode?: ShareMode;
  width?: number;
  height?: number;
  /** 2 par défaut : un nœud de 540×960 donne une image de 1080×1920. */
  pixelRatio?: number;
  /** Fond de l'image — transparent si absent. Aucune couleur n'est choisie ici : c'est à l'appelant. */
  backgroundColor?: string;
  /**
   * Désactivé par défaut : `cacheBust` ajoute un paramètre d'URL, ce qui invaliderait la signature
   * des URLs signées Supabase (vignettes d'exercices).
   */
  cacheBust?: boolean;
}

type ShareNavigator = Navigator & {
  canShare?: (data: ShareData) => boolean;
  share?: (data: ShareData) => Promise<void>;
};

export async function renderPng(node: HTMLElement, options: ShareImageOptions): Promise<Blob> {
  const dataUrl = await toPng(node, {
    pixelRatio: options.pixelRatio ?? 2,
    backgroundColor: options.backgroundColor,
    cacheBust: options.cacheBust ?? false,
    width: options.width,
    height: options.height,
  });
  return (await fetch(dataUrl)).blob();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Pas de révocation immédiate : certains navigateurs n'ont pas encore démarré le téléchargement.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isAbort(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === "AbortError";
}

export async function shareImage(
  node: HTMLElement,
  options: ShareImageOptions,
): Promise<ShareOutcome> {
  let blob: Blob;
  try {
    blob = await renderPng(node, options);
  } catch {
    return "failed";
  }

  const nav = navigator as ShareNavigator;
  const file = new File([blob], options.filename, { type: "image/png" });
  if ((options.mode ?? "share") === "share" && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: options.title, text: options.text });
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "cancelled";
      // Autre échec du partage natif (autorisation expirée pendant le rendu, par exemple) :
      // on enregistre l'image plutôt que de ne rien livrer.
    }
  }

  try {
    downloadBlob(blob, options.filename);
    return "downloaded";
  } catch {
    return "failed";
  }
}
