import { useState } from "react";
import { Plus, Pencil, Trash2, Loader2, GripVertical, X, Check } from "lucide-react";
import { getIcon } from "@/lib/maison/icons";
import { CategoryIconPicker } from "./CategoryIconPicker";
import {
  useHomeSubcategories,
  useCreateSubcategory,
  useUpdateSubcategory,
  useDeleteSubcategory,
} from "@/hooks/useHomeSubcategories";
import type { HomeSubcategory } from "@/types/home";

interface SubcategoryListProps {
  categoryId: string;
  categoryName: string;
  onClose: () => void;
}

export function SubcategoryList({ categoryId, categoryName, onClose }: SubcategoryListProps) {
  const { data: subs = [], isLoading } = useHomeSubcategories(categoryId);
  const create = useCreateSubcategory();
  const update = useUpdateSubcategory(categoryId);
  const remove = useDeleteSubcategory(categoryId);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("Box");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("Box");
  const [showIconPicker, setShowIconPicker] = useState<"new" | string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await create.mutateAsync({ category_id: categoryId, name: newName.trim(), icon: newIcon });
    setNewName("");
    setNewIcon("Box");
    setCreating(false);
    setShowIconPicker(null);
  };

  const startEdit = (sub: HomeSubcategory) => {
    setEditId(sub.id);
    setEditName(sub.name);
    setEditIcon(sub.icon);
    setShowIconPicker(null);
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    await update.mutateAsync({ id, patch: { name: editName.trim(), icon: editIcon } });
    setEditId(null);
  };

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] rounded-t-3xl border border-border bg-card shadow-elevated max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Compartiments</p>
            <h2 className="text-base font-bold">{categoryName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && subs.map((sub) => {
            const SubIcon = getIcon(sub.icon);
            const isEditing = editId === sub.id;

            return (
              <div key={sub.id} className="rounded-2xl border border-border bg-surface p-3">
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowIconPicker(showIconPicker === sub.id ? null : sub.id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-elevated"
                      >
                        {getIcon(editIcon)({ className: "h-4 w-4" })}
                      </button>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                        autoFocus
                      />
                    </div>
                    {showIconPicker === sub.id && (
                      <CategoryIconPicker value={editIcon} onChange={setEditIcon} />
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditId(null)}
                        className="flex-1 rounded-xl border border-border py-2 text-xs font-semibold"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdate(sub.id)}
                        disabled={update.isPending}
                        className="flex flex-[1.5] items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        {update.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Sauver
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated">
                      <SubIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className="flex-1 text-sm font-medium">{sub.name}</span>
                    <button
                      type="button"
                      onClick={() => startEdit(sub)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-elevated"
                      aria-label="Modifier"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove.mutate(sub.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {!isLoading && subs.length === 0 && !creating && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun compartiment. Ajoutez-en un ci-dessous.
            </p>
          )}

          {/* Formulaire création */}
          {creating ? (
            <form onSubmit={handleCreate} className="rounded-2xl border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowIconPicker(showIconPicker === "new" ? null : "new")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-surface-elevated"
                >
                  {getIcon(newIcon)({ className: "h-4 w-4" })}
                </button>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nom du compartiment…"
                  className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                  autoFocus
                />
              </div>
              {showIconPicker === "new" && (
                <CategoryIconPicker value={newIcon} onChange={setNewIcon} />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setCreating(false); setShowIconPicker(null); }}
                  className="flex-1 rounded-xl border border-border py-2 text-xs font-semibold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={create.isPending || !newName.trim()}
                  className="flex flex-[1.5] items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {create.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Ajouter
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Plus className="h-4 w-4" />
              Ajouter un compartiment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
