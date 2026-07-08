// ============================================================
// Carte d'exercice pour l'éditeur de modèle de séance — même identité
// visuelle qu'ActiveExerciseCard (séance active), via les primitives
// partagées de src/components/fitness/exerciseCard/. Différences
// fonctionnelles volontaires (un modèle n'a jamais été « joué ») :
// pas de badges PR/dernière séance/récupération, pas de bouton
// statistiques/historique, pas de coche de validation de série. En
// contrepartie, un modèle a besoin d'un réordonnancement manuel (haut/bas)
// et de notes, absents de la séance active.
// ============================================================

import { useState } from "react";
import { ArrowDown, ArrowUp, Link2, Trash2 } from "lucide-react";
import { useUpsertExercisePhoto } from "@/hooks/useUserExercisePhotos";
import {
  ExerciseCardConfirmDelete,
  ExerciseCardContainer,
  ExerciseCardHeader,
  ExerciseCardIconButton,
  ExerciseCardPillButton,
  ExerciseCardSetIndex,
  ExerciseCardSetRow,
  ExerciseCardStatField,
  ExercisePhotoTile,
} from "../exerciseCard/ExerciseCardPrimitives";

export interface EditableTemplateExercise {
  key: string;
  name: string;
  supersetWithPrevious: boolean;
  default_sets: string;
  default_reps: string;
  default_weight: string;
  notes: string;
}

export function emptyTemplateExercise(seed?: {
  name: string;
  sets?: string;
  reps?: string;
  weight?: string;
}): EditableTemplateExercise {
  return {
    key: crypto.randomUUID(),
    name: seed?.name ?? "",
    supersetWithPrevious: false,
    default_sets: seed?.sets && seed.sets.trim() !== "" ? seed.sets : "3",
    default_reps: seed?.reps && seed.reps.trim() !== "" ? seed.reps : "10",
    default_weight: seed?.weight ?? "",
    notes: "",
  };
}

const MAX_SETS = 20;

export function TemplateExerciseCard({
  row,
  isFirst,
  isLast,
  imageUrl,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  row: EditableTemplateExercise;
  isFirst: boolean;
  isLast: boolean;
  imageUrl: string | null;
  onChange: (patch: Partial<EditableTemplateExercise>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const upsertPhoto = useUpsertExercisePhoto();
  const [collapsed, setCollapsed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setCount = Math.max(1, Math.round(Number(row.default_sets)) || 1);

  const handlePhotoFile = (file: File) => {
    if (!row.name.trim()) return;
    upsertPhoto.mutate({ exerciseName: row.name.trim(), file });
  };

  const changeSetCount = (next: number) => {
    onChange({ default_sets: String(Math.min(MAX_SETS, Math.max(1, next))) });
  };

  const metaLine = (
    <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className="tabular-nums">
        {setCount} série{setCount > 1 ? "s" : ""}
      </span>
      {row.default_reps.trim() !== "" && (
        <>
          <span className="text-muted-foreground/30">•</span>
          <span className="tabular-nums">{row.default_reps} reps</span>
        </>
      )}
      {row.default_weight.trim() !== "" && (
        <>
          <span className="text-muted-foreground/30">•</span>
          <span className="tabular-nums text-muted-foreground/70">{row.default_weight} kg</span>
        </>
      )}
    </div>
  );

  const badges = row.supersetWithPrevious ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
      <Link2 className="h-3 w-3" />
      Superset
    </span>
  ) : undefined;

  return (
    <ExerciseCardContainer>
      <ExerciseCardHeader
        photo={
          <ExercisePhotoTile
            imageUrl={imageUrl}
            name={row.name || "Exercice"}
            onPickPhoto={handlePhotoFile}
            uploading={upsertPhoto.isPending}
          />
        }
        title={row.name || "Exercice sans nom"}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        metaLine={metaLine}
        badges={badges}
        actions={
          <>
            <ExerciseCardIconButton
              icon={ArrowUp}
              onClick={onMoveUp}
              label="Monter"
              disabled={isFirst}
            />
            <ExerciseCardIconButton
              icon={ArrowDown}
              onClick={onMoveDown}
              label="Descendre"
              disabled={isLast}
            />
            <ExerciseCardIconButton
              icon={Trash2}
              onClick={() => setConfirmDelete(true)}
              label="Supprimer l'exercice"
              variant="destructive"
            />
          </>
        }
      />

      {confirmDelete && (
        <ExerciseCardConfirmDelete
          label={`Retirer « ${row.name || "cet exercice"} » du modèle ?`}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={onDelete}
        />
      )}

      {!collapsed && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          {!isFirst && (
            <label className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-white/[0.05] px-3 py-2.5 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" />
                Superset avec l'exercice précédent
              </span>
              <input
                type="checkbox"
                checked={row.supersetWithPrevious}
                onChange={(e) => onChange({ supersetWithPrevious: e.target.checked })}
                className="h-4 w-4 rounded border-border accent-primary"
              />
            </label>
          )}

          {/* Séries par défaut — même valeurs de reps/charge partagées par
              toutes les séries (le schéma ne stocke qu'un seul couple
              reps/charge par exercice de modèle, pas par série). */}
          <div className="mt-3">
            <ul className="flex flex-col gap-2">
              {Array.from({ length: setCount }, (_, i) => (
                <ExerciseCardSetRow key={i}>
                  <ExerciseCardSetIndex>
                    <span className="text-sm font-extrabold tabular-nums leading-none text-foreground">
                      {i + 1}
                    </span>
                  </ExerciseCardSetIndex>

                  <ExerciseCardStatField
                    value={row.default_weight}
                    onChange={(v) => onChange({ default_weight: v })}
                    onCommit={(v) => onChange({ default_weight: v })}
                    placeholder=""
                    unit="kg"
                    step="0.5"
                  />

                  <ExerciseCardStatField
                    value={row.default_reps}
                    onChange={(v) => onChange({ default_reps: v })}
                    onCommit={(v) => onChange({ default_reps: v })}
                    placeholder=""
                    unit="reps"
                  />

                  <button
                    type="button"
                    onClick={() => changeSetCount(setCount - 1)}
                    disabled={setCount <= 1}
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground/25 transition-colors hover:text-destructive disabled:opacity-30"
                    aria-label="Supprimer la série"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </ExerciseCardSetRow>
              ))}
            </ul>

            <ExerciseCardPillButton
              label="Ajouter une série"
              onClick={() => changeSetCount(setCount + 1)}
              disabled={setCount >= MAX_SETS}
            />
          </div>

          <input
            type="text"
            value={row.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Notes (optionnel)"
            className="mt-3 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs outline-none focus:border-primary"
          />
        </div>
      )}
    </ExerciseCardContainer>
  );
}
