import { useMemo, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dumbbell,
  Loader2,
  AlertCircle,
  ChevronDown,
  CalendarDays,
  Trophy,
  Repeat,
  Flame,
  Layers,
  Award,
  HeartPulse,
  Swords,
} from "lucide-react";
import { SeancesHero } from "@/components/fitness/SeancesHero";
import { SenseiIACard } from "@/components/fitness/SenseiIACard";
import { ChoisirEpreuveCard } from "@/components/fitness/ChoisirEpreuveCard";
import { LaForgeCard } from "@/components/fitness/LaForgeCard";
import { BodyMap } from "@/components/fitness/BodyMap";
import { WorkoutCard, type WorkoutRow } from "@/components/fitness/WorkoutCard";
import { WorkoutSheet } from "@/components/fitness/WorkoutSheet";
import { GenericHistoryCard } from "@/components/fitness/session/GenericHistoryCard";
import { GenericSessionReviewSheet } from "@/components/fitness/session/GenericSessionReviewSheet";
import { WorkoutProgressCharts } from "@/components/fitness/WorkoutProgressCharts";
import { StartWorkoutSheet } from "@/components/fitness/StartWorkoutSheet";
import { ActiveWorkoutView } from "@/components/fitness/ActiveWorkoutView";
import { ExerciseCatalogSheet } from "@/components/fitness/ExerciseCatalogSheet";
import { PostWorkoutAnalysisSheet } from "@/components/fitness/PostWorkoutAnalysisSheet";
import { SeancesProgressionCard } from "@/components/fitness/SeancesProgressionCard";
import { ProfileRPGData } from "@/components/profile/rpg/ProfileRPGData";
import { SectionReveal } from "@/components/fitness/SectionReveal";
import { AnimatedNumber } from "@/components/fitness/AnimatedNumber";
import {
  useExerciseImageUrls,
  useWorkouts,
  useActiveWorkout,
  useStartWorkoutFromTemplate,
  type ActiveWorkout,
} from "@/hooks/use-fitness";
import { useRecoveryMap } from "@/hooks/useRecoveryMap";
import { useFitnessStreak } from "@/hooks/useFitnessStreak";

import { CoachSheet, type WorkoutTemplate } from "./CoachSheet";
import { computePRs } from "@/utils/fitness/exercise-stats";
import { ENGINE_REGISTRY } from "@/lib/fitness/engines/registry";
import {
  isReadyEngine,
  type DisciplineId,
  type WorkoutRecordDraft,
} from "@/lib/fitness/engines/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function weekdayLabel(iso: string) {
  return new Date(iso + "T00:00:00")
    .toLocaleDateString("fr-FR", { weekday: "short" })
    .replace(".", "");
}

// ── Composant principal ─────────────────────────────────────────────────────────

export function SeancesTab() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useWorkouts();
  const { data: activeWorkout, isLoading: activeLoading } = useActiveWorkout();
  const recoveryMap = useRecoveryMap(data);
  const streak = useFitnessStreak(data);

  // Phase 7 : remplace l'ancien "Tonnage 7j" (implicitement muscu — 0 kg
  // silencieux pour Cardio/HYROX/Course/Guidé) par une métrique réellement
  // commune à TOUTE discipline : la durée. Le tonnage reste visible là où
  // il a du sens (WorkoutCard, propre à la musculation), juste plus comme
  // KPI global de tête de page.
  const weekDurationMinutes = useMemo(() => {
    if (!data) return 0;
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return data
      .filter((w) => new Date(w.date) >= start)
      .reduce((acc, w) => acc + (w.duration_minutes ?? 0), 0);
  }, [data]);

  const recentWorkouts = useMemo(() => (data ?? []).slice(0, 5), [data]);

  const [startOpen, setStartOpen] = useState(false);
  const [open, setOpen] = useState(false);
  // C2 : le snapshot de la séance clôturée vit ici pour que la fiche d'analyse
  // IA survive au démontage d'ActiveWorkoutView.
  const [finishedSnapshot, setFinishedSnapshot] = useState<ActiveWorkout | null>(null);
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [genericDraft, setGenericDraft] = useState<WorkoutRecordDraft | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachInitialMuscles, setCoachInitialMuscles] = useState<string[] | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const { prByName, histByName, volByName, prByGym, histByGym, nameByKey, topExercises } = useMemo(
    () => computePRs(data ?? []),
    [data],
  );

  const allImagePaths = useMemo(
    () =>
      historyOpen
        ? (data ?? []).flatMap((w) => (w.exercises ?? []).map((ex) => ex.image_path))
        : [],
    [data, historyOpen],
  );
  const { data: listImageUrls } = useExerciseImageUrls(allImagePaths);
  const latestDate = useMemo(() => data?.[0]?.date ?? "", [data]);

  // H1 : « Refaire » démarre une séance LIVE pré-remplie.
  const startFromTemplate = useStartWorkoutFromTemplate();
  const repeatLive = useCallback(
    (w: WorkoutRow) => {
      if (startFromTemplate.isPending) return;
      startFromTemplate.mutate({
        name: w.name,
        gym_location: (w as { gym_location?: string | null }).gym_location ?? null,
        exercises: w.exercises ?? [],
      });
    },
    [startFromTemplate],
  );

  // Saisie rétroactive (ancien « Refaire ») — accessible via le menu ⋮ d'une séance.
  const openFromTemplate = useCallback((w: WorkoutRow) => {
    if (!w.id || !w.exercises) return;
    setTemplate({
      name: w.name || "Séance sans nom",
      exercises: (w.exercises ?? []).map((ex) => ({
        name: ex.name || "Exercice inconnu",
        sets: ex.sets != null ? String(ex.sets) : "",
        reps: ex.reps != null ? String(ex.reps) : "",
        weight: ex.weight != null ? String(ex.weight) : "",
        image_path: ex.image_path ?? null,
      })),
    });
    setOpen(true);
  }, []);

  const handleCoachResult = useCallback((tpl: WorkoutTemplate, draft: WorkoutRecordDraft) => {
    setCoachOpen(false);
    // Musculation garde WorkoutSheet (édition fine, intouché) ; toute autre
    // discipline route vers l'écran de relecture générique — décision prise
    // une seule fois ici, jamais dupliquée pour HYROX/Course/Cardio/Guidé.
    const entry = ENGINE_REGISTRY[draft.discipline];
    const isStrength =
      entry && isReadyEngine(entry) && entry.historyPresentation.cardVariant === "strength";
    if (isStrength) {
      setTemplate(tpl);
      setOpen(true);
    } else {
      setGenericDraft(draft);
    }
  }, []);

  const openCoach = useCallback((initial?: string[]) => {
    setCoachInitialMuscles(initial?.length ? initial : undefined);
    setCoachOpen(true);
  }, []);

  if (activeLoading && isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── VUE SÉANCE ACTIVE ──────────────────────────────────────────────────────
  if (activeWorkout) {
    return (
      <section className="flex flex-col gap-4">
        <ActiveWorkoutView
          workout={activeWorkout}
          recoveryMap={recoveryMap}
          onFinished={setFinishedSnapshot}
          onOpenCatalog={() => setCatalogOpen(true)}
        />
        {finishedSnapshot && (
          <PostWorkoutAnalysisSheet
            workout={finishedSnapshot}
            workoutId={finishedSnapshot.id}
            previousWorkouts={data ?? []}
            recoveryMap={recoveryMap}
            onClose={() => setFinishedSnapshot(null)}
          />
        )}
        {/* Catalogue accessible aussi pendant une séance active — bibliothèque
            de référence du module Exercices, atteignable partout dans l'app. */}
        {catalogOpen && (
          <ExerciseCatalogSheet
            onClose={() => setCatalogOpen(false)}
            histByName={histByName}
            volByName={volByName}
            prByName={prByName}
          />
        )}
      </section>
    );
  }

  // ── VUE HISTORIQUE ─────────────────────────────────────────────────────────
  return (
    <section className="flex flex-col gap-5">
      {/* ── HERO — LA FORGE ─────────────────────────────────────────── */}
      <SeancesHero topExercises={topExercises} />

      {/* ── Sensei^IA ───────────────────────────────────────────────── */}
      <SenseiIACard onClick={() => openCoach()} />

      {/* ── Choisir une épreuve — action principale ─────────────────── */}
      <ChoisirEpreuveCard onClick={() => setStartOpen(true)} />

      {/* Trait de liaison — même lieu, pas des cartes indépendantes */}
      <SectionLink />

      {/* ── Progression RPG — une seule carte immersive qui raconte où en
          est le joueur, plutôt qu'un carousel de dizaines d'exercices.
          Le détail complet ("Toutes les maîtrises") vit dans son propre
          écran, ouvert via le bouton de la carte. ──────────────────── */}
      {topExercises.length > 0 && (
        <SectionReveal>
          <div>
            <SectionTitle icon={<Swords className="h-3 w-3" />} title="Progression RPG" />
            <ProfileRPGData>
              {({
                rankAggregate,
                achievements,
                topExercises: rpgTop,
                nameByKey: rpgNameByKey,
                histByName: rpgHist,
                prByName: rpgPr,
              }) => (
                <SeancesProgressionCard
                  rankAggregate={rankAggregate}
                  achievements={achievements}
                  topExercises={rpgTop}
                  nameByKey={rpgNameByKey}
                  histByName={rpgHist}
                  prByName={rpgPr}
                  onViewAll={() => navigate({ to: "/maitrises" })}
                />
              )}
            </ProfileRPGData>
          </div>
        </SectionReveal>
      )}

      {/* ── La Forge — atelier de sélection des techniques ──────────── */}
      <SectionReveal delay={0.05}>
        <LaForgeCard onClick={() => setCatalogOpen(true)} />
      </SectionReveal>

      {error && !isLoading && (
        <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
            <div>
              <h3 className="font-semibold text-destructive">Erreur de chargement</h3>
              <p className="mt-1 text-sm text-destructive/80">
                {error instanceof Error ? error.message : "Une erreur est survenue"}
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Trait de liaison — vers le Palmarès et le reste du sanctuaire */}
      {data && !isLoading && data.length > 0 && <SectionLink />}

      {/* ── LE PALMARÈS ─────────────────────────────────────────────── */}
      {data && !isLoading && data.length > 0 && (
        <SectionReveal>
          <PalmaresSection>
            {/* Chroniques complètes — source unique de l'historique : vue
                compacte (dernières séances) repliée, vue détaillée (graphes
                + historique complet) dépliée. */}
            <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] to-white/[0.01] shadow-card backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
                aria-expanded={historyOpen}
              >
                <span className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <span className="font-serif text-[13px] font-semibold italic text-white/90">
                    Chroniques complètes
                  </span>
                  <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-white/70">
                    {data.length}
                  </span>
                </span>
                <ChevronDown
                  className={
                    "h-4 w-4 text-muted-foreground transition-transform " +
                    (historyOpen ? "rotate-180" : "")
                  }
                />
              </button>

              {!historyOpen && (
                <div className="px-5 pb-5">
                  <ul className="space-y-2">
                    {recentWorkouts.map((w) => (
                      <li
                        key={w.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="w-9 shrink-0 text-center text-[10px] font-semibold uppercase tracking-wide text-primary">
                            {weekdayLabel(w.date)}
                          </span>
                          <span className="truncate text-xs font-semibold text-white/90">
                            {w.name || "Séance"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => repeatLive(w)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-all active:scale-90 hover:bg-primary/15 hover:text-primary"
                          title="Refaire cette séance"
                          aria-label="Refaire cette séance"
                        >
                          <Repeat className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {historyOpen && (
                <div className="px-3 pb-4">
                  <WorkoutProgressCharts
                    topExercises={topExercises}
                    histByName={histByName}
                    prByName={prByName}
                    nameByKey={nameByKey}
                  />
                  <ul className="mt-3 space-y-3">
                    {data.map((w) => {
                      // Musculation garde WorkoutCard tel quel (intouché) ; toute
                      // autre discipline route vers la carte générique — décision
                      // prise une seule fois ici, jamais dupliquée par discipline.
                      const entry =
                        ENGINE_REGISTRY[(w.discipline as DisciplineId | null) ?? "muscu"];
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
                          imageUrls={listImageUrls}
                          latestDate={latestDate}
                          onRepeatLive={repeatLive}
                          onOpenFromTemplate={openFromTemplate}
                        />
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </PalmaresSection>
        </SectionReveal>
      )}

      {data && data.length === 0 && !isLoading && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Aucune séance</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lance-toi, ta première légende t'attend.
          </p>
        </div>
      )}

      {/* ── ÉTAT DU CORPS — récupération musculaire (déplacé plus bas) ── */}
      {data && (
        <SectionReveal>
          <div>
            <SectionTitle icon={<HeartPulse className="h-3 w-3" />} title="État du corps" />
            <BodyMap mode="recovery" recoveryMap={recoveryMap} />
          </div>
        </SectionReveal>
      )}

      {/* ── LES PERFORMANCES ────────────────────────────────────────── */}
      {data && data.length > 0 && (
        <SectionReveal>
          <div>
            <SectionTitle icon={<Award className="h-3 w-3" />} title="Les Performances" />
            <div className="grid grid-cols-3 gap-2">
              <PerfTile
                icon={<Flame className="h-3.5 w-3.5 text-orange-400" />}
                label="Ardeur"
                value={streak.current}
                sub={`≥ ${streak.threshold}/sem`}
                accent="rgba(251,146,60,0.35)"
              />
              <PerfTile
                icon={<CalendarDays className="h-3.5 w-3.5 text-sky-300" />}
                label="Cycle en cours"
                value={streak.thisWeekCount}
                sub={
                  streak.thisWeekCount >= streak.threshold
                    ? "Objectif ✓"
                    : `${streak.threshold - streak.thisWeekCount} restantes`
                }
                accent="rgba(56,189,248,0.30)"
              />
              <PerfTile
                icon={<Layers className="h-3.5 w-3.5 text-amber-300" />}
                label="Temps forgé"
                value={weekDurationMinutes >= 60 ? weekDurationMinutes / 60 : weekDurationMinutes}
                decimals={weekDurationMinutes >= 60 ? 1 : 0}
                suffix={weekDurationMinutes >= 60 ? "h" : ""}
                sub={weekDurationMinutes >= 60 ? "toutes disciplines" : "min · toutes disciplines"}
                accent="rgba(251,191,36,0.30)"
              />
            </div>
          </div>
        </SectionReveal>
      )}

      {startOpen && <StartWorkoutSheet onClose={() => setStartOpen(false)} />}

      {open && (
        <WorkoutSheet
          template={template}
          priorPRs={prByName}
          onClose={() => {
            setOpen(false);
            setTemplate(null);
          }}
        />
      )}

      {coachOpen && (
        <CoachSheet
          onClose={() => setCoachOpen(false)}
          onResult={handleCoachResult}
          initialMuscles={coachInitialMuscles}
        />
      )}

      {genericDraft && (
        <GenericSessionReviewSheet
          draft={genericDraft}
          onClose={() => setGenericDraft(null)}
          onSaved={() => setGenericDraft(null)}
        />
      )}

      {catalogOpen && (
        <ExerciseCatalogSheet
          onClose={() => setCatalogOpen(false)}
          histByName={histByName}
          volByName={volByName}
          prByName={prByName}
        />
      )}

      {/* C2 : fiche d'analyse IA — rendue aussi hors séance active */}
      {finishedSnapshot && (
        <PostWorkoutAnalysisSheet
          workout={finishedSnapshot}
          workoutId={finishedSnapshot.id}
          previousWorkouts={data ?? []}
          recoveryMap={recoveryMap}
          onClose={() => setFinishedSnapshot(null)}
        />
      )}
    </section>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 px-1">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h2>
    </div>
  );
}

// Trait de liaison discret entre deux zones de la page — évoque un même
// lieu que l'on traverse plutôt qu'un empilement de cartes indépendantes.
function SectionLink() {
  return (
    <div aria-hidden className="flex justify-center py-0.5">
      <div className="h-6 w-px bg-gradient-to-b from-transparent via-white/[0.12] to-transparent" />
    </div>
  );
}

function PalmaresSection({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <SectionTitle icon={<Trophy className="h-3 w-3" />} title="Le Palmarès" />
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function PerfTile({
  icon,
  label,
  value,
  decimals = 0,
  suffix = "",
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 shadow-card transition-colors hover:border-white/[0.12]"
      style={{
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.02), 0 8px 24px -14px ${accent}`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-3 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div
        aria-hidden
        className="mb-1.5 flex h-6 w-6 items-center justify-center rounded-full"
        style={{
          background: `radial-gradient(circle, ${accent} 0%, transparent 72%)`,
          boxShadow: `inset 0 0 0 1px ${accent}`,
        }}
      >
        {icon}
      </div>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-white/50">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums leading-none text-white">
        <AnimatedNumber value={value} decimals={decimals} suffix={suffix} />
      </p>
      {sub && <p className="mt-1 text-[9.5px] text-white/45">{sub}</p>}
    </div>
  );
}
