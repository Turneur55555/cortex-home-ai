import { useState } from "react";
import { Sheet, Field, SubmitButton } from "@/components/shared/FormComponents";
import { useWorkouts } from "@/hooks/use-fitness";
import { useUserExercisePhotos } from "@/hooks/useUserExercisePhotos";
import {
  useCreateWorkoutTemplate,
  useUpdateWorkoutTemplate,
  type TemplateExerciseInput,
  type WorkoutTemplateRow,
} from "@/hooks/useWorkoutTemplates";
import { normalize } from "@/lib/fitness/exerciseCatalog";
import { exerciseIllustration } from "@/lib/fitness/exerciseIllustrations";
import { computeRecentExercises } from "@/lib/fitness/recentExercises";
import { computeSupersetGroups, type TemplateSeedExercise } from "@/lib/fitness/workoutTemplates";
import { AddExerciseButton } from "../exerciseCard/ExerciseCardPrimitives";
import { ExercisePickerSheet, type PickedExercise } from "../ExercisePickerSheet";
import {
  emptyTemplateExercise,
  TemplateExerciseCard,
  type EditableTemplateExercise,
} from "./TemplateExerciseCard";
import {
  TemplateIcon,
  TEMPLATE_ICON_NAMES,
  TEMPLATE_COLOR_NAMES,
  templateColorHex,
} from "./templateVisuals";

function toEditable(exercises: WorkoutTemplateRow["exercises"]): EditableTemplateExercise[] {
  return exercises.map((e, i) => ({
    key: e.id,
    name: e.name,
    supersetWithPrevious:
      i > 0 && e.superset_group != null && e.superset_group === exercises[i - 1].superset_group,
    default_sets: e.default_sets != null ? String(e.default_sets) : "",
    default_reps: e.default_reps != null ? String(e.default_reps) : "",
    default_weight: e.default_weight != null ? String(e.default_weight) : "",
    notes: e.notes ?? "",
  }));
}

/** Pré-remplissage depuis une séance PASSÉE (« Enregistrer comme séance
 *  sauvegardée » dans l'historique) — reste en mode création (`template`
 *  n'est jamais fourni ici), seules les valeurs de départ changent. */
function toEditableFromSeed(seed: TemplateSeedExercise[]): EditableTemplateExercise[] {
  return seed.map((e) => ({
    key: crypto.randomUUID(),
    name: e.name,
    supersetWithPrevious: false,
    default_sets: e.default_sets != null ? String(e.default_sets) : "3",
    default_reps: e.default_reps != null ? String(e.default_reps) : "10",
    default_weight: e.default_weight != null ? String(e.default_weight) : "",
    notes: e.notes ?? "",
  }));
}

export function TemplateEditorSheet({
  template,
  seedName,
  seedExercises,
  onClose,
}: {
  /** undefined = création, sinon édition du modèle fourni. */
  template?: WorkoutTemplateRow;
  /** Pré-remplissage optionnel depuis une séance passée — ignoré si
   *  `template` est fourni (édition). Le flux reste une CRÉATION : un
   *  nouveau modèle est créé, la séance d'origine n'est pas modifiée. */
  seedName?: string;
  seedExercises?: TemplateSeedExercise[];
  onClose: () => void;
}) {
  const create = useCreateWorkoutTemplate();
  const update = useUpdateWorkoutTemplate();

  // Mêmes sources que le picker en séance active (ActiveWorkoutView) — un
  // modèle réutilise exactement le même sélecteur d'exercices, avec les
  // mêmes suggestions issues de l'historique réel.
  const { data: allWorkouts } = useWorkouts();
  const recentExercises = computeRecentExercises(allWorkouts);
  const { data: userPhotos } = useUserExercisePhotos();

  const [name, setName] = useState(template?.name ?? seedName ?? "");
  const [icon, setIcon] = useState(template?.icon ?? "Dumbbell");
  const [color, setColor] = useState(template?.color ?? "primary");
  const [exercises, setExercises] = useState<EditableTemplateExercise[]>(() => {
    if (template) return toEditable(template.exercises);
    if (seedExercises && seedExercises.length > 0) return toEditableFromSeed(seedExercises);
    return [];
  });
  const [pickerOpen, setPickerOpen] = useState(false);

  const isPending = create.isPending || update.isPending;

  const updateExercise = (key: string, patch: Partial<EditableTemplateExercise>) => {
    setExercises((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeExercise = (key: string) => {
    setExercises((rows) => rows.filter((r) => r.key !== key));
  };

  const moveExercise = (index: number, direction: -1 | 1) => {
    setExercises((rows) => {
      const target = index + direction;
      if (target < 0 || target >= rows.length) return rows;
      const next = [...rows];
      [next[index], next[target]] = [next[target], next[index]];
      // Le lien "superset avec le précédent" ne veut plus dire la même chose
      // après un déplacement — on le remet à zéro pour ne pas lier deux
      // exercices sans rapport par accident.
      next[index] = { ...next[index], supersetWithPrevious: false };
      next[target] = { ...next[target], supersetWithPrevious: false };
      return next;
    });
  };

  const handlePickExercise = (picked: PickedExercise) => {
    setPickerOpen(false);
    setExercises((rows) => [
      ...rows,
      emptyTemplateExercise({
        name: picked.name,
        sets: picked.sets,
        reps: picked.reps,
        weight: picked.weight,
      }),
    ]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = exercises.filter((r) => r.name.trim().length > 0);
    if (!name.trim() || validRows.length === 0) return;

    const groups = computeSupersetGroups(validRows);
    const payloadExercises: TemplateExerciseInput[] = validRows.map((r, i) => ({
      name: r.name.trim(),
      superset_group: groups[i],
      default_sets: r.default_sets.trim() === "" ? null : Math.round(Number(r.default_sets)),
      default_reps: r.default_reps.trim() === "" ? null : Math.round(Number(r.default_reps)),
      default_weight: r.default_weight.trim() === "" ? null : Number(r.default_weight),
      notes: r.notes.trim() === "" ? null : r.notes.trim(),
    }));

    if (template) {
      await update.mutateAsync({ id: template.id, name, icon, color, exercises: payloadExercises });
    } else {
      await create.mutateAsync({ name, icon, color, exercises: payloadExercises });
    }
    onClose();
  };

  return (
    <>
      <Sheet title={template ? "Modifier le modèle" : "Nouveau modèle"} onClose={onClose}>
        <form className="space-y-4" onSubmit={submit}>
          <Field
            label="Nom du modèle"
            value={name}
            onChange={setName}
            placeholder="Push, Jambes, HYROX Force…"
            required
          />

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Icône
            </p>
            <div className="grid grid-cols-6 gap-2">
              {TEMPLATE_ICON_NAMES.map((name_) => (
                <button
                  key={name_}
                  type="button"
                  onClick={() => setIcon(name_)}
                  aria-label={name_}
                  className={`flex h-11 items-center justify-center rounded-xl border transition-colors ${
                    icon === name_
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-surface text-muted-foreground"
                  }`}
                >
                  <TemplateIcon icon={name_} className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Couleur
            </p>
            <div className="flex flex-wrap gap-2">
              {TEMPLATE_COLOR_NAMES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={`h-9 w-9 rounded-full border-2 transition-transform ${
                    color === c ? "scale-110 border-foreground" : "border-transparent"
                  }`}
                  style={{ backgroundColor: templateColorHex(c) }}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Exercices
            </p>

            {exercises.length === 0 ? (
              <div className="mb-3 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  Aucun exercice — ajoutez-en un ci-dessous
                </p>
              </div>
            ) : (
              <div className="mb-3 flex flex-col gap-3">
                {exercises.map((row, i) => {
                  const image =
                    userPhotos?.get(normalize(row.name)) ?? exerciseIllustration(row.name);
                  return (
                    <TemplateExerciseCard
                      key={row.key}
                      row={row}
                      isFirst={i === 0}
                      isLast={i === exercises.length - 1}
                      imageUrl={image}
                      onChange={(patch) => updateExercise(row.key, patch)}
                      onDelete={() => removeExercise(row.key)}
                      onMoveUp={() => moveExercise(i, -1)}
                      onMoveDown={() => moveExercise(i, 1)}
                    />
                  );
                })}
              </div>
            )}

            <AddExerciseButton onClick={() => setPickerOpen(true)} />
          </div>

          <SubmitButton pending={isPending}>
            {template ? "Enregistrer les modifications" : "Créer le modèle"}
          </SubmitButton>
        </form>
      </Sheet>

      {pickerOpen && (
        <ExercisePickerSheet
          recentExercises={recentExercises}
          onSelect={handlePickExercise}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
