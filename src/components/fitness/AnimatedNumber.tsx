import { useEffect, useState } from "react";
import { animate, useMotionValue, useMotionValueEvent } from "framer-motion";

/**
 * Compteur animé — anime la valeur affichée de son ancienne valeur vers la
 * nouvelle (ease-out, ~0.8s). Purement visuel : ne recalcule rien, se
 * contente d'interpoler un nombre déjà calculé ailleurs (PerfTile).
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  suffix = "",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
}) {
  const motionValue = useMotionValue(value);
  const [display, setDisplay] = useState(() => value.toFixed(decimals));

  useMotionValueEvent(motionValue, "change", (latest) => {
    setDisplay(latest.toFixed(decimals));
  });

  useEffect(() => {
    const controls = animate(motionValue, value, { duration: 0.8, ease: "easeOut" });
    return controls.stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span>
      {display}
      {suffix}
    </span>
  );
}
