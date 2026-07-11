import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useUserCourseSegmentInstances } from "@/hooks/useSegmentHistory";
import { groupByExerciseLabel } from "@/lib/fitness/segmentStats";
import { ACTIVITIES as CARDIO_ACTIVITIES } from "@/lib/fitness/engines/cardioEngine";
import { STATION_IDS as HYROX_STATIONS } from "@/lib/fitness/engines/hyroxEngine";
import { ACTIVITIES as GUIDED_ACTIVITIES } from "@/lib/fitness/engines/guidedEngine";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import type { DisciplineId } from "@/lib/fitness/engines/types";
import { ExerciseListBrowser, type BrowserExercise } from "./ExerciseListBrowser";
import { SegmentAnalysisSheet } from "./session/SegmentAnalysisSheet";

// ============================================================
// Bibliothèque d'exercices générique par discipline (Phase 1
// multi-discipline, 2026-07-11) — pendant d'ExerciseCatalogSheet
// (musculation, NON touché) pour Cardio/HYROX/Guided/Course. Construite
// sur ExerciseListBrowser, déjà 100% générique et partagé par le
// Catalogue et le Picker musculation — AUCUNE nouvelle interface de
// liste/recherche créée, conformément à la consigne de Nathan.
//
// Deux façons d'obtenir la liste d'un "groupe" :
// - Cardio/HYROX/Guided : liste FIXE déjà posée par chaque moteur
//   (ACTIVITIES/STATION_IDS, exportées pour l'occasion — zéro
//   duplication de vocabulaire).
// - Course : liste DYNAMIQUE, découverte depuis l'historique réel de
//   l'utilisateur (labels de segments déjà réalisés) — Course n'a pas de
//   vocabulaire figé (les libellés portent un contexte numérique généré
//   par Sensei), donc rien à afficher tant qu'aucune séance n'a été
//   faite, jamais de liste inventée.
//
// Tap sur un exercice → SegmentAnalysisSheet (même fiche que Course,
// généralisée en Phase 1 — voir ce fichier) avec la discipline choisie.
// ============================================================

function fixedItems(names: readonly string[], group: string): BrowserExercise[] {
  return names.map((name) => ({ id: name, name, group }));
}

function useCourseLibraryItems(): { items: BrowserExercise[]; isLoading: boolean } {
  const { user } = useAuth();
  const { data, isLoading } = useUserCourseSegmentInstances(user?.id);
  const items = useMemo(() => {
    const groups = groupByExerciseLabel(data ?? []);
    return groups.map((g) => ({ id: g.key, name: g.displayLabel, group: "Course à pied" }));
  }, [data]);
  return { items, isLoading };
}

export function DisciplineExerciseLibrarySheet({
  discipline,
  onClose,
}: {
  discipline: DisciplineId;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const engineLabel = ENGINE_REGISTRY[discipline]?.label ?? discipline;

  const courseLibrary = useCourseLibraryItems();
  const fixedByDiscipline: Partial<Record<DisciplineId, BrowserExercise[]>> = {
    cardio: fixedItems(CARDIO_ACTIVITIES, "Cardio"),
    hyrox: fixedItems(HYROX_STATIONS, "HYROX"),
    guided: fixedItems(GUIDED_ACTIVITIES, "Activités accompagnées"),
  };

  const isCourse = discipline === "course";
  const items = isCourse ? courseLibrary.items : (fixedByDiscipline[discipline] ?? []);
  const isLoading = isCourse ? courseLibrary.isLoading : false;
  const emptyLabel = isCourse
    ? "Aucun exercice de course réalisé pour l'instant — reviens après ta prochaine séance."
    : "Aucun exercice pour cette discipline.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <div>
            <h3 className="font-serif text-lg font-semibold italic text-foreground">La Forge</h3>
            <p className="text-[11px] text-muted-foreground">{engineLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ExerciseListBrowser
          items={items}
          isLoading={isLoading}
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder="Rechercher un exercice…"
          onRowTap={(item) => setSelectedLabel(item.name)}
          emptyLabel={emptyLabel}
        />
      </div>

      {selectedLabel && (
        <SegmentAnalysisSheet
          rawLabel={selectedLabel}
          discipline={discipline}
          onClose={() => setSelectedLabel(null)}
        />
      )}
    </div>
  );
}
