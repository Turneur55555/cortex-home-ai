import { Sparkles } from "lucide-react";
import { MUSCLE_META } from "@/lib/fitness/muscleMapping";
import { courseCaloriesEstimate, type Course } from "@/lib/fitness/courses";

/**
 * Carte d'un cours encadré (Lagree) pendant la séance : le cours, sa durée
 * fixe et ses zones ciblées — juste les zones, aucun mannequin (choix Nathan,
 * 04/11/2026). UI seule : le cours vient de `lib/fitness/courses.ts`.
 */
export function CourseSessionCard({ course }: { course: Course }) {
  const stats = [
    { value: String(course.durationMinutes), label: "min" },
    { value: `~${courseCaloriesEstimate(course)}`, label: "kcal estimées" },
    { value: String(course.zones.length), label: "zones" },
  ];

  return (
    <section aria-label={`Cours de ${course.name}`} className="flex flex-col gap-3">
      <div className="rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-500/15 to-card p-4 shadow-[0_0_30px_-12px_rgba(167,139,250,0.45)]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-400/15 text-violet-300">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold text-foreground">
                {course.activity}
              </span>
              <span className="rounded-md bg-violet-400/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-300">
                Cours
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {course.format} · {course.durationMinutes} min
            </p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Zones ciblées
        </h3>
        <ul className="rounded-2xl border border-border bg-card px-4">
          {course.zones.map((zone) => (
            <li
              key={zone}
              className="flex items-center gap-3 border-t border-border py-3 text-sm text-foreground first:border-t-0"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]"
              />
              {MUSCLE_META[zone].label}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-surface-elevated px-2 py-2.5 text-center">
            <div className="text-lg font-bold tabular-nums text-foreground">{s.value}</div>
            <div className="text-[10.5px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
