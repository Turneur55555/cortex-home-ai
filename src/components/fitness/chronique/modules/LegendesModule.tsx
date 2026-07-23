// ============================================================
// LES CHRONIQUES — Module « Les Légendes ».
//
// Mission unique : montrer, d'un coup d'œil, le niveau de maîtrise du
// joueur, groupe musculaire par groupe musculaire. Aucune XP globale,
// aucune statistique générale, aucun historique, aucun badge ici — ce
// module ne fait QUE projeter le volume réellement soulevé sur l'échelle
// de rang officielle (specRankFromVolume, LOT C3 — même moteur de
// projection que le Profil, jamais une seconde dérivation inventée).
//
// Hero = ClassCard (Classe principale), déjà l'artefact d'identité
// existant — pas de doublon, réutilisé tel quel. Le détail d'une famille
// (progression + exercices contributeurs) vit dans FamilyDetailSheet.
// ============================================================

import { useMemo, useState } from "react";
import { Crown } from "lucide-react";
import type { RankAggregate } from "@/components/fitness/RankAggregator";
import { ClassCard } from "@/components/profile/ClassCard";
import { SectionReveal } from "@/components/fitness/SectionReveal";
import type { WorkoutRow } from "@/components/fitness/WorkoutCard";
import { computeLegendFamilies, type WorkoutLike } from "@/lib/fitness/chronicles";
import { specRankFromVolume } from "../livreData";
import { ModuleSectionTitle, PopIn, RankPill } from "../livreParts";
import { RankIllustration } from "@/components/rpg/RankIllustration";
import { FamilyDetailSheet } from "./FamilyDetailSheet";

interface Props {
  workouts: WorkoutRow[];
  rankAggregate: RankAggregate;
  prByName: Map<string, number>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  nameByKey: Map<string, string>;
  classWorkouts: Array<{
    date: string;
    exercises: Array<{
      name: string;
      weight: number | null;
      sets: number | null;
      reps: number | null;
    }>;
  }>;
}

export function LegendesModule({
  workouts,
  rankAggregate,
  prByName,
  histByName,
  volByName,
  nameByKey,
  classWorkouts,
}: Props) {
  const families = useMemo(() => computeLegendFamilies(workouts as WorkoutLike[]), [workouts]);
  const [openFamilyId, setOpenFamilyId] = useState<string | null>(null);
  const openFamily = families.find((f) => f.id === openFamilyId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <SectionReveal>
        <ClassCard workouts={classWorkouts} rankAggregate={rankAggregate} />
      </SectionReveal>

      <SectionReveal delay={0.05}>
        <div>
          <ModuleSectionTitle
            icon={<Crown className="h-4 w-4" />}
            hint="Le rang de chaque famille, projeté depuis ton volume réel — touche une famille pour son détail."
          >
            Maîtrise par groupe musculaire
          </ModuleSectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {families.map((f, i) => {
              const sr = specRankFromVolume(f.volume);
              const pct = f.volume > 0 ? sr.rank.xp : 0;
              return (
                <PopIn key={f.id} delay={i * 0.05}>
                  <button
                    type="button"
                    onClick={() => setOpenFamilyId(f.id)}
                    className="group relative w-full overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.01] text-left backdrop-blur-xl transition-transform active:scale-[0.98]"
                    style={{ boxShadow: f.volume > 0 ? `0 0 26px -16px ${sr.glow}` : undefined }}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-4 top-0 h-px opacity-70"
                      style={{ background: f.volume > 0 ? sr.gradient : "rgba(255,255,255,0.08)" }}
                    />
                    <div className="relative aspect-[4/3] w-full overflow-hidden">
                      <RankIllustration
                        rankKey={sr.rank.rank.key}
                        label={sr.rank.rank.label}
                        className="absolute inset-0 h-full w-full"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                      {f.volume === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/50">
                            Pas encore entraîné
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="relative p-3">
                      <p className="truncate text-[13px] font-bold text-white/90">{f.title}</p>
                      <div className="mt-1.5">
                        <RankPill rank={sr.rank} />
                      </div>
                      {f.volume > 0 && (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: sr.gradient }}
                          />
                        </div>
                      )}
                    </div>
                  </button>
                </PopIn>
              );
            })}
          </div>
        </div>
      </SectionReveal>

      {openFamily && (
        <FamilyDetailSheet
          family={openFamily}
          workouts={workouts}
          prByName={prByName}
          histByName={histByName}
          volByName={volByName}
          nameByKey={nameByKey}
          onClose={() => setOpenFamilyId(null)}
        />
      )}
    </div>
  );
}
