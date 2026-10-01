import { useEffect, useMemo, useRef } from "react";
import { useWorkouts } from "@/hooks/use-fitness";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import { isHapticsEnabled } from "@/lib/haptics";
import { resolveSessionGoal, type SessionGoalInput } from "@/lib/fitness/sessionGoal";
import { summarizeTemplate } from "@/lib/fitness/weeklyPlan";
import { cn } from "@/lib/utils";

/**
 * Double impact bref, une seule fois, au moment où la dernière séance du même nom
 * est battue. Volontairement DISTINCT du buzz unique de 50 ms qu'émet déjà la
 * validation d'une série (`ActiveExerciseCard`), qui précède de quelques
 * millisecondes : un simple « 40 ms » se confondrait avec lui.
 */
const BEATEN_VIBRATION_PATTERN = [30, 70, 30];

/**
 * L'objectif de séance (C13), dans le bandeau de la séance en cours, sous le nom.
 *
 * Purement présentationnel : tout vient de `resolveSessionGoal`
 * (`lib/fitness/sessionGoal.ts`). Sans référence — première fois, séance libre —
 * il ne rend RIEN : on n'invente jamais une cible.
 *
 * La barre dit où tu en es (séries cochées sur séries prévues), le volume dit si
 * tu fais mieux. La cible est un miroir du passé, jamais une consigne de charge.
 * Couleurs : jetons du thème uniquement — `primary` suit le Rang courant, donc la
 * variante « dépassé » prend la matière du rang.
 */
export function SessionGoalBar({
  name,
  exercises,
}: {
  name: string;
  exercises: SessionGoalInput["exercises"];
}) {
  const { data: history } = useWorkouts();
  const { data: templates } = useWorkoutTemplates();

  const goal = useMemo(
    () =>
      resolveSessionGoal({
        name,
        exercises,
        history: history ?? [],
        templates: (templates ?? []).map(summarizeTemplate),
      }),
    [name, exercises, history, templates],
  );

  // Vibre à la TRANSITION « pas encore battu » → « battu », jamais au montage : rouvrir
  // une séance déjà dépassée ne doit pas vibrer.
  const wasBeaten = useRef<boolean | null>(null);
  const beaten = goal?.beaten ?? null;
  useEffect(() => {
    if (wasBeaten.current === false && beaten === true) {
      // Le réglage « Vibrations » du Profil fait foi (`lib/haptics`).
      if (
        isHapticsEnabled() &&
        typeof navigator !== "undefined" &&
        typeof navigator.vibrate === "function"
      ) {
        navigator.vibrate(BEATEN_VIBRATION_PATTERN);
      }
    }
    wasBeaten.current = beaten;
  }, [beaten]);

  if (goal === null) return null;

  return (
    <div
      data-beaten={goal.beaten}
      className={cn(
        "border-t px-4 pb-3 pt-2.5",
        goal.beaten ? "border-primary/30 bg-primary/[0.08]" : "border-white/5",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-[0.16em]",
            goal.beaten ? "text-primary" : "text-muted-foreground",
          )}
        >
          {goal.label}
        </span>
        <span className="text-[13px] font-bold tabular-nums">
          {goal.setsDone}
          <span className="font-semibold text-muted-foreground">
            {" "}
            / {goal.setsTarget} série{goal.setsTarget > 1 ? "s" : ""}
          </span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Séries cochées"
        aria-valuemin={0}
        aria-valuemax={goal.setsTarget}
        aria-valuenow={Math.min(goal.setsDone, goal.setsTarget)}
        aria-valuetext={`${goal.setsDone} série${goal.setsDone > 1 ? "s" : ""} sur ${goal.setsTarget}`}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            goal.beaten ? "bg-gradient-primary shadow-glow" : "bg-primary/80",
          )}
          style={{ width: `${Math.round(goal.progress * 100)}%` }}
        />
      </div>
      <p
        className={cn(
          "mt-1.5 text-[11px] leading-snug",
          goal.beaten ? "text-primary" : "text-muted-foreground",
        )}
      >
        {goal.note}
      </p>
    </div>
  );
}
