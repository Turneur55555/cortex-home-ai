import { useRef, type ReactNode } from "react";
import { Trash2 } from "lucide-react";

/**
 * Ligne d'aliment avec swipe-to-delete style iOS.
 * - Glissement fluide en temps réel (translate suit le doigt).
 * - Bouton suppression compact (icône seule, coins arrondis).
 * - Tap sur la carte = onTap (édition). Tap pendant un swipe = ferme le swipe.
 * - Après suppression, le swipe se referme automatiquement.
 */
export function SwipeableNutritionItem({
  onDelete,
  onTap,
  children,
}: {
  onDelete: () => void;
  onTap: () => void;
  children: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const baseOffset = useRef(0);
  const offset = useRef(0);
  const dragging = useRef(false);
  const moved = useRef(false);

  // Largeur du bouton + petit padding visuel
  const ACTION_WIDTH = 64;
  const REVEAL = ACTION_WIDTH + 8;
  const TRIGGER = ACTION_WIDTH / 2;

  const apply = (x: number, animate: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate
      ? "transform 260ms cubic-bezier(0.32, 0.72, 0, 1)"
      : "none";
    el.style.transform = `translate3d(${x}px, 0, 0)`;
    offset.current = x;
  };

  const close = (animate = true) => apply(0, animate);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    baseOffset.current = offset.current;
    dragging.current = true;
    moved.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current + baseOffset.current;
    if (Math.abs(dx - baseOffset.current) > 6) moved.current = true;
    // Bornes : 0 (fermé) à -REVEAL avec un léger over-drag amorti
    let x = Math.min(0, dx);
    if (x < -REVEAL) x = -REVEAL + (x + REVEAL) * 0.25;
    apply(x, false);
  };

  const handleTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    apply(offset.current <= -TRIGGER ? -ACTION_WIDTH : 0, true);
  };

  const handleClick = () => {
    // Si swipe ouvert ou déplacement notable, on absorbe le tap et on referme.
    if (offset.current < -2 || moved.current) {
      close(true);
      return;
    }
    onTap();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    close(false);
    onDelete();
  };

  return (
    <li className="relative overflow-hidden rounded-2xl">
      {/* Zone d'action révélée — compacte, icône seule */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end pr-1"
        aria-hidden
      >
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Supprimer l'aliment"
          className="flex h-[calc(100%-8px)] w-14 items-center justify-center rounded-xl bg-destructive text-white shadow-sm transition-colors active:bg-destructive/80"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Contenu — translaté pendant le swipe */}
      <div
        ref={contentRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTap();
          }
        }}
        className="relative rounded-2xl border border-border bg-card will-change-transform"
        style={{ transform: "translate3d(0,0,0)" }}
      >
        {children}
      </div>
    </li>
  );
}
