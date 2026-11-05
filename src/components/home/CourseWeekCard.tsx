import { Link } from "@tanstack/react-router";
import { Check, Plus, Sparkles } from "lucide-react";
import { useWorkouts } from "@/hooks/use-fitness";
import { useLocalToday } from "@/hooks/useLocalToday";
import { useRewardAmount } from "@/hooks/useRewardAmount";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import { courseOfTemplate } from "@/lib/fitness/courses";
import { COURSE_SLOTS_PER_WEEK, courseWeek, type CourseWeekSlot } from "@/lib/fitness/courseWeek";
import { cn } from "@/lib/utils";

/**
 * « Tes cours » — sous « Ton rythme » sur l'Accueil (variante B, version fine,
 * choisie par Nathan le 05/11/2026) : deux créneaux de cours par semaine, le
 * cours fait (jour, XP réellement versée) et celui qui reste à prendre.
 * Invisible tant que le joueur n'a ni modèle de cours ni cours cette semaine.
 */
export function CourseWeekCard() {
  const today = useLocalToday();
  const { data: workouts } = useWorkouts();
  const { data: templates } = useWorkoutTemplates();
  const { data: courseXp } = useRewardAmount("workout_course");

  const week = courseWeek(workouts ?? [], today);
  const hasCourseTemplate = (templates ?? []).some((t) => courseOfTemplate(t) !== null);
  if (!hasCourseTemplate && week.doneCount === 0) return null;

  return (
    <section
      aria-label="Tes cours cette semaine"
      className="mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <Sparkles aria-hidden className="h-3.5 w-3.5 text-violet-300" />
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Tes cours
          </h2>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {Math.min(week.doneCount, COURSE_SLOTS_PER_WEEK)} / {COURSE_SLOTS_PER_WEEK} cette semaine
        </span>
      </div>
      <ol className="grid grid-cols-2 gap-1.5">
        {week.slots.map((slot, index) => (
          <li key={slot.kind === "done" ? slot.workoutId : `open-${index}`}>
            <CourseSlot slot={slot} courseXp={courseXp ?? null} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function CourseSlot({ slot, courseXp }: { slot: CourseWeekSlot; courseXp: number | null }) {
  const base = "flex h-10 w-full items-center gap-2 rounded-xl px-3 text-left";
  if (slot.kind === "done") {
    return (
      <div className={cn(base, "bg-violet-500/[0.12] ring-1 ring-inset ring-violet-400/35")}>
        <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-violet-300" strokeWidth={3} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">
          {slot.courseName}
          <span className="ml-1 font-normal text-muted-foreground">{slot.dayShort}</span>
        </span>
        {slot.xp != null && slot.xp > 0 && (
          <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-amber-300">
            +{slot.xp}
          </span>
        )}
      </div>
    );
  }
  return (
    <Link
      to="/seances"
      search={{ demarrer: "nouvelle" }}
      className={cn(base, "border border-dashed border-white/[0.12] active:scale-[0.98]")}
    >
      <Plus aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
        À prendre
      </span>
      {courseXp != null && (
        <span className="shrink-0 text-[11.5px] font-semibold tabular-nums text-muted-foreground">
          +{courseXp}
        </span>
      )}
    </Link>
  );
}
