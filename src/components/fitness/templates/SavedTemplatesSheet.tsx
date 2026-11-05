import { useState } from "react";
import { Copy, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Sheet } from "@/components/shared/FormComponents";
import {
  useWorkoutTemplates,
  useStartWorkoutFromSavedTemplate,
  useLogCourseFromTemplate,
  useDeleteWorkoutTemplate,
  useDuplicateWorkoutTemplate,
  type WorkoutTemplateRow,
} from "@/hooks/useWorkoutTemplates";
import { TemplateEditorSheet } from "./TemplateEditorSheet";
import { TemplateIcon, templateColorHex } from "./templateVisuals";
import { toast } from "sonner";
import { courseOfTemplate } from "@/lib/fitness/courses";
import { useDeleteWorkout } from "@/hooks/use-fitness";
import { MUSCLE_META } from "@/lib/fitness/muscleMapping";

/**
 * Liste des modèles de séance sauvegardés — sélection démarre une séance
 * active avec la structure complète du modèle (voir
 * useStartWorkoutFromSavedTemplate). Gestion complète (créer/renommer/
 * modifier/dupliquer/supprimer) directement ici, nombre illimité de modèles.
 */
export function SavedTemplatesSheet({
  onClose,
  onStarted,
}: {
  onClose: () => void;
  /** Appelé après démarrage réussi d'une séance depuis un modèle — ferme
   *  toute la chaîne de sheets pour rejoindre l'écran de séance active. */
  onStarted: () => void;
}) {
  const { data: templates, isLoading } = useWorkoutTemplates();
  const start = useStartWorkoutFromSavedTemplate();
  const logCourse = useLogCourseFromTemplate();
  const deleteWorkout = useDeleteWorkout();
  const busy = start.isPending || logCourse.isPending;
  const del = useDeleteWorkoutTemplate();
  const duplicate = useDuplicateWorkoutTemplate();

  const [editing, setEditing] = useState<WorkoutTemplateRow | "new" | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (editing) {
    return (
      <TemplateEditorSheet
        template={editing === "new" ? undefined : editing}
        onClose={() => setEditing(null)}
      />
    );
  }

  const handleStart = async (template: WorkoutTemplateRow) => {
    // Un cours (Lagree) n'ouvre pas de séance : il est enregistré tel quel
    // (50 min, aujourd'hui), avec « Annuler » si le toucher était involontaire.
    const course = courseOfTemplate(template);
    if (course) {
      const { workoutId } = await logCourse.mutateAsync(template);
      toast.success(`${course.name} enregistré · ${course.durationMinutes} min`, {
        action: { label: "Annuler", onClick: () => deleteWorkout.mutate(workoutId) },
      });
      onStarted();
      return;
    }
    await start.mutateAsync(template);
    onStarted();
  };

  return (
    <Sheet title="Séances sauvegardées" onClose={onClose}>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Nouveau modèle
        </button>

        {isLoading && (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!isLoading && templates?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun modèle pour l'instant — enregistre ta première séance type.
          </p>
        )}

        {templates?.map((template) => {
          const course = courseOfTemplate(template);
          return (
            <div
              key={template.id}
              className="rounded-2xl border border-border bg-surface"
              style={{ borderLeftWidth: 3, borderLeftColor: templateColorHex(template.color) }}
            >
              <button
                type="button"
                onClick={() => handleStart(template)}
                disabled={busy}
                className="flex w-full items-center gap-3 p-3 text-left disabled:opacity-50"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${templateColorHex(template.color)}26` }}
                >
                  <TemplateIcon icon={template.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">
                    {template.name}
                  </span>
                  {course ? (
                    <>
                      <span className="block text-xs text-muted-foreground">
                        Cours · {course.durationMinutes} min · {course.location}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {course.zones.map((zone) => (
                          <span
                            key={zone}
                            className="rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10.5px] text-primary-glow"
                          >
                            {MUSCLE_META[zone].label}
                          </span>
                        ))}
                      </span>
                    </>
                  ) : (
                    <span className="block text-xs text-muted-foreground">
                      {template.exercises.length} exercice(s)
                      {/* Musculation hybride (2026-08-19) : indication discrète,
                        aucune discipline "Hybride" séparée n'est introduite. */}
                      {template.segments.length > 0 && ` · ${template.segments.length} bloc(s)`}
                    </span>
                  )}
                </span>
                {busy ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : (
                  course && (
                    <span className="shrink-0 rounded-full bg-violet-400/15 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
                      J'y étais
                    </span>
                  )
                )}
              </button>

              <div className="flex items-center gap-1 border-t border-border/60 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setEditing(template)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => duplicate.mutate(template)}
                  disabled={duplicate.isPending}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Dupliquer
                </button>

                {confirmDeleteId === template.id ? (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Supprimer ?</span>
                    <button
                      type="button"
                      onClick={() => {
                        del.mutate(template.id);
                        setConfirmDeleteId(null);
                      }}
                      className="rounded-lg bg-destructive/15 px-2 py-1 text-[11px] font-semibold text-destructive"
                    >
                      Oui
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(template.id)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-destructive/80 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
