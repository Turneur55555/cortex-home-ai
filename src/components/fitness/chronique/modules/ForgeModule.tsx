// ============================================================
// LES CHRONIQUES — Module « La Forge ».
//
// Mission unique : la bibliothèque complète des exercices (recherche,
// filtres, variantes, favoris, tutoriels, muscles sollicités) — jamais un
// créateur de séance (décision Nathan, 23/07/2026). Avant ce lot, la Forge
// était un lanceur (bottom sheet) déclenché depuis l'écran Séances ; elle
// vit désormais ICI, comme un vrai onglet du livre — même contenu, même
// sous-écrans (ExerciseCatalogSheet / DisciplineExerciseLibrarySheet),
// aucune duplication de la logique de bibliothèque existante.
// ============================================================

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Hammer } from "lucide-react";
import { listEngines } from "@/lib/fitness/engines/registry";
import { isReadyEngine } from "@/lib/fitness/engines/types";
import type { DisciplineId } from "@/lib/fitness/engines/types";
import { DisciplineIcon } from "@/components/fitness/session/DisciplineIcon";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import type { RankAggregate } from "@/components/fitness/RankAggregator";
import { DisciplineExerciseLibrarySheet } from "@/components/fitness/DisciplineExerciseLibrarySheet";

export function ForgeModule({
  rankAggregate,
  onOpenCatalog,
}: {
  rankAggregate: RankAggregate;
  /** Musculation garde son propre catalogue (ExerciseCatalogSheet), monté
   *  dans SeancesTab — partagé avec l'accès pendant une séance active. */
  onOpenCatalog: () => void;
}) {
  const disciplines = useMemo(
    () => listEngines().filter((e) => isReadyEngine(e) && e.id !== "autre"),
    [],
  );
  const [libraryDiscipline, setLibraryDiscipline] = useState<DisciplineId | null>(null);

  const handlePick = (discipline: DisciplineId) => {
    if (discipline === "muscu") onOpenCatalog();
    else setLibraryDiscipline(discipline);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 px-1">
        <Hammer className="h-4 w-4 text-amber-400" />
        <h2 className="font-serif text-[15px] font-semibold italic text-white/90">
          Choisis une discipline
        </h2>
      </div>

      <ul className="flex flex-col gap-2">
        {disciplines.map((d, i) => {
          const muscuRank = d.id === "muscu" ? rankAggregate.best?.rank : null;
          return (
            <motion.li
              key={d.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
            >
              <button
                type="button"
                onClick={() => handlePick(d.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-left transition-colors active:scale-[0.99] hover:bg-white/[0.06]"
              >
                {muscuRank ? (
                  <div className="relative aspect-[4/5] w-10 shrink-0 overflow-hidden rounded-xl shadow-elevated">
                    <RankIllustration
                      rankKey={muscuRank.rank.key}
                      label={muscuRank.rank.label}
                      className="absolute inset-0 h-full w-full"
                    />
                  </div>
                ) : (
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 ${d.accentClassName}`}
                  >
                    <DisciplineIcon icon={d.icon} className="h-4.5 w-4.5" />
                  </span>
                )}
                <span className="text-sm font-semibold text-white/90">{d.label}</span>
              </button>
            </motion.li>
          );
        })}
      </ul>

      {libraryDiscipline && (
        <DisciplineExerciseLibrarySheet
          discipline={libraryDiscipline}
          onClose={() => setLibraryDiscipline(null)}
        />
      )}
    </div>
  );
}
