import { useState, useMemo } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { CATALOG_GROUPS } from "@/lib/fitness/exerciseCatalog";
import { toast } from "sonner";
import {
  useExerciseCatalog,
  useAddExercise,
  useDeleteExercise,
  useUpdateExercise,
} from "@/hooks/useExerciseCatalog";

interface Props {
  onClose: () => void;
}

export function ExerciseCatalogSheet({ onClose }: Props) {
  const { data: catalog, isLoading } = useExerciseCatalog();
  const addExercise = useAddExercise();
  const deleteExercise = useDeleteExercise();
  const updateExercise = useUpdateExercise();

  const [query, setQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(CATALOG_GROUPS),
  );
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState(CATALOG_GROUPS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editGroup, setEditGroup] = useState("");

  const normQuery = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const q = normQuery(query);
    if (!q) return catalog;
    return catalog.filter(
      (e) =>
        normQuery(e.name).includes(q) || normQuery(e.group_name).includes(q),
    );
  }, [catalog, query]);

  const byGroup = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const arr = map.get(e.group_name) ?? [];
      arr.push(e);
      map.set(e.group_name, arr);
    }
    return map;
  }, [filtered]);

  const allDisplayGroups = [
    ...CATALOG_GROUPS.filter((g) => byGroup.has(g)),
    ...[...byGroup.keys()].filter((g) => !CATALOG_GROUPS.includes(g)),
  ];

  const toggleGroup = (g: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });

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
    try {
      await deleteExercise.mutateAsync(id);
      toast.success(`"${name}" supprimé`);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erreur lors de la suppression",
      );
    }
  };

  const handleEditSave = async () => {
    if (!editingId || !editName.trim()) return;
    try {
      await updateExercise.mutateAsync({
        id: editingId,
        name: editName.trim(),
        group_name: editGroup,
      });
      toast.success("Exercice modifié");
      setEditingId(null);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Erreur lors de la modification",
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      onClick={onClose}
    >
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

        {/* Search */}
        <div className="shrink-0 px-4 pb-3">
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un exercice…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="mx-4 mb-3 shrink-0 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
              Nouvel exercice
            </p>
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
                {addExercise.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Ajouter
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {isLoading && (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && allDisplayGroups.length === 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              {query
                ? "Aucun résultat."
                : "Catalogue vide — ajoutez des exercices."}
            </p>
          )}

          {allDisplayGroups.map((group) => {
            const exercises = byGroup.get(group) ?? [];
            const isExpanded = expandedGroups.has(group);

            return (
              <div key={group} className="mb-3">
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </span>
                  <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {exercises.length}
                  </span>
                </button>

                {isExpanded && (
                  <ul className="space-y-0.5 pl-6">
                    {exercises.map((ex) =>
                      editingId === ex.id ? (
                        <li key={ex.id} className="rounded-xl border border-primary/40 bg-primary/5 p-2">
                          <input
                            autoFocus
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) =>
                              e.key === "Enter" && handleEditSave()
                            }
                            className="mb-2 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
                          />
                          <div className="mb-2 flex flex-wrap gap-1">
                            {CATALOG_GROUPS.map((g) => (
                              <button
                                key={g}
                                type="button"
                                onClick={() => setEditGroup(g)}
                                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                  editGroup === g
                                    ? "border-primary bg-primary/20 text-primary"
                                    : "border-border text-muted-foreground"
                                }`}
                              >
                                {g}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="flex-1 rounded-lg border border-border py-1.5 text-xs font-semibold text-muted-foreground"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={handleEditSave}
                              disabled={updateExercise.isPending}
                              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                            >
                              {updateExercise.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="h-3 w-3" />
                              )}
                              Sauvegarder
                            </button>
                          </div>
                        </li>
                      ) : (
                        <li key={ex.id}>
                          <div className="group flex items-center justify-between gap-2 rounded-xl px-3 py-2 hover:bg-white/[0.04]">
                            <span className="flex-1 truncate text-sm">
                              {ex.name}
                            </span>
                            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(ex.id);
                                  setEditName(ex.name);
                                  setEditGroup(ex.group_name);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-muted-foreground hover:bg-primary/20 hover:text-primary"
                                aria-label={`Modifier ${ex.name}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(ex.id, ex.name)}
                                disabled={deleteExercise.isPending}
                                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-50"
                                aria-label={`Supprimer ${ex.name}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
