import type { Ref } from "react";
import { ShareSignature, type SignatureRank } from "@/components/share/ShareSignature";

/** Une image exportée fait 540×960 CSS — 1080×1920 après `pixelRatio: 2`. */
export const EXPORT_WIDTH = 540;
export const EXPORT_HEIGHT = 960;
export const EXPORT_BACKGROUND = "#050505";

/**
 * G28 — LE NŒUD D'EXPORT 9:16, UNE SEULE FOIS.
 *
 * Rendu hors écran et capturé SEUL (`lib/share/shareImage.ts`) : jamais une capture de l'écran. Le
 * pied de carte signé est ajouté ici, donc sur toute carte qui passe par ce cadre — une carte
 * n'a pas à penser à se signer.
 */
export function ShareExportFrame({
  exportRef,
  rank,
  children,
}: {
  exportRef: Ref<HTMLDivElement>;
  rank?: SignatureRank | null;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed left-[-10000px] top-0"
      style={{ width: EXPORT_WIDTH, height: EXPORT_HEIGHT }}
    >
      <div
        ref={exportRef}
        className="flex h-full w-full flex-col items-center justify-center px-8"
        style={{ background: "linear-gradient(180deg, #0a0908 0%, #050505 100%)" }}
      >
        {children}
        <ShareSignature rank={rank} />
      </div>
    </div>
  );
}
