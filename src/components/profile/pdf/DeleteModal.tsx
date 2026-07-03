import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UserPdf } from "@/hooks/use-user-pdfs";

export function DeleteModal({
  pdf,
  onConfirm,
  onCancel,
  isPending,
}: {
  pdf: UserPdf;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-t-3xl border border-white/10 bg-card p-6 sm:rounded-3xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <Trash2 className="h-5 w-5" />
        </div>
        <p className="font-semibold">Supprimer ce PDF ?</p>
        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{pdf.file_name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Cette action est irréversible.</p>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel} disabled={isPending}>
            Annuler
          </Button>
          <Button variant="destructive" className="flex-1" onClick={onConfirm} disabled={isPending}>
            {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Supprimer
          </Button>
        </div>
      </div>
    </div>
  );
}
