import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Sheet, Field, SubmitButton } from "@/components/shared/FormComponents";
import { useWorkouts } from "@/hooks/use-fitness";
import { useUserExercisePhotos } from "@/hooks/useUserExercisePhotos";
import {
  useCreateWorkoutTemplate,
  useUpdateWorkoutTemplate,
  orderedTemplateItems,
  type TemplateItemInput,
  type WorkoutTemplateRow,
} from "@/hooks/useWorkoutTemplates";
import { exerciseIllustration } from "@/lib/fitness/exerciseIllustrations";
import { computeRecentExercises, identityKey } from "@/lib/fitness/recentExercises";
import { computeSupersetGroups, type TemplateSeedExercise } from "@/lib/fitness/workoutTemplates";
import { listEngines } from "@/lib/fitness/engines/registry";
import type { DisciplineId } from "@/lib/fitness/engines/types";
import { DisciplineIcon } from "../session/DisciplineIcon";
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

// Musculation hybride (2026-08-19) — un modèle est désormais une liste
// ORDONNÉE d'items hétérogènes (force ou bloc), exactement comme la séance
// qu'il représente (voir docs/architecture, useWorkoutTemplates.ts). Un
// item de bloc reste volontairement léger dans l'éditeur (label + discipline
// seulement, pas de métriques) : les métriques se remplissent en séance
// active, un modèle n'est qu'un point de départ — même philosophie que les
// "valeurs par défaut" des exercices de force ci-dessous.
type EditableItem =
  | ({ kind: "exercise" } & EditableTemplateExercise)
  | { kind: "segment"; key: string; label: string; discipline: DisciplineId };

function toEditable(template: WorkoutTemplateRow): EditableItem[] {
  const ordered = orderedTemplateItems(template);
  return ordered.map((item, i) => {
    if (item.kind !== "exercise") {
      return {
        kind: "segment",
        key: crypto.randomUUID(),
        label: item.label,
        discipline: item.discipline as DisciplineId,
      };
    }
    // Superset préservé UNIQUEMENT si l'item combiné précédent est aussi un
    // exercice avec le même groupe non-nul — un bloc entre deux exercices
    // rompt la chaîne de superset (voir en-tête de fichier).
    const prev = ordered[i - 1];
    const supersetWithPrevious =
      i > 0 &&
      prev?.kind === "exercise" &&
      item.superset_group != null &&
      item.superset_group === prev.superset_group;
    return {
      kind: "exercise",
      key: crypto.randomUUID(),
      name: item.name,
      supersetWithPrevious,
      default_sets: item.default_sets != null ? String(item.default_sets) : "",
      default_reps: item.default_reps != null ? String(item.default_reps) : "",
      default_weight: item.default_weight != null ? String(item.default_weight) : "",
      notes: item.notes ?? "",
    };
  });
}

/** Pré-remplissage depuis une séance PASSÉE (« Enregistrer comme séance
 *  sauvegardée » dans l'historique) — reste en mode création (`template`
 *  n'est jamais fourni ici), seules les valeurs de départ changent. Cette
 *  entrée du parcours reste force-only (le seed vient de WorkoutCard, muscu
 *  classique) — aucun bloc à pré-remplir. */
function toEditableFromSeed(seed: TemplateSeedExercise[]): EditableItem[] {
  return seed.map((e) => ({
    kind: "exercise",
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
  const [items, setItems] = useState<EditableItem[]>(() => {
    if (template) return toEditable(template);
    if (seedExercises && seedExercises.length > 0) return toEditableFromSeed(seedExercises);
    return [];
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  // Musculation hybride — bloc : discipline choisie avant d'ouvrir le
  // picker, même geste qu'ActiveWorkoutView (ajout de bloc en séance active).
  const blockEngines = listEngines().filter((e) => !e.comingSoon && e.id !== "muscu");
  const [blockDiscipline, setBlockDiscipline] = useState<DisciplineId>(
    () => blockEngines[0]?.id ?? "autre",
  );
  const [blockPickerOpen, setBlockPickerOpen] = useState(false);

  const isPending = create.isPending || update.isPending;

  const updateExercise = (key: string, patch: Partial<EditableTemplateExercise>) => {
    setItems((rows) =>
      rows.map((r) => (r.kind === "exercise" && r.key === key ? { ...r, ...patch } : r)),
    );
  };

  const removeItem = (key: string) => {
    setItems((rows) => rows.filter((r) => r.key !== key));
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    setItems((rows) => {
      const target = index + direction;
      if (target < 0 || target >= rows.length) return rows;
      const next = [...rows];
      [next[index], next[target]] = [next[target], next[index]];
      // Le lien "superset avec le précédent" ne veut plus dire la même chose
      // après un déplacement — on le remet à zéro pour ne pas lier deux
      // exercices sans rapport par accident (même règle si un bloc vient
      // maintenant s'intercaler).
      if (next[index].kind === "exercise")
        next[index] = { ...next[index], supersetWithPrevious: false };
      if (next[target].kind === "exercise")
        next[target] = { ...next[target], supersetWithPrevious: false };
      return next;
    });
  };

  const handlePickExercise = (picked: PickedExercise) => {
    setPickerOpen(false);
    setItems((rows) => [
      ...rows,
      {
        kind: "exercise",
        ...emptyTemplateExercise({
          name: picked.name,
          sets: picked.sets,
          reps: picked.reps,
          weight: picked.weight,
        }),
      },
    ]);
  };

  const handlePickBlock = (picked: PickedExercise) => {
    setBlockPickerOpen(false);
    const label = picked.name.trim();
    if (!label) return;
    setItems((rows) => [
      ...rows,
      { kind: "segment", key: crypto.randomUUID(), label, discipline: blockDiscipline },
    ]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validItems = items.filter((r) =>
      r.kind === "exercise" ? r.name.trim().length > 0 : r.label.trim().length > 0,
    );
    if (!name.trim() || validItems.length === 0) return;

    // Supersets calculés sur la SEULE sous-séquence d'exercices (dans leur
    // ordre réel) — un item de bloc entre deux exercices a déjà forcé
    // `supersetWithPrevious` à false (toEditable/moveItem), donc deux
    // exercices non réellement adjacents ne peuvent jamais être groupés ici.
    const exerciseRows = validItems.filter((r) => r.kind === "exercise");
    const groups = computeSupersetGroups(exerciseRows);
    let exerciseCursor = 0;
    const payloadItems: TemplateItemInput[] = validItems.map((r) => {
      if (r.kind === "segment") {
        return { kind: "segment", label: r.label.trim(), discipline: r.discipline };
      }
      const groupIndex = exerciseCursor;
      exerciseCursor += 1;
      return {
        kind: "exercise",
        name: r.name.trim(),
        superset_group: groups[groupIndex],
        default_sets: r.default_sets.trim() === "" ? null : Math.round(Number(r.default_sets)),
        default_reps: r.default_reps.trim() === "" ? null : Math.round(Number(r.default_reps)),
        default_weight: r.default_weight.trim() === "" ? null : Number(r.default_weight),
        notes: r.notes.trim() === "" ? null : r.notes.trim(),
      };
    });

    if (template) {
      await update.mutateAsync({ id: template.id, name, icon, color, items: payloadItems });
    } else {
      await create.mutateAsync({ name, icon, color, items: payloadItems });
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
              Exercices &amp; blocs
            </p>

            {items.length === 0 ? (
              <div className="mb-3 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  Aucun exercice — ajoutez-en un ci-dessous
                </p>
              </div>
            ) : (
              <div className="mb-3 flex flex-col gap-3">
                {items.map((row, i) => {
                  if (row.kind === "segment") {
                    const engine = blockEngines.find((e) => e.id === row.discipline);
                    return (
                      <div
                        key={row.key}
                        className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3"
                      >
                        <span
                          className={
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 " +
                            (engine?.accentClassName ?? "")
                          }
                        >
                          <DisciplineIcon icon={engine?.icon ?? "Sparkles"} className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{row.label || "Bloc sans nom"}</p>
                          <p className="text-xs text-muted-foreground">
                            {engine?.label ?? row.discipline}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => moveItem(i, -1)}
                          disabled={i === 0}
                          aria-label="Monter"
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(i, 1)}
                          disabled={i === items.length - 1}
                          aria-label="Descendre"
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(row.key)}
                          aria-label="Retirer le bloc"
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  }
                  // Étape 4.5 : un exercice de modèle n'a pas de FK vers
                  // exercise_reference (structure du modèle = nom/notes/
                  // superset uniquement) — filet de compatibilité par nom
                  // uniquement ici, comportement inchangé.
                  const image =
                    userPhotos?.get(identityKey({ name: row.name })) ??
                    exerciseIllustration(row.name);
                  return (
                    <TemplateExerciseCard
                      key={row.key}
                      row={row}
                      isFirst={i === 0}
                      isLast={i === items.length - 1}
                      imageUrl={image}
                      onChange={(patch) => updateExercise(row.key, patch)}
                      onDelete={() => removeItem(row.key)}
                      onMoveUp={() => moveItem(i, -1)}
                      onMoveDown={() => moveItem(i, 1)}
                    />
                  );
                })}
              </div>
            )}

            <AddExerciseButton onClick={() => setPickerOpen(true)} />

            {/* Musculation hybride — ajouter un bloc (course/HYROX/cardio) au
                modèle, même geste qu'en séance active (ActiveWorkoutView) :
                choisir la discipline du bloc, puis le même picker. */}
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {blockEngines.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setBlockDiscipline(e.id)}
                    className={
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors " +
                      (blockDiscipline === e.id
                        ? `border-primary/40 bg-primary/15 ${e.accentClassName}`
                        : "border-border bg-surface text-muted-foreground hover:border-primary/30")
                    }
                  >
                    <DisciplineIcon icon={e.icon} className="h-3.5 w-3.5" />
                    {e.label}
                  </button>
                ))}
              </div>
              <AddExerciseButton
                label={`Ajouter un bloc ${blockEngines.find((e) => e.id === blockDiscipline)?.label ?? ""}`}
                onClick={() => setBlockPickerOpen(true)}
              />
            </div>
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

      {blockPickerOpen && (
        <ExercisePickerSheet
          discipline={blockDiscipline}
          recentExercises={[]}
          onSelect={handlePickBlock}
          onClose={() => setBlockPickerOpen(false)}
        />
      )}
    </>
  );
}
