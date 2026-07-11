import { useState } from "react";
import { BarChart3, Repeat } from "lucide-react";
import type { ActiveGenericSegment } from "@/hooks/useGenericActiveSession";
import {
  useAddGenericSegment,
  useDeleteGenericSegment,
  useReorderGenericSegment,
  useUpdateGenericSegment,
} from "@/hooks/useGenericActiveSession";
import type { LabelGroup } from "@/lib/fitness/segmentStats";
import {
  ExerciseCardContainer,
  ExerciseCardHeader,
  ExerciseCardIconButton,
  ExerciseCardPillButton,
} from "../exerciseCard/ExerciseCardPrimitives";
import { ActiveSegmentCard } from "./ActiveSegmentCard";

// ============================================================
// Carte "exercice de course" en séance active — regroupe toutes les
// répétitions d'un même type de segment (ex. "400 m allure 5 km") sous
// UNE seule carte, pendant de ActiveExerciseCard (musculation) qui
// groupe les séries sous l'exercice. Nouveau composant introduit le
// 2026-07-11 suite au retour de Nathan : le modèle doit être identique à
// la musculation — séance > exercice > répétitions — jamais une carte
// par répétition individuelle.
//
// Réutilise TELLES QUELLES les primitives visuelles génériques de
// ExerciseCardPrimitives (déjà partagées par ActiveExerciseCard et
// TemplateExerciseCard, entièrement génériques — aucune connaissance du
// vocabulaire musculation dans ces primitives) plutôt que de dupliquer le
// markup d'en-tête/repli, et réutilise ActiveSegmentCard tel quel pour
// chaque répétition (AUCUNE modification de ce composant : il ne sait
// toujours gérer qu'un segment individuel, exactement comme avant). Le
// clic sur l'icône "Statistiques" ouvre SegmentAnalysisSheet — la même
// fiche que celle utilisée depuis l'historique (voir
// CourseHistoryContent.tsx) : aucune deuxième implémentation de fiche.
//
// Les positions restent globales à la séance (voir
// useReorderGenericSegment, qui échange la position avec le voisin
// immédiat au sein du tableau qu'on lui passe) : en passant SEULEMENT
// `group.instances` (au lieu de la liste complète des segments de la
// séance) aux flèches haut/bas, le réordonnancement reste cantonné aux
// répétitions du même exercice, sans aucune modification du hook.
// ============================================================

export function ActiveCourseExerciseCard({
  group,
  workoutId,
  nextPosition,
  onOpenStats,
}: {
  group: LabelGroup<ActiveGenericSegment>;
  workoutId: string;
  /** Position à utiliser pour une nouvelle répétition ajoutée à ce
   *  groupe — les positions sont globales à la séance, pas propres au
   *  groupe (voir en-tête ci-dessus). */
  nextPosition: number;
  onOpenStats: (rawLabel: string) => void;
}) {
  const updateSegment = useUpdateGenericSegment();
  const deleteSegment = useDeleteGenericSegment();
  const reorderSegment = useReorderGenericSegment();
  const addSegment = useAddGenericSegment();

  const [collapsed, setCollapsed] = useState(false);

  const doneCount = group.instances.filter((s) => s.completed).length;

  const handleAddRep = () => {
    addSegment.mutate({
      workoutId,
      label: group.displayLabel,
      metrics: {},
      metricKey: group.instances[0]?.metricKey ?? undefined,
      position: nextPosition,
    });
  };

  return (
    <ExerciseCardContainer>
      <ExerciseCardHeader
        photo={
          <div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl bg-black/25 ring-1 ring-white/10">
            <Repeat className="h-6 w-6 text-primary/70" />
          </div>
        }
        title={group.displayLabel}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        metaLine={
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <span className="tabular-nums">
              {group.instances.length} répétition{group.instances.length > 1 ? "s" : ""}
              {doneCount > 0 && <span className="text-success"> ({doneCount}✓)</span>}
            </span>
          </div>
        }
        actions={
          <ExerciseCardIconButton
            icon={BarChart3}
            onClick={() => onOpenStats(group.instances[0].label)}
            label="Statistiques de l'exercice"
          />
        }
      />

      {!collapsed && (
        <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <ul className="flex flex-col gap-2">
            {group.instances.map((segment, i) => (
              <ActiveSegmentCard
                key={segment.id}
                segment={segment}
                isFirst={i === 0}
                isLast={i === group.instances.length - 1}
                onUpdate={(fields) => updateSegment.mutate({ id: segment.id, ...fields })}
                onDelete={() => deleteSegment.mutate(segment.id)}
                onMoveUp={() =>
                  reorderSegment.mutate({
                    segments: group.instances,
                    id: segment.id,
                    direction: "up",
                  })
                }
                onMoveDown={() =>
                  reorderSegment.mutate({
                    segments: group.instances,
                    id: segment.id,
                    direction: "down",
                  })
                }
              />
            ))}
          </ul>

          <ExerciseCardPillButton
            label="Ajouter une répétition"
            onClick={handleAddRep}
            disabled={addSegment.isPending}
          />
        </div>
      )}
    </ExerciseCardContainer>
  );
}
