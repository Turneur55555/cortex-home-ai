import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { HomeCategory } from "@/types/home";

interface DeleteCategoryDialogProps {
  category: HomeCategory;
  otherCategories: HomeCategory[];
  onConfirm: () => void;
  onClose: () => void;
}

type Action = "delete" | "transfer";

export function DeleteCategoryDialog({
  category,
  otherCategories,
  onConfirm,
  onClose,
}: DeleteCategoryDialogProps) {
  const [action, setAction] = useState<Action>("delete");
  const [transferTo, setTransferTo] = useState(otherCategories[0]?.slug ?? "");
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      if (action === "transfer" && transferTo) {
        await supabase
          .from("items")
          .update({ room: transferTo })
          .eq("room", category.slug);
      } else {
        await supabase
          .from("items")
          .delete()
          .eq("room", category.slug);
      }
      onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] rounded-t-3xl border border-border bg-card p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="font-bold">Supprimer « {category.name} » ?</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Cette action supprimera aussi tous les sous-compartiments.
            </p>
          </div>
        </div>

        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Que faire des objets liés ?
        </p>

        <div className="space-y-2 mb-4">
          {/* Option : supprimer */}
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
            action === "delete" ? "border-destructive/50 bg-destructive/5" : "border-border bg-surface"
          }`}>
            <input
              type="radio"
              name="action"
              value="delete"
              checked={action === "delete"}
              onChange={() => setAction("delete")}
              className="mt-0.5 accent-destructive"
            />
            <div>
              <p className="text-sm font-semibold">Supprimer tous les objets</p>
              <p className="text-xs text-muted-foreground">Les objets de cette catégorie seront définitivement supprimés.</p>
            </div>
          </label>

          {/* Option : transférer */}
          {otherCategories.length > 0 && (
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
              action === "transfer" ? "border-primary/50 bg-primary/5" : "border-border bg-surface"
            }`}>
              <input
                type="radio"
                name="action"
                value="transfer"
                checked={action === "transfer"}
                onChange={() => setAction("transfer")}
                className="mt-0.5 accent-primary"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Transférer vers…</p>
                <select
                  value={transferTo}
                  onChange={(e) => {
                    setTransferTo(e.target.value);
                    setAction("transfer");
                  }}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
                >
                  {otherCategories.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={loading || (action === "transfer" && !transferTo)}
            onClick={handleConfirm}
            className="flex flex-[1.2] items-center justify-center gap-2 rounded-xl bg-destructive py-3 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}
