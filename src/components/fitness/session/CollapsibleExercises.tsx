// ============================================================
// Liste d'exercices repliable — journal de progression (refonte
// 25/07/2026). Par défaut repliée ("Voir les N exercices") : les exploits
// de la séance (Moments forts, Records) se lisent avant le détail complet.
// Une fois ouverte, comportement strictement identique à avant (accordéon
// par exercice inchangé) — ce composant ne fait qu'ajouter un niveau de
// repli au-dessus, sans toucher au contenu qu'il enveloppe.
// ============================================================

import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ReactNode } from "react";
import { EASE_OUT } from "@/components/rpg/premium/tokens";

export function CollapsibleExercises({
  count,
  open,
  onToggle,
  children,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="px-4 pb-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
        aria-expanded={open}
      >
        <span>
          {open ? "Masquer les exercices" : `Voir les ${count} exercice${count > 1 ? "s" : ""}`}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
