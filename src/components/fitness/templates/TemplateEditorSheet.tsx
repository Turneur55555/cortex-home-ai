import { useId, useState } from "react";
import { ChevronDown, ChevronUp, Link2, Plus, Trash2 } from "lucide-react";
import { Sheet, Field, SubmitButton } from "@/components/shared/FormComponents";
import {
  useCreateWorkoutTemplate,
  useUpdateWorkoutTemplate,
  type TemplateExerciseInput,
  type WorkoutTemplateRow,
} from "@/hooks/useWorkoutTemplates";
import { EXERCISE_CATALOG } from "@/lib/fitness/exerciseCatalog";
import { computeSupersetGroups } from "@/lib/fitness/workoutTemplates";
import {
  TemplateIcon,
  TEMPLATE_ICON_NAMES,
  TEMPLATE_COLOR_NAMES,
  templateColorHex,
} from "./templateVisuals";

interface EditableExercise {
  key: string;
  name: string;
  supersetWithPrevious: boolean;
  default_sets: string;
  default_reps: string;
  default_weight: string;
  notes: string;
}

function emptyExercise(): EditableExercise {
  return {
    key: crypto.randomUUID(),
    name: "",
    supersetWithPrevious: false,
    default_sets: "3",
    default_reps: "10",
    default_weight: "",
    notes: "",
  };
}

function toEditable(exercises: WorkoutTemplateRow["exercises"]): EditableExercise[] {
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

export function TemplateEditorSheet({
  template,
  onClose,
}: {
  /** undefined = création, sinon édition du modèle fourni. */
  template?: WorkoutTemplateRow;
  onClose: () => void;
}) {
  const create = useCreateWorkoutTemplate();
  const update = useUpdateWorkoutTemplate();
  const datalistId = useId();

  const [name, setName] = useState(template?.name ?? "");
  const [icon, setIcon] = useState(template?.icon ?? "Dumbbell");
  const [color, setColor] = useState(template?.color ?? "primary");
  const [exercises, setExercises] = useState<EditableExercise[]>(
    template ? toEditable(template.exercises) : [emptyExercise()],
  );

  const isPending = create.isPending || update.isPending;

  const updateExercise = (key: string, patch: Partial<EditableExercise>) => {
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
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Exercices
            </p>
            <button
              type="button"
              onClick={() => setExercises((rows) => [...rows, emptyExercise()])}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          </div>

          <datalist id={datalistId}>
            {EXERCISE_CATALOG.map((e) => (
              <option key={e.name} value={e.name} />
            ))}
          </datalist>

          <div className="space-y-2">
            {exercises.map((row, i) => (
              <div
                key={row.key}
                className="space-y-2 rounded-xl border border-border bg-surface/60 p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    list={datalistId}
                    value={row.name}
                    onChange={(e) => updateExercise(row.key, { name: e.target.value })}
                    placeholder="Nom de l'exercice"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => moveExercise(i, -1)}
                    disabled={i === 0}
                    aria-label="Monter"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveExercise(i, 1)}
                    disabled={i === exercises.length - 1}
                    aria-label="Descendre"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeExercise(row.key)}
                    aria-label="Supprimer"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={row.default_sets}
                    onChange={(e) => updateExercise(row.key, { default_sets: e.target.value })}
                    placeholder="Séries"
                    className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={row.default_reps}
                    onChange={(e) => updateExercise(row.key, { default_reps: e.target.value })}
                    placeholder="Reps"
                    className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={row.default_weight}
                    onChange={(e) => updateExercise(row.key, { default_weight: e.target.value })}
                    placeholder="Charge (kg)"
                    className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
                </div>

                <input
                  type="text"
                  value={row.notes}
                  onChange={(e) => updateExercise(row.key, { notes: e.target.value })}
                  placeholder="Notes (optionnel)"
                  className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-xs outline-none focus:border-primary"
                />

                {i > 0 && (
                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={row.supersetWithPrevious}
                      onChange={(e) =>
                        updateExercise(row.key, { supersetWithPrevious: e.target.checked })
                      }
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    <Link2 className="h-3 w-3" />
                    Superset avec l'exercice précédent
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>

        <SubmitButton pending={isPending}>
          {template ? "Enregistrer les modifications" : "Créer le modèle"}
        </SubmitButton>
      </form>
    </Sheet>
  );
}
