import { ImageOff } from "lucide-react";
import type { WardrobeItemView } from "@/hooks/useWardrobe";
import { cn } from "@/lib/utils";

/**
 * Vignettes des pièces d'une tenue — un seul rendu partagé par Générer une
 * tenue, Mes tenues de la semaine, le Journal et la Tenue du jour.
 * Une pièce marquée « oubliée » porte une petite pastille.
 */
export function OutfitThumbnails({
  pieces,
  forgottenIds,
  size = "md",
  single = false,
}: {
  pieces: WardrobeItemView[];
  forgottenIds?: ReadonlyArray<string>;
  size?: "sm" | "md";
  /** Une vignette seule qui occupe toute la largeur de son conteneur. */
  single?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid",
        single ? "grid-cols-1" : "grid-cols-4",
        size === "sm" ? "gap-1.5" : "gap-2",
      )}
    >
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className={cn(
            "relative aspect-[3/4] overflow-hidden bg-muted/30",
            size === "sm" ? "rounded-lg" : "rounded-xl",
          )}
        >
          {piece.imageUrl ? (
            <img
              src={piece.imageUrl}
              alt={piece.name ?? "Pièce de la tenue"}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageOff className="h-4 w-4" />
            </div>
          )}
          {forgottenIds?.includes(piece.id) && (
            <span className="absolute left-1 top-1 rounded-full bg-background/85 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
              Oubliée
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
