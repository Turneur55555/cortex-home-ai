import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { CategoryColorPicker } from "./CategoryColorPicker";
import { CategoryIconPicker } from "./CategoryIconPicker";
import { getIcon } from "@/lib/maison/icons";
import type { HomeCategory, CreateCategoryInput, UpdateCategoryInput } from "@/types/home";

interface CategoryModalProps {
  category?: HomeCategory;
  onSave: (data: CreateCategoryInput | UpdateCategoryInput) => Promise<void>;
  onClose: () => void;
}

const DEFAULTS = { name: "", icon: "Box", color: "#6366f1" };

export function CategoryModal({ category, onSave, onClose }: CategoryModalProps) {
  const [form, setForm] = useState({
    name: category?.name ?? DEFAULTS.name,
    icon: category?.icon ?? DEFAULTS.icon,
    color: category?.color ?? DEFAULTS.color,
  });
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"icon" | "color">("icon");

  useEffect(() => {
    if (category) setForm({ name: category.name, icon: category.icon, color: category.color });
  }, [category]);

  const PreviewIcon = getIcon(form.icon);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      await onSave({ name: form.name.trim(), icon: form.icon, color: form.color });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] rounded-t-3xl border border-border bg-card p-5 shadow-elevated max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="mb-4 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {category ? "Modifier la catégorie" : "Nouvelle catégorie"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Preview live */}
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-md transition-all duration-200"
            style={{ background: form.color }}
          >
            <PreviewIcon className="h-6 w-6" />
          </div>
          <p className="text-base font-bold">{form.name || "Nom de la catégorie"}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nom
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Cuisine, Jardin…"
              required
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </div>

          {/* Tabs icône / couleur */}
          <div className="flex rounded-xl border border-border bg-surface p-1 gap-1">
            {(["icon", "color"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                  tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {t === "icon" ? "Icône" : "Couleur"}
              </button>
            ))}
          </div>

          {tab === "icon" ? (
            <CategoryIconPicker
              value={form.icon}
              onChange={(icon) => setForm((f) => ({ ...f, icon }))}
            />
          ) : (
            <CategoryColorPicker
              value={form.color}
              onChange={(color) => setForm((f) => ({ ...f, color }))}
            />
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !form.name.trim()}
              className="flex flex-[1.5] items-center justify-center gap-2 rounded-xl bg-gradient-primary py-3 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {category ? "Sauvegarder" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
