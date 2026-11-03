import { ImageOff } from "lucide-react";
import type { WardrobeItemView } from "@/hooks/useWardrobe";
import { cn } from "@/lib/utils";

/**
 * La tenue « à plat » (Refonte Dressing, variante A) — un seul rendu de tenue
 * pour tout le module : Aujourd'hui, la semaine, Composer, le journal et la
 * tuile de l'Accueil. Remplace l'ancienne rangée de vignettes.
 *
 * Mise en scène façon lookbook : fond studio clair, le haut au-dessus du bas,
 * chaussures en bas à droite, veste derrière le haut, accessoire en bas à
 * gauche. Une photo détourée (fond transparent) se pose directement ; une
 * photo brute reste encadrée, pour ne jamais coller un décor sur le fond.
 */

/** Fond studio : clair dans les deux thèmes, comme une photo de catalogue. */
export const STUDIO_BACKGROUND =
  "radial-gradient(120% 90% at 50% 28%, #F5F2ED 0%, #E4DED4 68%, #D8D1C5 100%)";

type Slot = "top" | "bottom" | "outerwear" | "shoes" | "accessory";

function slotOf(piece: WardrobeItemView): Slot | null {
  switch (piece.category) {
    case "top":
      return "top";
    case "bottom":
      return "bottom";
    case "outerwear":
      return "outerwear";
    case "shoes":
      return "shoes";
    case "accessory":
      return "accessory";
    default:
      return null;
  }
}

/** Positions en % du cadre ; le haut se décale quand une veste est posée derrière. */
const PLACEMENT: Record<Slot, string> = {
  outerwear: "left-[2%] top-[5%] w-[54%] z-0",
  top: "left-[18%] top-0 w-[64%] z-20",
  bottom: "left-[24%] top-[43%] w-[52%] z-10",
  shoes: "right-[3%] bottom-[2%] w-[30%] z-30",
  accessory: "left-[3%] bottom-[5%] w-[22%] z-30",
};
const TOP_WITH_LAYER = "left-[34%] top-[2%] w-[58%] z-20";

/** L'image affichée est la version détourée dès qu'elle existe (`pickDisplayStoragePath`). */
function isCutout(piece: WardrobeItemView): boolean {
  return !!piece.processed_storage_path;
}

function PieceImage({ piece, compact }: { piece: WardrobeItemView; compact: boolean }) {
  if (!piece.imageUrl) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-black/5 text-[#8a8378]">
        <ImageOff className={compact ? "h-3 w-3" : "h-5 w-5"} />
      </div>
    );
  }
  if (isCutout(piece)) {
    return (
      <img
        src={piece.imageUrl}
        alt={piece.name ?? "Pièce de la tenue"}
        loading="lazy"
        draggable={false}
        className="block aspect-square w-full object-contain drop-shadow-[0_8px_10px_rgba(60,45,30,0.22)]"
      />
    );
  }
  return (
    <img
      src={piece.imageUrl}
      alt={piece.name ?? "Pièce de la tenue"}
      loading="lazy"
      draggable={false}
      className={cn(
        "block aspect-square w-full object-cover shadow-[0_8px_18px_-6px_rgba(60,45,30,0.45)]",
        compact ? "rounded-md" : "rounded-2xl",
      )}
    />
  );
}

/** Silhouette de chaussure en pointillés : ce qui manque à la tenue. */
function MissingShoes({ withLabel }: { withLabel: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 120 60" className="w-full" aria-hidden>
        <path
          d="M8 44 Q9 24 26 22 L48 19 Q58 31 76 33 L100 37 Q113 39 113 49 L113 53 L8 53 Z"
          fill="none"
          stroke="#9b958b"
          strokeWidth="2"
          strokeDasharray="4 3.5"
        />
      </svg>
      {withLabel && (
        <span className="whitespace-nowrap text-[10px] font-semibold text-[#8a8378]">
          Chaussures ?
        </span>
      )}
    </div>
  );
}

export function OutfitLook({
  pieces,
  size = "card",
  showMissingShoes = false,
  forgottenIds,
  className,
}: {
  pieces: WardrobeItemView[];
  /** hero : Aujourd'hui · card : listes · mini : bande de la semaine. */
  size?: "hero" | "card" | "mini";
  showMissingShoes?: boolean;
  forgottenIds?: ReadonlyArray<string>;
  className?: string;
}) {
  const compact = size === "mini";
  const bySlot = new Map<Slot, WardrobeItemView>();
  for (const piece of pieces) {
    const slot = slotOf(piece);
    if (slot && !bySlot.has(slot)) bySlot.set(slot, piece);
  }
  const hasLayer = bySlot.has("outerwear");

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden",
        size === "hero" ? "aspect-[6/5]" : size === "card" ? "aspect-[4/3]" : "aspect-[4/5]",
        className,
      )}
      style={size === "hero" ? undefined : { background: STUDIO_BACKGROUND }}
      role="img"
      aria-label={pieces.map((p) => p.name ?? "Pièce").join(" + ") || "Tenue"}
    >
      <div
        className={cn(
          "absolute",
          size === "hero"
            ? "inset-x-[17%] bottom-[11%] top-[2%]"
            : size === "card"
              ? "inset-x-[18%] inset-y-[4%]"
              : "inset-[6%]",
        )}
      >
        {[...bySlot.entries()].map(([slot, piece]) => (
          <div
            key={piece.id}
            className={cn(
              "absolute",
              slot === "top" && hasLayer ? TOP_WITH_LAYER : PLACEMENT[slot],
            )}
          >
            <PieceImage piece={piece} compact={compact} />
            {forgottenIds?.includes(piece.id) && !compact && (
              <span className="absolute left-1 top-1 rounded-full bg-white/85 px-1.5 py-0.5 text-[9px] font-semibold text-[#7a5a12]">
                Oubliée
              </span>
            )}
          </div>
        ))}
        {showMissingShoes && !bySlot.has("shoes") && (
          <div className={cn("absolute", PLACEMENT.shoes)}>
            <MissingShoes withLabel={size === "card"} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Une pièce seule sur fond studio (grille du Vestiaire, pièce fétiche, oubliées). */
export function PieceTile({
  piece,
  badge,
  className,
}: {
  piece: WardrobeItemView;
  badge?: string | null;
  className?: string;
}) {
  const cutout = isCutout(piece);
  return (
    <div
      className={cn("relative aspect-[3/4] w-full overflow-hidden", className)}
      style={{ background: STUDIO_BACKGROUND }}
    >
      {piece.imageUrl ? (
        <img
          src={piece.imageUrl}
          alt={piece.name ?? "Pièce du dressing"}
          loading="lazy"
          className={cn(
            "h-full w-full",
            cutout
              ? "object-contain p-[10%] drop-shadow-[0_8px_10px_rgba(60,45,30,0.22)]"
              : "object-cover",
          )}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[#8a8378]">
          <ImageOff className="h-5 w-5" />
        </div>
      )}
      {badge && (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-[#14121c]/80 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
          {badge}
        </span>
      )}
    </div>
  );
}
