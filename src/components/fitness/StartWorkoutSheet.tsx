import { useState } from "react";
import { Loader2, X, Zap } from "lucide-react";
import { useStartWorkout } from "@/hooks/use-fitness";
import { GYMS, defaultWorkoutName } from "@/lib/fitness/config";

export function StartWorkoutSheet({ onClose }: { onClose: () => void }) {
  const start = useStartWorkout();
  const [name, setName] = useState(defaultWorkoutName);
  const [gym, setGym] = useState<string>("Keep Cool");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await start.mutateAsync({ name: name.trim(), gym_location: gym });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form
        className="relative w-full max-w-[430px] rounded-t-3xl border-t border-border bg-card px-5 pt-4 pb-8 shadow-elevated"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        {/* Handle */}
        <div className="mb-4 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Nouvelle séance
            </p>
            <h2 className="text-lg font-bold">Démarrer maintenant</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nom */}
        <div className="mb-4">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Nom de la séance
          </label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Push, Jambes, Cardio…"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium outline-none placeholder:text-muted-foreground/50 focus:border-primary"
            required
          />
        </div>

        {/* Salle */}
        <div className="mb-6">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Salle
          </label>
          <div className="grid grid-cols-2 gap-2">
            {GYMS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGym(g)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  gym === g
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={!name.trim() || start.isPending}
          className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
        >
          {start.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Démarrer la séance
        </button>
      </form>
    </div>
  );
}
