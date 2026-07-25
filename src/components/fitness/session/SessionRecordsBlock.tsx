// ============================================================
// Bloc "Records" — journal de progression (refonte 25/07/2026). N'affiche
// QUE les exercices ayant établi un nouveau record dans cette séance
// (fourni déjà filtré par l'appelant, via `computeRecordsBySession` côté
// musculation ou `useDisciplineSegmentHistory` côté disciplines
// génériques) — plus jamais la liste complète des exercices ici.
// Remplace le badge Trophy jusque-là répété sous chaque exercice : cette
// info vit maintenant à un seul endroit.
// ============================================================

import { Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { EASE_OUT } from "@/components/rpg/premium/tokens";

export interface SessionRecordEntry {
  key: string;
  name: string;
  valueLabel: string;
  deltaLabel?: string | null;
}

export function SessionRecordsBlock({ records }: { records: SessionRecordEntry[] }) {
  if (records.length === 0) return null;
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-amber-400/15 bg-amber-400/[0.04]">
      <ul className="divide-y divide-amber-400/10">
        {records.map((r, i) => (
          <motion.li
            key={r.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.05, ease: EASE_OUT }}
            className="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span className="truncate text-[13px] font-semibold text-amber-100">{r.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-[13px] font-bold tabular-nums text-amber-300">
              {r.valueLabel}
              {r.deltaLabel && (
                <span className="text-[11px] font-semibold text-amber-400/80">{r.deltaLabel}</span>
              )}
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
