import { useMemo, useState } from "react";
import { ChevronRight, Sparkles, Swords } from "lucide-react";
import { AppSheet } from "@/components/profile/AppSheet";
import { computeCharacterClass, type CharacterClassResult } from "@/lib/profile/characterClass";
import type { RankAggregate } from "@/components/fitness/RankAggregator";
import { gradeName } from "@/lib/fitness/rpg/grade";

interface WorkoutLike {
  date: string;
  exercises: Array<{
    name: string;
    weight: number | null;
    sets: number | null;
    reps: number | null;
  }>;
}

interface Props {
  workouts: WorkoutLike[];
  rankAggregate: RankAggregate;
}

/**
 * Classe principale — carte épurée, aucune statistique en façade. Tout
 * l'explicatif (pourquoi cette classe, quelles données, comment évoluer)
 * vit dans le bottom sheet ouvert au tap. Dérivé uniquement de données déjà
 * calculées ailleurs (volume par exercice + classification de famille du
 * moteur Rang existant, rangs déjà sondés par RankAggregator) — aucune
 * nouvelle règle métier.
 */
export function ClassCard({ workouts, rankAggregate }: Props) {
  const [open, setOpen] = useState(false);

  const result = useMemo(
    () => computeCharacterClass(workouts, rankAggregate.reports),
    [workouts, rankAggregate.reports],
  );

  if (!result) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] px-4 py-3.5 text-left backdrop-blur-xl transition-colors hover:border-primary/30"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Swords className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Classe principale
            </p>
            <p className="truncate text-base font-bold tracking-tight">{result.className}</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <ClassDetailSheet open={open} onOpenChange={setOpen} result={result} />
    </>
  );
}

function ClassDetailSheet({
  open,
  onOpenChange,
  result,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: CharacterClassResult;
}) {
  const secondFamily = result.breakdown[1] ?? null;
  const accentColor = result.bestRankInFamily?.rank.colors.secondary;

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      title={result.className}
      description="Comment cette classe a été déterminée"
      size="full"
    >
      <div className="space-y-5 pb-4 pt-2">
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pourquoi cette classe ?
          </h3>
          <p className="text-sm leading-relaxed text-foreground/90">
            <strong>{result.dominantShare}%</strong> de ton volume d'entraînement loggé porte sur
            des mouvements de la famille associée à « {result.className} »
            {result.breakdown[0]?.topExerciseName && (
              <>
                {" "}
                — principalement via <strong>{result.breakdown[0].topExerciseName}</strong>
              </>
            )}
            . C'est la famille la mieux représentée dans ton historique de séances.
          </p>
          {result.bestRankInFamily && (
            <p className="mt-2 text-sm leading-relaxed text-foreground/90">
              Ton meilleur rang dans cette famille :{" "}
              <strong>
                {result.bestRankInFamily.rank.label} —{" "}
                {gradeName(result.bestRankInFamily.rank.key, result.bestRankInFamily.levelInRank)}
              </strong>
              .
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Répartition de ton volume
          </h3>
          <div className="space-y-2">
            {result.breakdown.slice(0, 6).map((f) => (
              <div
                key={f.family}
                className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/[0.05]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-foreground/90">
                    {f.className}
                  </span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">
                    {f.share}%
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${f.share}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground/70">
                  {f.sessionsCount} séance{f.sessionsCount > 1 ? "s" : ""} · {f.exerciseCount}{" "}
                  exercice{f.exerciseCount > 1 ? "s" : ""}
                  {f.bestRank &&
                    ` · ${f.bestRank.rank.label} — ${gradeName(f.bestRank.rank.key, f.bestRank.levelInRank)}`}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accentColor }} />
            <div className="min-w-0 space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Comment évoluer
              </h3>
              <p className="text-xs leading-relaxed text-foreground/80">
                Continue à travailler les mouvements de <strong>{result.className}</strong> pour
                renforcer cette spécialisation et progresser vers un rang supérieur.
              </p>
              {secondFamily && (
                <p className="text-xs leading-relaxed text-foreground/80">
                  Pour diversifier, augmente la part de <strong>{secondFamily.className}</strong>{" "}
                  (actuellement {secondFamily.share}% de ton volume) — assez de séances dans cette
                  famille peut en faire ta nouvelle classe principale.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </AppSheet>
  );
}
