// ============================================================
// Confirmation "Refaire en live" — Phase C, lot V1 (P1-6).
//
// Remplace les deux `window.confirm()` natifs (SeancesTab.repeatLive côté
// musculation, GenericHistoryCard.handleRepeatLive côté générique) : hors
// charte visuelle, et la boîte native avait bloqué les onglets de test de
// la Phase B. Un seul composant, deux appelants — même gabarit que
// WorkoutDeleteDialog (le dialogue de référence du module), action
// primaire au lieu de destructive.
// ============================================================

export function RepeatLiveConfirmDialog({
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
        <p className="mb-1 text-sm font-semibold">Refaire « {workoutName} » en live ?</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Une séance active démarre immédiatement, pré-remplie avec les exercices de cette séance.
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
            className="flex-1 rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Refaire
          </button>
        </div>
      </div>
    </div>
  );
}
