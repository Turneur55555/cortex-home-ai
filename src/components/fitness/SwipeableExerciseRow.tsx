import { useRef } from "react";
import { Trash2 } from "lucide-react";

export function SwipeableExerciseRow({
  onDelete,
  children,
}: {
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const currentOffset = useRef(0);
  const dragging = useRef(false);
  const THRESHOLD = 72;

  const applyOffset = (offset: number, animate = false) => {
    if (!contentRef.current) return;
    contentRef.current.style.transition = animate ? "transform 0.18s ease" : "none";
    contentRef.current.style.transform = `translateX(${offset}px)`;
    currentOffset.current = offset;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    dragging.current = true;
    applyOffset(currentOffset.current, false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const delta = e.touches[0].clientX - startX.current + currentOffset.current;
    if (delta < 0) applyOffset(Math.max(delta, -(THRESHOLD + 6)), false);
  };

  const handleTouchEnd = () => {
    dragging.current = false;
    if (currentOffset.current <= -THRESHOLD / 2) {
      applyOffset(-THRESHOLD, true);
    } else {
      applyOffset(0, true);
    }
  };

  return (
    <li className="relative overflow-hidden rounded-lg list-none">
      <div className="absolute inset-y-0 right-0 flex w-[72px] items-center justify-center rounded-r-lg bg-destructive/90">
        <button
          type="button"
          onClick={() => { applyOffset(0, true); onDelete(); }}
          className="flex h-9 w-9 items-center justify-center text-white"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={contentRef}
        className="relative bg-card"
        style={{ transform: "translateX(0px)", zIndex: 1 }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </li>
  );
}
