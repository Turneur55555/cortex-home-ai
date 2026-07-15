// ============================================================
// Primitives visuelles partagées de l'écran de clôture de séance —
// extraites de WorkoutSummaryOverlay.tsx (musculation) en Addendum 3
// (2026-07-15, audit convergence UX) pour que GenericWorkoutSummaryOverlay
// (5 autres disciplines) ait EXACTEMENT la même célébration (confetti,
// gabarit de tuile) sans dupliquer le CSS. Aucune logique métier ici
// (1RM/tonnage restent dans WorkoutSummaryOverlay, propres à muscu).
// ============================================================

import { useMemo } from "react";

const CONFETTI_STYLE = `
@keyframes confettiBurst {
  0%   { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
  100% { transform: translateY(-70vh) rotate(720deg) scale(0.4); opacity: 0; }
}
`;

const COLORS = ["#6c63ff", "#f59e0b", "#22c55e", "#ec4899", "#06b6d4", "#f97316"];

export function Confetti() {
  const particles = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        left: `${5 + (i * 3.9) % 92}%`,
        color: COLORS[i % COLORS.length],
        delay: `${(i * 0.04).toFixed(2)}s`,
        duration: `${(0.8 + (i % 5) * 0.22).toFixed(2)}s`,
        size: 5 + (i % 4) * 2,
        shape: i % 3 === 0 ? "2px" : "50%",
      })),
    [],
  );

  return (
    <>
      <style>{CONFETTI_STYLE}</style>
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            style={{
              position: "absolute",
              bottom: "30%",
              left: p.left,
              width: p.size,
              height: p.size,
              borderRadius: p.shape,
              background: p.color,
              animation: `confettiBurst ${p.duration} ${p.delay} ease-out forwards`,
            }}
          />
        ))}
      </div>
    </>
  );
}

export function SummaryStatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.04] p-3 text-center">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold leading-none">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[9px] text-muted-foreground/60">{sub}</p>}
    </div>
  );
}
