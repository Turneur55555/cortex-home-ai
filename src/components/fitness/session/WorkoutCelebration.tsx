// ============================================================
// Primitive visuelle partagée de l'écran de clôture de séance (confetti) —
// utilisée par SessionRewardScreen (écran XP/Progression RPG).
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
        left: `${5 + ((i * 3.9) % 92)}%`,
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
