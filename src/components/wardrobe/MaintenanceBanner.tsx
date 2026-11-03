import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Wand2 } from "lucide-react";
import type { WardrobeItemView } from "@/hooks/useWardrobe";
import { detectWardrobeFixes, itemsWithoutCutout } from "@/lib/wardrobe/dataQuality";

/** Lien vers « Remise à niveau », visible seulement s'il reste quelque chose à faire. */
export function MaintenanceBanner({ items }: { items: WardrobeItemView[] }) {
  const photos = itemsWithoutCutout(items).length;
  const fixes = useMemo(() => detectWardrobeFixes(items).length, [items]);
  if (photos === 0 && fixes === 0) return null;
  const parts = [
    photos > 0 ? `${photos} photo${photos > 1 ? "s" : ""} à détourer` : null,
    fixes > 0 ? `${fixes} correction${fixes > 1 ? "s" : ""}` : null,
  ].filter(Boolean);
  return (
    <Link
      to="/dressing/remise-a-niveau"
      className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-3.5 py-3 transition-opacity active:opacity-80"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
        <Wand2 className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Remise à niveau</span>
        <span className="block truncate text-xs text-muted-foreground">{parts.join(" · ")}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
