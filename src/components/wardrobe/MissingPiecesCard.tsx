import { ShoppingBag } from "lucide-react";
import type { MissingPieceSuggestion } from "@/lib/wardrobe/missingPieces";

/**
 * « À ajouter à ton dressing » — les pièces qui débloqueraient le plus de
 * tenues, déduites du dressing réel (`suggestMissingPieces`). Rien ne
 * s'affiche quand il n'y a rien à suggérer.
 */
export function MissingPiecesCard({
  suggestions,
  limit = 3,
}: {
  suggestions: MissingPieceSuggestion[];
  limit?: number;
}) {
  const visible = suggestions.slice(0, limit);
  if (visible.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <ShoppingBag className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">À ajouter à ton dressing</p>
          <p className="text-[11px] text-muted-foreground">Ce qui débloquerait le plus de tenues</p>
        </div>
      </div>
      <ul className="space-y-2.5">
        {visible.map((s) => (
          <li key={s.key} className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">{s.title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{s.reason}</p>
            </div>
            {s.unlocks !== null && (
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                +{s.unlocks}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
