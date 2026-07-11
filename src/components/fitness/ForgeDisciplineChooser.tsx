import { X } from "lucide-react";
import { listEngines } from "@/lib/fitness/engines/registry";
import { isReadyEngine } from "@/lib/fitness/engines/types";
import type { DisciplineId } from "@/lib/fitness/engines/types";
import { DisciplineIcon } from "./session/DisciplineIcon";

// ============================================================
// Point d'entrée UNIQUE de La Forge (Phase 1 multi-discipline,
// 2026-07-11) — Nathan : "il n'existe qu'une seule Forge pour toute
// l'application". Avant, LaForgeCard ouvrait directement le catalogue
// musculation (ExerciseCatalogSheet) sans notion de discipline. Ce petit
// écran s'intercale : il liste TOUTES les disciplines réellement
// disponibles (lues depuis ENGINE_REGISTRY — zéro liste dupliquée, zéro
// if/switch(discipline), même philosophie que le reste de l'architecture
// à moteurs) puis délègue :
//   - "Musculation" → ExerciseCatalogSheet, INCHANGÉ (voir SeancesTab.tsx)
//   - toute autre discipline prête → DisciplineExerciseLibrarySheet
//     (nouveau, générique, voir ce fichier)
// "autre" (Freeform) est explicitement exclu : texte libre généré par IA,
// aucun vocabulaire d'exercice stable à cataloguer.
// ============================================================

export function ForgeDisciplineChooser({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (discipline: DisciplineId) => void;
}) {
  const disciplines = listEngines().filter((e) => isReadyEngine(e) && e.id !== "autre");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <h3 className="font-serif text-lg font-semibold italic text-foreground">La Forge</h3>
            <p className="text-[11px] text-muted-foreground">Choisis une discipline</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-1.5 overflow-y-auto">
          {disciplines.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onPick(d.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface/60 p-3 text-left transition-colors hover:bg-surface active:scale-[0.99]"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 ${d.accentClassName}`}
                >
                  <DisciplineIcon icon={d.icon} className="h-4.5 w-4.5" />
                </span>
                <span className="text-sm font-medium text-foreground">{d.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
