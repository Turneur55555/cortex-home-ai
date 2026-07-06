import { useMemo, useState } from "react";
import { BookOpen, Check, Loader2, Plus, X } from "lucide-react";
import { CATALOG_GROUPS, normalize } from "@/lib/fitness/exerciseCatalog";
import { defaultWorkoutName } from "@/lib/fitness/config";
import { findSimilarExercises } from "@/lib/fitness/exerciseSimilar";
import { exerciseIllustration } from "@/lib/fitness/exerciseIllustrations";
import { toast } from "sonner";
import {
  useFullExerciseCatalog,
  useAddExercise,
  useDeleteExercise,
  useUpdateExercise,
  usePromoteExercise,
  type DbCatalogRow,
} from "@/hooks/useExerciseCatalog";
import { useUserExercisePhotos } from "@/hooks/useUserExercisePhotos";
import { useActiveWorkout, useAddExerciseToActiveWorkout, useStartWorkoutFromTemplate } from "@/hooks/use-fitness";
import { ExerciseListBrowser, type BrowserExercise } from "./ExerciseListBrowser";
import { ExerciseActionsMenu, type ExerciseMenuAction } from "./ExerciseActionsMenu";
import { ExerciseAnalysisSheet, type ExerciseAnalysisActions } from "./ExerciseAnalysisSheet";

interface Props {
  onClose: () => void;
  /** Historique/records déjà calculés par SeancesTab (computePRs) — réutilisés
   *  tels quels par la fiche d'analyse ouverte depuis le Catalogue. */
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByName: Map<string, number>;
}

const ALL_GROUPS = [...CATALOG_GROUPS, "Mes exercices"];

/**
 * Catalogue d'exercices — bibliothèque de référence du module Exercices.
 * Le tap principal sur une ligne ouvre la fiche d'analyse intelligente
 * (ExerciseAnalysisSheet), qui devient la page de référence de l'exercice
 * et porte les actions (démarrer une séance / ajouter à la séance en cours /
 * modifier / promouvoir / supprimer). La gestion du catalogue lui-même
 * (ajout, édition, suppression, promotion) reste accessible en secondaire
 * via le bouton "..." de chaque ligne.
 */
export function ExerciseCatalogSheet({ onClose, histByName, volByName, prByName }: Props) {
  const { data: catalog, isLoading } = useFullExerciseCatalog();
  const { data: userPhotos } = useUserExercisePhotos();
  const addExercise = useAddExercise();
  const deleteExercise = useDeleteExercise();
  const updateExercise = useUpdateExercise();
  const promoteExercise = usePromoteExercise();
  const { data: activeWorkout } = useActiveWorkout();
  const addToActiveWorkout = useAddExerciseToActiveWorkout();
  const startFromTemplate = useStartWorkoutFromTemplate();

  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState(CATALOG_GROUPS[0]);
  const [editingExercise, setEditingExercise] = useState<DbCatalogRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editGroup, setEditGroup] = useState("");
  const [promotingExercise, setPromotingExercise] = useState<DbCatalogRow | null>(null);
  const [promoteGroup, setPromoteGroup] = useState(CATALOG_GROUPS[0]);
  const [openExercise, setOpenExercise] = useState<BrowserExercise | null>(null);

  const items: BrowserExercise[] = useMemo(
    () => (catalog ?? []).map((r) => ({ id: r.id, name: r.name, group: r.group_name })),
    [catalog],
  );

  const isCustom = (id: string) => id.startsWith("custom__");

  const getPhoto = (name: string) => {
    if (userPhotos) {
      const userUrl = userPhotos.get(normalize(name));
      if (userUrl) return userUrl;
    }
    return exerciseIllustration(name);
  };

  const findRow = (id: string): DbCatalogRow | undefined => catalog?.find((r) => r.id === id);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await addExercise.mutateAsync({ name: newName.trim(), group_name: newGroup });
      toast.success(`"${newName.trim()}" ajouté`);
      setNewName("");
      setShowAdd(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'ajout");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (isCustom(id)) {
      toast.error("Exercice hors catalogue — supprime-le depuis tes séances.");
      return;
    }
    try {
      await deleteExercise.mutateAsync(id);
      toast.success(`"${name}" supprimé`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleEditSave = async () => {
    if (!editingExercise || !editName.trim()) return;
    try {
      await updateExercise.mutateAsync({ id: editingExercise.id, name: editName.trim(), group_name: editGroup });
      toast.success("Exercice modifié");
      setEditingExercise(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handlePromote = async () => {
    if (!promotingExercise) return;
    try {
      await promoteExercise.mutateAsync({ name: promotingExercise.name, group_name: promoteGroup });
      toast.success(`"${promotingExercise.name}" ajouté au catalogue`);
      setPromotingExercise(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  };

  const handleStartSession = async (name: string) => {
    try {
      await startFromTemplate.mutateAsync({ name: defaultWorkoutName(), gym_location: null, exercises: [{ name }] });
      onClose();
    } catch {
      // erreur déjà notifiée par le hook (toast.error)
    }
  };

  const handleAddToActive = async (name: string) => {
    if (!activeWorkout) return;
    try {
      await addToActiveWorkout.mutateAsync({ workoutId: activeWorkout.id, name });
      toast.success(`"${name}" ajouté à la séance en cours`);
      onClose();
    } catch {
      // erreur déjà notifiée par le hook (toast.error)
    }
  };

  // ── Menu "..." par ligne (gestion uniquement — la fiche porte le reste) ────

  const buildRowMenu = (ex: BrowserExercise) => {
    const row = findRow(ex.id);
    const custom = isCustom(ex.id);
    const actions: ExerciseMenuAction[] = [
      {
        key: "open",
        label: "Voir la fiche",
        icon: <BookOpen className="h-4 w-4" />,
        onClick: () => setOpenExercise(ex),
      },
    ];
    if (custom) {
      actions.push({
        key: "promote",
        label: "Ajouter au catalogue",
        icon: <Plus className="h-4 w-4" />,
        onClick: () => {
          setPromotingExercise({ id: ex.id, name: ex.name, group_name: ex.group, sort_order: 999, created_at: "" });
          setPromoteGroup(CATALOG_GROUPS[0]);
        },
      });
    } else if (row) {
      actions.push(
        {
          key: "edit",
          label: "Modifier",
          icon: <Check className="h-4 w-4" />,
          onClick: () => {
            setEditingExercise(row);
            setEditName(row.name);
            setEditGroup(row.group_name);
          },
        },
        {
          key: "delete",
          label: "Supprimer",
          icon: <X className="h-4 w-4" />,
          onClick: () => handleDelete(ex.id, ex.name),
          destructive: true,
        },
      );
    }
    return <ExerciseActionsMenu title={ex.name} actions={actions} />;
  };

  // ── Actions de la fiche d'analyse (contexte séance active ou non) ──────────

  const analysisActionsFor = (ex: BrowserExercise): ExerciseAnalysisActions => {
    const custom = isCustom(ex.id);
    const row = findRow(ex.id);
    return {
      onStartSession: !activeWorkout ? () => handleStartSession(ex.name) : undefined,
      onAddToActiveWorkout: activeWorkout ? () => handleAddToActive(ex.name) : undefined,
      onEdit: !custom && row ? () => { setEditingExercise(row); setEditName(row.name); setEditGroup(row.group_name); } : undefined,
      onDelete: !custom ? () => handleDelete(ex.id, ex.name) : undefined,
      onPromote: custom
        ? () => {
            setPromotingExercise({ id: ex.id, name: ex.name, group_name: ex.group, sort_order: 999, created_at: "" });
            setPromoteGroup(CATALOG_GROUPS[0]);
          }
        : undefined,
    };
  };

  const similarFor = (ex: BrowserExercise) =>
    findSimilarExercises({ name: ex.name, group: ex.group }, items.map((i) => ({ name: i.name, group: i.group })));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative flex h-[92vh] w-full max-w-[430px] flex-col rounded-t-3xl border-t border-border bg-card shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex shrink-0 justify-center pb-1 pt-3">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold">Catalogue d'exercices</h2>
            {catalog && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {catalog.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-primary transition-colors active:bg-primary/30"
              aria-label="Ajouter un exercice"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-muted-foreground"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="mx-4 mb-3 shrink-0 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Nouvel exercice</p>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Nom de l'exercice…"
              className="mb-3 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
            />
            <div className="mb-3 grid grid-cols-2 gap-1.5">
              {CATALOG_GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setNewGroup(g)}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    newGroup === g
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border bg-card/50 text-muted-foreground"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 rounded-xl border border-border bg-card py-2.5 text-sm font-semibold text-muted-foreground"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newName.trim() || addExercise.isPending}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {addExercise.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Ajouter
              </button>
            </div>
          </div>
        )}

        {/* Liste partagée (Catalogue ↔ Picker) */}
        <div className="flex min-h-0 flex-1 flex-col px-4">
          <ExerciseListBrowser
            items={items}
            isLoading={isLoading}
            query={query}
            onQueryChange={setQuery}
            groupOrder={ALL_GROUPS}
            highlightGroups={new Set(["Mes exercices"])}
            getPhoto={getPhoto}
            onRowTap={(ex) => setOpenExercise(ex)}
            renderRowMenu={buildRowMenu}
            emptyLabel={query ? "Aucun résultat." : "Catalogue vide — ajoutez des exercices."}
          />
        </div>
      </div>

      {/* Fiche d'analyse — page de référence de l'exercice */}
      {openExercise && (
        <ExerciseAnalysisSheet
          exerciseName={openExercise.name}
          weightHistory={histByName.get(normalize(openExercise.name)) ?? []}
          volumeHistory={volByName.get(normalize(openExercise.name)) ?? []}
          pr={prByName.get(normalize(openExercise.name))}
          imageUrl={getPhoto(openExercise.name)}
          onClose={() => setOpenExercise(null)}
          actions={analysisActionsFor(openExercise)}
          similarExercises={similarFor(openExercise)}
          onSelectSimilar={(name) => {
            const found = items.find((i) => normalize(i.name) === normalize(name));
            if (found) setOpenExercise(found);
          }}
        />
      )}

      {/* Modifier */}
      {editingExercise && (
        <EditExerciseSheet
          name={editName}
          group={editGroup}
          pending={updateExercise.isPending}
          onNameChange={setEditName}
          onGroupChange={setEditGroup}
          onCancel={() => setEditingExercise(null)}
          onSave={handleEditSave}
        />
      )}

      {/* Promouvoir */}
      {promotingExercise && (
        <PromoteExerciseSheet
          name={promotingExercise.name}
          group={promoteGroup}
          pending={promoteExercise.isPending}
          onGroupChange={setPromoteGroup}
          onCancel={() => setPromotingExercise(null)}
          onConfirm={handlePromote}
        />
      )}
    </div>
  );
}

// ── Petites feuilles de gestion (modifier / promouvoir) ──────────────────────

function EditExerciseSheet({
  name,
  group,
  pending,
  onNameChange,
  onGroupChange,
  onCancel,
  onSave,
}: {
  name: string;
  group: string;
  pending: boolean;
  onNameChange: (v: string) => void;
  onGroupChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[430px] rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Modifier l'exercice</p>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSave()}
          className="mb-3 w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
        />
        <div className="mb-4 grid grid-cols-2 gap-1.5">
          {CATALOG_GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onGroupChange(g)}
              className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                group === g ? "border-primary bg-primary/20 text-primary" : "border-border bg-card/50 text-muted-foreground"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground">
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!name.trim() || pending}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  );
}

function PromoteExerciseSheet({
  name,
  group,
  pending,
  onGroupChange,
  onCancel,
  onConfirm,
}: {
  name: string;
  group: string;
  pending: boolean;
  onGroupChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[430px] rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Ajouter "{name}" au catalogue</p>
        <div className="mb-4 grid grid-cols-2 gap-1.5">
          {CATALOG_GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onGroupChange(g)}
              className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                group === g ? "border-primary bg-primary/20 text-primary" : "border-border bg-card/50 text-muted-foreground"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground">
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
