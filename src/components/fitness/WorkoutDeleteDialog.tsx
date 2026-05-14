export function WorkoutDeleteDialog({
  workoutName,
  onConfirm,
  onCancel,
}: {
  workoutName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="mb-20 w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-1 text-sm font-semibold">Supprimer « {workoutName} » ?</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Cette action est irréversible. Tous les exercices seront supprimés.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-white"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
