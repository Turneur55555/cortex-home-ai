import { motion } from "framer-motion";
import { BOOK_STATUS_EDIT_ORDER, BOOK_STATUS_SINGULAR, type BookStatus } from "@/lib/books/types";

/** Sélecteur de statut façon iOS : une pastille qui glisse sous l'option choisie. */
export function StatusSegmented({
  value,
  onChange,
}: {
  value: BookStatus;
  onChange: (s: BookStatus) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Statut"
      className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-card/70 p-1 backdrop-blur"
    >
      {BOOK_STATUS_EDIT_ORDER.map((s) => {
        const active = s === value;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(s)}
            className={`relative h-10 rounded-xl text-sm font-semibold transition-colors ${
              active ? "text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {active && (
              <motion.span
                layoutId="book-status-pill"
                className="absolute inset-0 rounded-xl bg-primary shadow-[0_6px_20px_-8px_var(--primary)]"
                transition={{ type: "spring", damping: 30, stiffness: 380 }}
              />
            )}
            <span className="relative">{BOOK_STATUS_SINGULAR[s]}</span>
          </button>
        );
      })}
    </div>
  );
}
