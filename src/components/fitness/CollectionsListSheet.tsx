import { useState } from "react";
import { motion } from "framer-motion";
import { Check, FolderPlus, Loader2, Pencil, Trash2, X } from "lucide-react";
import { FullscreenSheet, SubmitButton } from "@/components/shared/FormComponents";
import {
  useCollections,
  useCreateCollection,
  useDeleteCollection,
  useRenameCollection,
  type RecipeCollection,
} from "@/hooks/useCollections";

const PRESS = { scale: 0.97 };

/**
 * Gestion des collections (créer/renommer/supprimer) — "Favoris" n'apparaît
 * jamais ici (collection virtuelle dérivée de recipes.is_favorite, gérée par
 * l'étoile déjà présente sur chaque recette).
 */
export function CollectionsListSheet({ onClose }: { onClose: () => void }) {
  const { data: collections, isLoading } = useCollections();
  const createCollection = useCreateCollection();
  const renameCollection = useRenameCollection();
  const deleteCollection = useDeleteCollection();

  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createCollection.mutate(newName.trim(), { onSuccess: () => setNewName("") });
  };

  const startEditing = (c: RecipeCollection) => {
    setEditingId(c.id);
    setEditingName(c.name);
  };

  const saveRename = (id: string) => {
    if (!editingName.trim()) return;
    renameCollection.mutate(
      { id, name: editingName.trim() },
      { onSuccess: () => setEditingId(null) },
    );
  };

  return (
    <FullscreenSheet title="Mes collections" subtitle="Organise tes recettes" onClose={onClose}>
      <form onSubmit={submit} className="mb-5 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nouvelle collection (ex. Sport du dimanche)"
          maxLength={60}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <div className="w-28">
          <SubmitButton pending={createCollection.isPending}>
            <FolderPlus className="h-4 w-4" />
          </SubmitButton>
        </div>
      </form>

      {isLoading && (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (collections?.length ?? 0) === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <FolderPlus className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucune collection</p>
        </div>
      )}

      <ul className="space-y-2">
        {(collections ?? []).map((c) => (
          <li key={c.id} className="rounded-2xl border border-border bg-card p-3">
            {editingId === c.id ? (
              <div className="flex items-center gap-2">
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  maxLength={60}
                  autoFocus
                  className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => saveRename(c.id)}
                  disabled={renameCollection.isPending}
                  aria-label="Valider"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-primary disabled:opacity-60"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  aria-label="Annuler"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : confirmDeleteId === c.id ? (
              <div className="flex items-center gap-2">
                <p className="flex-1 text-xs text-destructive">Supprimer « {c.name} » ?</p>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() =>
                    deleteCollection.mutate(c.id, { onSuccess: () => setConfirmDeleteId(null) })
                  }
                  disabled={deleteCollection.isPending}
                  className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground disabled:opacity-60"
                >
                  Supprimer
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
                <motion.button
                  whileTap={PRESS}
                  type="button"
                  onClick={() => startEditing(c)}
                  aria-label={`Renommer ${c.name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </motion.button>
                <motion.button
                  whileTap={PRESS}
                  type="button"
                  onClick={() => setConfirmDeleteId(c.id)}
                  aria-label={`Supprimer ${c.name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </motion.button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </FullscreenSheet>
  );
}
