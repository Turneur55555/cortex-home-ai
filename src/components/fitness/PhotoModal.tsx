import { Camera, Trash2, X } from "lucide-react";

export function PhotoModal({
  url,
  onClose,
  onDelete,
  onModify,
}: {
  url: string;
  onClose: () => void;
  onDelete: () => void;
  onModify: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
    >
      <div className="relative w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <img src={url} alt="Exercice" className="w-full rounded-2xl object-contain" />
        <div className="mt-4 flex gap-3">
          <button
            onClick={onModify}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/15 py-2.5 text-sm font-semibold text-white"
          >
            <Camera className="h-4 w-4" />
            Modifier
          </button>
          <button
            onClick={onDelete}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-destructive/80 py-2.5 text-sm font-semibold text-white"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
