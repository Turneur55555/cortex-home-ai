// ============================================================
// LES CHRONIQUES — Module « Progression ».
//
// Mission unique : raconter, avec les preuves, tout ce que le joueur a
// fait et comment il évolue. Contient : le récap carrière, les exercices
// oubliés, les plateaux et la Chronologie des séances (chacune ouvre sa
// Chronique immersive). Zéro rang par muscle ici (→ Légendes).
//
// Note (suppression Hall of Fame + Tendances, 25/07/2026) : les deux
// sections ont été retirées de cet écran à la demande produit. Les
// helpers `computeHallOfFame`, `computeForgotten`, `computePlateaus` et
// le composant `WorkoutProgressCharts` restent utilisés ailleurs dans
// l'app — on ne retire ici QUE leurs usages locaux devenus obsolètes.
// ============================================================

import { useMemo } from "react";
import { Heart, History, Hourglass, Sparkles, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

import { WorkoutCard, type WorkoutRow } from "@/components/fitness/WorkoutCard";
import { GenericHistoryCard } from "@/components/fitness/session/GenericHistoryCard";
import { SectionReveal } from "@/components/fitness/SectionReveal";
import { formatTonnage } from "@/lib/fitness/strength";
import { computeHallOfFame, computeForgotten, computePlateaus } from "@/lib/fitness/chronicles";
import { useLatestBodyWeight } from "@/hooks/useLatestBodyWeight";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import { isReadyEngine, type DisciplineId } from "@/lib/fitness/engines/types";
import { AnimatedNumber, ModuleSectionTitle, PopIn, GoldCard } from "../livreParts";

interface Props {
  workouts: WorkoutRow[];
  prByName: Map<string, number>;
  histByName: Map<string, Array<{ date: string; weight: number }>>;
  volByName: Map<string, Array<{ date: string; volume: number }>>;
  prByGym: Map<string, Map<string, number>>;
  histByGym: Map<string, Map<string, Array<{ date: string; weight: number }>>>;
  /** Conservé pour compatibilité avec ChroniquesPage (les Tendances ont
   *  été supprimées : plus consommé localement). */
  nameByKey: Map<string, string>;
  /** Idem — plus consommé localement depuis la suppression des Tendances. */
  topExercises: string[];
  imageUrls: Map<string, string> | undefined;
  latestDate: string;
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
  imageUrls,
  latestDate,
  onRepeatLive,
  onOpenFromTemplate,
  onSaveAsTemplate,
  onOpenChronicle,
}: Props) {
  const { data: bodyWeightKg } = useLatestBodyWeight();

  const career = useMemo(
    () => computeHallOfFame(workouts, bodyWeightKg ?? null).career,
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
                value={career.sessions}
                className="text-xl font-bold tabular-nums text-white"
              />
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/50">
                Séances
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] px-2 py-3 text-center ring-1 ring-white/5">
              <AnimatedNumber
                value={career.tonnage}
                format={(n) => formatTonnage(Math.round(n))}
                className="text-xl font-bold tabular-nums text-white"
              />
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/50">
                Soulevés
              </p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] px-2 py-3 text-center ring-1 ring-white/5">
              <AnimatedNumber
                value={career.prCount}
                className="text-xl font-bold tabular-nums text-amber-300"
              />
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/50">
                Records
              </p>
            </div>
          </div>
        </div>
      </SectionReveal>

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
