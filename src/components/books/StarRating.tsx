import { Star } from "lucide-react";
import { RATING_WORDS } from "./bookLabels";

export function StarRating({
  value,
  onChange,
  size = "lg",
}: {
  value: number | null;
  onChange?: (v: number | null) => void;
  size?: "sm" | "lg";
}) {
  const icon = size === "lg" ? "h-8 w-8" : "h-3.5 w-3.5";
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex items-center gap-1"
        role={onChange ? "radiogroup" : "img"}
        aria-label={value ? `Note ${value} sur 5` : "Pas de note"}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value != null && n <= value;
          const star = (
            <Star
              className={`${icon} transition-transform ${
                on ? "fill-primary text-primary" : "text-muted-foreground/35"
              }`}
              strokeWidth={1.5}
            />
          );
          return onChange ? (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} sur 5`}
              onClick={() => onChange(value === n ? null : n)}
              className="p-1 active:scale-90"
            >
              {star}
            </button>
          ) : (
            <span key={n}>{star}</span>
          );
        })}
      </div>
      {size === "lg" && (
        <p className="h-4 text-xs font-medium text-muted-foreground">
          {value ? RATING_WORDS[value] : onChange ? "Touche pour noter" : ""}
        </p>
      )}
    </div>
  );
}
