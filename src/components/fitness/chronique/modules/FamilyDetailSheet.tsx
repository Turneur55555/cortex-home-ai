// ============================================================
// LES CHRONIQUES — détail d'une famille musculaire (Les Légendes).
//
// « Le détail d'un groupe musculaire lorsqu'on clique dessus : la
// progression vers le rang suivant, les exercices ayant contribué à ce
// rang. » Aucune nouvelle donnée : la progression vient de
// specRankFromVolume (même moteur que la carte), les exercices
// contributeurs viennent de computeLegends() filtrés par la même
// taxonomie muscle → famille que la carte mère (SPECIALIZATION_GROUPS).
// ============================================================

import { useMemo } from "react";
import { Dumbbell } from "lucide-react";
import { AppSheet } from "@/components/profile/AppSheet";
import type { WorkoutRow } from "@/components/fitness/WorkoutCard";
import {
  computeLegends,
  SPECIALIZATION_GROUPS,
  type Specialization,
} from "@/lib/fitness/chronicles";
import { exerciseToMuscles } from "@/lib/fitness/muscleMapping";
import { formatTonnage } from "@/lib/fitness/strength";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { specRankFromVolume } from "../livreData";
import { RankPill, MasteryGauge } from "../livreParts";

export function FamilyDetailSheet({
  family,
  workouts,
  onClose,
}: {
  family: Specialization;
  workouts: WorkoutRow[];
  onClose: () => void;
}) {
  const sr = specRankFromVolume(family.volume);
  const pct = family.volume > 0 ? sr.rank.xp : 0;

  const contributors = useMemo(() => {
    const group = SPECIALIZATION_GROUPS.find((g) => g.id === family.id);
    if (!group) return [];
    const all = computeLegends(workouts, 999);
    return all
      .filter((card) => exerciseToMuscles(card.name).some((m) => group.muscles.includes(m)))
      .slice(0, 12);
  }, [family.id, workouts]);

  return (
    <AppSheet open onOpenChange={(o) => !o && onClose()} title={family.title} size="full">
      <div className="space-y-5 pb-4 pt-1">
        <div className="relative overflow-hidden rounded-3xl">
          <div className="relative aspect-[16/10] w-full">
            <RankIllustration
              rankKey={sr.rank.rank.key}
              label={sr.rank.rank.label}
              className="absolute inset-0 h-full w-full"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          </div>
          <div className="absolute inset-x-0 bottom-0 p-4">
            <RankPill rank={sr.rank} />
          </div>
        </div>

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Progression
            </h3>
            <span className="text-[11px] font-bold tabular-nums text-white/70">{pct}%</span>
          </div>
          <MasteryGauge percent={pct} gradient={sr.gradient} height="h-2" />
          <div className="mt-2 flex items-center justify-between text-[11px] text-white/50">
            <span>
              {family.volume > 0
                ? `${formatTonnage(family.volume)} soulevés`
                : "Pas encore entraîné"}
              {family.sets > 0 ? ` · ${family.sets} séries` : ""}
            </span>
            {sr.nextName && (
              <span className="font-medium text-amber-300/80">Vers {sr.nextName}</span>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Exercices contributeurs
          </h3>
          {contributors.length === 0 ? (
            <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-center text-xs text-muted-foreground">
              Aucun exercice construit sur la durée dans ce groupe pour l'instant.
            </p>
          ) : (
            <div className="space-y-2">
              {contributors.map((c) => (
                <div
                  key={c.key}
                  className="flex items-center gap-3 rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/[0.05]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-white/50">
                    <Dumbbell className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white/90">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      PR {c.pr} kg · {c.sessions} séance{c.sessions > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppSheet>
  );
}
