// ============================================================
// LES CHRONIQUES — Module « Progression ».
//
// Mission unique : raconter, avec les preuves, tout ce que le joueur a
// fait et comment il évolue. Contient : le récap carrière, le Hall of
// Fame (records personnels absolus), les courbes de tendance, les
// exercices en perte de vitesse (oubliés / plateaux), la collection de
// badges & succès unifiée (TrophyRoom — intégrée ici naturellement,
// aucune 4e destination créée), et la Chronologie des séances (chacune
// ouvre sa Chronique immersive). Zéro rang par muscle ici (→ Légendes).
// ============================================================

import { useMemo } from "react";
import {
  Clock,
  Crown,
  Flame,
  Heart,
  History,
  Hourglass,
  Layers,
  Medal,
  Sparkles,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

import { WorkoutCard, type WorkoutRow } from "@/components/fitness/WorkoutCard";
import { GenericHistoryCard } from "@/components/fitness/session/GenericHistoryCard";
import { SectionReveal } from "@/components/fitness/SectionReveal";
import { WorkoutProgressCharts } from "@/components/fitness/WorkoutProgressCharts";
import { TrophyRoom } from "@/components/profile/rpg/TrophyRoom";
import type { AchievementAggregateWithLoading } from "@/hooks/useAchievements";
import type { BadgeWithProgress } from "@/hooks/useBadgeSystem";
import { formatTonnage } from "@/lib/fitness/strength";
import { computeHallOfFame, computeForgotten, computePlateaus } from "@/lib/fitness/chronicles";
import { useLatestBodyWeight } from "@/hooks/useLatestBodyWeight";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import { isReadyEngine, type DisciplineId } from "@/lib/fitness/engines/types";
import { AnimatedNumber, GoldCard, ModuleSectionTitle, PopIn } from "../livreParts";

interface Props {
  workouts: WorkoutRow[];
  prByName: Map<string, number>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByGym: Map<string, Map<string, number>>;
  histByGym: Map<string, Map<string, Array<{ date: string; weight: number }>>>;
  nameByKey: Map<string, string>;
  topExercises: string[];
  imageUrls: Map<string, string> | undefined;
  latestDate: string;
  achievements: AchievementAggregateWithLoading;
  legacyBadges: BadgeWithProgress[];
  onRepeatLive: (w: WorkoutRow) => void;
  onOpenFromTemplate: (w: WorkoutRow) => void;
  onSaveAsTemplate: (w: WorkoutRow) => void;
  onOpenChronicle: (w: WorkoutRow) => void;
}

export function ProgressionModule({
  workouts,
  prByName,
  histByName,
  volByName,
  prByGym,
  histByGym,
  nameByKey,
  topExercises,
  imageUrls,
  latestDate,
  achievements,
  legacyBadges,
  onRepeatLive,
  onOpenFromTemplate,
  onSaveAsTemplate,
  onOpenChronicle,
}: Props) {
  const { data: bodyWeightKg } = useLatestBodyWeight();

  const hof = useMemo(
    () => computeHallOfFame(workouts, bodyWeightKg ?? null),
    [workouts, bodyWeightKg],
  );
  const forgotten = useMemo(() => computeForgotten(workouts), [workouts]);
  const plateaus = useMemo(() => computePlateaus(workouts), [workouts]);

  const dateOf = (iso: string) => format(parseISO(iso), "d MMM yyyy", { locale: fr });

  return (
    <div className="flex flex-col gap-6">
      {/* ── Récap carrière ─────────────────────────────────────────────── */}
      <SectionReveal>
        <div
          className="relative overflow-hidden rounded-[26px] border border-white/[0.08] p-5 shadow-elevated"
          style={{
            background: `
              radial-gradient(120% 80% at 50% 0%, rgba(234,179,8,0.14) 0%, transparent 55%),
              linear-gradient(180deg,#171004 0%,#070502 100%)`,
          }}
        >
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white/[0.04] px-2 py-3 text-center ring-1 ring-white/5">
              <AnimatedNumber
                value={hof.career.sessions}
                className="text-xl font-bold tabular-nums text-white"
              />
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/50">
                Séances
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] px-2 py-3 text-center ring-1 ring-white/5">
              <AnimatedNumber
                value={hof.career.tonnage}
                format={(n) => formatTonnage(Math.round(n))}
                className="text-xl font-bold tabular-nums text-white"
              />
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/50">
                Soulevés
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] px-2 py-3 text-center ring-1 ring-white/5">
              <AnimatedNumber
                value={hof.career.prCount}
                className="text-xl font-bold tabular-nums text-amber-300"
              />
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/50">
                Records
              </p>
            </div>
          </div>
        </div>
      </SectionReveal>

      {/* ── Hall of Fame ───────────────────────────────────────────────── */}
      {(hof.bestTonnage || hof.heaviestSet || hof.longestSet || hof.longestSession) && (
        <SectionReveal>
          <div>
            <ModuleSectionTitle icon={<Crown className="h-4 w-4" />} hint="Tes records absolus.">
              Hall of Fame
            </ModuleSectionTitle>
            <div className="flex flex-col gap-3">
              {hof.bestTonnage && (
                <PopIn>
                  <div
                    className="relative overflow-hidden rounded-3xl border border-amber-400/25 p-5 backdrop-blur-xl"
                    style={{
                      background:
                        "radial-gradient(120% 100% at 30% 0%, rgba(234,179,8,0.18) 0%, transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)",
                      boxShadow: "0 0 46px -12px rgba(234,179,8,0.5)",
                    }}
                  >
                    <div className="relative flex items-center gap-4">
                      <div
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
                        style={{
                          background: "linear-gradient(140deg,#78350f 0%,#eab308 50%,#451a03 100%)",
                          boxShadow:
                            "inset 0 1px 0 rgba(255,255,255,0.3), 0 6px 24px -8px rgba(234,179,8,0.8)",
                        }}
                      >
                        <Trophy className="h-7 w-7 text-white drop-shadow" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">
                          Plus gros tonnage
                        </p>
                        <AnimatedNumber
                          value={hof.bestTonnage.value}
                          format={(n) => formatTonnage(Math.round(n))}
                          className="mt-0.5 block font-serif text-[34px] font-semibold italic leading-none text-white"
                        />
                        <p className="mt-1 truncate text-[11px] text-white/50">
                          {hof.bestTonnage.workoutName} · {dateOf(hof.bestTonnage.date)}
                        </p>
                      </div>
                    </div>
                  </div>
                </PopIn>
              )}

              <div className="grid grid-cols-2 gap-3">
                {hof.bestCalories && (
                  <PopIn delay={0.04}>
                    <GoldCard glow>
                      <div className="p-4">
                        <Medal className="h-4 w-4 text-amber-300" />
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                          Plus grosse séance
                        </p>
                        <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
                          <AnimatedNumber value={hof.bestCalories.value} />{" "}
                          <span className="text-[11px] font-medium text-white/50">kcal</span>
                        </p>
                      </div>
                    </GoldCard>
                  </PopIn>
                )}
                {hof.bestIntensity && (
                  <PopIn delay={0.08}>
                    <GoldCard glow>
                      <div className="p-4">
                        <Zap className="h-4 w-4 text-amber-300" />
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                          Plus haute intensité
                        </p>
                        <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
                          <AnimatedNumber value={hof.bestIntensity.value} />{" "}
                          <span className="text-[11px] font-medium text-white/50">kg/min</span>
                        </p>
                      </div>
                    </GoldCard>
                  </PopIn>
                )}
                {hof.heaviestSet && (
                  <PopIn delay={0.12}>
                    <GoldCard glow>
                      <div className="p-4">
                        <Flame className="h-4 w-4 text-amber-300" />
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                          Série la plus lourde
                        </p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-white/80">
                          {hof.heaviestSet.exercise}
                        </p>
                        <p className="text-xl font-bold tabular-nums text-white">
                          <AnimatedNumber value={hof.heaviestSet.weight} />{" "}
                          <span className="text-[11px] font-medium text-white/50">kg</span>
                        </p>
                      </div>
                    </GoldCard>
                  </PopIn>
                )}
                {hof.longestSet && (
                  <PopIn delay={0.16}>
                    <GoldCard glow>
                      <div className="p-4">
                        <Crown className="h-4 w-4 text-amber-300" />
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                          Plus longue série
                        </p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-white/80">
                          {hof.longestSet.exercise}
                        </p>
                        <p className="text-xl font-bold tabular-nums text-white">
                          <AnimatedNumber value={hof.longestSet.reps} />{" "}
                          <span className="text-[11px] font-medium text-white/50">reps</span>
                        </p>
                      </div>
                    </GoldCard>
                  </PopIn>
                )}
                {hof.longestSession && (
                  <PopIn delay={0.2}>
                    <GoldCard glow>
                      <div className="p-4">
                        <Clock className="h-4 w-4 text-amber-300" />
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                          Plus longue séance
                        </p>
                        <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
                          <AnimatedNumber value={hof.longestSession.minutes} />{" "}
                          <span className="text-[11px] font-medium text-white/50">min</span>
                        </p>
                      </div>
                    </GoldCard>
                  </PopIn>
                )}
                {hof.career.series > 0 && (
                  <PopIn delay={0.24}>
                    <GoldCard glow>
                      <div className="p-4">
                        <Layers className="h-4 w-4 text-amber-300" />
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-white/50">
                          Séries au total
                        </p>
                        <p className="mt-0.5 text-xl font-bold tabular-nums text-white">
                          <AnimatedNumber value={hof.career.series} />
                        </p>
                      </div>
                    </GoldCard>
                  </PopIn>
                )}
              </div>
            </div>
          </div>
        </SectionReveal>
      )}

      {/* ── Courbes & tendances ────────────────────────────────────────── */}
      {topExercises.length > 0 && (
        <SectionReveal>
          <div>
            <ModuleSectionTitle
              icon={<TrendingUp className="h-4 w-4" />}
              hint="Tes charges dans le temps."
            >
              Tendances
            </ModuleSectionTitle>
            <WorkoutProgressCharts
              topExercises={topExercises}
              histByName={histByName}
              prByName={prByName}
              nameByKey={nameByKey}
            />
          </div>
        </SectionReveal>
      )}

      {/* ── Techniques oubliées ────────────────────────────────────────── */}
      {forgotten.length > 0 && (
        <SectionReveal>
          <div>
            <ModuleSectionTitle
              icon={<History className="h-4 w-4" />}
              hint="Des exercices que tu maîtrisais disparaissent de tes séances."
            >
              Techniques oubliées
            </ModuleSectionTitle>
            <div className="flex flex-col gap-3">
              {forgotten.map((f, i) => {
                const lastPr = prByName.get(f.key) ?? null;
                const mainMuscle = f.impact[0] ?? null;
                return (
                  <PopIn key={f.key} delay={i * 0.05}>
                    <GoldCard className="border-orange-400/15">
                      <div className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="truncate text-sm font-bold text-white/90">{f.name}</h3>
                          <span className="flex shrink-0 items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-orange-300">
                            <Hourglass className="h-3 w-3" />
                            {f.daysSince} j
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {mainMuscle && (
                            <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-white/70">
                              {mainMuscle}
                            </span>
                          )}
                          {lastPr != null && (
                            <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                              Dernier PR {lastPr} kg
                            </span>
                          )}
                        </div>
                        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                          <Sparkles className="h-3 w-3" />
                          Suggestion : le réintroduire à ta prochaine séance.
                        </p>
                      </div>
                    </GoldCard>
                  </PopIn>
                );
              })}
            </div>
          </div>
        </SectionReveal>
      )}

      {/* ── Potentiel caché (plateaux) ─────────────────────────────────── */}
      {plateaus.length > 0 && (
        <SectionReveal>
          <div>
            <ModuleSectionTitle
              icon={<TrendingUp className="h-4 w-4" />}
              hint="Des exercices encore joués, mais qui ne progressent plus."
            >
              Le potentiel caché
            </ModuleSectionTitle>
            <div className="flex flex-col gap-3">
              {plateaus.map((p, i) => (
                <PopIn key={p.key} delay={i * 0.05}>
                  <GoldCard className="border-cyan-400/15">
                    <div className="p-4">
                      <h3 className="truncate text-sm font-bold text-white/90">{p.name}</h3>
                      <p className="mt-2 text-[11px] text-white/50">
                        {p.stalledSessions} séances sans dépasser le PR de {p.pr} kg.
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                        <Sparkles className="h-3 w-3" />
                        Suggestion : varier les reps ou baisser la charge pour relancer.
                      </p>
                    </div>
                  </GoldCard>
                </PopIn>
              ))}
            </div>
          </div>
        </SectionReveal>
      )}

      {/* ── Trophées & succès — intégrés naturellement, aucune 4e
          destination créée (décision Nathan, 23/07/2026). ──────────────── */}
      <SectionReveal>
        <TrophyRoom
          achievements={achievements}
          legacyBadges={legacyBadges}
          isLoading={achievements.isLoading}
        />
      </SectionReveal>

      {/* ── Chronologie ────────────────────────────────────────────────── */}
      <SectionReveal>
        <div>
          <ModuleSectionTitle
            icon={<Heart className="h-4 w-4" />}
            hint="Chaque séance ouvre sa Chronique immersive."
          >
            Chronologie
          </ModuleSectionTitle>
          {workouts.length === 0 ? (
            <p className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center text-xs text-muted-foreground">
              Encore vierge — lance-toi, ta première légende t'attend.
            </p>
          ) : (
            <ul className="space-y-3">
              {workouts.map((w) => {
                const entry = ENGINE_REGISTRY[(w.discipline as DisciplineId | null) ?? "muscu"];
                const isStrength =
                  !entry ||
                  !isReadyEngine(entry) ||
                  entry.historyPresentation.cardVariant === "strength";
                if (!isStrength) {
                  return <GenericHistoryCard key={w.id} workout={w} />;
                }
                return (
                  <WorkoutCard
                    key={w.id}
                    w={w}
                    prByName={prByName}
                    histByName={histByName}
                    volByName={volByName}
                    prByGym={prByGym}
                    histByGym={histByGym}
                    imageUrls={imageUrls}
                    latestDate={latestDate}
                    onRepeatLive={onRepeatLive}
                    onOpenFromTemplate={onOpenFromTemplate}
                    onSaveAsTemplate={onSaveAsTemplate}
                    onOpenChronicle={onOpenChronicle}
                  />
                );
              })}
            </ul>
          )}
        </div>
      </SectionReveal>
    </div>
  );
}
