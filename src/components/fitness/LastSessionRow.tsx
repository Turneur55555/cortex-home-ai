import { Link } from "@tanstack/react-router";
import { ChevronRight, History } from "lucide-react";
import { useLocalToday } from "@/hooks/useLocalToday";
import {
  lastCompletedSession,
  relativeDaysLabel,
  type TodayWorkout,
} from "@/lib/fitness/todayCard";

/**
 * « Dernière séance » — le seul endroit de l'Arène qui montre une séance FAITE.
 *
 * Avant, l'onglet Séances n'en montrait aucune : le sélecteur, une citation, « Choisir une
 * épreuve », le plan, le Scan des Titans. Pour retrouver ce qu'on avait fait, il fallait passer
 * aux Chroniques puis à la Progression. Une ligne, un fait (le nom et le jour, tels qu'ils sont
 * enregistrés), un tap vers la Chronique de cette séance.
 *
 * Rien n'est affiché sans séance terminée : on n'invente pas de « dernière fois ».
 */
export function LastSessionRow({ workouts }: { workouts: readonly TodayWorkout[] | undefined }) {
  const today = useLocalToday();
  const last = lastCompletedSession(workouts ?? []);
  if (!last) return null;

  return (
    <Link
      to="/chroniques"
      search={{ seance: last.workoutId }}
      className="-mt-1 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 active:scale-[0.99]"
    >
      <History aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Dernière séance
        </span>
        <span className="block truncate text-sm font-semibold">
          {last.name.trim() || "Sans nom"} · {relativeDaysLabel(last.date, today)}
        </span>
      </span>
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
